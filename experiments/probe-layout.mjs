import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pages = process.argv.slice(2);
if (!pages.length) throw new Error("Pass page names such as shabbos:2a or nedarim:10b");

for (const name of pages) {
  const match = /^([a-z-]+):(\d+)([ab])$/.exec(name);
  if (!match) throw new Error(`Invalid page ${name}`);
  const [, tractate, daf, amud] = match;
  const url = new URL("https://www.shas.org/daf-pdf/api/");
  url.search = new URLSearchParams({ masechta: tractate, daf, amud });
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const task = getDocument({ data });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${name}: expected one page`);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const sizes = {};
    for (const item of items) {
      if (item.transform[4] < 125 || item.transform[4] > 550 || item.transform[5] < 380 || item.transform[5] > 1145) continue;
      const size = item.height.toFixed(2);
      const entry = sizes[size] ??= { fragments: 0, width: 0, minX: Infinity, maxX: -Infinity };
      entry.fragments++;
      entry.width += item.width;
      entry.minX = Math.min(entry.minX, item.transform[4]);
      entry.maxX = Math.max(entry.maxX, item.transform[4] + item.width);
    }
    console.log(JSON.stringify({ page: name, view: page.view, sizes: Object.entries(sizes).sort((first, second) => second[1].width - first[1].width).slice(0, 10) }));
  } finally {
    await task.destroy();
  }
}