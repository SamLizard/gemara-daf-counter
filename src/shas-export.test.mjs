import assert from "node:assert/strict";
import { test } from "node:test";
import { frameForPage } from "./measure-corpus.mjs";
import { buildShasExport } from "./shas-export.mjs";

test("Kinnim exports and measures each side against its own printed body", () => {
  const catalog = [{ slug: "kinim", title: "Kinnim", order: "Kodashim", first: "22a", last: "22b" }];
  const row = { left: 20, right: 80, baseline: 120, pitch: 10 };
  const shared = { left: 110, right: 140, baseline: 40, pitch: 5 };
  const data = { kinim: Object.fromEntries([["22a", shared], ["22b", row]].map(([amud, main]) => [amud,
    { page: { name: `kinim-${amud}`, groups: { main: [main], rashi: [], tosafot: [] } } }])) };
  const before = structuredClone(data);
  const book = buildShasExport(catalog, data).tractates[0];
  assert.equal(book.frame.coordinateSpace, "kinim-per-page-v1");
  for (const result of book.pages) {
    const page = data.kinim[result.amud].page;
    const frame = frameForPage(book.frame, page);
    const main = page.groups.main[0];
    const area = (frame.right - frame.left) * (frame.top - frame.bottom);
    assert.ok(main.left >= frame.left && main.right <= frame.right);
    assert.ok(main.baseline - main.pitch / 2 >= frame.bottom && main.baseline + main.pitch * 0.7 <= frame.top);
    assert.ok(Math.abs(result.fractions.main - (main.right - main.left) * main.pitch / area) < 1e-12);
  }
  assert.notDeepEqual(book.frame.pageFrames["22a"], book.frame.pageFrames["22b"]);
  assert.throws(() => frameForPage(book.frame, { name: "kinim-23a" }), /matching measured page/);
  assert.deepEqual(data, before);
});

test("numeric Shekalim coverage does not certify recovered or unclassified frames", () => {
  const row = { left: 0, right: 10, baseline: 5, pitch: 10 };
  for (const recovery of [false, true]) for (const unclassified of [false, true]) {
    const catalog = [{ slug: "shekalim", title: "Shekalim", order: "Moed", first: "2a", last: "2a" }];
    const entry = { page: { name: "shekalim-2a", frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: 85.08 }, groups: { main: [row], rashi: [], tosafot: [] },
      ...(unclassified ? { frameRows: [row] } : {}) }, ...(recovery ? { recovery: {} } : {}), confirmedAbsent: ["rashi", "tosafot"] };
    const book = buildShasExport(catalog, { shekalim: { "2a": entry } }).tractates[0];
    assert.equal(book.status, "complete");
    assert.equal(book.frame.provisional, recovery || unclassified);
    assert.equal(book.frame.referenceBasis, unclassified ? "main-and-unclassified-text" : recovery ? "main-text-only" : "classified-text");
  }
});

test("Shekalim export uses aligned frames, preserves unknowns and confirmed zeroes, and leaves unrelated books unchanged", () => {
  const catalog = [{ slug: "shekalim", title: "Shekalim", order: "Moed", first: "2a", last: "2b" },
    { slug: "tamid", title: "Tamid", order: "Kodashim", first: "2a", last: "2a" }];
  const row = { left: 110, right: 530, baseline: 900, pitch: 10 };
  const entries = Object.fromEntries(["a", "b"].map((side) => {
    const offset = side === "a" ? 85.08 : 0;
    return [`2${side}`, { page: { name: `shekalim-2${side}`, frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: offset },
      groups: { main: [{ ...row, left: row.left + offset, right: row.right + offset }], rashi: [], tosafot: [] },
      frameRows: [{ ...row, left: 106.19 + offset, right: 531.5 + offset, pitch: 9 }] },
    unknownCategories: ["rashi", "tosafot"], ...(side === "b" ? { confirmedAbsent: ["tosafot"] } : {}) }];
  }));
  const data = { shekalim: entries, tamid: { "2a": { page: { name: "tamid-2a", groups: { main: [row], rashi: [], tosafot: [] } } } } };
  const before = structuredClone(data);
  const [book, unrelated] = buildShasExport(catalog, data).tractates;
  assert.ok(Math.abs(book.frame.left - 104.19) < 1e-10);
  assert.ok(Math.abs(book.frame.right - 533.5) < 1e-10);
  assert.equal(book.frame.coordinateSpace, "shekalim-aligned-v1");
  assert.deepEqual(book.frame.sideOffsets, { a: 85.08, b: 0 });
  for (const page of book.pages) {
    const offset = book.frame.sideOffsets[page.amud.at(-1)];
    const placed = frameForPage(book.frame, entries[page.amud].page);
    assert.equal(placed.left, book.frame.left + offset);
    assert.equal(placed.right, book.frame.right + offset);
    assert.ok(Math.abs(page.fractions.main * book.frame.area - 4200) < 1e-8);
    assert.equal(page.fractions.rashi, null);
  }
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal(book.pages[1].fractions.tosafot, 0);
  assert.equal("sideOffsets" in unrelated.frame, false);
  assert.deepEqual(unrelated, buildShasExport([catalog[1]], { tamid: data.tamid }).tractates[0]);
  assert.deepEqual(data, before);
  delete entries["2a"].page.frameGeometry;
  assert.throws(() => buildShasExport(catalog, data), /geometry rebuild on every measured side/);
});

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

test("exports measured Ran separately and labels Nedarim audit fallbacks main-only", () => {
  const catalog = [{ slug: "nedarim", title: "Nedarim", order: "Nashim", first: "2a", last: "2b" }];
  const main = { left: 0, right: 10, baseline: 5, pitch: 10 };
  const ran = { left: 10, right: 20, baseline: 5, pitch: 10 };
  const entries = {
    "2a": { page: { name: "nedarim-2a", groups: { main: [main], rashi: [], tosafot: [], other: [ran] }, matches: [{ kind: "other", source: "Ran" }] }, unknownCategories: ["tosafot"], nedarimAudit: { outcome: "recomputed" } },
    "2b": { page: { name: "nedarim-2b", groups: { main: [main], rashi: [], tosafot: [], other: [] } }, unknownCategories: ["rashi", "tosafot"], nedarimAudit: { outcome: "fallback" } },
  };
  const book = buildShasExport(catalog, { nedarim: entries }).tractates[0];
  assert.equal(book.pages[0].otherCommentary.sources[0], "Ran");
  assert.equal(book.pages[0].otherCommentary.fraction, 100 / book.frame.area);
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal(book.pages[1].method, "main-only");
});

test("excluded Tosafot is zero without asserting absence or fitting excluded rows, including unresolved sides", () => {
  const catalog = [{ slug: "nedarim", title: "Nedarim", order: "Nashim", first: "2a", last: "2b" }];
  const main = { left: 0, right: 10, baseline: 5, pitch: 10 };
  const entries = {
    "2a": { page: { name: "nedarim-2a", groups: { main: [main], rashi: [], tosafot: [{ ...main, left: 1000, right: 2000 }] } }, unknownCategories: ["tosafot"], excludedCategories: ["tosafot"] },
    "2b": { error: "PDF unavailable", unknownCategories: ["rashi", "other-unknown", "tosafot"], excludedCategories: ["tosafot"] },
  };
  const before = structuredClone(entries);
  const book = buildShasExport(catalog, { nedarim: entries }).tractates[0];
  assert.deepEqual(book.excludedCategories, ["tosafot"]);
  assert.ok(book.frame.right < 1000);
  assert.equal(book.pages[0].status, "measured");
  assert.deepEqual(book.pages.map((page) => page.fractions.tosafot), [0, 0]);
  assert.deepEqual(book.pages[1].unknownCategories, ["rashi", "other-unknown", "main"]);
  for (const page of book.pages) {
    assert.deepEqual(page.excludedCategories, ["tosafot"]);
    assert.equal(page.confirmedAbsent, undefined);
  }
  assert.deepEqual(book.totals.sides, { main: null, rashi: null, tosafot: 0 });
  assert.equal(book.totals.dafim.tosafot, 0);
  assert.deepEqual(entries, before);
});

test("Kinnim, Tamid and Middot exclude both commentary categories without asserting absence", () => {
  const row = { left: 0, right: 10, baseline: 5, pitch: 10 };
  for (const slug of ["kinim", "tamid", "middos"]) {
    const catalog = [{ slug, title: slug, order: "Kodashim", first: "2a", last: "2a" }];
    const entry = { page: { name: `${slug}-2a`, groups: { main: [row], rashi: [], tosafot: [] }, frameRows: [row] },
      unknownCategories: ["rashi", "tosafot"], inferredAbsent: ["rashi"] };
    const before = structuredClone(entry);
    const book = buildShasExport(catalog, { [slug]: { "2a": entry } }).tractates[0];
    assert.equal(book.status, "complete");
    assert.deepEqual(book.pages[0].excludedCategories, ["rashi", "tosafot"]);
    assert.deepEqual(book.pages[0].unknownCategories, []);
    assert.deepEqual([book.pages[0].fractions.rashi, book.pages[0].fractions.tosafot], [0, 0]);
    assert.equal(book.pages[0].confirmedAbsent, undefined);
    assert.equal(book.frame.provisional, true);
    assert.deepEqual(entry, before);
  }
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

test("hides suspect Tosafot after a failed commentary retry while retaining confirmed zeroes", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2b" }];
  const rows = { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [{ left: 20, right: 30, baseline: 5, pitch: 10 }] };
  const retry = { state: "error", error: "ambiguous commentary stream" };
  const data = { example: {
    "2a": { page: { name: "example-2a", groups: rows }, inferredAbsent: ["rashi"], commentaryRetry: retry },
    "2b": { page: { name: "example-2b", groups: { ...rows, tosafot: [] } }, inferredAbsent: ["rashi"], confirmedAbsent: ["tosafot"], commentaryRetry: retry },
  } };
  const book = buildShasExport(catalog, data).tractates[0];
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal(book.pages[0].commentaryRetryError, "ambiguous commentary stream");
  assert.equal(book.pages[1].fractions.tosafot, 0);
  assert.equal(data.example["2a"].page.groups.tosafot.length, 1);
});

test("hides previously classified commentary after a failed legacy audit but preserves a confirmed zero", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2b" }];
  const rows = { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [{ left: 10, right: 20, baseline: 5, pitch: 10 }], tosafot: [{ left: 20, right: 30, baseline: 5, pitch: 10 }] };
  const retry = { state: "error", error: "uncertain", legacyAudit: true };
  const data = { example: {
    "2a": { page: { name: "example-2a", groups: rows }, commentaryRetry: retry },
    "2b": { page: { name: "example-2b", groups: { ...rows, tosafot: [] } }, confirmedAbsent: ["tosafot"], commentaryRetry: retry },
  } };
  const book = buildShasExport(catalog, data).tractates[0];
  assert.equal(book.pages[0].fractions.rashi, null);
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal(book.pages[1].fractions.rashi, null);
  assert.equal(book.pages[1].fractions.tosafot, 0);
  assert.equal(data.example["2a"].page.groups.rashi.length, 1);
});

test("failed legacy audits preserve every confirmed category zero with or without a measured page", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const kinds = ["main", "rashi", "tosafot"];
  const page = { name: "example-2a", groups: { main: [], rashi: [], tosafot: [], other: [{ left: 0, right: 10, baseline: 5, pitch: 10 }] } };
  for (const confirmedAbsent of [["main"], ["rashi"], ["tosafot"], kinds]) {
    for (const measured of [false, true]) {
      const entry = { ...(measured ? { page } : { error: "PDF unavailable" }), confirmedAbsent,
        unknownCategories: kinds, inferredAbsent: kinds, commentaryRetry: { state: "error", error: "uncertain", legacyAudit: true } };
      const snapshot = structuredClone(entry);
      const book = buildShasExport(catalog, { example: { "2a": entry } }).tractates[0];
      assert.deepEqual(book.pages[0].fractions, Object.fromEntries(kinds.map((kind) => [kind, confirmedAbsent.includes(kind) ? 0 : null])));
      assert.deepEqual(book.pages[0].confirmedAbsent, confirmedAbsent);
      for (const kind of confirmedAbsent) {
        assert.equal(book.coverage.knownByCategory[kind], 1);
        assert.ok(!book.pages[0].unknownCategories?.includes(kind));
      }
      assert.deepEqual(entry, snapshot);
    }
  }
});

test("retained unknown checkpoints export null without dropping saved geometry", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const rows = (count, left) => Array.from({ length: count }, (_, index) => ({ left, right: left + 100, baseline: 1500 - index * 10, pitch: 10 }));
  const entry = { page: { name: "example-2a", groups: { main: rows(1, 0), rashi: rows(136, 100), tosafot: rows(4, 300) } },
    unknownCategories: ["rashi", "tosafot"], commentaryRetry: { state: "error", error: "Previously measured Rashi could not be reproduced" } };
  const snapshot = structuredClone(entry);
  const exported = buildShasExport(catalog, { example: { "2a": entry } }).tractates[0].pages[0];
  assert.equal(exported.fractions.rashi, null);
  assert.equal(exported.fractions.tosafot, null);
  assert.equal(exported.status, "partial");
  assert.deepEqual(entry, snapshot);
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

test("exports Rashi source-only evidence with or without a measured page", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const evidence = { revision: 42, decision: "absent", basis: "wikisource-empty-regular-rashi-section" };
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  for (const entry of [{ page, unknownCategories: ["tosafot"] }, { error: "PDF unavailable" }]) {
    const result = buildShasExport(catalog, { example: { "2a": { ...entry, confirmedAbsent: ["rashi"], rashiEvidence: evidence } } }).tractates[0].pages[0];
    assert.equal(result.fractions.rashi, 0);
    assert.deepEqual(result.rashiEvidence, evidence);
  }
});

test("exports the restored Horayot Sefaria source and a layout-backed zero", () => {
  const catalog = [{ slug: "horayos", title: "Horayot", order: "Nezikin", first: "9a", last: "9a" }];
  const page = { name: "horayos-9a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } };
  const tosafotEvidence = { sourceType: "sefaria", decision: "absent", basis: "historical-horayot-pdf-layout" };
  const book = buildShasExport(catalog, { horayos: { "9a": { page, confirmedAbsent: ["tosafot"], tosafotEvidence } } }).tractates[0];
  assert.equal(book.status, "complete");
  assert.equal(book.pages[0].fractions.tosafot, 0);
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

test("exports a source-only Tosafot zero without claiming the page was measured", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const entry = { error: "PDF failed", confirmedAbsent: ["tosafot"], tosafotEvidence: { state: "error", decision: "absent", basis: "wikisource-no-populated-tosafot-sections" } };
  const book = buildShasExport(catalog, { example: { "2a": entry } }).tractates[0];
  assert.equal(book.pages[0].status, "unresolved");
  assert.deepEqual(book.pages[0].fractions, { main: null, rashi: null, tosafot: 0 });
  assert.equal(book.coverage.measured, 0);
  assert.equal(book.coverage.knownByCategory.tosafot, 1);
  assert.equal(book.totals, null);
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

test("fits other commentary into the frame without counting it as Rashi or Tosafot", () => {
  const catalog = [{ slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const page = { name: "example-2a", groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [], other: [{ left: -20, right: -10, baseline: 5, pitch: 10 }] }, matches: [{ kind: "other", source: "Rashbam" }] };
  const book = buildShasExport(catalog, { example: { "2a": { page, unknownCategories: ["rashi", "tosafot"] } } }).tractates[0];
  assert.ok(book.frame.left < -20);
  assert.ok(book.pages[0].fractions.main > 0);
  assert.equal(book.pages[0].fractions.rashi, null);
  assert.equal(book.pages[0].fractions.tosafot, null);
  assert.equal("other" in book.pages[0].fractions, false);
  assert.deepEqual(book.pages[0].otherCommentary, { sources: ["Rashbam"], rows: 1 });
});