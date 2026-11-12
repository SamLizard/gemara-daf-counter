import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(directory, "../results");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "gemara-review-"));
const samples = ["2a", "2b", "3a"];

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