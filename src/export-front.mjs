import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const orders = ["Zeraim", "Moed", "Nashim", "Nezikin", "Kodashim", "Tahorot"];

const round = (value, digits) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const sumKnown = (values) => (values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0));
const sourcesOf = (page) => page.otherCommentary?.sources || [];
const otherFraction = (page, source) => (sourcesOf(page).includes(source) ? (page.otherCommentary.fraction ?? null) : 0);

// Per-side value of each displayed text. Rashbam is shown together with Rashi.
function columnsFor(tractate) {
  const hasRashbam = tractate.pages.some((page) => sourcesOf(page).includes("Rashbam"));
  const hasRan = tractate.pages.some((page) => sourcesOf(page).includes("Ran"));
  const fraction = (kind) => (page) => page.fractions?.[kind] ?? null;
  const columns = [{ id: "main", value: fraction("main"), category: "main" }];
  if (hasRashbam) {
    columns.push({
      id: "rashi-rashbam",
      category: "rashi",
      value: (page) => sumKnown([fraction("rashi")(page), otherFraction(page, "Rashbam")]),
    });
  } else {
    columns.push({ id: "rashi", value: fraction("rashi"), category: "rashi" });
  }
  if (hasRan) columns.push({ id: "ran", value: (page) => otherFraction(page, "Ran") });
  columns.push({ id: "tosafot", value: fraction("tosafot"), category: "tosafot" });
  return columns;
}

export function buildFrontExport(data) {
  const tractates = data.tractates.map((tractate) => {
    const excluded = new Set(tractate.excludedCategories || []);
    const columns = columnsFor(tractate);
    const values = columns.map((column) => tractate.pages.map((page) => column.value(page)));
    const texts = columns.map((column, index) => {
      if (column.category && excluded.has(column.category)) return { id: column.id, state: "not-measured", total: null };
      const sum = sumKnown(values[index]);
      if (sum === 0) return { id: column.id, state: "absent", total: null };
      if (sum === null) return { id: column.id, state: "not-measured", total: null };
      return { id: column.id, state: "measured", total: round(sum / 2, 2) };
    });
    // When only the main text remains, the commentaries were not measured (Shekalim, Kinnim,
    // Tamid, Middos): show one "not calculated" line instead of per-text entries.
    const mainOnly = texts.every((text) => text.id === "main" || text.state !== "measured");
    if (mainOnly) for (const text of texts) if (text.id !== "main") text.state = "absent";
    const kept = texts.map((text, index) => ({ text, index })).filter(({ text }) => text.state !== "absent");
    return {
      id: tractate.id,
      order: tractate.order,
      firstAmud: tractate.firstAmud,
      lastAmud: tractate.lastAmud,
      printedSides: tractate.pages.length,
      texts: kept.map(({ text }) => text),
      otherCommentaries: mainOnly ? "not-measured" : "none",
      columns: kept.map(({ text }) => text.id),
      pages: tractate.pages.map((page, row) => [page.amud, ...kept.map(({ index }) => round(values[index][row], 4))]),
    };
  });
  const unknownOrder = tractates.find((tractate) => !orders.includes(tractate.order));
  if (unknownOrder) throw new Error(`Unknown order ${unknownOrder.order} for ${unknownOrder.id}`);
  return {
    generatedFrom: { schemaVersion: data.schemaVersion, classifierVersion: data.classifierVersion },
    attribution: {
      pdf: data.methodology.pdfAttribution,
      sources: [data.methodology.pdfSource, data.methodology.commentarySource, data.methodology.tosafotSource],
    },
    warning: data.methodology.warning,
    orders,
    tractates,
  };
}

async function main() {
  const data = JSON.parse(await readFile(join(root, "data", "shas-metrics.json"), "utf8"));
  const output = buildFrontExport(data);
  const target = join(root, "front", "public", "shas-front.json");
  await mkdir(dirname(target), { recursive: true });
  const json = JSON.stringify(output);
  await writeFile(target, json);
  console.log(`Wrote ${target} (${Math.round(json.length / 1024)} KB, ${output.tractates.length} tractates)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
