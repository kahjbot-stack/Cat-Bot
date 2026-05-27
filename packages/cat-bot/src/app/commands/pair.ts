// /pair — Compatibility Pairing
//
// Pairs two users together and generates a compatibility card via the
// Wajiro /api/v1/pair endpoint. The result is a styled PNG image card
// showing both avatars, names, a heart, and a compatibility bar.
//
// Targeting modes (in priority order):
//   /pair (reply)     -> Pairs the sender with the user they replied to
//   /pair @mention    -> Pairs the sender with the mentioned user
//   /pair <uid>       -> Pairs the sender with a user by their ID
//   /pair             -> Randomly picks two participants from the thread
//
// Compatibility scoring:
//   Score is deterministic per pair — computed via a djb2-style hash of both
//   sorted user IDs so the same two users always receive the same percentage.
//   Range is [74, 99] to align with the server's own random fallback range
//   (74-100) when compatibility is omitted from the request body.
//
// API contract (from wajiro pair module):
//   POST https://wajiro-apis.onrender.com/api/v1/pair
//   Content-Type: multipart/form-data
//   Fields:
//     avatar1       (text, required) - First avatar image URL
//     avatar2       (text, required) - Second avatar image URL
//     name1         (text, required) - First person's display name
//     name2         (text, required) - Second person's display name
//     compatibility (text, optional) - Integer 0-100; server randomises if omitted
//   Returns: PNG image buffer (image/png)
//
// Group-only restriction:
//   Blocked in DMs — the card is a group/social feature and random-pick
//   mode requires multiple participants.
//
// Platform restriction:
//   Discord, Telegram, Facebook Messenger only.

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { createUrl } from '@/engine/utils/api.util.js';
import { Platforms } from '@/engine/modules/platform/platform.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ── Command Config ────────────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'pair',
  aliases: ['ship', 'compatibility'],
  version: '1.2.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description:
    'Pair two users and reveal their compatibility percentage as an image card.',
  category: 'Fun',
  usage: [
    'me <- pairs you with a random participant from this group',
    '(reply) <- pairs you with the user you replied to',
    '@mention <- pairs you with the mentioned user',
    '<uid> <- pairs you with a user by their ID',
    '(none) <- randomly picks two participants from this group',
  ],
  cooldown: 60,
  hasPrefix: true,
  platform: [
    Platforms.Discord,
    Platforms.Telegram,
    Platforms.FacebookMessenger,
  ],
};

// ── Compatibility scorer ──────────────────────────────────────────────────────

// Produces a deterministic compatibility score for two user IDs.
// Both IDs are sorted before hashing so the result is commutative —
// pair(A, B) === pair(B, A). A djb2-style XOR hash maps the seed to a
// stable 32-bit integer, then clamped to [74, 99].
function computeCompatibility(idA: string, idB: string): number {
  const seed = [idA, idB].sort().join(':');
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (((hash << 5) + hash) ^ seed.charCodeAt(i)) >>> 0;
  }
  return 74 + (hash % 26);
}

// ── Random participant picker ─────────────────────────────────────────────────

function sampleUnique<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  const result: T[] = [];
  while (result.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]!);
  }
  return result;
}

// ── Command handler ───────────────────────────────────────────────────────────

export const onCommand = async ({
  chat,
  user,
  thread,
  event,
  args,
  usage,
}: AppCtx): Promise<void> => {
  // ── Group guard ─────────────────────────────────────────────────────────────
  if (!event['isGroup']) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ This command can only be used in group chats.',
    });
    return;
  }

  const senderID   = event['senderID'] as string;
  const threadID   = event['threadID'] as string;
  const mentions   = event['mentions'] as Record<string, string> | undefined;
  const mentionIDs = Object.keys(mentions ?? {});

  // ── Read the replied-to message (if any) ───────────────────────────────────
  // event['messageReply'] is populated by the Facebook Messenger (and Discord/
  // Telegram) adapters whenever the user replies to an existing message.
  const messageReply    = event['messageReply'] as Record<string, unknown> | undefined;
  const repliedSenderID = (messageReply?.['senderID'] as string | undefined) ?? null;

  // ── Resolve the two participants ────────────────────────────────────────────
  // Priority: me subcommand > reply > mention > uid arg > random
  let userID1 = senderID;
  let userID2: string | null = null;
  let overrideName2: string | null = null;  // pre-resolved name from mention tag

  // Helper: pick one random participant from the thread excluding the sender.
  // Shared by both "me" mode and the fully-random fallback mode.
  const pickRandomPartner = async (): Promise<string | null> => {
    let participants: string[] = [];
    try {
      const info = await thread.getInfo(threadID);
      participants = info.participantIDs ?? [];
    } catch {
      // getInfo can fail on some platforms — proceed with empty list
    }
    const candidates = participants.filter((id) => id !== senderID);
    if (candidates.length === 0) return null;
    const [picked] = sampleUnique(candidates, 1);
    return picked ?? null;
  };

  // 0. "me" subcommand — sender is always one side, random partner is the other
  if (args[0]?.toLowerCase() === 'me') {
    const partner = await pickRandomPartner();
    if (!partner) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ No other participants found to pair you with.',
      });
      return;
    }
    userID2 = partner;
  }
  // 1. Reply mode — pair sender with the author of the replied-to message
  else if (repliedSenderID) {
    userID2 = repliedSenderID;
  }
  // 2. Mention mode — pair sender with the first @-tagged user
  else if (mentionIDs.length > 0) {
    userID2 = mentionIDs[0]!;
    overrideName2 =
      (mentions?.[userID2] ?? '').replace(/^@/, '').trim() || null;
  }
  // 3. UID argument mode
  else if (args[0]) {
    userID2 = args[0].trim();
  }
  // 4. Fully random mode — pick two random participants (neither is guaranteed to be sender)
  else {
    let participants: string[] = [];

    try {
      const info = await thread.getInfo(threadID);
      participants = info.participantIDs ?? [];
    } catch {
      // getInfo can fail on some platforms — proceed with empty list
    }

    if (participants.length < 2) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          '❌ Not enough participants found to pair randomly. Try mentioning someone.',
      });
      return;
    }

    const candidates = participants.filter((id) => id !== senderID);

    if (candidates.length === 0) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ No other participants found to pair with.',
      });
      return;
    }

    const [picked1, picked2] = sampleUnique(candidates, 2);

    if (!picked1) {
      await usage();
      return;
    }

    userID1 = picked2 ?? senderID;
    userID2 = picked1;
  }

  if (!userID2) {
    await usage();
    return;
  }

  // ── Self-pair guard ─────────────────────────────────────────────────────────
  // Any other path that accidentally resolves to the same ID is rejected.
  if (userID1 === userID2) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ You cannot pair a user with themselves.',
    });
    return;
  }

  try {
    // ── Resolve display names ─────────────────────────────────────────────────
    const [resolvedName1, resolvedName2] = await Promise.all([
      user.getName(userID1),
      user.getName(userID2),
    ]);
    const name1 = resolvedName1 ?? userID1;
    const name2 = overrideName2 ?? resolvedName2 ?? userID2;

    // ── Resolve avatar URLs ───────────────────────────────────────────────────
    const [avatarUrl1, avatarUrl2] = await Promise.all([
      user.getAvatarUrl(userID1),
      user.getAvatarUrl(userID2),
    ]);

    if (!avatarUrl1 || !avatarUrl2) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          '❌ Could not retrieve one or both profile pictures. Please try again.',
      });
      return;
    }

    // ── Compute compatibility score ───────────────────────────────────────────
    const compatibility = computeCompatibility(userID1, userID2);

    // ── Build multipart form ──────────────────────────────────────────────────
    const apiUrl = createUrl('wajiro', '/api/v1/pair');
    if (!apiUrl) throw new Error('Failed to build Wajiro API URL.');

    const form = new FormData();
    form.append('avatar1', avatarUrl1);
    form.append('avatar2', avatarUrl2);
    form.append('name1', name1);
    form.append('name2', name2);
    form.append('compatibility', String(compatibility));

    // ── Call API ──────────────────────────────────────────────────────────────
    const res = await fetch(apiUrl, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Wajiro API returned status ${res.status}`);

    const imageBuffer = Buffer.from(await res.arrayBuffer());

    // ── Send result ───────────────────────────────────────────────────────────
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: buildCaption(name1, name2, compatibility),
      attachment: [{ name: 'pair.png', stream: imageBuffer }],
    });
  } catch (err) {
    const error = err as { message?: string };
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `⚠️ **Error:** ${error.message ?? 'Something went wrong. Please try again.'}`,
    });
  }
};

// ── Caption helpers ───────────────────────────────────────────────────────────

function buildCaption(name1: string, name2: string, score: number): string {
  return [
    `${heartEmoji(score)} **${name1}** x **${name2}**`,
    `Compatibility: **${score}%** — ${compatLabel(score)}`,
  ].join('\n');
}

function heartEmoji(score: number): string {
  if (score >= 95) return '💖';
  if (score >= 88) return '💗';
  if (score >= 80) return '💛';
  return '💙';
}

function compatLabel(score: number): string {
  if (score >= 95) return 'A match made in heaven! 🌟';
  if (score >= 88) return 'Practically soulmates 💫';
  if (score >= 80) return 'Really great together!';
  return "There's definitely something there ✨";
}