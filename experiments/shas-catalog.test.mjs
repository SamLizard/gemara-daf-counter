import assert from "node:assert/strict";
import { test } from "node:test";
import { amudim, amudIndex, amudName, tractates } from "./shas-catalog.mjs";

test("catalog covers each API page once, including separate Meilah sections", () => {
  assert.equal(tractates.length, 40);
  assert.equal(new Set(tractates.map((tractate) => tractate.slug)).size, tractates.length);
  assert.equal(amudim(tractates.find((tractate) => tractate.slug === "horayos")).length, 25);
  assert.equal(amudim(tractates.find((tractate) => tractate.slug === "rosh-hashanah")).length, 67);
  const sections = tractates.filter((tractate) => tractate.sourceSlug === "meilah");
  const pages = sections.flatMap(amudim);
  assert.equal(pages.length, 72);
  assert.equal(new Set(pages).size, pages.length);
  assert.equal(pages[0], "2a");
  assert.equal(pages.at(-1), "37b");
  assert.ok(pages.every((page, index) => amudIndex(page) === index + 4));
  assert.equal(amudName(amudIndex("25b")), "25b");
});