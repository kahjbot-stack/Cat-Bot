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

  const words = text
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  const hasWord = (...keywords: string[]) =>
    keywords.some((k) => words.includes(k));

  let reply = "";

    // Greetings
  if (
    hasWord(
      "hi",
      "hello",
      "hey",
      "hii",
      "hiii",
      "hola",
      "kamusta",
      "kumusta"
    ) ||
    text.includes("good morning") ||
    text.includes("good afternoon") ||
    text.includes("good evening")
  ) {
    reply = random(greetings);
  }

  // Love
  else if (
    hasWord(
      "love",
      "mahal",
      "mahalin",
      "jowa",
      "bf",
      "boyfriend",
      "gf",
      "girlfriend",
      "inlove"
    ) ||
    text.includes("mahal kita") ||
    text.includes("mahal mo ba ako") ||
    text.includes("in love")
  ) {
    reply = random(loveReplies);
  }

  // Crush
  else if (
    hasWord("crush") ||
    text.includes("crush kita") ||
    text.includes("crush mo ba ako") ||
    text.includes("gusto kita") ||
    text.includes("gusto mo ba ako") ||
    text.includes("type kita") ||
    text.includes("type mo ba ako") ||
    text.includes("may gusto ka ba sakin") ||
    text.includes("miss mo ba ako") ||
    text.includes("namimiss mo ba ako")
  ) {
    reply = random(crushReplies);
  }

    // Kiss
  else if (
    hasWord(
      "kiss",
      "halik",
      "beso",
      "mwah",
      "mwa"
    ) ||
    text.includes("halikan") ||
    text.includes("halik nga")
  ) {
    reply = random(kissReplies);
  }

  // Flirty
  else if (
    hasWord(
      "landi",
      "date",
      "yakap",
      "hug",
      "baby",
      "babe",
      "beb",
      "cute",
      "ganda",
      "gwapo",
      "hot",
      "sexy"
    ) ||
    text.includes("landi tayo") ||
    text.includes("labas tayo")
  ) {
    reply = random(flirtyReplies);
  }

  // Tarantado
  else if (
    hasWord(
      "tarantado",
      "ulol",
      "loko",
      "gago",
      "bwisit",
      "asar",
      "inis",
      "kupal"
    )
  ) {
    reply = random(tarantadoReplies);
  }

    // Murahan
  else if (
    hasWord(
      "puta",
      "putangina",
      "tangina",
      "gagi",
      "leche",
      "punyeta",
      "hayop"
    )
  ) {
    reply = random(murahanReplies);
  }

  // Roast
  else if (
    hasWord(
      "tanga",
      "bobo",
      "engot",
      "pangit",
      "bugok",
      "obob",
      "lutang"
    ) ||
    text.includes("sira ulo")
  ) {
    reply = random(roastReplies);
  }

  // Random Savage
  else if (
    hasWord(
      "haha",
      "hahaha",
      "lol",
      "lmao",
      "xd",
      "char",
      "joke",
      "eme",
      "trip"
    )
  ) {
    reply = random(randomSavageReplies);
  }

    // Villain Era
  else if (
    hasWord(
      "ex",
      "cheat",
      "broken",
      "heartbroken"
    ) ||
    text.includes("break up") ||
    text.includes("breakup") ||
    text.includes("hiwalay") ||
    text.includes("iniwan") ||
    text.includes("bumalik") ||
    text.includes("balikan") ||
    text.includes("niloko")
  ) {
    reply = random(villainEraReplies);
  }

  // Name
  else if (
    text.includes("ano pangalan mo") ||
    text.includes("pangalan mo") ||
    text.includes("sino ka") ||
    text.includes("who are you") ||
    hasWord("name", "pangalan")
  ) {
    reply = "Ako si Sim. Huwag mo akong guluhin kung wala kang dalang chismis. 😎";
  }

  // Age
  else if (
    text.includes("ilang taon") ||
    hasWord("age", "edad", "birthday")
  ) {
    reply = "Secret ang edad ko. Baka tawagin mo pa akong tito. 😭";
  }

  // Creator
  else if (
    text.includes("sino gumawa sayo") ||
    hasWord(
      "creator",
      "owner",
      "developer",
      "gumawa"
    )
  ) {
    reply =
      "Ginawa ako ni Kahj. Pero mas pogi pa rin ako sa creator ko. 😭";
  }

    // Thank You
  else if (
    text.includes("thank you") ||
    hasWord(
      "thank",
      "thanks",
      "salamat",
      "ty",
      "tnx"
    )
  ) {
    reply =
      "Welcome. Sana hindi lang pag may kailangan saka ka nagte-thank you. 😭";
  }

  // Bye
  else if (
    text.includes("see you") ||
    text.includes("goodbye") ||
    text.includes("alis muna") ||
    hasWord(
      "bye",
      "aalis",
      "ingat"
    )
  ) {
    reply =
      "Sige, ingat. Huwag ka mawala nang matagal, baka ma-miss pa kita... konti lang. 😭";
  }

  // Good Morning
  else if (
    text.includes("good morning") ||
    text.includes("magandang umaga")
  ) {
    reply =
      "Good morning! Sana mas maganda araw mo kaysa sa mga desisyon mo kahapon. ☀️";
  }

  // Good Night
  else if (
    text.includes("good night") ||
    text.includes("tulog na") ||
    text.includes("matutulog")
  ) {
    reply =
      "Good night. Matulog ka na, baka bukas gumana na common sense mo. 🌙😭";
  }

  // Default
  else {
    reply = random(randomReplies);
  }

  await ctx.chat.replyMessage({
    style: MessageStyle.TEXT,
    message: reply,
  });
};
