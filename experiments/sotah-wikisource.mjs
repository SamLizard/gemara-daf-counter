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

export function wikisourceTitle(tractate, amud) {
  const match = /^(\d+)([ab])$/.exec(amud);
  if (!match || Number(match[1]) < 2 || Number(match[1]) > 399) throw new Error(`Invalid amud: ${amud}`);
  if (!hebrewTitles[tractate.slug]) return null;
  let number = Number(match[1]);
  let numeral = "";
  for (const [value, letter] of [[300, "ש"], [200, "ר"], [100, "ק"]]) {
    if (number >= value) { numeral += letter; number -= value; }
  }
  if (number === 15 || number === 16) numeral += number === 15 ? "טו" : "טז";
  else numeral += ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"][Math.floor(number / 10)] + ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"][number % 10];
  return `${hebrewTitles[tractate.slug]} ${numeral} ${match[2] === "a" ? "א" : "ב"}`;
}

export async function loadWikisourcePages(tractate, { fetcher = fetch } = {}) {
  const pages = {};
  const titles = amudim(tractate).map((amud) => ({ amud, title: wikisourceTitle(tractate, amud) }));
  for (const entry of titles.filter((entry) => !entry.title)) pages[entry.amud] = { title: null, revision: null, status: "unknown", text: "" };
  const supported = titles.filter((entry) => entry.title);
  for (let offset = 0; offset < supported.length; offset += 50) {
    const batch = supported.slice(offset, offset + 50);
    const byTitle = new Map(batch.map((entry) => [entry.title, entry.amud]));
    const url = new URL("https://he.wikisource.org/w/api.php");
    url.search = new URLSearchParams({ action: "query", prop: "revisions", rvprop: "ids|content", rvslots: "main", format: "json", formatversion: "2", titles: [...byTitle.keys()].join("|") });
    const response = await fetcher(url, { signal: AbortSignal.timeout(60000), headers: { "User-Agent": "GemaraDafCounter/1.0 (noncommercial research)", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`Wikisource HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.query?.pages)) throw new Error(`Unexpected Wikisource response: ${data.error?.info || "missing pages"}`);
    for (const page of data.query.pages) {
      const amud = byTitle.get(page.title);
      if (!amud) throw new Error(`Unexpected Wikisource title: ${page.title}`);
      const revision = page.revisions?.[0];
      const content = revision?.slots?.main?.content;
      const usable = typeof content === "string" && !/^#(?:הפניה|redirect)(?:\s|\[\[|$)/i.test(content);
      pages[amud] = { title: page.title, pageid: page.pageid || null, revision: revision?.revid || null, ...(usable ? parseTosafotSection(content, { missingSectionStatus: tractate.slug === "sotah" ? "absent" : "unknown" }) : { status: "unknown", text: "" }) };
    }
    if (batch.some((entry) => !pages[entry.amud])) throw new Error("Wikisource response omitted a requested page");
  }
  return pages;
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
  } else if (reference.revision && reference.status === "absent" && !detected && hasRashi) {
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

export function parseTosafotSection(wikitext, { missingSectionStatus = "unknown" } = {}) {
  if (typeof wikitext !== "string") throw new Error("Missing Wikisource wikitext");
  const heading = /^==[ \t]*(?:תוספות|תוס['׳])[ \t]*==[ \t]*$/m.exec(wikitext);
  if (!heading) return { status: missingSectionStatus, text: "" };
  const following = wikitext.slice(heading.index + heading[0].length);
  const nextHeading = /^==[^=\n].*?==[ \t]*$/m.exec(following);
  const section = (nextHeading ? following.slice(0, nextHeading.index) : following).replace(/<[^>]*>/g, " ");
  if (/\(\s*אין תוספות לפרק זה\s*\)/.test(section)) return { status: "absent", text: "" };
  const text = normalizeHebrew(section);
  return text.length >= 16 ? { status: "present", text } : { status: "unknown", text: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pages = await loadWikisourcePages(tractates.find((tractate) => tractate.slug === "sotah"));
  console.log(JSON.stringify({ pages: Object.keys(pages).length, counts: Object.fromEntries(["present", "absent", "unknown"].map((status) => [status, Object.values(pages).filter((page) => page.status === status).length])) }, null, 2));
}