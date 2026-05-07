import axios from 'axios';
import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { ButtonStyle } from '@/engine/constants/button-style.constants.js';
import { createUrl } from '@/engine/utils/api.util.js';
import { hasNativeButtons } from '@/engine/utils/ui-capabilities.util.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShotiResult {
  author: string;
  title: string;
  cover_image: string;
  shotiurl: string;
  cover: string;
  username: string;
  nickname: string;
  duration: number;
  region: string;
  total_vids: number;
}

interface ShotiResponse {
  status: boolean;
  result: ShotiResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchShoti(): Promise<{ data: ShotiResult; buffer: Buffer }> {
  const base = createUrl('betadash', '/shoti');
  if (!base) throw new Error('Failed to build Shoti API URL.');

  const { data: json } = await axios.get<ShotiResponse>(base);
  if (!json.status || !json.result) {
    throw new Error('Shoti API returned an unsuccessful response.');
  }

  const data = json.result;
  const { data: videoData } = await axios.get<Buffer>(data.shotiurl, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: 'https://www.tiktok.com/',
      Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const buffer = Buffer.from(videoData);
  return { data, buffer };
}

function buildCaption(data: ShotiResult): string {
  const title = data.title?.trim() || 'TikTok Shoti';
  return [
    `🎬 **${title}**`,
    ``,
    `👤 **${data.nickname}** (@${data.username})`,
    `⏱️ Duration: **${data.duration}s**`,
    `🌏 Region: **${data.region}**`,
    `🎞️ Total Videos: **${data.total_vids.toLocaleString()}**`,
  ].join('\n');
}

// ── Command Config ────────────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'shoti',
  aliases: ['sg', 'tiktokgirl'] as string[],
  version: '1.1.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description: 'Get a random TikTok girl video.',
  category: 'random',
  usage: '',
  cooldown: 5,
  hasPrefix: true,
};

// ── Button Definition ─────────────────────────────────────────────────────────

const BUTTON_ID = { next: 'next' } as const;

/**
 * Button definitions exported as `button`.
 * onClick re-invokes onCommand so the existing message is replaced in-place.
 */
export const button = {
  [BUTTON_ID.next]: {
    label: '🔁 More Shoti',
    style: ButtonStyle.PRIMARY,
    onClick: async (ctx: AppCtx) => onCommand(ctx),
  },
};

// ── Command Handler ───────────────────────────────────────────────────────────

export const onCommand = async (ctx: AppCtx): Promise<void> => {
  const { chat, native, event, button, session } = ctx;

  const isButtonAction = event['type'] === 'button_action';

  try {
    const { data, buffer } = await fetchShoti();

    const caption = buildCaption(data);

    // Reuse the active instance ID when refreshing via button so the button
    // slot is updated in-place and never disappears between clicks.
    const buttonId = isButtonAction
      ? session.id
      : button.generateID({ id: BUTTON_ID.next, public: true });

    if (isButtonAction) {
      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message: caption,
        attachment: [{ name: 'shoti.mp4', stream: buffer }],
        message_id_to_edit: event['messageID'] as string,
        ...(hasNativeButtons(native.platform) ? { button: [buttonId] } : {}),
      });
    } else {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: caption,
        attachment: [{ name: 'shoti.mp4', stream: buffer }],
        reply_to_message_id: event['messageID'] as string,
        ...(hasNativeButtons(native.platform) ? { button: [buttonId] } : {}),
      });
    }
  } catch (err) {
    const error = err as { message?: string };
    const errPayload = {
      style: MessageStyle.MARKDOWN,
      message: `⚠️ **Error:** ${error.message ?? 'Unknown error'}`,
    };

    if (isButtonAction) {
      await chat.editMessage({
        ...errPayload,
        message_id_to_edit: event['messageID'] as string,
      });
    } else {
      await chat.replyMessage(errPayload);
    }
  }
};