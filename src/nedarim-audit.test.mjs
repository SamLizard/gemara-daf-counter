import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classifierVersion, nedarimAmudReferences } from "./measure-corpus.mjs";
import { auditNedarim, nedarimAmudIndex, nedarimWikisourceTitle, stageNedarimAudit } from "./nedarim-audit.mjs";
import { amudim } from "./shas-catalog.mjs";
import { buildShasExport } from "./shas-export.mjs";

const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = [{ slug: "nedarim", title: "Nedarim", order: "Nashim", first: "2a", last: "3b", sourceSlug: "nedarim" },
  { slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a", sourceSlug: "example" }];
const expected = amudim(catalog[0]);
const pdf = Object.fromEntries(expected.map((amud) => [amud, Buffer.from(`%PDF-nedarim-${amud}`)]));
const sha = Object.fromEntries(expected.map((amud) => [amud, fingerprint(pdf[amud])]));
const revisions = { "2a": 101, "2b": 102, "3a": 103, "3b": 104 };
const row = (kind, baseline, left, right, pitch) => ({ baseline, left, right, pitch, kind, top: baseline + pitch / 2, bottom: baseline - pitch / 2, tallFragments: [] });
const mainRow = row("main", 900, 212, 371, 11.88);
const rashiRow = row("rashi", 900, 120, 200, 10.44);
const ranRow = row("other", 900, 390, 500, 10.44);
const view = [0, 198.425, 643.575, 1191];

function wikiPages() {
  const content = `<קטע התחלה=ג/>${"אבגד הוזח טיכל ".repeat(4)}<קטע סוף=ג/>\n== מיוחס לרש"י ==\n${"מנסע פצקר ".repeat(3)}\n== ר"ן ==\n${"שתאב גדהו ".repeat(3)}\n== תוספות ==\nתוספות\n`;
  return Object.fromEntries(expected.map((amud) => [amud, { title: nedarimWikisourceTitle(amud), revisions: [{ revid: revisions[amud], slots: { main: { content } } }] }]));
}

function fixture() {
  const pages = {
    "2a": { classifierVersion, page: { name: "nedarim-2a", sha256: sha["2a"], view,
      groups: { main: [mainRow], rashi: [rashiRow, row("rashi", 1148.46, 128, 144, 10.44)], tosafot: [row("tosafot", 800, 400, 500, 10.44)] },
      matches: [{ kind: "rashi", scores: { rashi: 50, tosafot: 3 } }, { kind: "tosafot", scores: { rashi: 1, tosafot: 40 } }] },
    unknownCategories: [], inferredAbsent: [], confirmedAbsent: [],
    tosafotEvidence: { decision: "present", revision: 101, pdfSha256: sha["2a"], state: "processed" } },
    "2b": { classifierVersion, page: { name: "nedarim-2b", sha256: sha["2b"], view, groups: { main: [mainRow], rashi: [], tosafot: [] }, matches: [] },
      recovery: { reason: "saved main-only reason", mainMatch: { similarity: 0.9 } }, unknownCategories: ["tosafot"], inferredAbsent: [], confirmedAbsent: ["rashi"],
      rashiEvidence: { decision: "absent", revision: 102, pdfSha256: sha["2b"] }, tosafotEvidence: { decision: "unknown", state: "error" },
      lastClassificationError: "saved classification error", commentaryRetry: { state: "error", error: "saved retry", legacyAudit: true } },
    "3a": { classifierVersion, page: { name: "nedarim-3a", sha256: sha["3a"], view, groups: { main: [mainRow], rashi: [], tosafot: [] }, matches: [] },
      unknownCategories: [], inferredAbsent: [], confirmedAbsent: ["tosafot", "rashi"],
      tosafotEvidence: { decision: "absent", sourceType: "wikisource", revision: 999 }, rashiEvidence: { decision: "absent", revision: 999 } },
    "3b": { classifierVersion, error: "saved unresolved", mainRecoveryError: "saved main error", unknownCategories: [], inferredAbsent: [], confirmedAbsent: ["tosafot"],
      tosafotEvidence: { decision: "absent", state: "error", revision: 104 } },
  };
  const checkpoint = { slug: "nedarim", pages };
  const data = { nedarim: pages, example: { "2a": { page: { name: "example-2a", groups: { main: [mainRow], rashi: [], tosafot: [] } } } } };
  const calls = { load: [], process: [] };
  return { catalog, checkpoint, data, existingExport: buildShasExport(catalog, data), wikiPages: wikiPages(), calls,
    loadPdf: async (definition, amud, expectedHash) => {
      calls.load.push(amud);
      assert.equal(expectedHash, sha[amud]);
      if (amud === "2b") throw new Error("PDF is not available in the local cache with the expected fingerprint");
      return pdf[amud];
    },
    processPage: async (definition, index, references, bytes) => {
      calls.process.push(expected[index]);
      assert.equal(definition.slug, "nedarim");
      assert.ok(!Object.hasOwn(references, "tosafot") && references.adjacent.every((source) => !Object.hasOwn(source, "tosafot")));
      return { name: `nedarim-${expected[index]}`, sha256: fingerprint(bytes), view, groups: { main: [structuredClone(mainRow)], rashi: [rashiRow], tosafot: [], other: [ranRow] },
        matches: [{ kind: "rashi", source: "Attributed Rashi", scores: { rashi: 40, tosafot: null, other: 0 } }], mainMatch: { fragments: 3, letters: 40 },
        commentaryAttribution: { version: 1, tosafot: null, revision: references.revision } };
    } };
}

const exported = (staged, amud) => staged.output.tractates[0].pages.find((page) => page.amud === amud);

test("Nedarim titles and indices follow the Wikisource and classifier conventions", () => {
  assert.deepEqual(["2a", "4b", "15a", "16b", "91b"].map(nedarimWikisourceTitle), ["נדרים ב א", "נדרים ד ב", "נדרים טו א", "נדרים טז ב", "נדרים צא ב"]);
  assert.deepEqual(["2a", "4b", "91b"].map(nedarimAmudIndex), [0, 5, 179]);
});

test("Nedarim audit recomputes pinned sides, falls back elsewhere, and keeps every prior decision in history", async () => {
  const input = fixture();
  const before = structuredClone({ checkpoint: input.checkpoint, data: input.data, existingExport: input.existingExport });
  const staged = await stageNedarimAudit(input);
  assert.deepEqual({ checkpoint: input.checkpoint, data: input.data, existingExport: input.existingExport }, before);
  assert.deepEqual(staged.report.recomputed, ["2a"]);
  assert.deepEqual(staged.report.fallbackReasons, {
    "pinned PDF unavailable offline: PDF is not available in the local cache with the expected fingerprint": ["2b"],
    "cached Wikisource revision # differs from saved #": ["3a"],
    "no previously measured page, so no pinned PDF fingerprint": ["3b"],
  });
  assert.deepEqual(input.calls.load, ["2a", "2b"]);
  for (const amud of expected) {
    const entry = staged.checkpoint.pages[amud];
    assert.deepEqual(entry.previousClassification, before.checkpoint.pages[amud], `${amud} history`);
    assert.ok(!entry.unknownCategories.includes("tosafot") && !entry.confirmedAbsent.length && !entry.tosafotEvidence && !entry.rashiEvidence);
    assert.deepEqual(entry.excludedCategories, ["tosafot"]);
    assert.deepEqual(exported(staged, amud).excludedCategories, ["tosafot"]);
    assert.equal(exported(staged, amud).fractions.tosafot, 0);
    assert.notEqual(exported(staged, amud).fractions?.rashi, 0);
  }
  const recomputed = staged.checkpoint.pages["2a"];
  assert.deepEqual(recomputed.page.groups, { main: [mainRow], rashi: [rashiRow], tosafot: [], other: [ranRow] }, "header label and Tosafot rows removed");
  assert.deepEqual(recomputed.unknownCategories, []);
  assert.equal(exported(staged, "2a").status, "measured");
  assert.deepEqual(recomputed.nedarimAudit.sources.map((source) => source.revision), [101, 102]);
  assert.ok(exported(staged, "2a").fractions.rashi > 0);
  const fallback = staged.checkpoint.pages["2b"];
  assert.deepEqual(fallback.page.groups, { main: [mainRow], rashi: [], tosafot: [], other: [] });
  assert.equal(fallback.page.matches, undefined);
  assert.deepEqual([fallback.recovery, fallback.lastClassificationError, fallback.commentaryRetry], [before.checkpoint.pages["2b"].recovery, "saved classification error", undefined]);
  assert.deepEqual(exported(staged, "2b").unknownCategories, ["rashi"]);
  assert.deepEqual([staged.checkpoint.pages["3b"].error, staged.checkpoint.pages["3b"].mainRecoveryError], ["saved unresolved", "saved main error"]);
  assert.deepEqual(exported(staged, "3b").fractions, { main: null, rashi: null, tosafot: 0 });
  assert.deepEqual(staged.output.tractates[0].excludedCategories, ["tosafot"]);
  assert.deepEqual(staged.output.tractates[0].totals.sides, { main: null, rashi: null, tosafot: 0 });
  for (const amud of ["2a", "2b", "3a"]) {
    assert.equal(exported(staged, amud).fractions.main, (mainRow.right - mainRow.left) * mainRow.pitch / staged.output.tractates[0].frame.area);
  }
  assert.deepEqual(staged.report.zeroes, { rashi: { before: 2, after: 0 }, tosafot: { before: 2, after: 4 } });
  assert.deepEqual(staged.report.knownByCategory.after, { main: 3, rashi: 1, tosafot: 4 });
  assert.ok(staged.report.frame.after.top < staged.report.frame.before.top, "legacy header label no longer sets the frame top");
  assert.equal(staged.report.nonNedarimTractatesByteIdentical, 1);
});

test("Nedarim audit falls back on conflicting pins, unusable caches and unreproduced or unsafe pages", async () => {
  const cases = [
    [(input) => { input.checkpoint.pages["2a"].tosafotEvidence.pdfSha256 = "0".repeat(64); }, /conflicting saved PDF fingerprints/],
    [(input) => { input.checkpoint.pages["2a"].previousClassification = { rashiEvidence: { revision: 55 } }; }, /conflicting saved Wikisource revisions/],
    [(input) => { input.loadPdf = async () => Buffer.from("%PDF-other"); }, /differs from the saved fingerprint/],
    [(input) => { delete input.wikiPages["2b"]; }, /lacks adjacent amud 2b/],
    [(input) => { input.wikiPages["2b"].title = "נדרים ג א"; }, /unexpected title/],
    [(input) => { input.wikiPages["2a"].revisions[0].slots.main.content = "== ר\"ן ==\n"; }, /Wikisource references unusable/],
    [(input) => { const run = input.processPage; input.processPage = async (...args) => { const page = await run(...args); page.groups.main[0].right += 0.5; return page; }; }, /main rows were not exactly reproduced/],
    [(input) => { const run = input.processPage; input.processPage = async (...args) => { const page = await run(...args); page.groups.main.push(row("main", 700, 212, 371, 11.88)); return page; }; }, /main rows were not exactly reproduced/],
    [(input) => { const run = input.processPage; input.processPage = async (...args) => ({ ...await run(...args), groups: { main: [mainRow], rashi: [], tosafot: [], other: [ranRow] } }); }, /no attributed Rashi/],
    [(input) => { const run = input.processPage; input.processPage = async (...args) => { const page = await run(...args); page.groups.tosafot.push(rashiRow); return page; }; }, /carries Tosafot/],
    [(input) => { const run = input.processPage; input.processPage = async (...args) => ({ ...await run(...args), frameRows: [rashiRow] }); }, /carries Tosafot or frame-only rows/],
    [(input) => { input.processPage = async () => { throw new Error("nedarim-2a: unresolved Nedarim commentary segments at 1.0/2-3"); }; }, /classifier rejected/],
  ];
  for (const [change, reason] of cases) {
    const input = fixture();
    change(input);
    const original = structuredClone(input.checkpoint.pages["2a"]);
    const staged = await stageNedarimAudit(input);
    const entry = staged.checkpoint.pages["2a"];
    assert.equal(entry.nedarimAudit.outcome, "fallback", String(reason));
    assert.match(entry.nedarimAudit.reason, reason);
    assert.deepEqual(entry.previousClassification, original);
    assert.deepEqual(entry.page.groups, { main: [mainRow], rashi: [], tosafot: [], other: [] });
    assert.deepEqual([exported(staged, "2a").fractions.rashi, exported(staged, "2a").fractions.tosafot], [null, 0]);
  }
});

test("Nedarim audit refuses unknown saved fields, missing sides, filtered data and unrelated export drift", async () => {
  for (const change of [
    (input) => { input.checkpoint.pages["2a"].customField = true; },
    (input) => { input.checkpoint.pages["2a"].page.frameGeometry = {}; },
    (input) => { input.checkpoint.pages["2a"].page.groups.margin = []; },
    (input) => { input.checkpoint.pages["2b"].nedarimAudit = { version: 99 }; },
    (input) => { delete input.checkpoint.pages["3b"]; },
    (input) => { input.data.nedarim = structuredClone(input.checkpoint.pages); input.data.nedarim["2a"].page.groups.main[0].left++; },
    (input) => { input.existingExport.tractates[1].title = "Changed"; },
    (input) => { input.existingExport.schemaVersion = 2; },
  ]) {
    const input = fixture();
    change(input);
    await assert.rejects(stageNedarimAudit(input));
  }
});

test("Nedarim audit is idempotent and fallback-only staging loads nothing", async () => {
  const input = fixture();
  const staged = await stageNedarimAudit(input);
  const forbidden = async () => { throw new Error("must not run"); };
  const repeated = await stageNedarimAudit({ ...input, checkpoint: staged.checkpoint, data: { ...input.data, nedarim: staged.checkpoint.pages },
    existingExport: staged.output, loadPdf: forbidden, processPage: forbidden });
  assert.equal(JSON.stringify(repeated.checkpoint), JSON.stringify(staged.checkpoint));
  assert.equal(JSON.stringify(repeated.output), JSON.stringify(staged.output));
  assert.equal(repeated.report.alreadyAudited, 4);
  const plain = fixture();
  const fallbackOnly = await stageNedarimAudit({ ...plain, recompute: false, loadPdf: forbidden, processPage: forbidden });
  assert.deepEqual(fallbackOnly.report.recomputed, []);
  assert.deepEqual(fallbackOnly.report.fallbackReasons, { "recomputation disabled": expected });
  assert.deepEqual(fallbackOnly.report.knownByCategory.after, { main: 3, rashi: 0, tosafot: 4 });
});

test("version-one policy upgrade preserves history and unrelated unknowns without loading sources", async () => {
  const input = fixture();
  const staged = await stageNedarimAudit(input);
  const old = structuredClone(staged.checkpoint);
  for (const entry of Object.values(old.pages)) {
    delete entry.excludedCategories;
    entry.unknownCategories.push("tosafot", "other-unknown");
    entry.nedarimAudit.tosafot = "unknown";
  }
  const history = Object.fromEntries(Object.entries(old.pages).map(([amud, entry]) => [amud, structuredClone(entry.previousClassification)]));
  const data = { ...input.data, nedarim: old.pages };
  const forbidden = async () => { throw new Error("must not load source or PDF"); };
  const result = await stageNedarimAudit({ ...input, checkpoint: old, data, existingExport: buildShasExport(catalog, data), loadPdf: forbidden, processPage: forbidden });
  for (const [amud, entry] of Object.entries(result.checkpoint.pages)) {
    assert.deepEqual(entry.previousClassification, history[amud]);
    assert.ok(entry.unknownCategories.includes("other-unknown"));
    assert.deepEqual(entry.excludedCategories, ["tosafot"]);
    assert.equal(entry.nedarimAudit.tosafot, "excluded");
  }
  const repeated = await stageNedarimAudit({ ...input, checkpoint: result.checkpoint, data: { ...input.data, nedarim: result.checkpoint.pages }, existingExport: result.output, loadPdf: forbidden, processPage: forbidden });
  assert.deepEqual(repeated.checkpoint, result.checkpoint);
  assert.deepEqual(repeated.output, result.output);
});

function retryFixture() {
  const input = fixture();
  return stageNedarimAudit(input).then((first) => {
    const references = nedarimAmudReferences(input.wikiPages, nedarimAmudIndex("3b"));
    const mainPins = { "nedarim-3b": { pdfSha256: sha["3b"], revision: 104, mainSha256: references.sha256.main } };
    const run = input.processPage;
    const retry = { ...input, checkpoint: first.checkpoint, data: { ...input.data, nedarim: first.checkpoint.pages }, existingExport: first.output,
      retryUnknown: true, mainPins, loadPdf: async (definition, amud, expectedHash) => { input.calls.load.push(amud); assert.equal(expectedHash, sha[amud]); return pdf[amud]; },
      processPage: async (definition, index, refs, bytes, options = {}) => {
        if (expected[index] !== "3b") return run(definition, index, refs, bytes);
        if (!options.mainOnly) throw new Error("nedarim-3b: unresolved Nedarim commentary segments at 1.0/2-3");
        return { name: "nedarim-3b", sha256: fingerprint(bytes), view, mainMatch: { fragments: 3, letters: 38, basis: "reviewed-pinned-ambiguous-nun-alignment" },
          groups: { main: [structuredClone(mainRow)], rashi: [], tosafot: [], other: [] } };
      } };
    return { input, first, retry };
  });
}

test("Nedarim retry-unknown recomputes recoverable fallbacks, recovers pinned main only, and leaves the rest byte-identical", async () => {
  const { first, retry } = await retryFixture();
  const staged = await stageNedarimAudit(retry);
  assert.deepEqual(staged.report.retry.recomputed, ["2b"]);
  assert.deepEqual(staged.report.retry.mainRecovered, ["3b"]);
  assert.deepEqual(staged.report.retry.reasons, { "cached Wikisource revision # differs from saved #": ["3a"] });
  assert.deepEqual(staged.report.newlyMeasured, ["3b"]);
  assert.equal(JSON.stringify(staged.checkpoint.pages["3a"]), JSON.stringify(first.checkpoint.pages["3a"]));
  const recomputed = staged.checkpoint.pages["2b"];
  assert.deepEqual(recomputed.previousClassification, first.checkpoint.pages["2b"].previousClassification);
  assert.equal(recomputed.nedarimAudit.retriedFallbackReason, first.checkpoint.pages["2b"].nedarimAudit.reason);
  assert.ok(exported(staged, "2b").fractions.rashi > 0);
  const recovered = staged.checkpoint.pages["3b"];
  assert.deepEqual(recovered.previousClassification, first.checkpoint.pages["3b"].previousClassification);
  assert.deepEqual(recovered.page.groups, { main: [mainRow], rashi: [], tosafot: [], other: [] });
  assert.deepEqual([recovered.error, recovered.mainRecoveryError, recovered.nedarimAudit.outcome], [undefined, undefined, "fallback"]);
  assert.match(recovered.nedarimAudit.reason, /classifier rejected: .*unresolved/);
  assert.equal(recovered.nedarimAudit.mainRecovery.pdfSha256, sha["3b"]);
  assert.deepEqual(recovered.unknownCategories, ["rashi"]);
  assert.deepEqual([exported(staged, "3b").fractions.rashi, exported(staged, "3b").fractions.tosafot], [null, 0]);
  assert.ok(exported(staged, "3b").fractions.main > 0);
  assert.equal(staged.output.tractates[0].coverage.measured, first.output.tractates[0].coverage.measured + 1);
  const forbidden = async () => { throw new Error("must not run"); };
  const repeated = await stageNedarimAudit({ ...retry, checkpoint: staged.checkpoint, data: { ...retry.data, nedarim: staged.checkpoint.pages }, existingExport: staged.output,
    processPage: async (...args) => (args[1] === nedarimAmudIndex("3a") ? forbidden() : retry.processPage(...args)) });
  assert.equal(JSON.stringify(repeated.checkpoint), JSON.stringify(staged.checkpoint), "repeated retry is a no-op");
  assert.deepEqual([repeated.report.retry.recomputed, repeated.report.retry.mainRecovered], [[], []]);
});

test("Nedarim retry-unknown refuses unpinned or mismatched main recovery without changing the fallback", async () => {
  for (const change of [
    (retry) => { retry.mainPins = {}; },
    (retry) => { retry.mainPins["nedarim-3b"].pdfSha256 = "0".repeat(64); },
    (retry) => { retry.mainPins["nedarim-3b"].revision = 105; },
    (retry) => { retry.mainPins["nedarim-3b"].mainSha256 = "0".repeat(64); },
    (retry) => { const run = retry.processPage; retry.processPage = async (...args) => { const page = await run(...args); if (args[4]?.mainOnly) page.groups.rashi.push(rashiRow); return page; }; },
    (retry) => { const run = retry.processPage; retry.processPage = async (...args) => { if (args[4]?.mainOnly) throw new Error("nedarim-3b: insufficient main-text match"); return run(...args); }; },
  ]) {
    const { first, retry } = await retryFixture();
    change(retry);
    const staged = await stageNedarimAudit(retry);
    assert.equal(JSON.stringify(staged.checkpoint.pages["3b"]), JSON.stringify(first.checkpoint.pages["3b"]));
    assert.deepEqual(staged.report.newlyMeasured, []);
    assert.equal(staged.output.tractates[0].coverage.measured, first.output.tractates[0].coverage.measured);
  }
});

async function temporaryResults(run) {
  const directory = await mkdtemp(join(tmpdir(), "nedarim-audit-test-"));
  try {
    const input = fixture();
    for (const name of ["shas-work", "wikisource-cache", "pdf-cache", "pdfs"]) await mkdir(join(directory, name));
    const data = { nedarim: input.checkpoint.pages };
    const files = {
      checkpoint: [join(directory, "shas-work", "nedarim.json"), JSON.stringify(input.checkpoint)],
      export: [join(directory, "shas-metrics.json"), JSON.stringify(buildShasExport(catalog, data), null, 2)],
      wiki: [join(directory, "wikisource-cache", "nedarim.json"), JSON.stringify(input.wikiPages)],
    };
    for (const [name, bytes] of Object.values(files)) await writeFile(name, bytes);
    await writeFile(join(directory, "pdf-cache", `nedarim-2a-${sha["2a"]}.pdf`), pdf["2a"]);
    await writeFile(join(directory, "pdf-cache", `nedarim-3a-${sha["3a"]}.pdf`), pdf["3a"]);
    await run({ directory, files, options: { resultsDirectory: directory, catalog, processPage: input.processPage, checkWriters: async () => {} } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Nedarim audit dry run leaves results untouched; apply replaces atomically once and then is a no-op", async () => {
  await temporaryResults(async ({ directory, files, options }) => {
    const read = async () => Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, [name]]) => [key, await readFile(name, "utf8")])));
    const original = await read();
    const dry = await auditNedarim(options);
    assert.deepEqual([dry.applied, dry.dryRun, dry.unchanged, dry.sourceRequests], [false, true, false, 0]);
    assert.deepEqual(dry.recomputed, ["2a"]);
    assert.deepEqual(await read(), original);
    assert.deepEqual((await readdir(join(directory, "shas-work"))), ["nedarim.json"]);
    const staged = await readFile(join(dry.stagingDirectory, "staged-nedarim.json"), "utf8");
    const applied = await auditNedarim({ ...options, apply: true });
    assert.equal(applied.applied, true);
    const after = await read();
    assert.equal(after.checkpoint, staged);
    assert.equal(after.wiki, original.wiki);
    assert.equal(after.export, JSON.stringify(buildShasExport(catalog, { nedarim: JSON.parse(staged).pages }), null, 2));
    assert.deepEqual(JSON.parse(after.checkpoint).pages["2a"].previousClassification, JSON.parse(original.checkpoint).pages["2a"]);
    await rm(files.wiki[0]);
    const again = await auditNedarim({ ...options, apply: true });
    assert.deepEqual([again.applied, again.unchanged, again.alreadyAudited], [false, true, 4]);
    await writeFile(files.wiki[0], after.wiki);
    assert.deepEqual(await read(), after);
    assert.deepEqual((await readdir(join(directory, "shas-work"))), ["nedarim.json"]);
    for (const path of [dry.stagingDirectory, applied.stagingDirectory, again.stagingDirectory]) await rm(path, { recursive: true, force: true });
  });
});

test("Nedarim audit aborts without partial writes when an input changes during staging", async () => {
  await temporaryResults(async ({ directory, files, options }) => {
    const before = await readFile(files.checkpoint[0], "utf8");
    let stagingDirectory;
    await assert.rejects(auditNedarim({ ...options, apply: true, beforeReplace: async () => {
      await writeFile(files.wiki[0], JSON.stringify({ changed: true }));
    } }), (error) => {
      stagingDirectory = /staging: (\S+)$/.exec(error.message)?.[1];
      return /Saved input changed during staging/.test(error.message);
    });
    assert.equal(await readFile(files.checkpoint[0], "utf8"), before);
    assert.equal(await readFile(files.export[0], "utf8"), files.export[1]);
    assert.deepEqual((await readdir(join(directory, "shas-work"))), ["nedarim.json"]);
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
  });
});
