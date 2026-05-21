/**
 * onChat runner — passive middleware execution with role and ban enforcement.
 *
 * Runs every command's onChat handler for each incoming message regardless of
 * prefix. Used for cross-cutting concerns like logging that process every message.
 *
 * ── Access Control ────────────────────────────────────────────────────────────
 * Before fanning out, this runner pre-resolves the sender's effective role tier
 * and ban status once per message. Each module's config.role is then compared
 * against the cached tier — modules whose required role exceeds the sender's
 * tier are skipped silently (no response, no next() equivalent).
 *
 * Truth table (invoker → required role):
 *   Any user      → ANYONE (0) only
 *   THREAD_ADMIN  → ANYONE + THREAD_ADMIN
 *   PREMIUM       → ANYONE + THREAD_ADMIN + PREMIUM
 *   BOT_ADMIN     → ANYONE + THREAD_ADMIN + PREMIUM + BOT_ADMIN
 *   SYSTEM_ADMIN  → all tiers (full access)
 *
 * Ban enforcement mirrors enforceNotBanned from on-command.middleware.ts:
 * banned users and threads are silently skipped. Admins (BOT_ADMIN, SYSTEM_ADMIN)
 * bypass both role and ban checks.
 *
 * Fail-open: on any DB error the sender is treated as ANYONE with no bans
 * so a transient DB outage never silently suppresses legitimate passive handlers.
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * Handlers are independent passive observers with no ordering dependency,
 * so they are fanned out in parallel via Promise.allSettled. This collapses
 * O(N × T) sequential latency into O(max_T) — critical because onChat runs on
 * every message before any prefix check or command guard.
 */

import type { BaseCtx, CommandMap } from '@/engine/types/controller.types.js';
// Platform filter — respects config.platform[] declared by each command module
import { isPlatformAllowed } from '@/engine/modules/platform/platform-filter.util.js';
// Role and ban enforcement — same repo functions as onCommand middleware but applied
import { isThreadAdmin } from '@/engine/repos/threads.repo.js';
import { isBotAdmin, isBotPremium } from '@/engine/repos/credentials.repo.js';
import { Role, type RoleLevel } from '@/engine/constants/role.constants.js';
import { isUserBanned, isThreadBanned } from '@/engine/repos/banned.repo.js';
import { isSystemAdmin } from '@/engine/repos/system-admin.repo.js';

/**
 * Fans out to every command's onChat handler — used for passive middleware
 * like the logger module that processes every message regardless of prefix.
 *
 * Per-module access control runs before each task is enqueued:
 *   1. Platform exclusion (config.platform[]) — skip incompatible platforms.
 *   2. Ban guard — silently skip banned senders or banned threads.
 *   3. Role guard — silently skip modules whose config.role exceeds the sender's tier.
 *
 * All three guards are silent — no reply is sent, consistent with the
 * passive-observer contract of onChat handlers.
 */
export async function runOnChat(
  commands: CommandMap,
  ctx: BaseCtx,
): Promise<void> {
  // Deduplicate by module reference before fan-out — loadCommands() registers one Map key
  // per command name AND one per alias, all pointing to the same module object. Without
  // this guard, a module with N aliases fires onChat N+1 times per message (e.g. ai.ts
  // with aliases ['chatgpt', 'bot'] would call onChat 3× and send 3 AI replies).
  const seen = new Set<Record<string, unknown>>();

  // Resolve session identity once — shared across all module guards in this fan-out.
  // Avoids repeating the same native context reads inside each module iteration.
  const sessionUserId = ctx.native.userId ?? '';
  const sessionId = ctx.native.sessionId ?? '';
  const platform = ctx.native.platform;
  // senderID falls back to userID for edge-case events (reactions, system messages)
  // that still route through the onChat pipeline on some platforms.
  const senderID = (ctx.event['senderID'] ?? ctx.event['userID'] ?? '') as string;
  const threadID = (ctx.event['threadID'] ?? '') as string;

  // Pre-resolve the sender's effective role tier and ban status ONCE before the fan-out.
  // Comparing each module's config.role against this cached value avoids N independent
  // DB round-trips for N modules with onChat handlers on every message.
  // Fail-open: on any DB error the sender is treated as ANYONE with no bans so a
  // transient DB outage never silently suppresses legitimate passive handlers.
  let resolvedRole: RoleLevel = Role.ANYONE;
  let userBanned = false;
  let threadBanned = false;

  if (sessionUserId && sessionId && senderID) {
    try {
      // Check from highest privilege downward — first match sets the effective tier and stops.
      // Bot-admin and system-admin status also bypass the ban check entirely, mirroring
      // enforceNotBanned in on-command.middleware.ts where admins retain full access
      // regardless of ban table state — the same contract must hold for passive handlers.
      const adminResult = await isBotAdmin(
        sessionUserId,
        platform,
        sessionId,
        senderID,
      );
      // Avoid the isSystemAdmin DB call when isBotAdmin already returned true —
      // the short-circuit mirrors the pattern in enforcePermission middleware.
      const sysAdminResult = adminResult
        ? false
        : await isSystemAdmin(senderID);

      if (sysAdminResult) {
        resolvedRole = Role.SYSTEM_ADMIN;
        // No ban checks for system admins — full access regardless of ban table state
      } else if (adminResult) {
        resolvedRole = Role.BOT_ADMIN;
        // No ban checks for bot admins — same bypass as enforceNotBanned in onCommand
      } else {
        // Non-admin: resolve premium status, thread-admin status, and both ban flags in
        // parallel — all four results are needed before the per-module guard loop runs,
        // and running them concurrently collapses four DB round-trips into one wait.
        const [
          premiumResult,
          threadAdminResult,
          userBannedResult,
          threadBannedResult,
        ] = await Promise.all([
          isBotPremium(sessionUserId, platform, sessionId, senderID),
          threadID
            ? isThreadAdmin(threadID, senderID)
            : Promise.resolve(false),
          isUserBanned(sessionUserId, platform, sessionId, senderID),
          threadID
            ? isThreadBanned(sessionUserId, platform, sessionId, threadID)
            : Promise.resolve(false),
        ]);

        // PREMIUM (2) outranks THREAD_ADMIN (1) per truth table —
        // both grant ANYONE + THREAD_ADMIN access, but PREMIUM additionally
        // unlocks PREMIUM-gated onChat handlers. Resolve the higher tier when both are true.
        if (premiumResult) {
          resolvedRole = Role.PREMIUM;
        } else if (threadAdminResult) {
          resolvedRole = Role.THREAD_ADMIN;
        }

        userBanned = userBannedResult;
        threadBanned = threadBannedResult;
      }
    } catch {
      // Fail-open: DB errors must never silently suppress legitimate onChat handlers.
      // resolvedRole remains ANYONE and ban flags remain false — all modules run.
    }
  }

  // Collect all onChat promises before awaiting so every eligible module starts
  // immediately — no module waits for the previous module's onChat to resolve.
  const tasks: Promise<void>[] = [];
  for (const [name, mod] of commands) {
    if (seen.has(mod)) continue;
    seen.add(mod);
    if (typeof mod['onChat'] === 'function') {
      // Skip modules that explicitly exclude this platform via config.platform[]
      if (!isPlatformAllowed(mod, ctx.native.platform)) continue;

      // Silently skip banned senders — no response, consistent with the passive-observer
      // contract of onChat. Admins always have resolvedRole ≥ BOT_ADMIN(3) and their
      // ban flags are never set (userBanned/threadBanned resolved in the non-admin else
      // branch above, which adminResult/sysAdminResult short-circuits skip entirely).
      if (userBanned || threadBanned) continue;

      // Silently skip modules whose required role exceeds the sender's effective tier.
      // Simple numeric comparison is correct because the truth table is monotone:
      //   SYSTEM_ADMIN(4) ≥ BOT_ADMIN(3) ≥ PREMIUM(2) ≥ THREAD_ADMIN(1) ≥ ANYONE(0).
      // No response is sent — onChat is a passive observer, not an interactive dispatcher.
      const cfg = mod['config'] as { role?: number } | undefined;
      const requiredRole = cfg?.role ?? Role.ANYONE;
      if (resolvedRole < requiredRole) continue;

      tasks.push(
        (mod['onChat'] as (ctx: BaseCtx) => Promise<void>)(ctx).catch(
          (err: unknown) => console.error(`❌ onChat "${name}" failed`, err),
        ),
      );
    }
  }
  // allSettled (not all) as belt-and-suspenders: individual .catch() handlers above absorb
  // per-module errors, but allSettled guarantees we wait for every task even if one throws
  // synchronously before returning a Promise — preventing silent fire-and-forget behaviour.
  await Promise.allSettled(tasks);
}
