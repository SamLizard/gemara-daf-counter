import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShasExport } from "./shas-export.mjs";

test("exports page fractions and refuses incomplete tractate totals", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2b" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const result = buildShasExport(catalog, { example: { "2a": { page, unknownCategories: ["tosafot"] }, "2b": { error: "uncertain" } } });
  const book = result.tractates[0];
  assert.equal(book.status, "partial");
  assert.equal(book.totals, null);
  assert.equal(book.coverage.expected, 2);
  assert.equal(book.coverage.unresolved, 1);
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.ok(book.pages[0].fractions.main > 0);
  assert.equal(book.pages[1].fractions, null);
  assert.equal(book.frame.provisional, true);
});

test("exports complete tractate totals in sides and dafim", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const book = buildShasExport(catalog, { example: { "2a": { page } } }).tractates[0];
  assert.equal(book.status, "complete");
  assert.equal(book.totals.dafim.main, book.totals.sides.main / 2);
  assert.equal(book.pages[0].fractions.tosafot, 0);
});

test("keeps known category totals when another category remains unknown", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const book = buildShasExport(catalog, { example: { "2a": { page, unknownCategories: ["tosafot"] } } }).tractates[0];
  assert.equal(book.status, "partial");
  assert.ok(book.totals.sides.main > 0);
  assert.equal(book.totals.sides.tosafot, null);
  assert.equal(book.frame.provisional, true);
});

test("keeps inferred absence unknown rather than counting it as zero", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const book = buildShasExport(catalog, { example: { "2a": { page, inferredAbsent: ["tosafot"] } } }).tractates[0];
  assert.equal(book.status, "partial");
  assert.deepEqual(book.pages[0].inferredAbsent, ["tosafot"]);
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal(book.totals.dafim.tosafot, null);
  assert.equal(book.coverage.knownByCategory.tosafot, 0);
});

test("exports source-backed absence and its evidence", () => {
  const catalog = [{ slug: "sotah", title: "Sotah", order: "Nashim", first: "2a", last: "2a" }];
  const page = { name: "sotah-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const tosafotEvidence = { revision: 42, decision: "absent", basis: "wikisource-section-and-pdf-classification" };
  const book = buildShasExport(catalog, { sotah: { "2a": { page, confirmedAbsent: ["tosafot"], tosafotEvidence } } }).tractates[0];
  assert.equal(book.status, "complete");
  assert.equal(book.pages[0].fractions.tosafot, 0);
  assert.deepEqual(book.pages[0].confirmedAbsent, ["tosafot"]);
  assert.deepEqual(book.pages[0].tosafotEvidence, tosafotEvidence);
});

test("preserves source evidence and the latest error for an unmeasured page", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const evidence = { state: "error", revision: 42, runId: "fresh-run" };
  const book = buildShasExport(catalog, { example: { "2a": { error: "old error", lastClassificationError: "new error", tosafotEvidence: evidence } } }).tractates[0];
  assert.equal(book.pages[0].status, "unresolved");
  assert.equal(book.pages[0].reason, "new error");
  assert.deepEqual(book.pages[0].tosafotEvidence, evidence);
  assert.equal(book.pages[0].fractions, null);
});

test("uses unclassified text only to fit the frame", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] }, frameRows: [{ left: -10, right: 20, baseline: 5, pitch: 10 }] };
  const book = buildShasExport(catalog, { example: { "2a": { page, unknownCategories: ["rashi", "tosafot"], recovery: {} } } }).tractates[0];
  assert.equal(book.frame.referenceBasis, "main-and-unclassified-text");
  assert.ok(book.frame.right > 20);
  assert.equal(book.pages[0].fractions.rashi, null);
  assert.equal(book.pages[0].fractions.tosafot, null);
});