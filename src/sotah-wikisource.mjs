import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { normalizeHebrew } from "./measure-corpus.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";

const hebrewTitles = {
  berachos: "ברכות", shabbos: "שבת", eruvin: "עירובין", pesachim: "פסחים", shekalim: "שקלים",
  yoma: "יומא", sukkah: "סוכה", beitzah: "ביצה", "rosh-hashanah": "ראש השנה", taanis: "תענית",
  megillah: "מגילה", "moed-katan": "מועד קטן", chagigah: "חגיגה", yevamos: "יבמות", kesubos: "כתובות",
  nedarim: "נדרים", nazir: "נזיר", sotah: "סוטה", gittin: "גיטין", kiddushin: "קידושין",
  "bava-kamma": "בבא קמא", "bava-metzia": "בבא מציעא", "bava-basra": "בבא בתרא", sanhedrin: "סנהדרין",
  makkos: "מכות", shevuos: "שבועות", "avodah-zarah": "עבודה זרה", horayos: "הוריות", zevachim: "זבחים",
  menachos: "מנחות", chullin: "חולין", bechoros: "בכורות", arachin: "ערכין", temurah: "תמורה",
  kereisos: "כריתות", meilah: "מעילה", niddah: "נידה",
};
let lastWikiRequest = 0;
// Reviewed revisions whose sole regular Tosafot heading line is indented by one space.
const indentedTosafotHeadings = {
  kiddushin: { "36b": { revision: 1181821, contentSha256: "345d02744d96340314dd24a6f10cb7342a1d661c87f9f8d4728e98a1026cda57" } },
};

export function reviewedWikisourceContent(slug, amud, revision, content) {
  const review = indentedTosafotHeadings[slug]?.[amud];
  if (!review || revision !== review.revision || typeof content !== "string"
    || createHash("sha256").update(content).digest("hex") !== review.contentSha256) return content;
  const indented = [...content.matchAll(/^ ==תוספות==$/gm)];
  if (indented.length !== 1 || /^==[ \t]*(?:תוספות|תוס['׳])[ \t]*==/m.test(content)) return content;
  return content.slice(0, indented[0].index) + content.slice(indented[0].index + 1);
}

export function wikisourceTitle(tractate, amud) {
  const match = /^(\d+)([ab])$/.exec(amud);
  if (!match || Number(match[1]) < 2 || Number(match[1]) > 399) throw new Error(`Invalid amud: ${amud}`);
  if (!hebrewTitles[tractate.slug]) return null;
  if (tractate.slug === "shekalim" && amud === "2a") return "שקלים א א";
  let number = Number(match[1]);
  let numeral = "";
  for (const [value, letter] of [[300, "ש"], [200, "ר"], [100, "ק"]]) {
    if (number >= value) { numeral += letter; number -= value; }
  }
  if (number === 15 || number === 16) numeral += number === 15 ? "טו" : "טז";
  else numeral += ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"][Math.floor(number / 10)] + ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"][number % 10];
  return `${hebrewTitles[tractate.slug]} ${numeral} ${match[2] === "a" ? "א" : "ב"}`;
}

const extendedMarkupTractates = ["menachos", "bechoros", "arachin", "temurah", "meilah"];

export async function loadWikisourcePages(tractate, { fetcher = fetch, selectedAmudim = amudim(tractate), cacheDirectory = null, refresh = false, requestDelay = 0, cacheOnly = false } = {}) {
  const pages = {};
  const titles = selectedAmudim.map((amud) => ({ amud, title: wikisourceTitle(tractate, amud) }));
  for (const entry of titles.filter((entry) => !entry.title)) pages[entry.amud] = { title: null, revision: null, status: "unknown", text: "" };
  const cacheFile = cacheDirectory && join(cacheDirectory, `${tractate.slug}.json`);
  let cached = {};
  if (cacheFile) {
    try { cached = JSON.parse(await readFile(cacheFile, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  function parsePage(amud, page) {
    const revision = page.revisions?.[0];
    const rawContent = revision?.slots?.main?.content;
    const content = reviewedWikisourceContent(tractate.slug, amud, revision?.revid, rawContent);
    const usable = typeof content === "string" && content.trim().length > 0 && !/^#(?:הפניה|redirect)(?:\s|\[\[|$)/i.test(content)
      && (tractate.slug !== "shekalim" || amud !== "2a" || /\{\{כותרת לעמוד בגמרא\s*\|\s*שקלים\s*\|\s*ב\s*\|\s*א\s*\|/.test(content));
    const mainSection = usable ? /<קטע\s+התחלה\s*=\s*ג\s*\/\s*>([^]*?)<קטע\s+סוף\s*=\s*ג\s*\/\s*>/.exec(content)?.[1] : null;
    const mainText = mainSection ? normalizeHebrew(mainSection.replace(/<!--[^]*?-->|<[^>]*>/g, " ")) : "";
    const absenceBasis = usable && hasEmptyRegularTosafotSection(content) ? "wikisource-empty-regular-tosafot-section"
      : usable && hasNoTosafotSections(content) ? "wikisource-no-populated-tosafot-sections" : null;
    const rashiAbsenceBasis = usable ? regularRashiAbsenceBasis(content) : null;
    const commentarySources = {};
    if (usable && revision?.revid) {
      const headings = [...content.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
      for (const [kind, headingPattern] of [["rashi", /^רש["״]י$/], ["tosafot", /^(?:תוספות|תוס['׳])$/]]) {
        const matching = headings.filter((heading) => headingPattern.test(heading[2].trim()) && heading[1].length === 2);
        if (matching.length !== 1) continue;
        const heading = matching[0];
        const end = headings.find((candidate) => candidate.index > heading.index && candidate[1].length <= heading[1].length)?.index ?? content.length;
        const rawSection = content.slice(heading.index + heading[0].length, end);
        if ((kind === "rashi" ? /<קטע\s+התחלה\s*=\s*ת\s*\/\s*>/ : /<קטע\s+התחלה\s*=\s*ר\s*\/\s*>/).test(rawSection)) continue;
        // Piped links, source templates and a parenthesised opening are accepted only for the Kodashim audit tractates,
        // so previously pinned sources elsewhere keep their exact fingerprints.
        const extendedMarkup = extendedMarkupTractates.includes(tractate.slug);
        let section = cleanRegularTosafotSection(rawSection).replace(/\[\[([^\[\]{}|]+)\]\]/g, "$1");
        if (extendedMarkup) section = section.replace(/\[\[[^\[\]{}|]+\|([^\[\]{}|]+)\]\]/g, "$1");
        section = section.replace(extendedMarkup ? /\{\{(?:הפניה-גמ1?|מקור)\|[^{}]+\}\}/g : /\{\{הפניה-גמ\|[^{}]+\}\}/g, "|");
        if (/\{\{|\[\[|^=/m.test(section)) continue;
        const text = normalizeHebrew(section);
        const openingWord = normalizeHebrew((extendedMarkup ? /^[(' \t\r\n]*([\u05d0-\u05ea]+(?:["\u05f4][\u05d0-\u05ea]+)*)(?=[^\u05d0-\u05ea]|$)/ : /^[' \t\r\n]*([\u05d0-\u05ea]+)(?=[^\u05d0-\u05ea]|$)/).exec(section)?.[1] || "");
        if (text.length < 16 || !openingWord || !text.startsWith(openingWord)) continue;
        commentarySources[kind] = { amud, tractate: tractate.slug, commentary: kind, title: page.title, revision: revision.revid, text, openingWord,
          source: `https://he.wikisource.org/?oldid=${revision.revid}`,
          sha256: createHash("sha256").update(JSON.stringify([text, openingWord])).digest("hex"), contentSha256: createHash("sha256").update(rawContent).digest("hex") };
      }
    }
    pages[amud] = { title: page.title, pageid: page.pageid || null, revision: revision?.revid || null, usable, mainText, commentarySources, absenceCandidate: Boolean(absenceBasis), absenceBasis, rashiAbsenceBasis, ...(usable ? parseTosafotSection(content, { missingSectionStatus: tractate.slug === "sotah" ? "absent" : "unknown" }) : { status: "unknown", text: "" }) };
    return usable && Boolean(revision?.revid);
  }
  const supported = titles.filter((entry) => {
    if (!entry.title) return false;
    if (!refresh && cached[entry.amud]?.title === entry.title && parsePage(entry.amud, cached[entry.amud])) return false;
    return true;
  });
  if (cacheOnly && supported.length) throw new Error(`Wikisource revisions unavailable in local cache: ${supported.map((entry) => entry.amud).join(", ")}`);
  for (let offset = 0; offset < supported.length; offset += 50) {
    if (requestDelay) {
      const wait = lastWikiRequest + requestDelay - Date.now();
      if (wait > 0) await delay(wait);
      lastWikiRequest = Date.now();
    }
    const batch = supported.slice(offset, offset + 50);
    const byTitle = new Map(batch.map((entry) => [entry.title, entry.amud]));
    const url = new URL("https://he.wikisource.org/w/api.php");
    url.search = new URLSearchParams({ action: "query", prop: "revisions", rvprop: "ids|content", rvslots: "main", format: "json", formatversion: "2", titles: [...byTitle.keys()].join("|") });
    const response = await fetcher(url, { signal: AbortSignal.timeout(60000), headers: { "User-Agent": "GemaraDafCounter/1.0 (noncommercial research)", "Cache-Control": "no-cache" } });
    if (!response.ok) {
      const retryAfter = response.headers?.get?.("retry-after");
      const error = new Error(`Wikisource HTTP ${response.status}${retryAfter ? ` (Retry-After: ${retryAfter})` : ""}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (!Array.isArray(data.query?.pages)) throw new Error(`Unexpected Wikisource response: ${data.error?.info || "missing pages"}`);
    for (const page of data.query.pages) {
      const amud = byTitle.get(page.title);
      if (!amud) throw new Error(`Unexpected Wikisource title: ${page.title}`);
      if (parsePage(amud, page)) cached[amud] = page;
      else delete cached[amud];
    }
    if (batch.some((entry) => !pages[entry.amud])) throw new Error("Wikisource response omitted a requested page");
    if (cacheFile) {
      await mkdir(cacheDirectory, { recursive: true });
      await writeFile(`${cacheFile}.tmp`, JSON.stringify(cached));
      await rename(`${cacheFile}.tmp`, cacheFile);
    }
  }
  return pages;
}

export function applyWikisourceAbsence(entry, reference) {
  if (!entry || !reference?.revision || !reference.absenceCandidate || entry.page?.groups?.tosafot?.length) return false;
  entry.unknownCategories = (entry.unknownCategories || []).filter((kind) => kind !== "tosafot");
  entry.inferredAbsent = (entry.inferredAbsent || []).filter((kind) => kind !== "tosafot");
  entry.confirmedAbsent = [...new Set([...(entry.confirmedAbsent || []), "tosafot"])];
  entry.tosafotEvidence = {
    state: "processed", ...entry.tosafotEvidence, version: 2, sourceType: "wikisource", title: reference.title, revision: reference.revision,
    source: `https://he.wikisource.org/?oldid=${reference.revision}`, sourceStatus: reference.status,
    decision: "absent", basis: reference.absenceBasis || "wikisource-no-populated-tosafot-sections", pdfSha256: entry.page?.sha256 || null,
  };
  return true;
}

export function needsWikisourceAbsence(entry) {
  return Boolean(entry && !entry.confirmedAbsent?.includes("tosafot") && !entry.page?.groups?.tosafot?.length
    && (!entry.page || [...(entry.unknownCategories || []), ...(entry.inferredAbsent || [])].includes("tosafot")));
}

export function needsWikisourceRashiAbsence(entry) {
  return Boolean(entry && !entry.confirmedAbsent?.includes("rashi") && !entry.page?.groups?.rashi?.length
    && (!entry.page || [...(entry.unknownCategories || []), ...(entry.inferredAbsent || [])].includes("rashi")));
}

export function applyWikisourceRashiAbsence(entry, reference) {
  if (!needsWikisourceRashiAbsence(entry) || !reference?.revision || !reference.rashiAbsenceBasis) return false;
  entry.unknownCategories = (entry.unknownCategories || []).filter((kind) => kind !== "rashi");
  entry.inferredAbsent = (entry.inferredAbsent || []).filter((kind) => kind !== "rashi");
  entry.confirmedAbsent = [...new Set([...(entry.confirmedAbsent || []), "rashi"])];
  entry.rashiEvidence = {
    state: "processed", sourceType: "wikisource", title: reference.title, revision: reference.revision,
    source: `https://he.wikisource.org/?oldid=${reference.revision}`, decision: "absent",
    basis: reference.rashiAbsenceBasis, pdfSha256: entry.page?.sha256 || null,
  };
  return true;
}

const reviewedPdfs = {
  "35a": "f70bff2057641ae9e7253a33c62ffe98fcbc761ab6af2fd2ca6f3a9f01bc94a4",
  "44a": "6d67f2550bdf5959bd7c2008592937f102ed9030649aed6db0e2412acf9ca9d0",
};

export function applySotahPdfReview(amud, page) {
  if (amud === "35a" && page.sha256 === reviewedPdfs[amud]) {
    const rows = page.groups.rashi.filter((row) => [594.5987621604, 584.1587663364].some((baseline) => Math.abs(row.baseline - baseline) < 0.1));
    if (rows.length !== 2 || page.groups.tosafot.length) throw new Error("35a: reviewed Tosafot rows do not match the PDF classification");
    page.groups.rashi = page.groups.rashi.filter((row) => !rows.includes(row));
    for (const row of rows) row.kind = "tosafot";
    page.groups.tosafot.push(...rows);
    return "manual-pdf-review";
  }
  return amud === "44a" && page.sha256 === reviewedPdfs[amud] && !page.groups.tosafot.length ? "manual-pdf-review" : null;
}

export function classifyWikisourceTosafot(tractate, amud, page, reference) {
  const review = tractate.slug === "sotah" ? applySotahPdfReview(amud, page) : null;
  const detected = page.groups.tosafot.length > 0;
  const hasRashi = page.matches.some((match) => match.kind === "rashi");
  let decision = "unknown";
  let basis = null;
  if (reference.revision && reference.status === "present" && detected) {
    decision = "present";
    basis = review || "wikisource-text-and-pdf-match";
  } else if (reference.revision && reference.status === "absent" && reference.absenceCandidate !== false && !detected && hasRashi) {
    decision = "absent";
    basis = "wikisource-section-and-pdf-classification";
  } else if (reference.revision && reference.status === "unknown" && review && !detected && hasRashi) {
    decision = "absent";
    basis = review;
  }
  return {
    version: 2, state: "processed", title: reference.title, revision: reference.revision,
    source: reference.revision ? `https://he.wikisource.org/?oldid=${reference.revision}` : null,
    sourceStatus: reference.status, decision, basis, pdfSha256: page.sha256,
  };
}

export function classifySotahTosafot(amud, page, reference) {
  return classifyWikisourceTosafot({ slug: "sotah" }, amud, page, reference);
}

export function sotahWikiTitle(amud) {
  const match = /^(\d+)([ab])$/.exec(amud);
  const daf = Number(match?.[1]);
  if (!match || daf < 2 || daf > 49) throw new Error(`Invalid Sotah amud: ${amud}`);
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ"];
  const number = daf === 15 ? "טו" : daf === 16 ? "טז" : tens[Math.floor(daf / 10)] + ones[daf % 10];
  return `סוטה ${number} ${match[2] === "a" ? "א" : "ב"}`;
}

export function hasNoTosafotSections(wikitext) {
  if (typeof wikitext !== "string") throw new Error("Missing Wikisource wikitext");
  const headings = [...wikitext.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (!/תוספות|תוס['׳״"]/.test(heading[2])) continue;
    let end = wikitext.length;
    for (const next of headings.slice(index + 1)) {
      if (next[1].length <= heading[1].length) { end = next.index; break; }
    }
    const section = wikitext.slice(heading.index + heading[0].length, end)
      .replace(/<!--[^]*?-->/g, " ").replace(/<center>\s*'*פרק\s+[^<]*<\/center>/gi, " ").replace(/<[^>]*>/g, " ")
      .replace(/^(={2,6})[ \t]*.*?[ \t]*\1[ \t]*$/gm, " ").trim();
    if (section && !/^\(\s*אין תוספות לפרק זה\s*\)$/.test(section)) return false;
  }
  return true;
}

function cleanRegularTosafotSection(section, marker = "ת") {
  const end = (marker === "ר" ? /<קטע\s+סוף\s*=\s*ר\s*\/\s*>/i : /<קטע\s+סוף\s*=\s*ת\s*\/\s*>/i).exec(section);
  return (end ? section.slice(0, end.index) : section)
    .replace(/<!--[^]*?-->/g, " ").replace(/<center>\s*'*פרק\s+[^<]*<\/center>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/^(={2,6})[ \t]*.*?[ \t]*\1[ \t]*$/gm, " ")
    .replace(/^\[\[קטגוריה:[^\]]+\]\][ \t]*$/gm, " ")
    .replace(/^\{\{מפרשים לדף גמרא\|[^{}]*\}\}[ \t]*$/gm, " ").trim();
}

export function regularRashiAbsenceBasis(wikitext) {
  if (typeof wikitext !== "string") throw new Error("Missing Wikisource wikitext");
  const headings = [...wikitext.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
  if (headings.some((heading) => /מיוחס/.test(heading[2]) && /רש(?:["״'׳])?י/.test(heading[2]))) return null;
  const regular = headings.filter((heading) => /^רש(?:["״])?י$/.test(heading[2].trim()));
  if (!regular.length) return "wikisource-no-regular-rashi-section";
  const empty = regular.every((heading) => {
    const next = headings.find((candidate) => candidate.index > heading.index && candidate[1].length <= heading[1].length);
    const section = cleanRegularTosafotSection(wikitext.slice(heading.index + heading[0].length, next?.index ?? wikitext.length), "ר");
    return !section || /^\(\s*אין\s*\)$/.test(section);
  });
  return empty ? "wikisource-empty-regular-rashi-section" : null;
}

function isExplicitNoTosafot(section) {
  return /^\(\s*אין(?:\s+תוספות\s+לפרק\s+זה)?\s*\)$/.test(section);
}

export function hasEmptyRegularTosafotSection(wikitext) {
  if (typeof wikitext !== "string") throw new Error("Missing Wikisource wikitext");
  const headings = [...wikitext.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
  const regular = headings.filter((heading) => /^(?:תוספות|תוס['׳])$/.test(heading[2].trim()));
  if (!regular.length) return false;
  return regular.every((heading) => {
    const next = headings.find((candidate) => candidate.index > heading.index && candidate[1].length <= heading[1].length);
    const section = cleanRegularTosafotSection(wikitext.slice(heading.index + heading[0].length, next?.index ?? wikitext.length));
    return !section || isExplicitNoTosafot(section);
  });
}

export function parseTosafotSection(wikitext, { missingSectionStatus = "unknown", emptySectionStatus = "unknown" } = {}) {
  if (typeof wikitext !== "string") throw new Error("Missing Wikisource wikitext");
  const heading = /^==[ \t]*(?:תוספות|תוס['׳])[ \t]*==[ \t]*$/m.exec(wikitext);
  if (!heading) return { status: missingSectionStatus, text: "" };
  const following = wikitext.slice(heading.index + heading[0].length);
  const nextHeading = /^==[^=\n].*?==[ \t]*$/m.exec(following);
  const section = cleanRegularTosafotSection(nextHeading ? following.slice(0, nextHeading.index) : following);
  if (isExplicitNoTosafot(section)) return { status: "absent", text: "" };
  const text = normalizeHebrew(section);
  if (!section.trim()) return { status: emptySectionStatus, text: "" };
  return text.length >= 16 ? { status: "present", text } : { status: "unknown", text: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pages = await loadWikisourcePages(tractates.find((tractate) => tractate.slug === "sotah"));
  console.log(JSON.stringify({ pages: Object.keys(pages).length, counts: Object.fromEntries(["present", "absent", "unknown"].map((status) => [status, Object.values(pages).filter((page) => page.status === status).length])) }, null, 2));
}