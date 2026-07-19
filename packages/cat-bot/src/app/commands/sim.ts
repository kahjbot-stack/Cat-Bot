import type { AppCtx } from "@/engine/types/controller.types.js";
import { Role } from "@/engine/constants/role.constants.js";
import { MessageStyle } from "@/engine/constants/message-style.constants.js";
import type { CommandConfig } from "@/engine/types/module-config.types.js";

import {
  greetings,
  loveReplies,
  crushReplies,
  kissReplies,
  flirtyReplies,
  roastReplies,
  tarantadoReplies,
  murahanReplies,
  villainEraReplies,
  genZReplies,
  memeReplies,
  nameReplies,
  ageReplies,
  thanksReplies,
  byeReplies,
  randomReplies,
} from "./sim.replies.js";

export const config: CommandConfig = {
  name: "sim",
  aliases: [],
  version: "3.0.0",
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
    text.includes("kamusta") ||
    text.includes("kumusta") ||
    text.includes("good morning") ||
    text.includes("good afternoon") ||
    text.includes("good evening")
  ) {
    reply = random(greetings);
  }

  // Love
  else if (
    text.includes("love") ||
    text.includes("mahal") ||
    text.includes("inlove") ||
    text.includes("in love") ||
    text.includes("jowa") ||
    text.includes("boyfriend") ||
    text.includes("girlfriend") ||
    text.includes("bf") ||
    text.includes("gf")
  ) {
    reply = random(loveReplies);
  }

  // Crush
  else if (
    text.includes("crush") ||
    text.includes("type mo ba ako") ||
    text.includes("type kita") ||
    text.includes("gusto mo ba ako") ||
    text.includes("may gusto ka ba sakin") ||
    text.includes("miss mo ba ako")
  ) {
    reply = random(crushReplies);
  }

  // Kiss
  else if (
    text.includes("kiss") ||
    text.includes("halik") ||
    text.includes("beso") ||
    text.includes("mwah") ||
    text.includes("mwa")
  ) {
    reply = random(kissReplies);
  }

  // Flirty
  else if (
    text.includes("landi") ||
    text.includes("date") ||
    text.includes("yakap") ||
    text.includes("hug") ||
    text.includes("baby") ||
    text.includes("babe") ||
    text.includes("cute") ||
    text.includes("ganda") ||
    text.includes("gwapo") ||
    text.includes("sexy")
  ) {
    reply = random(flirtyReplies);
  }

  // Tarantado
  else if (
    text.includes("tarantado") ||
    text.includes("ulol") ||
    text.includes("gago") ||
    text.includes("loko") ||
    text.includes("bwisit") ||
    text.includes("kupal") ||
    text.includes("asar")
  ) {
    reply = random(tarantadoReplies);
  }

  // Murahan
  else if (
    text.includes("puta") ||
    text.includes("putangina") ||
    text.includes("tangina") ||
    text.includes("gagi") ||
    text.includes("leche") ||
    text.includes("punyeta") ||
    text.includes("hayop")
  ) {
    reply = random(murahanReplies);
  }

  // Roast
  else if (
    text.includes("tanga") ||
    text.includes("bobo") ||
    text.includes("engot") ||
    text.includes("pangit") ||
    text.includes("obob") ||
    text.includes("bugok") ||
    text.includes("sira ulo")
  ) {
    reply = random(roastReplies);
  }

  // Villain Era
  else if (
    text.includes("ex") ||
    text.includes("break") ||
    text.includes("breakup") ||
    text.includes("hiwalay") ||
    text.includes("iniwan") ||
    text.includes("iwan") ||
    text.includes("sakit") ||
    text.includes("malungkot") ||
    text.includes("iyak") ||
    text.includes("bumalik")
  ) {
    reply = random(villainEraReplies);
  }

  // Gen Z
  else if (
    text.includes("delulu") ||
    text.includes("rizz") ||
    text.includes("slay") ||
    text.includes("sigma") ||
    text.includes("bro") ||
    text.includes("beh") ||
    text.includes("ate") ||
    text.includes("lods")
  ) {
    reply = random(genZReplies);
  }

  // Meme
  else if (
    text.includes("haha") ||
    text.includes("hahaha") ||
    text.includes("lol") ||
    text.includes("meme") ||
    text.includes("joke") ||
    text.includes("trip")
  ) {
    reply = random(memeReplies);
  }

  // Name
  else if (
    text.includes("name") ||
    text.includes("pangalan") ||
    text.includes("sino ka") ||
    text.includes("who are you") ||
    text.includes("ano pangalan mo")
  ) {
    reply = random(nameReplies);
  }

  // Age
  else if (
    text.includes("age") ||
    text.includes("edad") ||
    text.includes("ilang taon") ||
    text.includes("birthday")
  ) {
    reply = random(ageReplies);
  }

  // Thanks
  else if (
    text.includes("thank") ||
    text.includes("thanks") ||
    text.includes("salamat") ||
    text.includes("ty") ||
    text.includes("tnx")
  ) {
    reply = random(thanksReplies);
  }

  // Bye
  else if (
    text.includes("bye") ||
    text.includes("goodbye") ||
    text.includes("aalis") ||
    text.includes("see you")
  ) {
    reply = random(byeReplies);
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
