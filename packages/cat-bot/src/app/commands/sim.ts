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
  randomSavageReplies,
  villainEraReplies,
  randomReplies,
} from "./sim.replies.js";

export const config: CommandConfig = {
  name: "sim",
  aliases: [],
  version: "2.0.0",
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
    text.includes("landi") ||
    text.includes("landi tayo") ||
    text.includes("date") ||
    text.includes("labas tayo") ||
    text.includes("yakap") ||
    text.includes("hug") ||
    text.includes("kiss") ||
    text.includes("halik") ||
    text.includes("baby") ||
    text.includes("babe") ||
    text.includes("beb") ||
    text.includes("mahal") ||
    text.includes("cute") ||
    text.includes("ganda") ||
    text.includes("gwapo") ||
    text.includes("hot") ||
    text.includes("sexy")
  ) {
    reply = random(flirtyReplies);
  }

    // Love
  else if (
    text.includes("love") ||
    text.includes("mahal kita") ||
    text.includes("mahal mo ba ako") ||
    text.includes("mahal") ||
    text.includes("inlove") ||
    text.includes("in love") ||
    text.includes("jowa") ||
    text.includes("bf") ||
    text.includes("boyfriend") ||
    text.includes("gf") ||
    text.includes("girlfriend")
  ) {
    reply = random(loveReplies);
  }

  // Crush
  else if (
    text.includes("crush") ||
    text.includes("crush mo ba ako") ||
    text.includes("crush kita") ||
    text.includes("type mo ba ako") ||
    text.includes("type kita") ||
    text.includes("gusto mo ba ako") ||
    text.includes("gusto kita") ||
    text.includes("may gusto ka ba sakin") ||
    text.includes("miss mo ba ako") ||
    text.includes("namimiss mo ba ako")
  ) {
    reply = random(crushReplies);
  }

  // Kiss
  else if (
    text.includes("kiss") ||
    text.includes("halik") ||
    text.includes("beso") ||
    text.includes("mwah") ||
    text.includes("mwa") ||
    text.includes("halikan") ||
    text.includes("halik nga")
  ) {
    reply = random(kissReplies);
  }

    // Tarantado Replies
  else if (
    text.includes("tarantado") ||
    text.includes("ulol") ||
    text.includes("loko") ||
    text.includes("gago") ||
    text.includes("bwisit") ||
    text.includes("asar") ||
    text.includes("inis") ||
    text.includes("kupal")
  ) {
    reply = random(tarantadoReplies);
  }

  // Murahan Replies
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

  // Roast Replies
  else if (
    text.includes("tanga") ||
    text.includes("bobo") ||
    text.includes("engot") ||
    text.includes("pangit") ||
    text.includes("sira ulo") ||
    text.includes("bugok") ||
    text.includes("obob") ||
    text.includes("lutang")
  ) {
    reply = random(roastReplies);
  }

   // Random Savage
  else if (
    text.includes("haha") ||
    text.includes("hahaha") ||
    text.includes("lol") ||
    text.includes("lmao") ||
    text.includes("xd") ||
    text.includes("char") ||
    text.includes("joke") ||
    text.includes("eme") ||
    text.includes("trip")
  ) {
    reply = random(randomSavageReplies);
  }

  // Villain Era
  else if (
    text.includes("ex") ||
    text.includes("breakup") ||
    text.includes("break up") ||
    text.includes("hiwalay") ||
    text.includes("iniwan") ||
    text.includes("iwan") ||
    text.includes("bumalik") ||
    text.includes("balikan") ||
    text.includes("cheat") ||
    text.includes("niloko") ||
    text.includes("heartbroken") ||
    text.includes("broken")
  ) {
    reply = random(villainEraReplies);
  }

  // Name
  else if (
    text.includes("pangalan") ||
    text.includes("name") ||
    text.includes("sino ka") ||
    text.includes("who are you") ||
    text.includes("ano pangalan mo")
  ) {
    reply = "Ako si Sim. Huwag mo akong guluhin kung wala kang dalang chismis. 😎";
  }

  // Age
  else if (
    text.includes("ilang taon") ||
    text.includes("age") ||
    text.includes("edad") ||
    text.includes("birthday")
  ) {
    reply = "Secret ang edad ko. Baka tawagin mo pa akong tito. 😭";
  }

    // Creator
  else if (
    text.includes("creator") ||
    text.includes("owner") ||
    text.includes("developer") ||
    text.includes("gumawa") ||
    text.includes("sino gumawa sayo")
  ) {
    reply = "Ginawa ako ni Kahj. Pero mas pogi pa rin ako sa creator ko. 😭";
  }

  // Thank You
  else if (
    text.includes("thank") ||
    text.includes("thanks") ||
    text.includes("thank you") ||
    text.includes("salamat") ||
    text.includes("ty") ||
    text.includes("tnx")
  ) {
    reply = "Welcome. Wag kang masyadong mabait, nakakapanibago. 😎";
  }

  // Bye
  else if (
    text.includes("bye") ||
    text.includes("goodbye") ||
    text.includes("aalis") ||
    text.includes("alis muna") ||
    text.includes("see you") ||
    text.includes("ingat")
  ) {
    reply = "Sige umalis ka na. Babalik ka rin naman mamaya. 😭";
  }

  // Good Morning
  else if (
    text.includes("good morning") ||
    text.includes("magandang umaga")
  ) {
    reply = "Good morning! Sana hindi ka na gumawa ng katangahan ngayong araw. ☀️";
  }

  // Good Night
  else if (
    text.includes("good night") ||
    text.includes("matutulog") ||
    text.includes("tulog na")
  ) {
    reply = "Good night. Matulog ka na, baka bukas may common sense ka na. 🌙😭";
  }

  // Final Random
  else {
    reply = random(randomReplies);
  }

  await ctx.chat.replyMessage({
    style: MessageStyle.TEXT,
    message: reply,
  });
};
