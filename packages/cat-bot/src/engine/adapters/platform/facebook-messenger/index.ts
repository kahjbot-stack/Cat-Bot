/**
 * Facebook Messenger Platform Entry Point — Appstate-Manager Edition
 *
 * ── Ownership tree ────────────────────────────────────────────────────────────
 *   sessionManager        root    key `${userId}:${platform}:${sessionId}`
 *     └── appstateManager parent  key `${userId}:${sessionId}`
 *           ├── child 'mqtt'      exactly one fca listenMqtt handle
 *           └── child 'e2ee'      exactly one FBClient (Signal/Noise) instance
 *
 * Every lifecycle signal enters at sessionManager, is forwarded by this listener to
 * appstateManager, and cascades to the two children. THIS FILE CACHES NO STATE:
 * no activeFcaApi, no listener handle, no fbClient, no module-level registry. A
 * re-created closure (spawnDynamicSession slow path) therefore cannot resurrect a
 * dead transport — which was the mechanism behind three sessions merging into one
 * Facebook account.
 *
 * ── Concurrency ───────────────────────────────────────────────────────────────
 *   1. appstateManager.withLock  — boot / detach / E2EE-reconnect are serialised per account.
 *   2. Child token fencing       — a callback whose token is stale returns immediately.
 *   3. claimChild()              — synchronous CAS: an error burst yields one restart.
 *   4. boot() calls stopChildren() first — the "one handle per child key" invariant
 *      survives an aborted retry, a mid-boot stop, and a credential rotation.
 *
 * ── Unified emitter contract (unchanged) ──────────────────────────────────────
 *   'message', 'message_reply', 'message_reaction', 'message_unsend', 'event'
 *   Payload: { api: UnifiedApi, event: UnifiedEvent, native, prefix }
 */

import { EventEmitter } from 'events';

import type { FacebookMessengerEmitter, FcaApi } from './types.js';
export type { StartBotConfig, StartBotResult } from './types.js';

import type { UnifiedApi } from '@/engine/adapters/models/api.model.js';
import { createLogger } from '@/engine/modules/logger/logger.lib.js';
import type { SessionLogger } from '@/engine/modules/logger/logger.lib.js';
import { startBot, unbindFcaLoggerBridge } from './login.js';
import { routeRawEvent, routeFbClientEvent } from './event-router.js';
// isAuthError classifies MQTT callback errors as permanent vs recoverable.
// withRetry is absent by design — platform-runner.lib.ts owns every retry loop.
import { isAuthError } from '@/engine/lib/retry.lib.js';
import { sessionManager } from '@/engine/modules/session/session-manager.lib.js';
import { runManagedSession } from '@/engine/lib/platform-runner.lib.js';
import { appstateManager } from './appstate-manager.lib.js';

import {
  PLATFORM_TO_ID,
  Platforms,
} from '@/engine/modules/platform/platform.constants.js';
import { botRepo } from '@/server/repos/bot.repo.js';
import { env } from '@/engine/config/env.config.js';

// Re-export startBot so integration tests and the validation controller can log in directly.
export { startBot };

// ── Listener config ────────────────────────────────────────────────────────────

export interface FbMessengerListenerConfig {
  /** JSON.stringify'd fca-unofficial session cookie blob from the database. */
  appstate: string;
  prefix: string;
  userId: string;
  sessionId: string;
}

// ── FME (E2EE) logger bridge — keyed, same rationale as the fca bridge in login.ts ──

const fmeBridges = new Map<string, () => void>();

function unbindFmeLogger(key: string): void {
  const detach = fmeBridges.get(key);
  if (!detach) return;
  fmeBridges.delete(key);
  detach();
}

/**
 * Binds FME structured log output to the session logger, replacing any previous binding
 * for this key. Without the replace, every E2EE reconnect stacks another four handlers
 * on what may be a process-wide emitter — leaking listeners and cross-posting one
 * account's E2EE output into every other session's dashboard console.
 */
function bindFmeLogger(
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fmeInstance: (opts: { emitLogger: boolean }) => any,
  sessionLogger: SessionLogger,
): void {
  unbindFmeLogger(key);
  const { fmeLogger } = fmeInstance({ emitLogger: true }) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fmeLogger: any;
  };

  const handlers: Array<[string, (l: { message: string }) => void]> = [
    ['info', (l) => sessionLogger.info(`[facebook-messenger] [fme] ${l.message}`)],
    ['warn', (l) => sessionLogger.warn(`[facebook-messenger] [fme] ${l.message}`)],
    ['error', (l) => sessionLogger.error(`[facebook-messenger] [fme] ${l.message}`)],
  ];
  for (const [event, fn] of handlers) fmeLogger.on(event, fn);

  fmeBridges.set(key, () => {
    for (const [event, fn] of handlers) {
      const detach = fmeLogger.off ?? fmeLogger.removeListener;
      detach?.call(fmeLogger, event, fn);
    }
  });
}

// ── Platform Listener ──────────────────────────────────────────────────────────

/**
 * Creates a Facebook Messenger platform listener for one account session.
 * Call .start() to boot, .stop() for a soft detach, .destroy() for a hard eviction.
 */
export function createFacebookMessengerListener(
  config: FbMessengerListenerConfig,
): FacebookMessengerEmitter {
  const emitter = new EventEmitter() as FacebookMessengerEmitter;

  const sessionLogger = createLogger({
    userId: config.userId,
    platformId: PLATFORM_TO_ID[Platforms.FacebookMessenger],
    sessionId: config.sessionId,
  });

  // Root key (sessionManager) and parent key (appstateManager) — constant for the closure.
  const smKey = `${config.userId}:${Platforms.FacebookMessenger}:${config.sessionId}`;
  const asKey = appstateManager.buildKey(config.userId, config.sessionId);

  // The only two values this closure retains. Neither is transport state: apiFactory is a
  // pure function from wrapper.js, activePrefix is a plain string re-read from the DB on boot.
  let apiFactory:
    | ((fcaApi: FcaApi, sessionId: string, userId: string) => UnifiedApi)
    | null = null;
  let activePrefix = config.prefix;

  // ── MQTT child ───────────────────────────────────────────────────────────────

  /**
   * Attaches exactly one listenMqtt handle to the 'mqtt' child slot.
   * Resolves once MQTT confirms 'connect' so runManagedSession marks the session active
   * only after events can actually flow.
   */
  const attachMqtt = (api: FcaApi, prefix: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      // Reserve the generation BEFORE constructing the transport — a callback firing
      // during listenMqtt() construction is then already covered by the fence.
      const token = appstateManager.nextChildToken(asKey, 'mqtt');
      let connected = false;

      const fail = (err: unknown, isAuth: boolean): void => {
        // Synchronous CAS — the first callback of an error burst wins; the rest drop.
        if (!appstateManager.claimChild(asKey, 'mqtt', token)) return;
        if (isAuth) {
          // Flag for a full re-login: the cookie was invalidated server-side, so a
          // fast-path MQTT reattach on the cached FcaApi would fail identically.
          appstateManager.invalidate(asKey);
        }
        void sessionManager.markInactive(smKey);

        void (async () => {
          await appstateManager.stopChildren(asKey);

          if (!connected) {
            // Pre-connect: boot()'s Promise is still pending. Rejecting hands control to
            // the runner's backoff loop. A RAW auth error would make shouldRetry() return
            // false and permanently halt the runner even though a fresh login would work —
            // so auth failures are re-wrapped as a retryable error.
            reject(
              isAuth
                ? new Error(
                    '[facebook-messenger] MQTT session inactive — re-login scheduled for next retry',
                  )
                : err instanceof Error
                  ? err
                  : new Error(String(err)),
            );
            return;
          }
          // Post-connect: boot() already resolved, so reject() is a no-op. Re-enter the
          // runner; its isLocked / isRetrying guards keep exactly one loop alive per key.
          if (appstateManager.isStopping(asKey)) return;
          void emitter.start();
        })();
      };

      const handle = api.listenMqtt((err, rawEvent, state) => {
        // Zombie fence: a superseded generation can neither emit nor reconnect.
        if (!appstateManager.isChildCurrent(asKey, 'mqtt', token)) return;

        if (err) {
          sessionLogger.error('[facebook-messenger] MQTT error', { error: err });
          fail(err, isAuthError(err));
          return;
        }

        if (state) {
          sessionLogger.info(`[facebook-messenger] MQTT state: ${state.type}`, {
            mqttState: state,
          });
          if (state.type === 'connect') {
            connected = true;
            resolve();
            return;
          }
          // fca fires close/disconnect/error as a STATE, not an err — without this branch
          // a server-side idle timeout kills the session silently.
          if (
            state.type === 'close' ||
            state.type === 'disconnect' ||
            state.type === 'error'
          ) {
            // stopChildren() during a deliberate stop() triggers 'close'; do not race it.
            if (appstateManager.isStopping(asKey)) return;
            fail(new Error(`[facebook-messenger] MQTT ${state.type}`), false);
          }
          return;
        }

        // Guard routing so a malformed payload never throws through fca's synchronous
        // callback and silently kills the entire MQTT connection.
        try {
          const apiWrapper = apiFactory!(api, config.sessionId, config.userId);
          const native = {
            userId: config.userId,
            sessionId: config.sessionId,
            platform: Platforms.FacebookMessenger,
            api,
            event: rawEvent,
            fbAccountId: appstateManager.getFbAccountId(asKey),
          };
          routeRawEvent(rawEvent, apiWrapper, native, emitter, prefix);
        } catch (routeErr) {
          sessionLogger.error(
            '[facebook-messenger] routeRawEvent failed (event dropped)',
            { error: routeErr },
          );
        }
      });

      // A concurrent stop() during listenMqtt() would otherwise leave this connection
      // running with no owner and no way to reach it — close it immediately instead.
      const attached = appstateManager.attachChild(
        asKey,
        'mqtt',
        { instance: handle, stop: () => handle.stopListeningAsync() },
        token,
      );
      if (!attached) {
        void handle.stopListeningAsync().catch(() => undefined);
        reject(
          new Error(
            '[facebook-messenger] MQTT attach superseded by a newer generation',
          ),
        );
      }
    });

  // ── E2EE child ───────────────────────────────────────────────────────────────

  /**
   * Rebuilds the E2EE child after a transport failure.
   *
   * A fresh FBClient is mandatory: disconnect() tears down the internal API reference,
   * so connectE2EE() on the same object throws "Client is not connected" forever after.
   * claimChild() ensures only one reconnect is in flight; it bumps ONLY the e2ee token,
   * leaving the live MQTT callback untouched.
   */
  const reconnectE2EE = (token: number): void => {
    if (appstateManager.isStopping(asKey)) return;
    if (!appstateManager.claimChild(asKey, 'e2ee', token)) return;

    void (async () => {
      try {
        await appstateManager.stopChild(asKey, 'e2ee');
        await appstateManager.withLock(asKey, async () => {
          if (appstateManager.isStopping(asKey)) return;
          // E2EE rides on the FCA session; if MQTT dropped too, let its reconnect win.
          if (!appstateManager.getApi(asKey)) {
            sessionLogger.error(
              '[facebook-messenger] E2EE reconnect skipped — MQTT session unavailable',
            );
            return;
          }
          await attachE2EE(activePrefix);
        });
        sessionLogger.info('[facebook-messenger] E2EE reconnection successful');
      } catch (reconnectErr) {
        const msg =
          reconnectErr instanceof Error
            ? reconnectErr.message
            : String(reconnectErr);
        sessionLogger.error(
          `[facebook-messenger] E2EE reconnection failed: ${msg}`,
        );
      }
    })();
  };

  /**
   * Attaches exactly one FBClient to the 'e2ee' child slot.
   *
   * The E2EE transport runs concurrently with plaintext MQTT — both are children of the
   * same appstate entry, so a stop() at the parent tears them down in the correct order
   * (e2ee first, so the Signal handshake flushes before the FCA connection disappears).
   */
  const attachE2EE = async (prefix: string): Promise<void> => {
    const api = appstateManager.getApi(asKey);
    if (!api) {
      throw new Error(
        '[facebook-messenger] Cannot attach E2EE — no active FcaApi for this session',
      );
    }

    // Dynamic obscure import keeps tsc from traversing fca-cat-bot's broken .ts files
    const pkg = 'fca-cat-bot';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { FBClient: FBC, fmeInstance } = (await import(pkg)) as any;
    // Bind BEFORE instantiation so no early FME output is missed; keyed so a reconnect
    // replaces rather than stacks the handlers.
    bindFmeLogger(asKey, fmeInstance, sessionLogger);

    // Reserve the generation before constructing — onEvent may fire during connect().
    const token = appstateManager.nextChildToken(asKey, 'e2ee');
    // A fresh FBClient every time: disconnect() destroys the internal API reference, so
    // connectE2EE() on a reused instance throws "Client is not connected" permanently.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fbClient: any = new FBC({ platform: 'messenger', api });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbClient.onEvent((event: any) => {
      // Zombie fence — a superseded FBClient can neither emit nor trigger a reconnect.
      if (!appstateManager.isChildCurrent(asKey, 'e2ee', token)) return;

      // 'error' / 'disconnected' are transport failures, not routable messages.
      if (
        event.type === 'error' ||
        (event.type === 'disconnected' && event.data?.isE2EE)
      ) {
        sessionLogger.warn(
          `[facebook-messenger] E2EE ${String(event.type)} — reconnecting...`,
          { data: event.data as Record<string, unknown> },
        );
        reconnectE2EE(token);
        return;
      }

      try {
        const apiWrapper = apiFactory!(api, config.sessionId, config.userId);
        const native = {
          userId: config.userId,
          sessionId: config.sessionId,
          platform: Platforms.FacebookMessenger,
          api,
          fbClient,
          event,
          // Identity propagation mirrors the MQTT path for diagnostic parity.
          fbAccountId: appstateManager.getFbAccountId(asKey),
        };
        routeFbClientEvent(event, apiWrapper, native, emitter, prefix);
      } catch (routeErr) {
        sessionLogger.error(
          '[facebook-messenger] E2EE routeFbClientEvent failed',
          { error: routeErr },
        );
      }
    });

    // Superseded by a concurrent stop()/reconnect — close the orphan rather than leak it.
    const attached = appstateManager.attachChild(
      asKey,
      'e2ee',
      { instance: fbClient, stop: () => fbClient.disconnect() },
      token,
    );
    if (!attached) {
      await Promise.resolve(fbClient.disconnect()).catch(() => undefined);
      throw new Error(
        '[facebook-messenger] E2EE attach superseded by a newer generation',
      );
    }

    const { userId: clientUserId } = (await fbClient.connect()) as {
      userId: string;
    };
    await fbClient.connectE2EE({
      userId: clientUserId,
      // Device data lives on the appstate entry so Signal identity survives a reconnect.
      deviceData: appstateManager.getDeviceData(asKey),
      onUpdateDevice: (data: string) =>
        appstateManager.setDeviceData(asKey, data),
    });
  };

  // ── Runner hooks ─────────────────────────────────────────────────────────────

  /**
   * Tears down partial state between retry attempts. Called by runManagedSession before
   * each non-first attempt. The FcaApi is deliberately preserved so a still-valid cookie
   * can reattach MQTT without burning a re-login.
   */
  const cleanup = async (): Promise<void> => {
    await appstateManager.stopChildren(asKey);
  };

  /**
   * One boot attempt. Everything after ensure() runs under the appstate lock, so a
   * concurrent stop()/destroy()/E2EE-reconnect can never interleave with it.
   * markActive is NOT called here — runManagedSession fires it after boot() resolves.
   */
  const boot = async (): Promise<void> => {
    // Deferred: wrapper.js pulls in every lib/* file, any of which may throw at
    // evaluation time. apiFactory is a pure function — not transport state.
    const { createFacebookApi } = await import('./wrapper.js');
    apiFactory = createFacebookApi;

    sessionLogger.info('[facebook-messenger] Starting Listener...');

    // Refresh credentials on EVERY attempt so a dashboard credential update always
    // takes effect on the next retry without a process restart.
    const botDetail = await botRepo.getById(config.userId, config.sessionId);
    const appstate =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((botDetail?.credentials as any)?.appstate as string | undefined) ??
      config.appstate;
    activePrefix = botDetail?.prefix ?? config.prefix;
    const prefix = activePrefix;

    const ensured = appstateManager.ensure(
      config.userId,
      config.sessionId,
      appstate,
    );

    await appstateManager.withLock(asKey, async () => {
      // Idempotent boot: any surviving child from an aborted retry, a mid-boot stop, or
      // a credential rotation is closed here. This is what structurally guarantees the
      // "exactly one mqtt handle + one e2ee handle" invariant per appstate key.
      await appstateManager.stopChildren(asKey);
      // Re-arm inside the lock: a stop() that won the race set isStopping before we
      // acquired it, and every child callback consults this flag.
      appstateManager.beginStart(asKey);

      if (appstateManager.needsLogin(asKey)) {
        sessionLogger.info(
          ensured === 'rotated'
            ? '[facebook-messenger] Re-login required — appstate updated via dashboard'
            : ensured === 'created'
              ? '[facebook-messenger] No existing session — initial login'
              : '[facebook-messenger] Re-login required — previous session was flagged invalid',
        );
        await appstateManager.login(asKey, sessionLogger, startBot);
      } else {
        sessionLogger.info(
          '[facebook-messenger] Session intact — reattaching MQTT listener without re-login',
        );
      }

      const api = appstateManager.getApi(asKey);
      if (!api) {
        throw new Error(
          '[facebook-messenger] FcaApi missing after login — aborting boot',
        );
      }

      // boot() resolves only once MQTT reports 'connect', so the dashboard never shows a
      // session as online before events can actually flow.
      await attachMqtt(api, prefix);

      if (env.FCA_ENABLE_E2EE) {
        try {
          await attachE2EE(prefix);
          sessionLogger.info(
            '[facebook-messenger] Native E2EE connection established',
          );
        } catch (error) {
          // Non-fatal: plaintext MQTT is live. E2EE alone must not fail the whole boot.
          const message =
            error instanceof Error ? error.message : String(error);
          sessionLogger.error(
            `[facebook-messenger] Native E2EE connection failed: ${message}`,
          );
        }
      }

      sessionLogger.info('[facebook-messenger] Listener active');
    });
  };

  // ── Lifecycle surface consumed by sessionManager ─────────────────────────────

  emitter.start = async (): Promise<void> => {
    await runManagedSession({
      smKey,
      sessionLogger,
      label: '[facebook-messenger]',
      boot,
      cleanup,
    });
  };

  /**
   * Soft stop: closes both children, keeps the appstate entry and FcaApi so a subsequent
   * Start reattaches MQTT without a re-login (avoiding needless Meta auth traffic).
   */
  emitter.stop = async (_signal?: string): Promise<void> => {
    if (sessionManager.isLocked(smKey)) return;
    sessionManager.markLocked(smKey);
    try {
      sessionLogger.info('[facebook-messenger] Stopping Listener...');
      await appstateManager.detachSession(asKey);
    } finally {
      sessionManager.markUnlocked(smKey);
    }
  };

  /**
   * Hard teardown, invoked by sessionManager.unregister(). Evicts the appstate entry and
   * both logger bridges so a rebuilt closure — from credential rotation, ban, or delete —
   * inherits nothing at all. This is the guarantee that no zombie FcaApi survives anywhere.
   */
  emitter.destroy = async (): Promise<void> => {
    sessionLogger.info('[facebook-messenger] Destroying session state...');
    await appstateManager.destroySession(asKey);
    unbindFcaLoggerBridge(asKey);
    unbindFmeLogger(asKey);
    apiFactory = null;
  };

  return emitter;
}