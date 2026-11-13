import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { calculateAreas, calculateFrame, classifierVersion } from "./measure-corpus.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";

const kinds = ["main", "rashi", "tosafot"];

export function buildShasExport(catalog, data) {
  const books = catalog.map((tractate) => {
    const expected = amudim(tractate);
    const entries = data[tractate.slug] || {};
    const measured = expected.map((amud) => entries[amud]).filter((entry) => entry?.page);
    const pages = measured.map((entry) => structuredClone(entry.page));
    const framePages = pages.map((page) => ({ groups: { ...page.groups, unclassified: page.frameRows || [] } }));
    const frame = pages.length ? calculateFrame(framePages, { horizontal: 2, vertical: 2 }) : null;
    const frameArea = frame ? calculateAreas(pages, frame) : null;
    const byName = new Map(pages.map((page) => [page.name, page]));
    const output = expected.map((amud) => {
      const entry = entries[amud];
      if (!entry?.page) return { amud, status: entry?.error || entry?.tosafotEvidence?.state === "error" ? "unresolved" : "pending", reason: entry?.lastClassificationError || entry?.error || null, mainRecoveryError: entry?.mainRecoveryError || null, ...(entry?.tosafotEvidence ? { confirmedAbsent: [], tosafotEvidence: entry.tosafotEvidence, lastClassificationError: entry.lastClassificationError || null } : {}), fractions: null };
      const page = byName.get(entry.page.name);
      const unknownCategories = [...new Set([...(entry.unknownCategories || []), ...(entry.inferredAbsent || [])])];
      const mainSource = `https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/${`json/Talmud/Bavli/Seder ${tractate.order}/${tractate.title}/Hebrew/merged.json`.split("/").map(encodeURIComponent).join("/")}`;
      return {
        amud,
        status: unknownCategories.length ? "partial" : "measured",
        method: entry.recovery ? "main-only" : "classified",
        reason: entry.recovery?.reason || null,
        mainMatch: entry.recovery ? { referenceScope: "page", source: mainSource, ...entry.recovery.mainMatch } : null,
        unknownCategories,
        inferredAbsent: entry.inferredAbsent || [],
        ...(entry.tosafotEvidence ? { confirmedAbsent: entry.confirmedAbsent || [], tosafotEvidence: entry.tosafotEvidence, lastClassificationError: entry.lastClassificationError || null } : {}),
        fractions: Object.fromEntries(kinds.map((kind) => [kind, unknownCategories.includes(kind) ? null : page.areas[kind].fraction])),
      };
    });
    const complete = output.every((page) => page.status === "measured");
    const allPagesMeasured = output.every((page) => page.fractions);
    const sums = Object.fromEntries(kinds.map((kind) => [kind, allPagesMeasured && output.every((page) => page.fractions[kind] !== null)
      ? output.reduce((sum, page) => sum + page.fractions[kind], 0) : null]));
    return {
      id: tractate.slug, title: tractate.title, order: tractate.order, firstAmud: tractate.first, lastAmud: tractate.last,
      status: complete ? "complete" : measured.length ? "partial" : output.some((page) => page.status === "unresolved") ? "unresolved" : "pending",
      coverage: { expected: expected.length, measured: measured.length, unresolved: output.filter((page) => page.status === "unresolved").length, pending: output.filter((page) => page.status === "pending").length, pagesWithUnknownCategories: output.filter((page) => page.status === "partial").length, pagesWithInferredAbsence: output.filter((page) => page.inferredAbsent?.length).length, knownByCategory: Object.fromEntries(kinds.map((kind) => [kind, output.filter((page) => page.fractions && page.fractions[kind] !== null).length])) },
      frame: frame ? { ...frame, area: frameArea, provisional: !complete, referenceBasis: pages.some((page) => page.frameRows?.length) ? "main-and-unclassified-text" : measured.every((entry) => entry.recovery) ? "main-text-only" : "classified-text" } : null,
      totals: allPagesMeasured ? { sides: sums, dafim: Object.fromEntries(kinds.map((kind) => [kind, sums[kind] === null ? null : sums[kind] / 2])) } : null,
      pages: output,
    };
  });
  return {
    schemaVersion: 1,
    classifierVersion,
    methodology: {
      unit: "fractions of the tractate's fitted text-body rectangle per printed side",
      mainIncludes: ["Gemara", "Mishnah"],
      equivalentDaf: "two equivalent printed sides",
      warning: "Automatic line-box estimates, not ink area or fully hand-verified. Complete means classifier coverage, not verified accuracy. Different tractates have different reference rectangles. Null means unknown, not zero; inferred absence remains unknown. Source-backed absence uses a community index and PDF classification, not a manual inspection of every zero. Partial frames are provisional and may change with further measurements; unclassified or main-only frame bases are less certain. Other commentators, including Rashbam and Ran, are not included under Rashi or Tosafot.",
      pdfSource: "https://www.shas.org/daf-pdf/api/",
      pdfAttribution: "Shas.org, HebrewBooks.org and Moznaim (הוצאת ח. וגשל)",
      commentarySource: "https://github.com/Sefaria/Sefaria-Export-Archive/tree/3f1013631fdfe452e953a93a2c5f921319e394ed",
      tosafotSource: "https://he.wikisource.org/ (revision and evidence recorded per page when used)",
    },
    coverage: { tractates: books.length, complete: books.filter((book) => book.status === "complete").length, partial: books.filter((book) => book.status === "partial").length, unresolved: books.filter((book) => book.status === "unresolved").length, pending: books.filter((book) => book.status === "pending").length },
    tractates: books,
  };
}

export async function readShasData() {
  const data = {};
  try {
    const corpus = JSON.parse(await readFile("results/corpus-measurements.json", "utf8"));
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
    files = await readdir("results/shas-work");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of files.filter((entry) => entry.endsWith(".json"))) {
    const work = JSON.parse(await readFile(join("results/shas-work", file), "utf8"));
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