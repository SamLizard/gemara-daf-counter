import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const files = process.argv.slice(2);
if (!files.length) throw new Error("Pass one or more local single-page PDFs");
const pages = [];
for (const file of files) {
  const bytes = await readFile(file);
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${file}: expected a single-page PDF`);
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const content = await page.getTextContent();
    const groups = {};
    for (const item of content.items) {
      if (!item.str?.trim() || item.width <= 0 || item.height <= 0) continue;
      const size = item.height.toFixed(2);
      const [firstX, firstY] = viewport.convertToViewportPoint(item.transform[4], item.transform[5] - item.height * 0.2);
      const [secondX, secondY] = viewport.convertToViewportPoint(item.transform[4] + item.width, item.transform[5] + item.height * 0.8);
      (groups[size] ??= []).push({ x: Math.min(firstX, secondX), y: Math.min(firstY, secondY), width: Math.abs(secondX - firstX), height: Math.abs(secondY - firstY) });
    }
    pages.push({ name: basename(file), fingerprint, width: viewport.width, height: viewport.height, image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`, groups });
    console.log(`${basename(file)}: ${Object.keys(groups).length} sizes, ${Object.values(groups).reduce((total, boxes) => total + boxes.length, 0)} text items`);
  } finally {
    await task.destroy();
  }
}
const template = await readFile(join(dirname(fileURLToPath(import.meta.url)), "inspect-pdf.html"), "utf8");
const outputDirectory = resolve("results");
await mkdir(outputDirectory, { recursive: true });
const output = join(outputDirectory, "inspect-pdf.html");
await writeFile(output, template.replace("__REPORT_DATA__", JSON.stringify(pages).replaceAll("<", "\\u003c")));
console.log(`Open ${output}`);