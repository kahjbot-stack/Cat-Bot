/**
 * Facebook Messenger — Appstate Manager
 *
 * Single owner of every piece of per-account Facebook state. One entry per
 * `${userId}:${sessionId}`; each entry holds:
 *
 *   - the appstate credential blob and the FB account identity (c_user)
 *   - the one and only FcaApi handle for that account
 *   - EXACTLY ONE 'mqtt'  child slot (fca listenMqtt handle)
 *   - EXACTLY ONE 'e2ee'  child slot (FBClient Signal/Noise instance)
 *   - the E2EE device store payload
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * Before this module, MQTT/FcaApi state was owned in three places simultaneously:
 * the listener closure, a module-level sessionStateRegistry, and a module-level
 * e2eeDeviceStoreMap. Every slow-path restart (spawnDynamicSession → new closure)
 * created a SECOND owner while the first was still alive. fca-cat-bot keeps
 * module-level MQTT state, so two live owners in one process silently merge onto a
 * single Facebook account — the "3 sessions collapse into 1" bug.
 *
 * ── CONCURRENCY MODEL ─────────────────────────────────────────────────────────
 * 1. Per-key async lock (withLock)
 *      boot / detach / destroy / E2EE-reconnect are serialised per account key.
 *      Two lifecycle operations can never interleave on the same appstate.
 *
 * 2. Child token fencing (isChildCurrent)
 *      Every callback captures the child token it was registered under. A callback
 *      whose token has been superseded returns immediately — it cannot emit events
 *      into the unified emitter and cannot schedule a reconnect. Zombies are inert.
 *
 * 3. Synchronous compare-and-swap (claimChild)
 *      Bumps the token atomically BEFORE any await, so a burst of MQTT error
 *      callbacks in the same tick produces exactly one restart.
 *
 * 4. Structural single-instance invariant
 *      A child slot holds at most one handle. attachChild() refuses to store a
 *      handle whose token is stale, and boot() calls stopChildren() before
 *      attaching — so "1 mqtt key + 1 e2ee key" holds even after an aborted retry.
 *
 * Ownership tree: sessionManager (root) → appstateManager (parent) → mqtt / e2ee.
 * Signals always travel down this tree, never sideways.
 */

import type { FcaApi, StartBotConfig, StartBotResult } from './types.js';
import type { SessionLogger } from '@/engine/modules/logger/logger.lib.js';

// ── Public types ──────────────────────────────────────────────────────────────

/** The two — and only two — child transports an appstate entry may own. */
export type ChildKind = 'mqtt' | 'e2ee';

/**
 * Library-agnostic child handle. index.ts adapts `stopListeningAsync()` (MQTT) and
 * `disconnect()` (FBClient) into `stop()` so this module never imports fca internals.
 */
export interface ChildHandle {
  /** Raw library instance, retained for diagnostics only — never called from here. */
  readonly instance: unknown;
  /** Tears the child transport down. Rejections are swallowed by stopChild(). */
  readonly stop: () => Promise<void>;
}

/** Outcome of ensure() — lets the caller log the correct re-login reason. */
export type EnsureResult = 'created' | 'rotated' | 'unchanged';

/** Injected login function; keeps this module free of a cycle back to login.ts. */
export type StartBotFn = (
  config: StartBotConfig,
  sessionLogger: SessionLogger,
) => Promise<StartBotResult>;

// ── Internal shapes ───────────────────────────────────────────────────────────

interface ChildSlot {
  /** Monotonic generation counter. Any callback holding an older value is fenced. */
  token: number;
  handle: ChildHandle | null;
}

interface AppstateEntry {
  readonly userId: string;
  readonly sessionId: string;
  appstate: string;
  /** Stable Facebook numeric user ID (c_user) — the account identity anchor. */
  fbAccountId: string | null;
  api: FcaApi | null;
  isInvalid: boolean;
  isStopping: boolean;
  deviceData: string | undefined;
  /** Literal-keyed Record, not an index signature — avoids noUncheckedIndexedAccess. */
  readonly children: Record<ChildKind, ChildSlot>;
  /** Serialisation chain. Never rejects: each link swallows its own failure. */
  lock: Promise<unknown>;
}

/**
 * Extracts the Facebook numeric user ID (c_user cookie) from a serialised appstate.
 *
 * WHY c_user: it is the only cookie that is stable across session refreshes. Binding
 * the entry to it lets login() detect library-level account contamination — an
 * fca-cat-bot login for a different account silently overwriting module MQTT state.
 */
function extractFbAccountId(appstateJson: string): string | null {
  try {
    const cookies = JSON.parse(appstateJson) as Array<{
      key: string;
      value: string;
    }>;
    return cookies.find((c) => c.key === 'c_user')?.value ?? null;
  } catch {
    return null;
  }
}

// ── Manager ───────────────────────────────────────────────────────────────────

class AppstateManager {
  readonly #entries = new Map<string, AppstateEntry>();

  /** Canonical entry key. Deliberately excludes platform — one FB account per bot. */
  buildKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  has(key: string): boolean {
    return this.#entries.has(key);
  }

  #must(key: string): AppstateEntry {
    const entry = this.#entries.get(key);
    if (!entry) {
      throw new Error(`[appstate-manager] No entry registered for key "${key}"`);
    }
    return entry;
  }

  /**
   * Bumps both child tokens. Called whenever the FcaApi handle is replaced or
   * invalidated: every callback bound to the previous handle is fenced in one step.
   */
  #fenceAllChildren(entry: AppstateEntry): void {
    entry.children.mqtt.token++;
    entry.children.e2ee.token++;
  }

  /**
   * Creates the entry, or rotates it when the dashboard supplied a new appstate.
   * A rotation drops the cached FcaApi so the next boot() performs a full re-login —
   * reusing a handle across appstates is exactly how two accounts get merged.
   */
  ensure(userId: string, sessionId: string, appstate: string): EnsureResult {
    const key = this.buildKey(userId, sessionId);
    const existing = this.#entries.get(key);

    if (!existing) {
      this.#entries.set(key, {
        userId,
        sessionId,
        appstate,
        fbAccountId: extractFbAccountId(appstate),
        api: null,
        isInvalid: false,
        isStopping: false,
        deviceData: undefined,
        children: {
          mqtt: { token: 0, handle: null },
          e2ee: { token: 0, handle: null },
        },
        lock: Promise.resolve(),
      });
      return 'created';
    }

    if (existing.appstate === appstate) return 'unchanged';

    existing.appstate = appstate;
    existing.fbAccountId = extractFbAccountId(appstate);
    existing.api = null;
    existing.isInvalid = true;
    this.#fenceAllChildren(existing);
    return 'rotated';
  }

  /**
   * Serialises `fn` against every other withLock() caller for this key.
   *
   * NOT reentrant — callers inside the critical section must use the lock-free
   * primitives (stopChildren, login, attachChild, ...) rather than re-entering.
   */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const entry = this.#must(key);
    // Run regardless of whether the previous link resolved or rejected.
    const run = entry.lock.then(fn, fn);
    // Store a never-rejecting tail so one failure cannot poison the whole chain.
    entry.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // ── Credential / api lifecycle ──────────────────────────────────────────────

  needsLogin(key: string): boolean {
    const entry = this.#must(key);
    return entry.isInvalid || entry.api === null;
  }

  /**
   * Performs a full fca-unofficial login and binds the resulting handle to the entry.
   * Must be called inside withLock().
   *
   * The identity check is the last line of defence against library-level contamination:
   * a concurrent login() for another account can overwrite fca-cat-bot's internal MQTT
   * context. Throwing here keeps the platform runner's retry loop as the sole recovery
   * path, so no zombie session can accumulate.
   */
  async login(
    key: string,
    sessionLogger: SessionLogger,
    startBotFn: StartBotFn,
  ): Promise<FcaApi> {
    const entry = this.#must(key);
    const { api } = await startBotFn({ appstate: entry.appstate, key }, sessionLogger);

    const loggedInId = String(api.getCurrentUserID());
    if (entry.fbAccountId !== null && loggedInId !== entry.fbAccountId) {
      sessionLogger.error(
        `[appstate-manager] Identity mismatch for ${key}: expected fbAccountId=` +
          `${entry.fbAccountId} but api.getCurrentUserID()=${loggedInId} — ` +
          `library-level contamination detected; forcing re-login on retry.`,
      );
      entry.api = null;
      entry.isInvalid = true;
      this.#fenceAllChildren(entry);
      throw new Error(
        `[appstate-manager] FB account identity mismatch: expected ${entry.fbAccountId}, got ${loggedInId}`,
      );
    }

    entry.fbAccountId = loggedInId;
    entry.api = api;
    entry.isInvalid = false;
    // New api generation — every callback still holding the previous handle is now inert.
    this.#fenceAllChildren(entry);
    return api;
  }

  /** Flags the session for full re-login on the next boot (MQTT auth error path). */
  invalidate(key: string): void {
    const entry = this.#entries.get(key);
    if (!entry) return;
    entry.api = null;
    entry.isInvalid = true;
  }

  getApi(key: string): FcaApi | null {
    return this.#entries.get(key)?.api ?? null;
  }

  getFbAccountId(key: string): string | null {
    return this.#entries.get(key)?.fbAccountId ?? null;
  }

  getDeviceData(key: string): string | undefined {
    return this.#entries.get(key)?.deviceData;
  }

  /** Persists the Signal identity/keys so a reconnect does not regenerate the device. */
  setDeviceData(key: string, data: string): void {
    const entry = this.#entries.get(key);
    if (entry) entry.deviceData = data;
  }

  // ── Child slots — token fencing primitives ──────────────────────────────────

  /**
   * Reserves the next generation for a child slot. Callers capture the returned token
   * BEFORE constructing the transport so a callback firing during construction is fenced.
   */
  nextChildToken(key: string, kind: ChildKind): number {
    const entry = this.#must(key);
    return ++entry.children[kind].token;
  }

  /**
   * Stores the handle only if `token` is still the current generation.
   * Returns false when a concurrent stop() superseded this attach — the caller must
   * then tear its half-built transport down rather than leaving it orphaned.
   */
  attachChild(
    key: string,
    kind: ChildKind,
    handle: ChildHandle,
    token: number,
  ): boolean {
    const entry = this.#entries.get(key);
    if (!entry || entry.children[kind].token !== token) return false;
    entry.children[kind].handle = handle;
    return true;
  }

  /** Fence predicate — every transport callback calls this first and returns on false. */
  isChildCurrent(key: string, kind: ChildKind, token: number): boolean {
    return this.#entries.get(key)?.children[kind].token === token;
  }

  /**
   * Synchronous compare-and-swap. The first caller of a burst wins and bumps the token;
   * all later callbacks from the same generation see false and drop. Runs before any
   * await, so there is no interleaving window.
   */
  claimChild(key: string, kind: ChildKind, token: number): boolean {
    const entry = this.#entries.get(key);
    if (!entry || entry.children[kind].token !== token) return false;
    entry.children[kind].token++;
    return true;
  }

  /**
   * Detaches and stops one child. The slot is cleared and its token bumped BEFORE the
   * await, so a second concurrent stopChild() sees an empty slot and returns immediately.
   */
  async stopChild(key: string, kind: ChildKind): Promise<void> {
    const entry = this.#entries.get(key);
    if (!entry) return;
    const slot = entry.children[kind];
    const handle = slot.handle;
    slot.handle = null;
    // Fence even when there was no handle — an in-flight attachChild() must not win.
    slot.token++;
    if (!handle) return;
    try {
      await handle.stop();
    } catch {
      /* non-fatal — a failed teardown must never block the next attach */
    }
  }

  /**
   * E2EE first, then MQTT: the FBClient WebSocket handshake state must flush while the
   * underlying FCA connection is still alive, otherwise Signal sessions orphan server-side.
   */
  async stopChildren(key: string): Promise<void> {
    await this.stopChild(key, 'e2ee');
    await this.stopChild(key, 'mqtt');
  }

  // ── Stop-flag ───────────────────────────────────────────────────────────────

  beginStart(key: string): void {
    const entry = this.#entries.get(key);
    if (entry) entry.isStopping = false;
  }

  beginStop(key: string): void {
    const entry = this.#entries.get(key);
    if (entry) entry.isStopping = true;
  }

  /**
   * Defaults to true for unknown keys: a callback surviving destroySession() must never
   * schedule a reconnect for an account this process no longer manages.
   */
  isStopping(key: string): boolean {
    return this.#entries.get(key)?.isStopping ?? true;
  }

  // ── Session-level teardown (invoked by the listener on sessionManager signals) ──

  /**
   * Soft stop: closes both children, keeps the FcaApi so a subsequent start() can
   * reattach MQTT without burning a re-login (and risking a Meta suspension).
   */
  async detachSession(key: string): Promise<void> {
    if (!this.#entries.has(key)) return;
    // Set BEFORE taking the lock: live callbacks must stop scheduling restarts
    // the instant a stop is requested, not when the lock finally becomes free.
    this.beginStop(key);
    await this.withLock(key, async () => {
      await this.stopChildren(key);
    });
  }

  /**
   * Hard teardown: detach, drop the FcaApi, evict the entry entirely.
   * Fired by sessionManager.unregister() so a rebuilt listener closure starts from
   * zero state instead of inheriting a stale handle from a previous account.
   */
  async destroySession(key: string): Promise<void> {
    if (!this.#entries.has(key)) return;
    await this.detachSession(key);
    const entry = this.#entries.get(key);
    if (entry) entry.api = null;
    this.#entries.delete(key);
  }
}

export const appstateManager = new AppstateManager();