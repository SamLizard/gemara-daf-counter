import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { calculateAreas, calculateFrame, classifierVersion } from "./measure-corpus.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";

const kinds = ["main", "rashi", "tosafot"];
const excludedCommentary = new Set(["kinim", "tamid", "middos"]);

export function buildShasExport(catalog, data) {
  const books = catalog.map((tractate) => {
    const expected = amudim(tractate);
    const entries = data[tractate.slug] || {};
    const policyExclusions = excludedCommentary.has(tractate.slug) ? ["rashi", "tosafot"] : [];
    const exclusionsFor = (entry) => [...new Set([...(entry?.excludedCategories || []), ...policyExclusions])];
    const measured = expected.map((amud) => entries[amud]).filter((entry) => entry?.page);
    const pages = measured.map((entry) => {
      const page = structuredClone(entry.page);
      for (const kind of exclusionsFor(entry)) if (kind in page.groups) page.groups[kind] = [];
      return page;
    });
    const frame = pages.length ? calculateFrame(pages, { horizontal: 2, vertical: 2 }) : null;
    const frameArea = frame ? calculateAreas(pages, frame) : null;
    const byName = new Map(pages.map((page) => [page.name, page]));
    const output = expected.map((amud) => {
      const entry = entries[amud];
      const confirmedAbsent = entry?.confirmedAbsent || [];
      const excludedCategories = exclusionsFor(entry);
      if (!entry?.page) return { amud, status: entry?.error || entry?.tosafotEvidence?.state === "error" ? "unresolved" : "pending", reason: entry?.lastClassificationError || entry?.error || null, mainRecoveryError: entry?.mainRecoveryError || null, ...(confirmedAbsent.length ? { confirmedAbsent } : {}), ...(excludedCategories.length ? { excludedCategories, unknownCategories: [...new Set([...(entry?.unknownCategories || []), ...kinds])].filter((kind) => !confirmedAbsent.includes(kind) && !excludedCategories.includes(kind)) } : {}), ...(entry?.rashiEvidence ? { rashiEvidence: entry.rashiEvidence } : {}), ...(entry?.tosafotEvidence ? { confirmedAbsent, tosafotEvidence: entry.tosafotEvidence, lastClassificationError: entry.lastClassificationError || null } : {}), fractions: kinds.some((kind) => confirmedAbsent.includes(kind) || excludedCategories.includes(kind)) ? Object.fromEntries(kinds.map((kind) => [kind, confirmedAbsent.includes(kind) || excludedCategories.includes(kind) ? 0 : null])) : null };
      const page = byName.get(entry.page.name);
      const suspectTosafot = entry.commentaryRetry?.state === "error" && entry.inferredAbsent?.includes("rashi") && !entry.confirmedAbsent?.includes("tosafot") && entry.page.groups.tosafot?.length;
      const failedLegacyAudit = entry.commentaryRetry?.state === "error" && entry.commentaryRetry.legacyAudit;
      const unknownCategories = [...new Set([...(entry.unknownCategories || []), ...(entry.inferredAbsent || []), ...(failedLegacyAudit ? ["rashi"] : []), ...((suspectTosafot || (failedLegacyAudit && !confirmedAbsent.includes("tosafot"))) ? ["tosafot"] : [])])].filter((kind) => !confirmedAbsent.includes(kind) && !excludedCategories.includes(kind));
      const mainSource = `https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/${`json/Talmud/Bavli/Seder ${tractate.order}/${tractate.title}/Hebrew/merged.json`.split("/").map(encodeURIComponent).join("/")}`;
      return {
        amud,
        status: unknownCategories.length ? "partial" : "measured",
        method: entry.recovery || entry.nedarimAudit?.outcome === "fallback" ? "main-only" : "classified",
        reason: entry.recovery?.reason || null,
        mainMatch: entry.recovery ? { referenceScope: "page", source: mainSource, ...entry.recovery.mainMatch } : null,
        unknownCategories,
        inferredAbsent: (entry.inferredAbsent || []).filter((kind) => !excludedCategories.includes(kind)),
        ...(entry.commentaryRetry?.state === "error" ? { commentaryRetryError: entry.commentaryRetry.error } : {}),
        ...(page.matches?.some((match) => match.kind === "other" && match.source) ? { otherCommentary: { sources: [...new Set(page.matches.filter((match) => match.kind === "other" && match.source).map((match) => match.source))], rows: page.groups.other?.length || 0,
          ...((tractate.slug === "nedarim" && entry.nedarimAudit?.outcome === "recomputed") || page.matches.some((match) => match.kind === "other" && match.source === "Rashbam") ? { fraction: page.areas.other.fraction } : {}) } } : {}),
        ...(confirmedAbsent.length ? { confirmedAbsent } : {}),
        ...(excludedCategories.length ? { excludedCategories } : {}),
        ...(entry.rashiEvidence ? { rashiEvidence: entry.rashiEvidence } : {}),
        ...(entry.tosafotEvidence ? { confirmedAbsent, tosafotEvidence: entry.tosafotEvidence, lastClassificationError: entry.lastClassificationError || null } : {}),
        fractions: Object.fromEntries(kinds.map((kind) => [kind, excludedCategories.includes(kind) || confirmedAbsent.includes(kind) ? 0 : unknownCategories.includes(kind) ? null : page.areas[kind].fraction])),
      };
    });
    const complete = output.every((page) => page.status === "measured");
    const allPagesMeasured = output.every((page) => page.status === "measured" || page.status === "partial");
    const excludedCategories = kinds.filter((kind) => output.every((page) => page.excludedCategories?.includes(kind)));
    const sums = Object.fromEntries(kinds.map((kind) => [kind, excludedCategories.includes(kind) ? 0 : allPagesMeasured && output.every((page) => page.fractions[kind] !== null)
      ? output.reduce((sum, page) => sum + page.fractions[kind], 0) : null]));
    return {
      id: tractate.slug, title: tractate.title, order: tractate.order, firstAmud: tractate.first, lastAmud: tractate.last,
      ...(excludedCategories.length ? { excludedCategories } : {}),
      status: complete ? "complete" : measured.length ? "partial" : output.some((page) => page.status === "unresolved") ? "unresolved" : "pending",
      coverage: { expected: expected.length, measured: measured.length, unresolved: output.filter((page) => page.status === "unresolved").length, pending: output.filter((page) => page.status === "pending").length, pagesWithUnknownCategories: output.filter((page) => page.status === "partial").length, pagesWithInferredAbsence: output.filter((page) => page.inferredAbsent?.length).length, knownByCategory: Object.fromEntries(kinds.map((kind) => [kind, output.filter((page) => page.fractions && page.fractions[kind] !== null).length])) },
      frame: frame ? { ...frame, area: frameArea, provisional: !complete || ((tractate.slug === "shekalim" || policyExclusions.length > 0) && measured.some((entry) => entry.recovery || entry.page.frameRows?.length)), referenceBasis: pages.some((page) => page.frameRows?.length) ? "main-and-unclassified-text" : measured.every((entry) => entry.recovery) ? "main-text-only" : "classified-text" } : null,
      totals: allPagesMeasured || excludedCategories.length ? { sides: sums, dafim: Object.fromEntries(kinds.map((kind) => [kind, sums[kind] === null ? null : sums[kind] / 2])) } : null,
      pages: output,
    };
  });
  return {
    schemaVersion: 1,
    classifierVersion,
    methodology: {
      unit: "fractions of the tractate's fitted text-body rectangle per printed side; Kinnim uses a separately fitted rectangle for each side",
      mainIncludes: ["Gemara", "Mishnah"],
      equivalentDaf: "two equivalent printed sides",
      warning: "Automatic line-box estimates, not ink area or fully hand-verified. Complete means classifier coverage, not verified accuracy. Different tractates have different reference rectangles. Null means unknown, not zero; inferred absence remains unknown. Some Rashi and Tosafot zeroes rely only on Wikisource sections and can be wrong if the transcription is incomplete; they are not all verified against the PDF. Shekalim user-attested absences are not Wikisource findings or independent visual verification. Partial frames are provisional and may change with further measurements; Shekalim unclassified or main-only frames remain provisional even with numeric category coverage. Other commentators, including Rashbam and Ran, are not included under Rashi or Tosafot.",
      pdfSource: "https://www.shas.org/daf-pdf/api/",
      pdfAttribution: "Shas.org, HebrewBooks.org and Moznaim (הוצאת ח. וגשל)",
      commentarySource: "https://github.com/Sefaria/Sefaria-Export-Archive/tree/3f1013631fdfe452e953a93a2c5f921319e394ed",
      tosafotSource: "https://he.wikisource.org/ (Horayot uses the pinned Sefaria archive; absence decisions and their sources are recorded per page)",
    },
    coverage: { tractates: books.length, complete: books.filter((book) => book.status === "complete").length, partial: books.filter((book) => book.status === "partial").length, unresolved: books.filter((book) => book.status === "unresolved").length, pending: books.filter((book) => book.status === "pending").length },
    tractates: books,
  };
}

export async function readShasData({ resultsDirectory = "results" } = {}) {
  const data = {};
  try {
    const corpus = JSON.parse(await readFile(join(resultsDirectory, "corpus-measurements.json"), "utf8"));
    for (const tractate of tractates.filter((entry) => ["horayos", "rosh-hashanah"].includes(entry.slug))) {
      data[tractate.slug] = {};
      for (const page of corpus.pages.filter((entry) => entry.name.startsWith(`${tractate.slug}-`))) {
        data[tractate.slug][page.name.slice(tractate.slug.length + 1)] = { page };
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let files = [];
  try {
    files = await readdir(join(resultsDirectory, "shas-work"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files.filter((entry) => entry.endsWith(".json"))) {
    const work = JSON.parse(await readFile(join(resultsDirectory, "shas-work", file), "utf8"));
    data[work.slug] = Object.fromEntries(Object.entries(work.pages).filter(([, entry]) => entry.classifierVersion === classifierVersion));
  }
  return data;
}

export async function writeShasExport() {
  const output = buildShasExport(tractates, await readShasData());
  await mkdir("results", { recursive: true });
  await writeFile("results/shas-metrics.json", JSON.stringify(output, null, 2));
  return output.coverage;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await writeShasExport(), null, 2));