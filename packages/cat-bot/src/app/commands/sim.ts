import axios from "axios";
import type { AppCtx } from "@/engine/types/controller.types.js";
import { Role } from "@/engine/constants/role.constants.js";
import { MessageStyle } from "@/engine/constants/message-style.constants.js";
import type { CommandConfig } from "@/engine/types/module-config.types.js";

export const config: CommandConfig = {
  name: "sim",
  aliases: ["simsimi"],
  version: "1.0.0",
  role: Role.ANYONE,
  author: "Kahj",
  description: "Talk with SimSimi",
  category: "AI",
  usage: "<message>",
  cooldown: 3,
  hasPrefix: true,
};

export const onCommand = async (ctx: AppCtx): Promise<void> => {
  const prompt = ctx.args.join(" ").trim();

  if (!prompt) {
    await ctx.chat.replyMessage({
      style: MessageStyle.TEXT,
      message: "Example:\n!sim hello",
    });
    return;
  }

  try {
    const { data } = await axios.get(
      "https://api.simsimi.vn/v1/simtalk",
      {
        params: {
          text: prompt,
          lc: "ph",
        },
      }
    );

    await ctx.chat.replyMessage({
      style: MessageStyle.TEXT,
      message: data.message || "🤖 ...",
    });
  } catch (err) {
    console.error(err);

    await ctx.chat.replyMessage({
      style: MessageStyle.TEXT,
      message: "😭 SimSimi is currently unavailable.",
    });
  }
};
