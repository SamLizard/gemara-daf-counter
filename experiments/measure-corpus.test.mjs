import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculateAreas, calculateFrame, decodePdfText, groupRows, includeStreamFragments, matchScore, normalizeHebrew, splitRuns } from "./measure-corpus.mjs";

const item = (text, x, y, width = 20) => ({ str: text, transform: [0, 0, 0, 0, x, y], width });

test("decodes Hebrew text and preserves already decoded Hebrew", () => {
  assert.equal(decodePdfText("àëä ïçëùàãë ïä éðú éúëåã ìëá"), "בכל דוכתי תני הן כדאשכחן הכא");
  assert.equal(decodePdfText("רבא אמר"), "רבא אמר");
});

test("matches a fragmented right-to-left line against commentary", () => {
  const items = [item("וירא", 80, 100), item("לולי", 50, 100), item("כי ידין", 10, 100)];
  assert.ok(matchScore(items, normalizeHebrew("זכור ירכבהו וירא לולי כי ידין ככתוב")) >= 8);
});

test("splits vertically restarted commentary and measures each line", () => {
  const items = [item("first", 10, 100), item("second", 10, 60), item("third", 70, 100)];
  const runs = splitRuns(items);
  assert.equal(runs.length, 2);
  assert.equal(groupRows(runs[0]).length, 2);
  assert.equal(groupRows(runs[1]).length, 1);
});

test("includes bold fragments in the commentary stream but not a following margin", () => {
  const bold = { ...item("bold", 155, 90, 15), height: 11.94 };
  const body = { ...item("body", 100, 90, 50), height: 11.16 };
  const margin = { ...item("margin", 300, 90, 10), height: 11.94 };
  const items = [bold, body, margin];
  assert.deepEqual(includeStreamFragments(items, [body], [11.94], 0), [body, bold]);
});

test("uses the same reference area for all pages in a tractate", () => {
  const pages = [
    { groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } },
    { groups: { main: [{ left: 0, right: 5, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } },
  ];
  const frame = { left: 0, right: 10, bottom: 0, top: 10 };
  assert.equal(calculateAreas(pages, frame), 100);
  assert.equal(pages[0].areas.main.fraction, 1);
  assert.equal(pages[1].areas.main.fraction, 0.5);
  assert.equal(calculateFrame(pages).top, 12);
  assert.deepEqual(calculateFrame(pages, { horizontal: 2, vertical: 4 }), { left: -2, right: 12, bottom: -4, top: 16 });
  pages[0].groups.main[0].top = 100;
  assert.equal(calculateFrame(pages, { vertical: 4 }).top, 16);
});

test("calibrated 10a and embedded 31a preserve the known classifications", async (context) => {
  let text;
  try {
    text = await readFile("results/corpus-measurements.json", "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    context.skip("Generate the local corpus report to run this integration check");
    return;
  }
  const report = JSON.parse(text);
  const horayot = report.pages.find((page) => page.name === "horayos-10a");
  const rosh = report.pages.find((page) => page.name === "rosh-hashanah-31a");
  const horayotFirst = report.pages.find((page) => page.name === "horayos-2a");
  const roshFirst = report.pages.find((page) => page.name === "rosh-hashanah-2a");
  assert.equal(horayot.groups.main.filter((row) => row.right - row.left < 250).length, 31);
  assert.equal(horayot.groups.main.filter((row) => row.right - row.left >= 250).length, 21);
  assert.equal(horayot.groups.rashi.filter((row) => row.right - row.left < 140).length, 76);
  assert.equal(horayot.groups.rashi.filter((row) => row.right - row.left >= 140).length, 8);
  assert.deepEqual(rosh.matches.map((match) => match.kind), ["rashi", "rashi", "tosafot"]);
  assert.equal(rosh.groups.tosafot.length, 7);
  assert.ok(horayotFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 479.2) < 1 && row.right > 519));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1129.6) < 1 && row.right > 330));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1129.6) < 1 && row.tallFragments.length > 0));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 826.2) < 1 && row.right > 190));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1025) < 2 && row.right > 239.3));
  assert.ok(rosh.groups.tosafot.some((row) => Math.abs(row.baseline - 742) < 1 && row.right > 295));
  assert.equal(report.pages.length, 92);
  for (const page of report.pages) {
    assert.deepEqual(page.view, [0, 198.425, 643.575, 1191]);
    const slug = page.name.startsWith("horayos-") ? "horayos" : "rosh-hashanah";
    const frame = report.frames[slug];
    for (const row of Object.values(page.groups).flat()) {
      assert.ok(row.left > frame.left && row.right < frame.right);
      assert.ok(row.baseline - row.pitch / 2 > frame.bottom && row.baseline + row.pitch / 2 < frame.top);
      assert.ok(row.bottom > frame.bottom);
    }
    for (const firstKind of ["main", "rashi", "tosafot"]) {
      for (const secondKind of ["main", "rashi", "tosafot"]) {
        if (firstKind >= secondKind) continue;
        for (const first of page.groups[firstKind]) for (const second of page.groups[secondKind]) {
          const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapY = Math.min(first.baseline + first.pitch / 2, second.baseline + second.pitch / 2) - Math.max(first.baseline - first.pitch / 2, second.baseline - second.pitch / 2);
          assert.ok(overlapX <= 0 || overlapY <= 0, `${page.name}: ${firstKind} and ${secondKind} overlap`);
        }
      }
    }
  }
  assert.ok(report.frames["rosh-hashanah"].top < 1140);
  assert.ok(report.frames["rosh-hashanah"].top > 1138);
});