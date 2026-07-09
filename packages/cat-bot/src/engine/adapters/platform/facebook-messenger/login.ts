/**
 * Facebook Messenger — Authentication (per-session scoped, stateless)
 *
 * startBot() performs an fca-unofficial login and returns a FRESH FcaApi handle.
 * It caches NOTHING. The appstate manager is the single owner of every api handle,
 * keyed by `${userId}:${sessionId}` — so a caller that loses its reference can never
 * resurrect a zombie api from this module.
 *
 * Does NOT start MQTT listening. That is owned exclusively by the appstate manager's
 * 'mqtt' child slot, guaranteeing exactly one listener per connection at all times.
 *
 * ── Logger bridging is keyed too ──────────────────────────────────────────────
 * fcaInstance({ emitLogger: true }) may hand back a process-wide emitter. Binding four
 * handlers on every login therefore (a) leaks listeners on each retry and (b) fans one
 * account's login output into every other session's dashboard console — which is itself
 * a source of "these sessions look merged" confusion. bindFcaLoggerBridge() removes the
 * previous binding for the same key before installing a new one; transient (unkeyed)
 * callers such as the credential-validation endpoint unbind as soon as login settles.
 */

import { randomUUID } from 'node:crypto';
import type { StartBotConfig, StartBotResult } from './types.js';
import type { SessionLogger } from '@/engine/modules/logger/logger.lib.js';

interface FcaLogEntry {
  message: string;
}

/** Minimal emitter contract — fca-cat-bot ships no types; only these members are used. */
interface FcaLoggerEmitter {
  on(event: string, listener: (entry: FcaLogEntry) => void): void;
  off?(event: string, listener: (entry: FcaLogEntry) => void): void;
  removeListener?(event: string, listener: (entry: FcaLogEntry) => void): void;
}

/** key → detach closure. Exactly one live bridge per key, ever. */
const loggerBridges = new Map<string, () => void>();

/**
 * Removes the fca logger handlers previously bound for this key.
 * Exported so index.ts can detach when the appstate entry is destroyed.
 */
export function unbindFcaLoggerBridge(key: string): void {
  const detach = loggerBridges.get(key);
  if (!detach) return;
  loggerBridges.delete(key);
  detach();
}

function bindFcaLoggerBridge(
  key: string,
  fcaLogger: FcaLoggerEmitter,
  sessionLogger: SessionLogger,
): void {
  // Idempotent: a re-login for the same key replaces, never stacks, the handlers.
  unbindFcaLoggerBridge(key);

  const handlers: Array<[string, (entry: FcaLogEntry) => void]> = [
    ['info', (l) => sessionLogger.info(`[facebook-messenger] ${l.message}`)],
    ['warn', (l) => sessionLogger.warn(`[facebook-messenger] ${l.message}`)],
    ['error', (l) => sessionLogger.error(`[facebook-messenger] ${l.message}`)],
    ['log', (l) => sessionLogger.info(`[facebook-messenger] ${l.message}`)],
  ];

  for (const [event, fn] of handlers) fcaLogger.on(event, fn);

  // Capture the exact emitter instance — a later fcaInstance() call may return a
  // different object, and detaching from the wrong one would silently leak.
  loggerBridges.set(key, () => {
    for (const [event, fn] of handlers) {
      const detach = fcaLogger.off ?? fcaLogger.removeListener;
      detach?.call(fcaLogger, event, fn);
    }
  });
}

/**
 * Logs in via fca-unofficial using the appstate string loaded from the database.
 *
 * Rejects rather than calling process.exit() so the platform runner's retry loop can
 * classify the failure (auth → permanent; transient → backoff).
 */
export async function startBot(
  config: StartBotConfig,
  sessionLogger: SessionLogger,
): Promise<StartBotResult> {
  let appState: unknown;
  try {
    // appstate is JSON.stringify'd in the DB — parse back to the array fca expects
    appState = JSON.parse(config.appstate) as unknown;
  } catch (err) {
    sessionLogger.error(
      '[facebook-messenger] Failed to parse appstate from database',
      { error: err },
    );
    throw new Error(
      '[facebook-messenger] Invalid appstate: JSON.parse failed — ' +
        'ensure the appstate column contains a valid JSON-serialised array',
      // Attach root cause to preserve the full error stack for debugging
      { cause: err },
    );
  }

  // Dynamic obscure import prevents tsc from compiling fca-cat-bot's broken .ts files
  const pkg = 'fca-cat-bot';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fcaInstance } = (await import(pkg)) as any;

  const { login, fcaLogger } = fcaInstance({ emitLogger: true }) as {
    login: (
      opts: { appState: unknown },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb: (err: any, api: any) => void,
    ) => void;
    fcaLogger: FcaLoggerEmitter;
  };

  // The validation endpoint calls startBot() without a key — give it a throwaway
  // bridge key so its handlers are detached the moment the login promise settles.
  const isTransient = config.key === undefined;
  const bridgeKey = config.key ?? `transient:${randomUUID()}`;
  bindFcaLoggerBridge(bridgeKey, fcaLogger, sessionLogger);

  try {
    return await new Promise<StartBotResult>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      login({ appState }, async (err: any, api: any) => {
        if (err) {
          sessionLogger.error('[facebook-messenger] Login failed', { error: err });
          reject(err);
          return;
        }

        api.setOptions({
          listenEvents: true,
          selfListen: false,
          forceLogin: true,
        });

        // Second validation layer: a parseable appstate can still be a dead session.
        let dtsgOk = true;
        await new Promise<void>((settle) => {
          // Guard the absence case — the original `api.refreshFb_dtsg?.(cb)` left this
          // Promise pending forever when the method was missing, hanging boot() entirely.
          if (typeof api.refreshFb_dtsg !== 'function') {
            settle();
            return;
          }
          api.refreshFb_dtsg(
            (_e: unknown, info: { data?: { fb_dtsg?: string } }) => {
              if (!info?.data?.fb_dtsg) dtsgOk = false;
              settle();
            },
          );
        });

        if (!dtsgOk) {
          // Wording matters: isAuthError() matches this string to mark the failure
          // permanent so the runner stops retrying an appstate that cannot recover.
          reject(
            new Error(
              'Could not find fb_dtsg in HTML after requesting Facebook.',
            ),
          );
          return;
        }

        sessionLogger.info('[facebook-messenger] Bot initialised successfully!');
        resolve({ api: api as StartBotResult['api'], listener: null });
      });
    });
  } finally {
    if (isTransient) unbindFcaLoggerBridge(bridgeKey);
  }
}