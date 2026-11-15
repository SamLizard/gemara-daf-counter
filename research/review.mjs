import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadTexts, processPage } from "../src/measure-corpus.mjs";
import { amudIndex, tractates } from "../src/shas-catalog.mjs";
import { loadWikisourcePages } from "../src/sotah-wikisource.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(directory, "../results");
const samples = ["2a", "2b", "3a"];

async function reviewEruvin12b() {
  const tractate = tractates.find((entry) => entry.slug === "eruvin");
  const amud = "12b";
  const work = JSON.parse(await readFile(join(outputDirectory, "shas-work", "eruvin.json"), "utf8"));
  const entry = work.pages[amud];
  const data = JSON.parse(await readFile(join(outputDirectory, "shas-metrics.json"), "utf8"));
  const book = data.tractates.find((item) => item.id === "eruvin");
  const result = book.pages.find((item) => item.amud === amud);
  if (!entry?.page || !book.frame || !result) throw new Error("Eruvin 12b checkpoint or frame is unavailable");
  const wikiPages = await loadWikisourcePages(tractate, { selectedAmudim: [amud], cacheDirectory: join(outputDirectory, "wikisource-cache") });
  if (wikiPages[amud].revision !== entry.tosafotEvidence?.revision) throw new Error("Wikisource revision differs from the original classification");
  const texts = await loadTexts(tractate, { works: ["Rashi"] });
  const index = amudIndex(amud) - 4;
  const url = `https://www.shas.org/daf-pdf/api/?masechta=eruvin&daf=12&amud=b`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Could not download Eruvin ${amud}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== entry.page.sha256) throw new Error("PDF differs from the measured file");
  const definition = { ...tractate, mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44 };
  const candidate = await processPage(definition, index, { rashi: texts.rashi[index + 2] || "", tosafot: wikiPages[amud].text }, bytes);
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const rectangle = (coordinates) => {
      const [firstX, firstY] = viewport.convertToViewportPoint(coordinates[0], coordinates[1]);
      const [secondX, secondY] = viewport.convertToViewportPoint(coordinates[2], coordinates[3]);
      return { x: Math.min(firstX, secondX), y: Math.min(firstY, secondY), width: Math.abs(secondX - firstX), height: Math.abs(secondY - firstY) };
    };
    const bounds = (row) => [row.left, row.baseline - row.pitch / 2, row.right, row.baseline + row.pitch / 2];
    const overlaps = [];
    for (const main of candidate.groups.main) for (const tosafot of candidate.groups.tosafot) {
      const first = bounds(main), second = bounds(tosafot);
      const intersection = [Math.max(first[0], second[0]), Math.max(first[1], second[1]), Math.min(first[2], second[2]), Math.min(first[3], second[3])];
      if (intersection[2] - intersection[0] > 0.1 && intersection[3] - intersection[1] > 0.1) overlaps.push(rectangle(intersection));
    }
    const savedClassification = result.method === "classified" && JSON.stringify(candidate.groups) === JSON.stringify(entry.page.groups);
    const regions = Object.fromEntries(["main", "rashi", "tosafot"].map((kind) => [kind, {
      fraction: result.fractions[kind],
      rows: (kind === "main" || savedClassification ? entry.page.groups[kind] : candidate.groups[kind]).map((row) => rectangle(bounds(row))),
      provisional: kind !== "main" && !savedClassification,
    }]));
    const frame = book.frame;
    const report = [{ sample: amud, title: "Eruvin 12b", width: viewport.width, height: viewport.height,
      image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
      body: rectangle([frame.left, frame.bottom, frame.right, frame.top]), regions, overlaps, showAll: true,
      detail: savedClassification ? "Classified: the final Rashi and Tosafot measurements are shown; no conflicting main/Tosafot boxes remain."
        : `Partial: ${result.lastClassificationError || "commentary remains unknown"}. Rashi and Tosafot highlights are candidate assignments, not final measurements. Orange outlines mark conflicting boxes.` }];
    const template = await readFile(join(directory, "review.html"), "utf8");
    const output = join(outputDirectory, "review.html");
    await writeFile(output, template.replace("__REPORT_DATA__", JSON.stringify(report).replaceAll("<", "\\u003c")));
    console.log(`Open ${output}; found ${overlaps.length} overlapping line boxes`);
  } finally {
    await task.destroy();
  }
}

if (process.argv.length > 2) {
  if (process.argv.slice(2).join(" ") !== "eruvin 12b") throw new Error("Supported review: eruvin 12b");
  await reviewEruvin12b();
} else {
const temporaryDirectory = await mkdtemp(join(tmpdir(), "gemara-review-"));
try {
  const pages = [];
  for (const sample of samples) {
    const side = sample.at(-1);
    const url = `https://www.shas.org/daf-pdf/api/?masechta=berachos&daf=${sample.slice(0, -1)}&amud=${side}`;
    console.log(`Preparing Berakhot ${sample}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not download Berakhot ${sample}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pdfFile = join(temporaryDirectory, `${sample}.pdf`);
    await writeFile(pdfFile, bytes);
    const measurement = JSON.parse(execFileSync(process.execPath, [join(directory, "pdf.mjs"), pdfFile, side], { encoding: "utf8" }));
    const loadingTask = getDocument({ data: bytes });
    try {
      const document = await loadingTask.promise;
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const rectangle = (coordinates) => {
        const [firstX, firstY] = viewport.convertToViewportPoint(coordinates[0], coordinates[1]);
        const [secondX, secondY] = viewport.convertToViewportPoint(coordinates[2], coordinates[3]);
        return { x: Math.min(firstX, secondX), y: Math.min(firstY, secondY), width: Math.abs(secondX - firstX), height: Math.abs(secondY - firstY) };
      };
      const regions = {};
      for (const name of ["main", "rashi", "tosafot"]) {
        const region = measurement[name];
        regions[name] = {
          fraction: region.fractionOfEstimatedBody,
          rows: region.lines.map((line) => rectangle([line.left, line.baseline - region.medianBaselinePitch * 0.25, line.right, line.baseline + region.medianBaselinePitch * 0.75])),
        };
      }
      const bounds = measurement.bodyBounds;
      pages.push({
        sample,
        width: viewport.width,
        height: viewport.height,
        image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
        body: rectangle([bounds.left, bounds.bottom, bounds.right, bounds.top]),
        regions,
      });
    } finally {
      await loadingTask.destroy();
    }
  }
  const template = await readFile(join(directory, "review.html"), "utf8");
  const data = JSON.stringify(pages).replaceAll("<", "\\u003c");
  if (!template.includes("__REPORT_DATA__")) throw new Error("Review template is missing its data placeholder");
  await mkdir(outputDirectory, { recursive: true });
  const output = join(outputDirectory, "review.html");
  await writeFile(output, template.replace("__REPORT_DATA__", data));
  console.log(`Open ${output}`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
}