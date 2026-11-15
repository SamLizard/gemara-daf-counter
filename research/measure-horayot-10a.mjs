import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export function groupLines(items, size, splitColumns = false) {
  const rows = [];
  const matching = items.filter((item) => item.str?.trim() && item.width > 0 && Math.abs(item.height - size) < 0.02);
  for (const item of matching.sort((first, second) => second.transform[5] - first.transform[5])) {
    const side = splitColumns ? (item.transform[4] < 330 ? "left" : "right") : "main";
    let row = rows.find((candidate) => candidate.side === side && Math.abs(candidate.baseline - item.transform[5]) < 0.8);
    if (!row) {
      row = { side, baseline: item.transform[5], left: Infinity, right: -Infinity };
      rows.push(row);
    }
    row.left = Math.min(row.left, item.transform[4]);
    row.right = Math.max(row.right, item.transform[4] + item.width);
  }
  return rows;
}

export function summarize(main, rashi) {
  const mainNarrow = main.filter((row) => row.right - row.left < 250);
  const rashiNarrow = rashi.filter((row) => row.right - row.left < 140);
  const leftRashi = rashi.filter((row) => row.side === "left");
  const rightRashi = rashi.filter((row) => row.side === "right");
  if (main.length !== 52 || mainNarrow.length !== 31 || leftRashi.length !== 42 || rightRashi.length !== 42 || rashiNarrow.length !== 76) {
    throw new Error("This is not the calibrated Horayot 10a layout; do not apply these thresholds to another page.");
  }
  function pitch(rows) {
    const baselines = rows.map((row) => row.baseline).sort((first, second) => second - first);
    const spacing = (baselines[0] - baselines.at(-1)) / (baselines.length - 1);
    if (baselines.slice(1).some((baseline, index) => Math.abs(baselines[index] - baseline - spacing) > spacing * 0.15)) {
      throw new Error("The line spacing is not consistent with the calibrated page.");
    }
    return spacing;
  }
  const mainPitch = pitch(main);
  const rashiPitch = (pitch(leftRashi) + pitch(rightRashi)) / 2;
  const body = [...main, ...rashi];
  const bounds = {
    left: Math.min(...body.map((row) => row.left)),
    right: Math.max(...body.map((row) => row.right)),
    bottom: Math.min(...body.map((row) => row.baseline)) - mainPitch / 2,
    top: Math.max(...body.map((row) => row.baseline)) + mainPitch / 2,
  };
  const bodyArea = (bounds.right - bounds.left) * (bounds.top - bounds.bottom);
  const area = (lines, pitch) => lines.reduce((sum, row) => sum + (row.right - row.left) * pitch, 0);
  return {
    bounds,
    bodyArea,
    main: { narrowLines: mainNarrow.length, wideLines: main.length - mainNarrow.length, pitch: mainPitch, area: area(main, mainPitch), fraction: area(main, mainPitch) / bodyArea },
    rashi: { narrowLines: rashiNarrow.length, mediumLines: rashi.length - rashiNarrow.length, pitch: rashiPitch, area: area(rashi, rashiPitch), fraction: area(rashi, rashiPitch) / bodyArea },
    warning: "Calibrated single-page estimate; missing other fonts and decorations. Its per-page body rectangle cannot establish whole-tractate equivalents.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) throw new Error("Pass the local single-page Horayot 10a PDF");
  const task = getDocument({ data: new Uint8Array(await readFile(file)) });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error("Expected a single-page PDF");
    const page = await document.getPage(1);
    const { items } = await page.getTextContent();
    console.log(JSON.stringify(summarize(groupLines(items, 12.24), groupLines(items, 9.84, true)), null, 2));
  } finally {
    await task.destroy();
  }
}