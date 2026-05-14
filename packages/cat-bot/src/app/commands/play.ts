/**
 * /play — YouTube Audio Search and Streamer
 *
 * Searches YouTube for the given query, downloads the top result as an MP3
 * audio file, and sends it as a playable attachment in the current chat.
 *
 * API: https://yt-dlp-stream.onrender.com/api/v2/q?=<query>
 *
 * Response shape:
 *   {
 *     credit:   string   — API provider identifier
 *     version:  string   — API version string
 *     media: {
 *       mp4:  string     — direct MP4 video download URL
 *       mp3:  string     — direct MP3 audio download URL
 *     }
 *     ApiCount: number   — total requests served by this API instance
 *     ms:       number   — server-side processing time in milliseconds
 *   }
 *
 * The command fetches the mp3 URL from the API response, streams it into a
 * buffer, and sends it as a named .mp3 attachment alongside a clean caption.
 * All network steps use AbortSignal.timeout() guards to prevent indefinite hangs.
 *
 * Aliases: /song, /music
 * Access:  ANYONE
 * Cooldown: 15s (audio downloads are bandwidth-heavy)
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ── API constants ──────────────────────────────────────────────────────────────

const API_BASE = 'https://yt-dlp-stream.onrender.com/api/v2/q';

/** Maximum wait for the metadata fetch step (ms). */
const SEARCH_TIMEOUT_MS = 30_000;

/** Maximum wait for the audio binary download step (ms). */
const DOWNLOAD_TIMEOUT_MS = 60_000;

// ── API response type ──────────────────────────────────────────────────────────

interface YtDlpApiResponse {
  credit: string;
  version: string;
  media: {
    mp4: string;
    mp3: string;
  };
  ApiCount: number;
  ms: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strips characters that are unsafe in filenames across all major OSes.
 * Truncates to 80 characters to avoid path-length limits.
 */
function safeFilename(query: string): string {
  return (
    query
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 80) + '.mp3'
  );
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * e.g. 10535 → "10.5s"
 */
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Command configuration ──────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'play',
  aliases: ['song', 'music'] as string[],
  version: '2.0.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description:
    'Search YouTube and receive the top result as a playable MP3 audio file.',
  category: 'Media',
  usage: '<search query>',
  cooldown: 15,
  hasPrefix: true,
};

// ── Command handler ────────────────────────────────────────────────────────────

export const onCommand = async ({
  chat,
  args,
  usage,
}: AppCtx): Promise<void> => {
  // ── Input validation ───────────────────────────────────────────────────────

  if (args.length === 0) {
    await usage();
    return;
  }

  const query = args.join(' ').trim();

  // ── Loading indicator ──────────────────────────────────────────────────────
  // Shown while the API processes the search + download — gives the user
  // immediate feedback since audio fetches can take several seconds.

  const loadingId = (await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: `🔍  Searching for **${query}**...`,
  })) as string | undefined;

  try {
    // ── Step 1: Fetch audio URLs from the search API ───────────────────────
    // The API uses an empty-key query parameter: ?=<encoded query>
    // This is the literal format required by this endpoint.

    const apiUrl = `${API_BASE}?=${encodeURIComponent(query)}`;

    const searchRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!searchRes.ok) {
      throw new Error(
        `Search API returned HTTP ${searchRes.status} — the service may be temporarily unavailable.`,
      );
    }

    const apiData = (await searchRes.json()) as YtDlpApiResponse;

    if (!apiData.media?.mp3) {
      throw new Error(
        'No audio URL was returned for this query. Try a different search term.',
      );
    }

    const { mp3: mp3Url, mp4: mp4Url } = apiData.media;
    const processingTime = apiData.ms ?? 0;

    // ── Step 2: Update loading message while downloading the audio ─────────

    if (loadingId) {
      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: loadingId,
        message: `⬇️  Downloading audio for **${query}**...`,
      });
    }

    // ── Step 3: Stream audio binary into a buffer ──────────────────────────

    const audioRes = await fetch(mp3Url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!audioRes.ok) {
      throw new Error(
        `Audio download failed with HTTP ${audioRes.status}. The link may have expired — try again.`,
      );
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    if (audioBuffer.length === 0) {
      throw new Error(
        'The downloaded audio file is empty. The source may no longer be available.',
      );
    }

    // ── Step 4: Dismiss loading message and send the audio attachment ──────

    if (loadingId) {
      await chat.unsendMessage(loadingId).catch(() => {
        // Ignore — the message may have already been deleted or unsend is unsupported
      });
    }

    const fileSizeKb = Math.round(audioBuffer.length / 1024);
    const fileSizeLabel =
      fileSizeKb >= 1024
        ? `${(fileSizeKb / 1024).toFixed(1)} MB`
        : `${fileSizeKb} KB`;

    const caption = [
      `🎵  **${query}**`,
      '',
      `📦  **File Size**     ${fileSizeLabel}`,
      `⚡  **Processed in**  ${formatMs(processingTime)}`,
      `🎬  **Video**         ${mp4Url}`,
    ].join('\n');

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: caption,
      attachment: [
        {
          name: safeFilename(query),
          stream: audioBuffer,
        },
      ],
    });
  } catch (err) {
    const error = err as { message?: string };

    // Always clean up the loading indicator on failure
    if (loadingId) {
      await chat.unsendMessage(loadingId).catch(() => {});
    }

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: [
        `❌  **Could not retrieve audio for** \`${query}\``,
        `\`${error.message ?? 'An unexpected error occurred.'}\``,
      ].join('\n'),
    });
  }
};