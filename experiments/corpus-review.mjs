import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const packageUrl = import.meta.resolve("pdfjs-dist/package.json");
const report = JSON.parse(await readFile(join("results", "corpus-measurements.json"), "utf8"));
const images = join("results", "corpus-images");
await mkdir(images, { recursive: true });
const pages = [];
for (const [index, measured] of report.pages.entries()) {
  const bytes = await readFile(join("results", "pdfs", `${measured.name}.pdf`));
  if (createHash("sha256").update(bytes).digest("hex") !== measured.sha256) throw new Error(`${measured.name}: PDF differs from the measured file`);
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", packageUrl)),
    wasmUrl: fileURLToPath(new URL("wasm/", packageUrl)),
  });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    await writeFile(join(images, `${measured.name}.png`), canvas.toBuffer("image/png"));
    const rectangle = (coordinates) => {
      const [firstX, firstY] = viewport.convertToViewportPoint(coordinates[0], coordinates[1]);
      const [secondX, secondY] = viewport.convertToViewportPoint(coordinates[2], coordinates[3]);
      return { x: Math.min(firstX, secondX), y: Math.min(firstY, secondY), width: Math.abs(secondX - firstX), height: Math.abs(secondY - firstY) };
    };
    const slug = report.definitions.find((definition) => measured.name.startsWith(`${definition.slug}-`))?.slug;
    const frame = report.frames[slug];
    if (!frame) throw new Error(`${measured.name}: missing tractate frame`);
    const regions = Object.fromEntries(Object.entries(measured.groups).map(([kind, rows]) => [kind, {
      fraction: measured.areas[kind].fraction,
      rows: rows.map((row) => rectangle([row.left, row.baseline - row.pitch / 2, row.right, row.baseline + row.pitch / 2])),
      tallFragments: rows.flatMap((row) => (row.tallFragments || []).map((fragment) => rectangle([fragment.left, fragment.bottom, fragment.right, fragment.top]))),
    }]));
    pages.push({ name: measured.name, width: viewport.width, height: viewport.height, body: rectangle([frame.left, frame.bottom, frame.right, frame.top]), regions });
  } finally {
    await task.destroy();
  }
  if ((index + 1) % 10 === 0 || index + 1 === report.pages.length) console.log(`Rendered ${index + 1}/${report.pages.length} pages`);
}
const template = await readFile(join(directory, "corpus-review.html"), "utf8");
if (!template.includes("__REPORT_DATA__")) throw new Error("Review template is missing its data placeholder");
const data = JSON.stringify({ pages, totals: report.totals }).replaceAll("<", "\\u003c");
await writeFile(join("results", "corpus-review.html"), template.replace("__REPORT_DATA__", data));
console.log("Open results/corpus-review.html");