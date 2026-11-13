import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const archive = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/";
const decoder = new TextDecoder("windows-1255");
const definitions = [
  { slug: "horayos", title: "Horayot", order: "Nezikin", count: 25, mainSize: 12.24, mainPitch: 10.66825, commentaryPitch: 8.69562, tosafotPitch: 6.72 },
  { slug: "rosh-hashanah", title: "Rosh Hashanah", order: "Moed", count: 67, mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44 },
];

export function decodePdfText(text) {
  if (/[\u00c0-\u00fa]/.test(text) && [...text].every((character) => character.charCodeAt(0) < 256)) {
    return [...decoder.decode(Buffer.from(text, "latin1"))].reverse().join("");
  }
  return text;
}

export function normalizeHebrew(text) {
  return text.normalize("NFD").replace(/[^\u05d0-\u05ea]/g, "");
}

export function groupRows(items, tolerance = 0.8) {
  const rows = [];
  for (const item of [...items].sort((first, second) => second.transform[5] - first.transform[5])) {
    let row = rows.find((candidate) => Math.abs(candidate.baseline - item.transform[5]) < tolerance);
    if (!row) {
      row = { baseline: item.transform[5], left: Infinity, right: -Infinity, items: [] };
      rows.push(row);
    }
    row.left = Math.min(row.left, item.transform[4]);
    row.right = Math.max(row.right, item.transform[4] + item.width);
    row.items.push(item);
  }
  return rows;
}

export function splitRuns(items) {
  const runs = [];
  for (const item of items) {
    let run = runs.at(-1);
    if (!run || item.transform[5] - run.at(-1).transform[5] > 30) {
      run = [];
      runs.push(run);
    }
    run.push(item);
  }
  return runs;
}

export function matchScore(items, reference) {
  if (!reference) return 0;
  const fragments = items.map((item) => decodePdfText(item.str));
  const rows = groupRows(items).map((row) => row.items.sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" "));
  return [...fragments, ...rows].reduce((score, fragment) => {
    const text = normalizeHebrew(fragment);
    return score + (text.length >= 8 && reference.includes(text) ? text.length : 0);
  }, 0);
}

function lines(items, pitch, kind) {
  return groupRows(items).map(({ baseline, left, right }) => ({ baseline, left, right, pitch, kind }));
}

function itemsOfSize(items, sizes) {
  return items.filter((item) => sizes.some((size) => Math.abs(item.height - size) < 0.02));
}

async function loadTexts(definition) {
  const texts = {};
  for (const work of ["Rashi", "Tosafot"]) {
    const file = `json/Talmud/Bavli/Rishonim on Talmud/${work}/Seder ${definition.order}/${work} on ${definition.title}/Hebrew/merged.json`;
    const response = await fetch(archive + file.split("/").map(encodeURIComponent).join("/"), { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${work} on ${definition.title}: HTTP ${response.status}`);
    const data = await response.json();
    if (data.title !== `${work} on ${definition.title}` || !Array.isArray(data.text)) throw new Error(`Unexpected ${work} export`);
    texts[work.toLowerCase()] = data.text.map((segments) => normalizeHebrew((segments || []).flat(Infinity).join(" ")));
  }
  return texts;
}

function identifyRun(run, references, name) {
  const scores = { rashi: matchScore(run, references.rashi), tosafot: matchScore(run, references.tosafot) };
  const kind = scores.rashi > scores.tosafot ? "rashi" : "tosafot";
  const other = kind === "rashi" ? "tosafot" : "rashi";
  if (scores[kind] < 16 || scores[kind] < 2 * scores[other]) throw new Error(`${name}: ambiguous commentary stream ${JSON.stringify(scores)}`);
  return { kind, scores };
}

async function processPage(definition, index, references) {
  const daf = Math.floor(index / 2) + 2;
  const side = index % 2 ? "b" : "a";
  const name = `${definition.slug}-${daf}${side}`;
  const bytes = await readFile(join("results", "pdfs", `${name}.pdf`));
  const packageUrl = import.meta.resolve("pdfjs-dist/package.json");
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", packageUrl)),
    wasmUrl: fileURLToPath(new URL("wasm/", packageUrl)),
  });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${name}: expected one page`);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const main = lines(itemsOfSize(items, [definition.mainSize]), definition.mainPitch, "main");
    if (!main.length) throw new Error(`${name}: main type not found`);
    const groups = { main, rashi: [], tosafot: [] };
    const matches = [];
    if (definition.slug === "horayos") {
      const rashiRuns = splitRuns(itemsOfSize(items, [9.84]));
      if (rashiRuns.length !== 2) throw new Error(`${name}: expected two Rashi runs, found ${rashiRuns.length}`);
      for (const run of rashiRuns) {
        const result = identifyRun(run, references, name);
        if (result.kind !== "rashi") throw new Error(`${name}: side commentary did not match Rashi`);
        matches.push(result);
        groups.rashi.push(...lines(run, definition.commentaryPitch, "rashi"));
      }
      let tosafot = itemsOfSize(items, [7.56]);
      if (index === 0) tosafot = tosafot.filter((item) => item.transform[5] < 480);
      if (tosafot.length) {
        const result = identifyRun(tosafot, references, name);
        if (result.kind !== "tosafot") throw new Error(`${name}: lower commentary did not match Tosafot`);
        matches.push(result);
        if (tosafot.some((item) => item.transform[4] < 330 && item.transform[4] + item.width > 330)) throw new Error(`${name}: Tosafot crosses the column divider`);
        for (const side of ["left", "right"]) {
          const column = tosafot.filter((item) => side === "left" ? item.transform[4] < 330 : item.transform[4] >= 330);
          groups.tosafot.push(...lines(column, definition.tosafotPitch, "tosafot"));
        }
      }
    } else {
      const runs = splitRuns(itemsOfSize(items, [11.16, 11.4]));
      for (const run of runs) {
        const result = identifyRun(run, references, name);
        matches.push(result);
        groups[result.kind].push(...lines(run, definition.commentaryPitch, result.kind));
      }
    }
    return { name, sha256: createHash("sha256").update(bytes).digest("hex"), view: page.view, groups, matches };
  } finally {
    await task.destroy();
  }
}

export function calculateFrame(pages) {
  const all = pages.flatMap((page) => Object.values(page.groups).flat());
  if (!all.length) throw new Error("No measured lines");
  return {
    left: Math.min(...all.map((row) => row.left)),
    right: Math.max(...all.map((row) => row.right)),
    bottom: Math.min(...all.map((row) => row.baseline - row.pitch / 2)),
    top: Math.max(...all.map((row) => row.baseline + row.pitch / 2)),
  };
}

export function calculateAreas(pages, frame) {
  const frameArea = (frame.right - frame.left) * (frame.top - frame.bottom);
  if (!(frameArea > 0)) throw new Error("Invalid reference rectangle");
  for (const page of pages) {
    page.areas = {};
    for (const [kind, rows] of Object.entries(page.groups)) {
      const area = rows.reduce((sum, row) => sum + (row.right - row.left) * row.pitch, 0);
      page.areas[kind] = { rows: rows.length, area, fraction: area / frameArea };
    }
  }
  return frameArea;
}

async function main() {
  const pages = [];
  for (const definition of definitions) {
    const texts = await loadTexts(definition);
    for (let index = 0; index < definition.count; index++) {
      const references = { rashi: texts.rashi[index + 2] || "", tosafot: texts.tosafot[index + 2] || "" };
      pages.push(await processPage(definition, index, references));
    }
  }
  const frame = calculateFrame(pages);
  const frameArea = calculateAreas(pages, frame);
  const totals = {};
  for (const definition of definitions) {
    const selected = pages.filter((page) => page.name.startsWith(`${definition.slug}-`));
    totals[definition.slug] = Object.fromEntries(["main", "rashi", "tosafot"].map((kind) => [kind, selected.reduce((sum, page) => sum + page.areas[kind].fraction, 0)]));
  }
  const report = { frame, frameArea, definitions, totals, pages, warning: "Exploratory line-box estimates; headings, ornaments, and unrecognized type variants may be omitted." };
  await mkdir("results", { recursive: true });
  await writeFile(join("results", "corpus-measurements.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ frame, frameArea, totals, pages: pages.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();