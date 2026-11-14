import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { classifierVersion, preserveRetryPage, preserveRetryTosafot, verifyOverlapRetrySources } from "./measure-corpus.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";
import { buildShasExport } from "./shas-export.mjs";
import { confirmShekalimAbsence, saveShekalimAbsence, yerushalmiAbsenceBasis } from "./shekalim-absence.mjs";

const shekalim = tractates.find((tractate) => tractate.slug === "shekalim");
const hash = "a".repeat(64);
const row = { left: 200, right: 300, baseline: 500, pitch: 10 };
function fixture() {
  return { slug: "shekalim", pages: Object.fromEntries(amudim(shekalim).map((amud) => [amud, {
    classifierVersion, page: { name: `shekalim-${amud}`, sha256: hash,
      frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: amud.endsWith("a") ? 85.08 : 0 },
      frameRows: [row], groups: { main: [row], rashi: [], tosafot: [] } },
    unknownCategories: ["rashi", "tosafot"], inferredAbsent: [], confirmedAbsent: [], recovery: { reason: "main-only" },
    tosafotEvidence: { version: 2, runId: "prior-run", state: "processed", decision: "unknown", basis: "main-only", revision: null, source: null, pdfSha256: hash },
    commentaryRetry: { runId: "prior-retry", state: "resolved" }, previousClassification: { error: "prior error" },
  }])) };
}

test("confirms all 42 Shekalim sides, preserves two Wikisource zeroes and evidence, and is idempotent", () => {
  const original = fixture();
  for (const amud of ["2a", "16b"]) {
    const entry = original.pages[amud];
    entry.confirmedAbsent = ["rashi", "tosafot"];
    entry.unknownCategories = [];
    for (const kind of ["rashi", "tosafot"]) entry[`${kind}Evidence`] = { sourceType: "wikisource", source: "https://he.wikisource.org/?oldid=42",
      revision: 42, decision: "absent", basis: `wikisource-no-${kind}-section`, pdfSha256: hash };
  }
  const snapshot = structuredClone(original);
  const result = confirmShekalimAbsence(original);
  assert.equal(result.changed.length, 80);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(original, snapshot);
  for (const amud of amudim(shekalim)) {
    const entry = result.work.pages[amud];
    if (["2a", "16b"].includes(amud)) { assert.deepEqual(entry, snapshot.pages[amud]); continue; }
    for (const kind of ["rashi", "tosafot"]) {
      assert.deepEqual(entry[`${kind}Evidence`], { version: 2, state: "processed", sourceType: "user-attestation", source: null,
        decision: "absent", basis: yerushalmiAbsenceBasis, pdfSha256: hash, previousEvidence: snapshot.pages[amud][`${kind}Evidence`] ?? null });
    }
    const unchanged = structuredClone(entry);
    for (const field of ["rashiEvidence", "tosafotEvidence", "unknownCategories", "inferredAbsent", "confirmedAbsent"]) {
      if (field in snapshot.pages[amud]) unchanged[field] = snapshot.pages[amud][field];
      else delete unchanged[field];
    }
    assert.deepEqual(unchanged, snapshot.pages[amud]);
  }
  assert.deepEqual(confirmShekalimAbsence(result.work), { work: result.work, changed: [], conflicts: [] });
  const book = buildShasExport([shekalim], { shekalim: result.work.pages }).tractates[0];
  assert.equal(book.status, "complete");
  assert.equal(book.frame.provisional, true);
  assert.equal(book.frame.referenceBasis, "main-and-unclassified-text");
  assert.ok(book.pages.every((page) => page.fractions.rashi === 0 && page.fractions.tosafot === 0));
  const otherBooks = tractates.filter((tractate) => ["kinim", "middos", "tamid"].includes(tractate.slug));
  const otherData = Object.fromEntries(otherBooks.map((tractate) => [tractate.slug, { [tractate.first]: {
    page: { name: `${tractate.slug}-${tractate.first}`, groups: { main: [row], rashi: [row], tosafot: [row] } },
  } }]));
  const beforeBooks = buildShasExport([...otherBooks, shekalim], { ...otherData, shekalim: original.pages }).tractates;
  const afterBooks = buildShasExport([...otherBooks, shekalim], { ...otherData, shekalim: result.work.pages }).tractates;
  assert.deepEqual(afterBooks.slice(0, 3), beforeBooks.slice(0, 3));
});

test("known numbers, confirmed absences, source evidence, and detected rows are never overwritten", () => {
  for (const kind of ["rashi", "tosafot"]) for (const measured of [false, true]) {
    for (const scenario of ["known-zero", "known-positive", "classified-zero", "saved-area", "confirmed", "source", "present", "absent", "rows", "match-rows"]) {
      const work = fixture();
      const entry = work.pages["2b"];
      if (!measured) delete entry.page;
      if (scenario === "known-zero" || scenario === "known-positive") entry.fractions = { [kind]: scenario === "known-zero" ? 0 : 0.2 };
      if (scenario === "classified-zero") { entry.unknownCategories = []; if (measured) entry.page.areas = { [kind]: { fraction: 0 } }; else entry.fractions = { [kind]: 0 }; }
      if (scenario === "saved-area") { if (!measured) continue; entry.page.areas = { [kind]: { fraction: 0.2 } }; }
      if (scenario === "confirmed") entry.confirmedAbsent = [kind];
      if (scenario === "source") entry[`${kind}Evidence`] = { decision: "unknown", source: "https://example.test/revision", revision: 42, pdfSha256: hash };
      if (scenario === "present" || scenario === "absent") entry[`${kind}Evidence`] = { decision: scenario, pdfSha256: hash };
      if (scenario === "rows" || scenario === "match-rows") {
        if (!measured) continue;
        if (scenario === "rows") entry.page.groups[kind] = [row];
        else entry.page.matches = [{ kind, rows: [row] }];
      }
      const before = structuredClone(entry);
      const result = confirmShekalimAbsence(work);
      for (const field of [`${kind}Evidence`, "fractions", "page"]) assert.deepEqual(result.work.pages["2b"][field], before[field], `${kind}/${measured}/${scenario}/${field}`);
      assert.equal(result.work.pages["2b"].confirmedAbsent.includes(kind), before.confirmedAbsent.includes(kind));
      if (scenario === "rows" || scenario === "match-rows") {
        assert.ok(result.conflicts.some((conflict) => conflict.amud === "2b" && conflict.kind === kind));
        const exported = buildShasExport([shekalim], { shekalim: result.work.pages }).tractates[0].pages.find((page) => page.amud === "2b");
        assert.equal(exported.fractions[kind], null);
      }
    }
  }
});

test("unmeasured pages retain errors and hashes while only commentary becomes numeric", () => {
  const work = fixture();
  const entry = work.pages["2b"];
  delete entry.page;
  entry.error = "PDF unavailable";
  entry.lastClassificationError = "previous attempt failed";
  const result = confirmShekalimAbsence(work);
  const exported = buildShasExport([shekalim], { shekalim: result.work.pages }).tractates[0].pages.find((page) => page.amud === "2b");
  assert.equal(exported.status, "unresolved");
  assert.equal(exported.reason, entry.lastClassificationError);
  assert.deepEqual(exported.fractions, { main: null, rashi: 0, tosafot: 0 });
  assert.equal(exported.rashiEvidence.pdfSha256, hash);
  assert.deepEqual(exported.tosafotEvidence.previousEvidence, entry.tosafotEvidence);
});

test("missing or disagreeing hashes fail closed without deleting unknowns or saved evidence", () => {
  for (const scenario of ["missing", "invalid", "disagreeing", "unmeasured"]) {
    const work = fixture();
    const entry = work.pages["2b"];
    if (scenario === "missing") delete entry.page.sha256;
    if (scenario === "invalid") entry.page.sha256 = "bad";
    if (scenario === "disagreeing") entry.tosafotEvidence.pdfSha256 = "b".repeat(64);
    if (scenario === "unmeasured") { delete entry.page; delete entry.tosafotEvidence.pdfSha256; }
    const snapshot = structuredClone(entry);
    const result = confirmShekalimAbsence(work);
    assert.deepEqual(result.work.pages["2b"], snapshot);
    assert.ok(result.conflicts.some((conflict) => conflict.amud === "2b"));
  }
});

test("attested absences survive later retries without losing evidence or permitting PDF conflicts", () => {
  const entry = confirmShekalimAbsence(fixture()).work.pages["2b"];
  const candidate = structuredClone(entry.page);
  verifyOverlapRetrySources(entry, candidate, { revision: 99 });
  assert.throws(() => verifyOverlapRetrySources(entry, { ...candidate, sha256: "b".repeat(64) }), /PDF differs/);
  const next = { page: candidate, unknownCategories: ["rashi", "tosafot"], confirmedAbsent: [], tosafotEvidence: { decision: "unknown" } };
  preserveRetryTosafot(entry, candidate, next.tosafotEvidence, next.unknownCategories, next.confirmedAbsent, "new-run");
  next.tosafotEvidence = { sourceType: "wikisource", decision: "absent", revision: 99 };
  preserveRetryPage(entry, next);
  assert.deepEqual(next.rashiEvidence, entry.rashiEvidence);
  assert.deepEqual(next.tosafotEvidence, entry.tosafotEvidence);
  for (const kind of ["rashi", "tosafot"]) {
    const conflict = structuredClone(next);
    conflict.page.groups[kind] = [row];
    assert.throws(() => preserveRetryPage(entry, conflict), /conflicts with a previously recorded zero/);
  }
});

test("authorization is restricted to the existing 42-side Shekalim catalog", () => {
  for (const tractate of tractates.filter((book) => book.slug !== "shekalim")) {
    const work = { ...fixture(), slug: tractate.slug };
    const before = structuredClone(work);
    assert.throws(() => confirmShekalimAbsence(work), /only for Shekalim/);
    assert.deepEqual(work, before);
  }
  const incomplete = fixture();
  delete incomplete.pages["22b"];
  assert.throws(() => confirmShekalimAbsence(incomplete), /42 sides/);
});

test("explicit runner command is offline, writes an atomic checkpoint, and makes repeat runs byte-idempotent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shekalim-absence-"));
  const runner = fileURLToPath(new URL("./measure-shas.mjs", import.meta.url));
  const offline = ["--input-type=module", "--eval", `globalThis.fetch = () => { throw new Error("Source fetch forbidden"); }; await import(${JSON.stringify(new URL("./measure-shas.mjs", import.meta.url).href)});`, runner];
  try {
    const workDirectory = join(directory, "results", "shas-work");
    await mkdir(workDirectory, { recursive: true });
    await writeFile(join(workDirectory, "shekalim.json"), JSON.stringify(fixture()));
    const unrelated = JSON.stringify({ slug: "tamid", pages: { "25b": { classifierVersion, error: "unknown" } } });
    await writeFile(join(workDirectory, "tamid.json"), unrelated);
    for (const args of [["--confirm-yerushalmi-absence"], ["kinim", "--confirm-yerushalmi-absence"], ["shekalim", "tamid", "--confirm-yerushalmi-absence"], ["shekalim", "--confirm-yerushalmi-absence", "--wikisource"]]) {
      assert.throws(() => execFileSync(process.execPath, [...offline, ...args], { cwd: directory, stdio: "pipe" }), /requires only shekalim/);
    }
    const args = [...offline, "shekalim", "--confirm-yerushalmi-absence"];
    const first = JSON.parse(execFileSync(process.execPath, args, { cwd: directory, encoding: "utf8" }));
    assert.equal(first.checked, 42);
    assert.equal(first.changed.length, 84);
    const checkpoint = await readFile(join(workDirectory, "shekalim.json"), "utf8");
    const exported = await readFile(join(directory, "results", "shas-metrics.json"), "utf8");
    const second = JSON.parse(execFileSync(process.execPath, args, { cwd: directory, encoding: "utf8" }));
    assert.deepEqual(second.changed, []);
    assert.equal(await readFile(join(workDirectory, "shekalim.json"), "utf8"), checkpoint);
    assert.equal(await readFile(join(directory, "results", "shas-metrics.json"), "utf8"), exported);
    assert.equal(await readFile(join(workDirectory, "tamid.json"), "utf8"), unrelated);
    assert.deepEqual((await readdir(workDirectory)).sort(), ["shekalim.json", "tamid.json"]);
    assert.deepEqual((await readdir(join(directory, "results"))).sort(), ["shas-metrics.json", "shas-work"]);
    assert.deepEqual(await saveShekalimAbsence({ workDirectory }), { checked: 42, changed: [], conflicts: [] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});