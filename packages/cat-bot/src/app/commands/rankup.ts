/**
 * /rankup — Passive EXP System + Per-Thread Level-Up Notifications
 *
 * Two responsibilities unified in one module:
 *
 *   onChat  — fires on EVERY message (passive XP accumulation)
 *             +1 EXP per message; notifies the thread when a user levels up,
 *             if rankup notifications are enabled for that thread.
 *             On level-up, sends a rank card image via the Wajiro
 *             /api/v1/rankup-card3 endpoint (Discord/Messenger) or
 *             /api/v1/rankup-card4 endpoint (Telegram).
 *
 *   onCommand — /rankup on | off
 *             Toggles level-up notifications for the current thread.
 *             Requires THREAD_ADMIN role — only group admin can change
 *             whether chat gets spammed with congratulation messages.
 *
 * EXP collection schema (bot_users_session.data → "xp" key):
 *   { exp: number }  — raw accumulated experience points
 *
 * Thread settings schema (bot_threads_session.data → "rankup_settings" key):
 *   { enabled: boolean }  — defaults to true when key is absent (fail-open)
 *
 * The same DELTA_NEXT and level formula used here must match rank.ts.
 * Extract to a shared utility if additional economy commands are added.
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { ButtonStyle } from '@/engine/constants/button-style.constants.js';
import { hasNativeButtons } from '@/engine/utils/ui-capabilities.util.js';
import { createUrl } from '@/engine/utils/api.util.js';
import { Platforms } from '@/engine/modules/platform/platform.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

/** Must match the constant in rank.ts — controls EXP-to-level curve. */
const DELTA_NEXT = 5;

/** Name of the collection inside bot_threads_session.data for rankup settings. */
const SETTINGS_COLLECTION = 'rankup_settings';

/** Converts raw EXP to a level number. Mirrors rank.ts implementation. */
function expToLevel(exp: number): number {
  if (exp <= 0) return 0;
  return Math.floor((1 + Math.sqrt(1 + (8 * exp) / DELTA_NEXT)) / 2);
}

/** Minimum EXP required to reach a specific level. Mirrors rank.ts implementation. */
function levelToExp(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(((level * level - level) * DELTA_NEXT) / 2);
}

export const config: CommandConfig = {
  name: 'rankup',
  aliases: [] as string[],
  version: '1.0.0',
  role: Role.THREAD_ADMIN,
  author: 'John Lester',
  description:
    'Toggle level-up notifications for this thread (on/off). Gains EXP passively on every message.',
  category: 'Economy',
  usage: '[on | off]',
  cooldown: 5,
  hasPrefix: true,
  options: [
    {
      type: OptionType.string,
      name: 'action',
      description: 'Toggle state: "on" or "off"',
      required: false,
    },
  ],
};

/**
 * Builds a rank-up card image via the platform-appropriate endpoint:
 *   Discord / Messenger → Wajiro /api/v1/rankup-card3
 *   Telegram            → /api/v1/rankup-card4  (separate host)
 *
 * Fields sent:
 *   file       — avatar image buffer (uploaded as multipart)
 *   username   — display name of the user who levelled up
 *   level      — the level the user just reached
 *   currentXp  — EXP accumulated within this level span
 *   requiredXp — total EXP needed to complete this level
 *   rank       — leaderboard position across all session users
 *
 * Returns the image buffer on success, or null when any step fails.
 */
async function buildRankupCard(
  avatarUrl: string,
  username: string,
  currentLevel: number,
  newExp: number,
  rank: number,
  platform: string,
): Promise<Buffer | null> {
  // Download the avatar as a raw buffer — the API requires a file upload,
  // not a remote URL reference, so we cannot pass the URL directly.
  const avatarRes = await fetch(avatarUrl);
  if (!avatarRes.ok) return null;
  const avatarBuffer = Buffer.from(await avatarRes.arrayBuffer());

  // EXP values relative to the current level span.
  const currentBase = levelToExp(currentLevel);
  const nextBase    = levelToExp(currentLevel + 1);
  const currentXp   = newExp - currentBase;
  const requiredXp  = nextBase - currentBase;

  // Pick the endpoint based on platform.
  // Telegram uses rankup-card4 (separate host); all others use rankup-card3.
  const apiUrl =
    platform === Platforms.Telegram
      ? createUrl('wajiro', '/api/v1/rankup-card3')
      : createUrl('wajiro', '/api/v1/rankup-card2');
  if (!apiUrl) return null;

  const form = new FormData();
  form.append('file',       new Blob([avatarBuffer], { type: 'image/png' }), 'avatar.png');
  form.append('username',   username);
  form.append('level',      String(currentLevel));
  form.append('currentXp',  String(currentXp));
  form.append('requiredXp', String(requiredXp));
  form.append('rank',       String(rank));

  const cardRes = await fetch(apiUrl, { method: 'POST', body: form });
  if (!cardRes.ok) return null;

  return Buffer.from(await cardRes.arrayBuffer());
}

/**
 * Passive EXP accumulator — runs for every message before command dispatch.
 *
 * Reads current EXP, increments by 1, writes back. If the new EXP crosses a
 * level boundary AND rankup notifications are enabled for this thread, sends a
 * rank-up card image from the Wajiro API. Falls back to a plain congratulation
 * text message when the avatar fetch or API call fails. Errors are swallowed —
 * a failing EXP write must never block the message pipeline.
 */
export const onChat = async ({ event, db, chat, user, native }: AppCtx): Promise<void> => {
  const senderID = event['senderID'] as string | undefined;
  const threadID = event['threadID'] as string | undefined;
  if (!senderID || !threadID) return;

  // Ensure the xp collection exists before reading to avoid silent {} returns on first use
  const userColl = db.users.collection(senderID);
  try {
    if (!(await userColl.isCollectionExist('xp'))) {
      await userColl.createCollection('xp');
    }
    const xpColl = await userColl.getCollection('xp');
    const oldExp = ((await xpColl.get('exp')) as number | undefined) ?? 0;
    const newExp = oldExp + 1;
    // Write streak before any notification so EXP is durable even if message.send fails
    await xpColl.set('exp', newExp);

    // Level-up check — only check if the thread has rankup enabled (default: true)
    const oldLevel = expToLevel(oldExp);
    const newLevel = expToLevel(newExp);
    if (newLevel <= oldLevel || newLevel <= 1) return;

    // Read thread setting — fail-open: treat any error as enabled=true
    let rankupEnabled = true;
    try {
      const threadColl = db.threads.collection(threadID);
      if (await threadColl.isCollectionExist(SETTINGS_COLLECTION)) {
        const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
        rankupEnabled =
          ((await settings.get('enabled')) as boolean | undefined) ?? true;
      }
    } catch {
      rankupEnabled = true;
    }

    if (!rankupEnabled) return;

    const name = await db.users.getName(senderID);

    // ── Leaderboard rank ─────────────────────────────────────────────────────
    // Required by the new card API. Fail-open to 1 so a DB error never
    // prevents the level-up notification from being sent.
    let leaderboardRank = 1;
    try {
      const allSessions = await db.users.getAll();
      const sorted = allSessions
        .map(({ botUserId, data }) => {
          const xpData = data?.['xp'] as Record<string, unknown> | undefined;
          const userExp =
            xpData && typeof xpData['exp'] === 'number'
              ? (xpData['exp'] as number)
              : 0;
          return { botUserId, exp: userExp };
        })
        .sort((a, b) => b.exp - a.exp);
      const pos = sorted.findIndex((u) => u.botUserId === senderID);
      if (pos !== -1) leaderboardRank = pos + 1;
    } catch {
      leaderboardRank = 1;
    }

    // ── Rank-up card via Wajiro API ──────────────────────────────────────────
    // Attachment delivery is not supported on Facebook Page — skip card
    // generation entirely and fall through directly to the text fallback.
    // All other platforms attempt the card first, then fall back on error.
    const isFacebookPage = native.platform === Platforms.FacebookPage;

    if (!isFacebookPage) {
    // Attempt to build and send a visual rank card. If any step fails (avatar
    // unavailable, API down, network error), fall through to the plain text
    // congratulation message so the user always gets notified.
    try {
      const avatarUrl = await user.getAvatarUrl(senderID);

      if (avatarUrl) {
        const cardBuffer = await buildRankupCard(
          avatarUrl, name, newLevel, newExp, leaderboardRank, native.platform,
        );

        if (cardBuffer) {
          await chat.replyMessage({
            style: MessageStyle.MARKDOWN,
            message: `🎉 Congratulations **${name}**! You reached **level ${newLevel}**!`,
            attachment: [{ name: 'rankup.png', stream: cardBuffer }],
          });
          return;
        }
      }
    } catch {
      // Card generation failed — fall through to text fallback below
    }
    } // end !isFacebookPage

    // ── Text fallback ────────────────────────────────────────────────────────
    // Shown when the Wajiro API is unreachable or the avatar cannot be resolved.
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🎉 Congratulations **${name}**! You reached **level ${newLevel}**!`,
    });
  } catch {
    // Swallow all errors — EXP accumulation must never disrupt normal chat flow
  }
};

const BUTTON_ID = { my_level: 'my_level', back: 'back' } as const;

// The rankup status view naturally prompts the question "what level am I at?" —
// surfacing XP/level inline avoids an extra /rank command invocation.
export const button = {
  [BUTTON_ID.my_level]: {
    label: '📊 My Level',
    style: ButtonStyle.SECONDARY,
    onClick: async ({ chat, event, db, native, button }: AppCtx) => {
      const senderID = event['senderID'] as string | undefined;
      // Back button lets the user return to the rankup status without retyping the command
      const backId = button.generateID({ id: BUTTON_ID.back });
      if (!senderID) {
        await chat.editMessage({
          style: MessageStyle.MARKDOWN,
          message_id_to_edit: event['messageID'] as string,
          message: '❌ Could not identify your user ID on this platform.',
          ...(hasNativeButtons(native.platform) ? { button: [backId] } : {}),
        });
        return;
      }
      const userColl = db.users.collection(senderID);
      let exp = 0;
      if (await userColl.isCollectionExist('xp')) {
        const xpColl = await userColl.getCollection('xp');
        const rawExp = await xpColl.get('exp');
        exp = typeof rawExp === 'number' ? rawExp : 0;
      }
      // expToLevel is module-scoped — safe to call from the button handler closure.
      const level = expToLevel(exp);
      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: event['messageID'] as string,
        message: `⭐ **Level ${level}** — ${exp} total EXP`,
        ...(hasNativeButtons(native.platform) ? { button: [backId] } : {}),
      });
    },
  },
  // Returns to the rankup status view — closes the my_level → rankup navigation loop
  [BUTTON_ID.back]: {
    label: '⬅ Back',
    style: ButtonStyle.SECONDARY,
    onClick: async (ctx: AppCtx) => onCommand(ctx),
  },
};

/**
 * Toggle rankup notifications for the current thread.
 * Stores the setting in bot_threads_session.data under "rankup_settings".
 * The row is only persisted after the thread has been synced (upsertThreadSession),
 * which happens automatically via on-chat.middleware before commands run.
 */
export const onCommand = async ({
  chat,
  args,
  event,
  db,
  native,
  prefix = '',
  button,
}: AppCtx): Promise<void> => {
  const threadID = event['threadID'] as string | undefined;
  if (!threadID) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ This command can only be used in a thread.',
    });
    return;
  }

  const sub = args[0]?.toLowerCase();

  // Status query when no argument supplied
  if (sub !== 'on' && sub !== 'off') {
    let current = true;
    try {
      const threadColl = db.threads.collection(threadID);
      if (await threadColl.isCollectionExist(SETTINGS_COLLECTION)) {
        const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
        current =
          ((await settings.get('enabled')) as boolean | undefined) ?? true;
      }
    } catch {
      /* fail-open */
    }

    // Edit when navigating back via the ⬅ Back button; reply for fresh /rankup invocations
    const payload = {
      style: MessageStyle.MARKDOWN,
      message: [
        `Rankup notifications are currently ${current ? '✅ on' : '🔕 off'} for this thread.`,
        `Usage: ${prefix}rankup on | off`,
      ].join('\n'),
      ...(hasNativeButtons(native.platform)
        ? { button: [button.generateID({ id: BUTTON_ID.my_level })] }
        : {}),
    };
    if (event['type'] === 'button_action') {
      await chat.editMessage({
        ...payload,
        message_id_to_edit: event['messageID'] as string,
      });
    } else {
      await chat.replyMessage(payload);
    }
    return;
  }

  const enabled = sub === 'on';
  const threadColl = db.threads.collection(threadID);
  if (!(await threadColl.isCollectionExist(SETTINGS_COLLECTION))) {
    await threadColl.createCollection(SETTINGS_COLLECTION);
  }
  const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
  await settings.set('enabled', enabled);

  await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: enabled
      ? '✅ Rankup notifications enabled for this thread.'
      : '🔕 Rankup notifications disabled for this thread.',
  });
};