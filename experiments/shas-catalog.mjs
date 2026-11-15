export const tractates = [
  ["berachos", "Berakhot", "Zeraim", "2a", "64a"],
  ["shabbos", "Shabbat", "Moed", "2a", "157b"],
  ["eruvin", "Eruvin", "Moed", "2a", "105a"],
  ["pesachim", "Pesachim", "Moed", "2a", "121b"],
  ["shekalim", "Shekalim", "Moed", "2a", "22b"],
  ["yoma", "Yoma", "Moed", "2a", "88a"],
  ["sukkah", "Sukkah", "Moed", "2a", "56b"],
  ["beitzah", "Beitzah", "Moed", "2a", "40b"],
  ["rosh-hashanah", "Rosh Hashanah", "Moed", "2a", "35a"],
  ["taanis", "Taanit", "Moed", "2a", "31a"],
  ["megillah", "Megillah", "Moed", "2a", "32a"],
  ["moed-katan", "Moed Katan", "Moed", "2a", "29a"],
  ["chagigah", "Chagigah", "Moed", "2a", "27a"],
  ["yevamos", "Yevamot", "Nashim", "2a", "122a"],
  ["kesubos", "Ketubot", "Nashim", "2a", "112b"],
  ["nedarim", "Nedarim", "Nashim", "2a", "91b"],
  ["nazir", "Nazir", "Nashim", "2a", "66b"],
  ["sotah", "Sotah", "Nashim", "2a", "49b"],
  ["gittin", "Gittin", "Nashim", "2a", "90b"],
  ["kiddushin", "Kiddushin", "Nashim", "2a", "82b"],
  ["bava-kamma", "Bava Kamma", "Nezikin", "2a", "119b"],
  ["bava-metzia", "Bava Metzia", "Nezikin", "2a", "119a"],
  ["bava-basra", "Bava Batra", "Nezikin", "2a", "176b"],
  ["sanhedrin", "Sanhedrin", "Nezikin", "2a", "113b"],
  ["makkos", "Makkot", "Nezikin", "2a", "24b"],
  ["shevuos", "Shevuot", "Nezikin", "2a", "49b"],
  ["avodah-zarah", "Avodah Zarah", "Nezikin", "2a", "76b"],
  ["horayos", "Horayot", "Nezikin", "2a", "14a"],
  ["zevachim", "Zevachim", "Kodashim", "2a", "120b"],
  ["menachos", "Menachot", "Kodashim", "2a", "110a"],
  ["chullin", "Chullin", "Kodashim", "2a", "142a"],
  ["bechoros", "Bekhorot", "Kodashim", "2a", "61a"],
  ["arachin", "Arakhin", "Kodashim", "2a", "34a"],
  ["temurah", "Temurah", "Kodashim", "2a", "34a"],
  ["kereisos", "Keritot", "Kodashim", "2a", "28b"],
  ["meilah", "Meilah", "Kodashim", "2a", "22a"],
  ["kinim", "Kinnim", "Kodashim", "22a", "25a"],
  ["tamid", "Tamid", "Kodashim", "25b", "33b"],
  ["middos", "Middot", "Kodashim", "34a", "37b"],
  ["niddah", "Niddah", "Tahorot", "2a", "73a"],
].map(([slug, title, order, first, last]) => ({ slug, title, order, first, last, sourceSlug: ["kinim", "tamid", "middos"].includes(slug) ? "meilah" : slug }));

export function amudIndex(amud) {
  const match = /^(\d+)([ab])$/.exec(amud);
  if (!match || Number(match[1]) < 2) throw new Error(`Invalid amud: ${amud}`);
  return Number(match[1]) * 2 + (match[2] === "b" ? 1 : 0);
}

export function amudName(index) {
  return `${Math.floor(index / 2)}${index % 2 ? "b" : "a"}`;
}

export function amudim(tractate) {
  const first = amudIndex(tractate.first);
  const last = amudIndex(tractate.last);
  if (last < first) throw new Error(`Invalid range for ${tractate.slug}`);
  return Array.from({ length: last - first + 1 }, (_, offset) => amudName(first + offset));
}