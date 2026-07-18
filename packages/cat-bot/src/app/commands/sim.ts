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
  flirtyReplies,
  roastReplies,
  randomSavageReplies,
  villainEraReplies,
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
  text.includes("hii") ||
  text.includes("hiii") ||
  text.includes("hola") ||
  text.includes("kamusta") ||
  text.includes("kumusta") ||
  text.includes("good morning") ||
  text.includes("good afternoon") ||
  text.includes("good evening")
) {
  reply = random(greetings);
}

    // Flirty
else if (
  text.includes("miss kita") ||
  text.includes("miss mo ba ako") ||
  text.includes("mahal kita") ||
  text.includes("crush kita") ||
  text.includes("date") ||
  text.includes("ligaw") ||
  text.includes("landi") ||
  text.includes("lambing") ||
  text.includes("yakap") ||
  text.includes("hug") ||
  text.includes("kiss") ||
  text.includes("halik") ||
  text.includes("cute") ||
  text.includes("ganda") ||
  text.includes("gwapo") ||
  text.includes("hot") ||
  text.includes("baby") ||
  text.includes("babe") ||
  text.includes("beb") ||
  text.includes("mahal")
) {
  reply = random(flirtyReplies);
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

    // Roast / Asaran
else if (
  text.includes("tanga") ||
  text.includes("bobo") ||
  text.includes("gago") ||
  text.includes("pangit") ||
  text.includes("ulol") ||
  text.includes("engot") ||
  text.includes("tarantado") ||
  text.includes("bwisit") ||
  text.includes("sira ulo") ||
  text.includes("loko") ||
  text.includes("gunggong") ||
  text.includes("ogag") ||
  text.includes("inutil") ||
  text.includes("ew")
) {
  reply = random(roastReplies);
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
  text.includes("pangalan") ||
  text.includes("sino ka") ||
  text.includes("who are you") ||
  text.includes("ano pangalan mo")
) {
    reply = "Ako si Sim. 😎";
  }

  // Age
  else if (
  text.includes("ilang taon") ||
  text.includes("age") ||
  text.includes("edad") ||
  text.includes("ilan edad mo") ||
  text.includes("birthday")
) {
    reply = "Secret ang age ko. 😌";
  }

  // Creator
  else if (
  text.includes("creator") ||
  text.includes("owner") ||
  text.includes("developer") ||
  text.includes("gumawa") ||
  text.includes("creator mo") ||
  text.includes("sino gumawa sayo")
) {
    reply = "Ginawa ako ni Kahj. ❤️";
  }

  // Thank you
  else if (
  text.includes("thank") ||
  text.includes("thanks") ||
  text.includes("thank you") ||
  text.includes("salamat") ||
  text.includes("ty") ||
  text.includes("tnx")
) {
    reply = "Welcome. 😎";
  }

  // Bye
  else if (
  text.includes("bye") ||
  text.includes("goodbye") ||
  text.includes("aalis") ||
  text.includes("alis muna") ||
  text.includes("matutulog na") ||
  text.includes("see you")
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
