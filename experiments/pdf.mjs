import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
const side = process.argv[3];
if (!file || !["a", "b"].includes(side)) throw new Error("Pass a local Shas.org Berakhot sample PDF and its side (a or b)");
const loadingTask = getDocument({ data: new Uint8Array(await readFile(file)) });
const document = await loadingTask.promise;
try {
  if (document.numPages !== 1) throw new Error("Expected a single-page PDF");
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => item.str?.trim() && item.width > 0);
  const mainItems = items.filter((item) => Math.abs(item.height - 13.68) < 0.02);
  const bodyItems = items.filter((item) => [11.16, 11.4, 13.68].some((height) => Math.abs(item.height - height) < 0.02));
  if (!mainItems.length || !bodyItems.length) throw new Error("Expected sample-specific type sizes were not found");

  function measureRows(textItems) {
    const rows = [];
    for (const item of [...textItems].sort((first, second) => second.transform[5] - first.transform[5])) {
      const baseline = item.transform[5];
      let row = rows.find((candidate) => Math.abs(candidate.baseline - baseline) < 0.8);
      if (!row) {
        row = { baseline, left: Infinity, right: -Infinity };
        rows.push(row);
      }
      row.left = Math.min(row.left, item.transform[4]);
      row.right = Math.max(row.right, item.transform[4] + item.width);
    }
    const gaps = rows.slice(1).map((row, index) => rows[index].baseline - row.baseline).filter((gap) => gap > 1).sort((first, second) => first - second);
    const pitch = gaps[Math.floor(gaps.length / 2)];
    if (!pitch) throw new Error("Cannot infer a text row pitch");
    return { rows, pitch, area: rows.reduce((total, row) => total + (row.right - row.left) * pitch, 0) };
  }

  const commentaryRuns = [];
  for (const item of bodyItems.filter((entry) => Math.abs(entry.height - 13.68) >= 0.02)) {
    let run = commentaryRuns.at(-1);
    if (!run || item.transform[5] - run.at(-1).transform[5] > 30) {
      run = [];
      commentaryRuns.push(run);
    }
    run.push(item);
  }
  if (commentaryRuns.length !== 2) throw new Error(`Expected two ordered commentary streams, found ${commentaryRuns.length}`);
  const firstOnRight = commentaryRuns[0][0].transform[4] > commentaryRuns[1][0].transform[4];
  if (firstOnRight !== (side === "a")) throw new Error("Commentary stream order does not match the inner/outer side convention");

  const main = measureRows(mainItems);
  const rashi = measureRows(commentaryRuns[0]);
  const tosafot = measureRows(commentaryRuns[1]);
  const bounds = {
    left: Math.min(...bodyItems.map((item) => item.transform[4])),
    right: Math.max(...bodyItems.map((item) => item.transform[4] + item.width)),
    bottom: Math.min(...bodyItems.map((item) => item.transform[5])) - main.pitch / 2,
    top: Math.max(...bodyItems.map((item) => item.transform[5])) + main.pitch / 2,
  };
  const bodyArea = (bounds.right - bounds.left) * (bounds.top - bounds.bottom);
  const summarize = (measurement) => ({
    rowCount: measurement.rows.length,
    medianBaselinePitch: measurement.pitch,
    lineBoxArea: measurement.area,
    fractionOfEstimatedBody: measurement.area / bodyArea,
    lines: measurement.rows,
  });
  console.log(JSON.stringify({
    file,
    side,
    warning: "Sample-specific type-size and content-order heuristics, not validated labels; body excludes marginal notes and some fonts. Do not generalize to other editions.",
    pdfView: page.view,
    bodyBounds: bounds,
    main: summarize(main),
    rashi: summarize(rashi),
    tosafot: summarize(tosafot),
  }, null, 2));
} finally {
  await loadingTask.destroy();
}