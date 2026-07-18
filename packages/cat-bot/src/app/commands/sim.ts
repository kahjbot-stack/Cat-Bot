import type { AppCtx } from "@/engine/types/controller.types.js";
import { Role } from "@/engine/constants/role.constants.js";
import { MessageStyle } from "@/engine/constants/message-style.constants.js";
import type { CommandConfig } from "@/engine/types/module-config.types.js";

import {
  greetings,
  love,
  kiss,
  savage,
  randomReplies,
} from "./sim.replies.js";

export const config: CommandConfig = {
  name: "sim",
  aliases: [],
  version: "1.0.0",
  role: Role.ANYONE,
  author: "Kahj",
  description: "Funny Sim AI",
  category: "AI",
  usage: "<message>",
  cooldown: 2,
  hasPrefix: true,
};

function random(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export const onCommand = async (ctx: AppCtx): Promise<void> => {
  const prompt = ctx.args.join(" ").trim();

  if (!prompt) {
    await ctx.chat.replyMessage({
      style: MessageStyle.TEXT,
      message: "Example:\n!sim hello",
    });
    return;
  }

  const text = prompt.toLowerCase();

  let reply = "";

  // Greetings
  if (
    text.includes("hi") ||
    text.includes("hello") ||
    text.includes("hey") ||
    text.includes("hola") ||
    text.includes("kamusta")
  ) {
    reply = random(greetings);
  }

  // Love
  else if (
    text.includes("love") ||
    text.includes("mahal") ||
    text.includes("crush") ||
    text.includes("bf") ||
    text.includes("gf") ||
    text.includes("jowa")
  ) {
    reply = random(love);
  }

  // Kiss
  else if (
    text.includes("kiss") ||
    text.includes("halik") ||
    text.includes("beso")
  ) {
    reply = random(kiss);
  }

  // Savage
  else if (
    text.includes("pangit") ||
    text.includes("bobo") ||
    text.includes("gago") ||
    text.includes("tanga") ||
    text.includes("ulol") ||
    text.includes("mura") ||
    text.includes("sira")
  ) {
    reply = random(savage);
  }

  // Name
  else if (
    text.includes("name") ||
    text.includes("pangalan")
  ) {
    reply = "Ako si Sim. 😎";
  }

  // Age
  else if (
    text.includes("ilang taon") ||
    text.includes("age") ||
    text.includes("edad")
  ) {
    reply = "Secret ang age ko. 😌";
  }

  // Creator
  else if (
    text.includes("creator") ||
    text.includes("owner") ||
    text.includes("gumawa") ||
    text.includes("developer")
  ) {
    reply = "Ginawa ako ni Kahj. ❤️";
  }

  // Thank you
  else if (
    text.includes("thank") ||
    text.includes("salamat") ||
    text.includes("ty")
  ) {
    reply = "Welcome. 😎";
  }

  // Bye
  else if (
    text.includes("bye") ||
    text.includes("goodbye") ||
    text.includes("aalis")
  ) {
    reply = "Bye. Ingat ka. 👋";
  }

  // Good morning
  else if (
    text.includes("good morning") ||
    text.includes("magandang umaga")
  ) {
    reply = "Good morning! ☀️";
  }

  // Good night
  else if (
    text.includes("good night") ||
    text.includes("matutulog")
  ) {
    reply = "Good night. Sweet dreams. 🌙";
  }

  // Random
  else {
    reply = random(randomReplies);
  }

  await ctx.chat.replyMessage({
    style: MessageStyle.TEXT,
    message: reply,
  });
};
