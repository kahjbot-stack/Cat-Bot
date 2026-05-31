// /pair — Compatibility Pairing
//
// Pairs two users and generates a compatibility card via the
// Wajiro /api/v1/pair endpoint.
//
// Targeting modes (in priority order):
//   Modes: @user1 @user2 | reply | @mention | uid | me | (none)
//
// Gender filtering (random and me modes only):
//   Gender is read from the raw fca-unofficial user object (FB Messenger only).
//   fca returns gender as a number: 2 = male, 1 = female, 0 = unknown.
//   On Discord and Telegram gender is never available, so the command always
//   falls back to unrestricted random selection on those platforms.
//
// Deleted/disabled account filtering:
//   Candidates whose resolved name matches known platform tombstone strings
//   ("Facebook User", "Deleted Account") are excluded.
//   avatarUrl === null is NOT used as a deleted signal — on Telegram avatarUrl
//   is always null by design (getFullUserInfo defers the extra API call), which
//   would incorrectly mark every Telegram user as deleted.
//
// Participant resolution per platform:
//   Facebook Messenger — reads event['participantIDs'] directly (fca injects
//     the full thread roster on every raw message payload). thread.getInfo() is
//     never called — it triggers a GraphQL round-trip that is cached for 3 hours
//     and returns an empty array on the first invocation.
//   Telegram           — the Bot API has no member-list endpoint. getFullThreadInfo()
//     always returns participantIDs: []. We fall back to adminIDs (populated via
//     getChatAdministrators). The sender is always included as a candidate so
//     "me" mode still works even in groups with a single admin.
//   Discord            — getFullThreadInfo() returns guild.members.cache; works
//     reliably when the GuildMembers intent is enabled.
//
// Platform restriction: Discord, Telegram, Facebook Messenger only.
// Cooldown: 60 seconds.

import type { AppCtx } from '@/engine/types/controller.types.js';
import type { UserContext } from '@/engine/adapters/models/interfaces/index.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { createUrl } from '@/engine/utils/api.util.js';
import { Platforms } from '@/engine/modules/platform/platform.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';

// ── Command Config ────────────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'pair',
  aliases: ['ship'],
  version: '2.1.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description:
    'Pair two users and reveal their compatibility percentage as an image card.',
  category: 'Fun',
  usage: [
    '@user1 @user2  <- ships the two mentioned users together',
    '(reply)        <- pairs you with the user you replied to',
    '@mention       <- pairs you with the mentioned user',
    '<uid>          <- pairs you with a user by their ID',
    'me             <- pairs you with a random group member (opposite gender)',
    '(none)         <- randomly pairs two group members',
  ],
  cooldown: 60,
  hasPrefix: true,
  platform: [
    Platforms.Discord,
    Platforms.Telegram,
    Platforms.FacebookMessenger,
  ],
  options: [
    {
      type: OptionType.user,
      name: 'target',
      description: "@user1 @user2, a single @mention, uid, 'me', or leave blank for random",
      required: false,
    },
  ],
};

// ── Gender types and helpers ──────────────────────────────────────────────────

type Gender = 'male' | 'female' | 'unknown';

// Maximum number of candidates to resolve full profiles for during random search.
// Keeps API calls bounded for very large groups.
const MAX_PROFILE_FETCH = 50;

// Known platform tombstone display names for deleted or disabled accounts.
// NOTE: avatarUrl === null is intentionally NOT used as a deleted signal because
// on Telegram getFullUserInfo always returns avatarUrl: null by design — using it
// would mark every Telegram user as deleted and empty the valid candidate pool.
const DELETED_NAMES = new Set([
  'facebook user',
  'deleted account',
  'unknown user',
  'ghost',
]);

// Parses the gender value returned by fca-unofficial (FB Messenger only).
// fca returns gender as a number: 2 = male, 1 = female, 0 = unknown.
// Some fca versions return string values ("MALE", "FEMALE").
// On Discord and Telegram gender is never exposed — always returns 'unknown'.
function parseGender(value: unknown): Gender {
  if (typeof value === 'number') {
    if (value === 2) return 'male';
    if (value === 1) return 'female';
    return 'unknown';
  }
  if (typeof value === 'string') {
    const g = value.toLowerCase().trim();
    if (g === 'male' || g === 'm' || g === '2') return 'male';
    if (g === 'female' || g === 'f' || g === '1') return 'female';
  }
  return 'unknown';
}

interface UserProfile {
  id: string;
  name: string;
  gender: Gender;
  isDeleted: boolean;
}

// Resolves a single user's profile — gender and deleted status.
//
// Gender is sourced from the fca-unofficial raw user object. getFullUserInfo()
// on FB Messenger calls api.getUserInfo() which returns the raw fca shape; gender
// lives in the raw payload and is accessed via the loose cast below.
// On Discord and Telegram getFullUserInfo() returns a UnifiedUserInfo that never
// carries a gender field, so parseGender() returns 'unknown' for those platforms.
//
// isDeleted is based solely on display name matching DELETED_NAMES.
// avatarUrl is deliberately excluded from the deleted check (see file header).
async function resolveProfile(
  userID: string,
  user: UserContext,
): Promise<UserProfile> {
  try {
    const info = await user.getInfo(userID);
    const loose = info as unknown as Record<string, unknown>;

    // fca-unofficial hoists gender onto the resolved user object. Some versions
    // nest it under a 'raw' key; others place it at the top level.
    const rawObj = loose['raw'] as Record<string, unknown> | undefined;
    const genderRaw = loose['gender'] ?? rawObj?.['gender'];
    const gender = parseGender(genderRaw);

    const nameLower = info.name.toLowerCase().trim();
    const isDeleted = DELETED_NAMES.has(nameLower);

    return { id: userID, name: info.name, gender, isDeleted };
  } catch {
    // Network / API error — treat as a live but gender-unknown user rather than
    // dropping the candidate entirely, so large groups still work.
    return { id: userID, name: `User ${userID}`, gender: 'unknown', isDeleted: false };
  }
}

// Resolves profiles for a batch of user IDs in parallel.
async function resolveProfiles(
  ids: string[],
  user: UserContext,
): Promise<UserProfile[]> {
  return Promise.all(ids.map((id) => resolveProfile(id, user)));
}

// ── Participant resolver ──────────────────────────────────────────────────────

interface ParticipantResult {
  // Full list of known participant IDs including the sender.
  ids: string[];
  // True when we are on Telegram and fell back to adminIDs (Bot API limitation).
  isTelegramAdminFallback: boolean;
}

// Resolves the participant roster for the current thread, handling each platform's
// quirks so the command logic above never needs to branch on platform.
//
// Facebook Messenger:
//   fca-unofficial injects the full thread roster as participantIDs on every raw
//   message event. We read event['participantIDs'] directly — this is always
//   populated and always fresh. Calling thread.getInfo() instead would trigger a
//   GraphQL round-trip cached for 3 hours that returns [] on first access.
//
// Telegram:
//   The Bot API exposes no member-list endpoint. getFullThreadInfo() always returns
//   participantIDs: []. We fall back to adminIDs from getChatAdministrators, which
//   is populated for all group and supergroup types. In the worst case (no admins
//   resolved), we include the sender so "me" mode still has at least one candidate.
//
// Discord:
//   getFullThreadInfo() returns guild.members.cache. Reliable when the GuildMembers
//   privileged intent is enabled; may be sparse otherwise, but that is a bot config
//   concern rather than something pair.ts can work around.
async function resolveParticipants(
  thread: AppCtx['thread'],
  event: Record<string, unknown>,
  threadID: string,
  senderID: string,
): Promise<ParticipantResult> {
  const platform = event['platform'] as string | undefined;

  // ── Facebook Messenger — fast path via event payload ─────────────────────
  if (platform === Platforms.FacebookMessenger) {
    const eventIDs = event['participantIDs'] as string[] | undefined;
    if (Array.isArray(eventIDs) && eventIDs.length > 0) {
      return { ids: eventIDs, isTelegramAdminFallback: false };
    }
    // Fallback: event IDs missing (should not happen with fca, but be safe)
    // and fall through to thread.getInfo() below.
  }

  // ── Discord / FB fallback — standard thread.getInfo() path ───────────────
  try {
    const info = await thread.getInfo(threadID);
    const ids = info.participantIDs ?? [];

    // ── Telegram — Bot API never populates participantIDs ────────────────
    if (platform === Platforms.Telegram && ids.length === 0) {
      const adminIDs = info.adminIDs ?? [];
      // Always ensure the sender is included so "me" mode works even in groups
      // where only the sender is a known admin.
      const combined = Array.from(new Set([...adminIDs, senderID]));
      return {
        ids: combined,
        isTelegramAdminFallback: adminIDs.length > 0,
      };
    }

    return { ids, isTelegramAdminFallback: false };
  } catch {
    // thread.getInfo() failed entirely — return just the sender as a last resort
    // so the error message downstream is accurate ("not enough participants").
    return { ids: [senderID], isTelegramAdminFallback: false };
  }
}

// ── Compatibility scorer ──────────────────────────────────────────────────────

// Deterministic djb2-style hash clamped to [74, 99].
// Commutative: pair(A, B) === pair(B, A) via sorted join.
function computeCompatibility(idA: string, idB: string): number {
  const seed = [idA, idB].sort().join(':');
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (((hash << 5) + hash) ^ seed.charCodeAt(i)) >>> 0;
  }
  return 74 + (hash % 26);
}

// ── Shuffle / pick helpers ────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickOne<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Command handler ───────────────────────────────────────────────────────────

export const onCommand = async ({
  chat,
  user,
  thread,
  event,
  args,
}: AppCtx): Promise<void> => {
  // ── Group guard ─────────────────────────────────────────────────────────────
  if (!event['isGroup']) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ This command can only be used in group chats.',
    });
    return;
  }

  const senderID        = event['senderID'] as string;
  const threadID        = event['threadID'] as string;
  const mentions        = event['mentions'] as Record<string, string> | undefined;
  const mentionIDs      = Object.keys(mentions ?? {});
  const messageReply    = event['messageReply'] as Record<string, unknown> | undefined;
  const repliedSenderID = (messageReply?.['senderID'] as string | undefined) ?? null;

  // ── Fetch participant roster (only needed for random/me modes) ─────────────
  let participants: string[]         = [];
  let telegramAdminFallback          = false;

  const needsParticipants =
    !repliedSenderID &&
    mentionIDs.length === 0 &&
    (!args[0] || args[0].toLowerCase() === 'me');

  if (needsParticipants) {
    const resolved = await resolveParticipants(
      thread,
      event as Record<string, unknown>,
      threadID,
      senderID,
    );
    participants          = resolved.ids;
    telegramAdminFallback = resolved.isTelegramAdminFallback;
  }

  // ── Resolve pairing mode ────────────────────────────────────────────────────

  let userID1: string;
  let userID2: string;
  let overrideName1: string | null = null;
  let overrideName2: string | null = null;
  let genderFilterWarning          = false;

  // Mode 0: two mentions — ship those two users
  if (mentionIDs.length >= 2) {
    userID1       = mentionIDs[0]!;
    userID2       = mentionIDs[1]!;
    overrideName1 = (mentions?.[userID1] ?? '').replace(/^@/, '').trim() || null;
    overrideName2 = (mentions?.[userID2] ?? '').replace(/^@/, '').trim() || null;
  }

  // Mode 1: reply — pair sender with replied-to user
  else if (repliedSenderID) {
    userID1 = senderID;
    userID2 = repliedSenderID;
  }

  // Mode 2: single mention — pair sender with the mentioned user
  else if (mentionIDs.length === 1) {
    userID1       = senderID;
    userID2       = mentionIDs[0]!;
    overrideName2 = (mentions?.[userID2] ?? '').replace(/^@/, '').trim() || null;
  }

  // Mode 3: explicit UID argument
  else if (args[0] && args[0].toLowerCase() !== 'me') {
    userID1 = senderID;
    userID2 = args[0].trim();
  }

  // Mode 4: "me" — pair sender with a random opposite-gender participant
  else if (args[0]?.toLowerCase() === 'me') {
    const senderProfile = await resolveProfile(senderID, user);
    const opposite: Gender =
      senderProfile.gender === 'male'   ? 'female' :
      senderProfile.gender === 'female' ? 'male'   : 'unknown';

    const candidateIDs = shuffle(
      participants.filter((id) => id !== senderID),
    ).slice(0, MAX_PROFILE_FETCH);

    if (candidateIDs.length === 0) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ No other participants found to pair you with.',
      });
      return;
    }

    const profiles = await resolveProfiles(candidateIDs, user);
    const valid    = profiles.filter((p) => !p.isDeleted);

    if (valid.length === 0) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ No eligible participants found to pair you with.',
      });
      return;
    }

    // Prefer opposite gender; fall back to any valid candidate
    const gendered = opposite !== 'unknown'
      ? valid.filter((p) => p.gender === opposite)
      : [];

    if (gendered.length === 0) genderFilterWarning = true;

    const partner = pickOne(gendered) ?? pickOne(valid);

    if (!partner) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ No eligible participants found to pair you with.',
      });
      return;
    }

    userID1 = senderID;
    userID2 = partner.id;
  }

  // Mode 5: fully random — pick any two distinct participants
  else {
    // candidateIDs excludes the sender; we need at least 2 distinct candidates
    // to form a pair. The sender is NOT added back — we want two OTHER users.
    const candidateIDs = shuffle(
      participants.filter((id) => id !== senderID),
    ).slice(0, MAX_PROFILE_FETCH);

    if (candidateIDs.length < 2) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          '❌ Not enough participants found to pair randomly. Try mentioning someone.',
      });
      return;
    }

    const profiles = await resolveProfiles(candidateIDs, user);
    const valid    = profiles.filter((p) => !p.isDeleted);

    if (valid.length < 2) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          '❌ Not enough eligible participants found. Try mentioning someone instead.',
      });
      return;
    }

    const males   = valid.filter((p) => p.gender === 'male');
    const females = valid.filter((p) => p.gender === 'female');

    let picked1: UserProfile | undefined;
    let picked2: UserProfile | undefined;

    if (males.length > 0 && females.length > 0) {
      // Ideal: one from each gender
      picked1 = pickOne(males)!;
      picked2 = pickOne(females)!;
    } else {
      // No gender data (Discord / Telegram) or all same gender — pick any two
      genderFilterWarning = true;
      const shuffled = shuffle(valid);
      picked1 = shuffled[0];
      picked2 = shuffled[1];
    }

    if (!picked1 || !picked2) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          '❌ Not enough eligible participants found. Try mentioning someone instead.',
      });
      return;
    }

    // Randomly assign which slot each user occupies
    if (Math.random() < 0.5) {
      userID1 = picked1.id;
      userID2 = picked2.id;
    } else {
      userID1 = picked2.id;
      userID2 = picked1.id;
    }
  }

  // ── Self-pair guard ─────────────────────────────────────────────────────────
  if (userID1 === userID2) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ You cannot pair a user with themselves.',
    });
    return;
  }

  // ── Resolve names, avatars, and call API ────────────────────────────────────
  try {
    const [resolvedName1, resolvedName2] = await Promise.all([
      user.getName(userID1),
      user.getName(userID2),
    ]);
    const name1 = overrideName1 ?? resolvedName1 ?? userID1;
    const name2 = overrideName2 ?? resolvedName2 ?? userID2;

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

    const compatibility = computeCompatibility(userID1, userID2);

    const apiUrl = createUrl('wajiro', '/api/v1/pair');
    if (!apiUrl) throw new Error('Failed to build Wajiro API URL.');

    const form = new FormData();
    form.append('avatar1',        avatarUrl1);
    form.append('avatar2',        avatarUrl2);
    form.append('name1',          name1);
    form.append('name2',          name2);
    form.append('compatibility',  String(compatibility));

    const res = await fetch(apiUrl, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Wajiro API returned status ${res.status}`);

    const imageBuffer = Buffer.from(await res.arrayBuffer());
    const caption     = buildCaption(
      name1,
      name2,
      compatibility,
      genderFilterWarning,
      telegramAdminFallback,
    );

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: caption,
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

function buildCaption(
  name1: string,
  name2: string,
  score: number,
  genderWarning: boolean,
  telegramAdminFallback: boolean,
): string {
  const lines = [
    `${heartEmoji(score)} **${name1}** x **${name2}**`,
    `Compatibility: **${score}%** — ${compatLabel(score)}`,
  ];
  if (genderWarning) {
    lines.push(
      '_Note: gender info was unavailable, so the pair was chosen at random._',
    );
  }
  if (telegramAdminFallback) {
    lines.push(
      '_Note: Telegram does not expose full member lists — only group admins were considered._',
    );
  }
  return lines.join('\n');
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