import assert from "node:assert/strict";
import { test } from "node:test";
import { groupLines, summarize } from "./measure-horayot-10a.mjs";

test("keeps commentary on the same baseline in separate columns", () => {
  const items = [
    { str: "a", height: 9.84, width: 40, transform: [0, 0, 0, 0, 150, 100] },
    { str: "b", height: 9.84, width: 50, transform: [0, 0, 0, 0, 210, 100] },
    { str: "c", height: 9.84, width: 80, transform: [0, 0, 0, 0, 420, 100] },
  ];
  const rows = groupLines(items, 9.84, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.right - row.left), [110, 80]);
});

test("rejects an uncalibrated page", () => {
  assert.throws(() => summarize([], []), /not the calibrated Horayot 10a layout/);
});

test("counts different line widths and computes area inside the body rectangle", () => {
  const main = Array.from({ length: 52 }, (_, index) => ({ side: "main", baseline: 1100 - index * 10, left: 200, right: index < 31 ? 350 : 560 }));
  const rashi = ["left", "right"].flatMap((side) => Array.from({ length: 42 }, (_, index) => ({ side, baseline: 1150 - index * 8, left: side === "left" ? 100 : 400, right: (side === "left" ? 100 : 400) + (index < 4 ? 180 : 100) })));
  const result = summarize(main, rashi);
  assert.equal(result.main.narrowLines, 31);
  assert.equal(result.main.wideLines, 21);
  assert.equal(result.rashi.narrowLines, 76);
  assert.equal(result.rashi.mediumLines, 8);
  assert.equal(result.main.area, (31 * 150 + 21 * 360) * 10);
  assert.equal(result.rashi.area, (76 * 100 + 8 * 180) * 8);
  assert.equal(result.main.fraction, result.main.area / result.bodyArea);
});