import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { classifierVersion } from "./measure-corpus.mjs";
import { auditCachedPdfs, replaceSavedFiles, stageShekalimMigration } from "./migrate-shekalim-frame.mjs";
import { amudim } from "./shas-catalog.mjs";
import { buildShasExport } from "./shas-export.mjs";

function fixture() {
  const catalog = [{ slug: "shekalim", title: "Shekalim", order: "Moed", first: "2a", last: "22b" },
    { slug: "example", title: "Example", order: "Moed", first: "2a", last: "2a" }];
  const bytes = Buffer.from("%PDF-test-only");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const row = { left: 110, right: 530, baseline: 900, pitch: 10 };
  const checkpoint = { slug: "shekalim", retainedMetadata: { untouched: true }, pages: Object.fromEntries(amudim(catalog[0]).map((amud) => {
    const offset = amud.endsWith("a") ? 85.08 : 0;
    return [amud, { classifierVersion, page: { name: `shekalim-${amud}`, sha256, view: [0, 0, 700, 1200],
      groups: { main: [{ ...row, left: row.left + offset, right: row.right + offset }], rashi: [], tosafot: [] },
      frameRows: [{ ...row, left: 90, right: 640 }], areas: { main: { area: 4200, fraction: -1 } }, matches: [] },
    recovery: { reason: "retained", mainMatch: { source: "saved-source", similarity: 0.9 } },
    unknownCategories: ["rashi", "tosafot"], ...(amud === "22b" ? { confirmedAbsent: ["rashi", "tosafot"],
      tosafotEvidence: { basis: "saved-evidence", revision: 17 }, rashiEvidence: { basis: "saved-rashi" } } : {}),
    commentaryRetry: { state: "error", error: "saved retry" }, customField: { untouched: true } }];
  })) };
  const data = { shekalim: checkpoint.pages, example: { "2a": { page: { name: "example-2a", groups: { main: [row], rashi: [], tosafot: [] } } } } };
  const legacyData = structuredClone(data);
  for (const entry of Object.values(legacyData.shekalim)) entry.page.name = entry.page.name.replace("shekalim-", "legacy-");
  const existingExport = buildShasExport(catalog, legacyData);
  const rebuildPage = async (page) => {
    const offset = page.name.endsWith("a") ? 85.08 : 0;
    return { ...page, frameRows: [{ ...row, left: 106 + offset, right: 534 + offset }],
      frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: offset } };
  };
  return { catalog, data, checkpoint, existingExport, loadPdf: async () => bytes, rebuildPage };
}

test("Shekalim migration stages all 42 sides, preserving every non-geometry field, zero/unknown and other export", async () => {
  const input = fixture();
  const before = structuredClone({ data: input.data, checkpoint: input.checkpoint, existingExport: input.existingExport });
  const staged = await stageShekalimMigration(input);
  assert.deepEqual({ data: input.data, checkpoint: input.checkpoint, existingExport: input.existingExport }, before);
  assert.equal(staged.report.mainGroupsUnchanged, 42);
  assert.equal(staged.report.nonShekalimTractatesByteIdentical, 1);
  assert.deepEqual(staged.report.categoryCounts, { main: { known: 42, unknown: 0, zeroes: 0 },
    rashi: { known: 1, unknown: 41, zeroes: 1 }, tosafot: { known: 1, unknown: 41, zeroes: 1 } });
  assert.deepEqual(staged.report.frame.sideOffsets, { a: 85.08, b: 0 });
  assert.deepEqual(staged.checkpoint.pages["2a"].page.areas, input.checkpoint.pages["2a"].page.areas);
  const numerator = input.checkpoint.pages["2a"].page.groups.main.reduce((sum, row) => sum + (row.right - row.left) * row.pitch, 0);
  assert.equal(staged.output.tractates[0].pages[0].fractions.main, numerator / staged.report.frame.area);
  const repeated = await stageShekalimMigration({ ...input, checkpoint: staged.checkpoint,
    data: { ...input.data, shekalim: staged.checkpoint.pages }, existingExport: staged.output });
  assert.deepEqual(repeated.checkpoint, staged.checkpoint);
  assert.deepEqual(repeated.output, staged.output);
});

test("Shekalim staging blocks mismatched PDFs, missing sides, changed numerators/evidence and unrelated export drift", async () => {
  for (const change of [
    (input) => { input.loadPdf = async () => Buffer.from("%PDF-wrong"); },
    (input) => { delete input.checkpoint.pages["2a"]; },
    (input) => { const rebuild = input.rebuildPage; input.rebuildPage = async (page) => { const next = await rebuild(page); next.groups.main[0].right++; return next; }; },
    (input) => { const rebuild = input.rebuildPage; input.rebuildPage = async (page) => ({ ...await rebuild(page), mainMatch: { changed: true } }); },
    (input) => { input.existingExport.tractates[1].title = "Changed unrelated title"; },
    (input) => { input.existingExport.tractates[0].pages[0].fractions.rashi = 0; },
  ]) {
    const input = fixture();
    change(input);
    await assert.rejects(stageShekalimMigration(input));
  }
});

async function temporaryFiles(run) {
  const directory = await mkdtemp(join(tmpdir(), "shekalim-migration-test-"));
  try {
    const files = ["checkpoint.json", "export.json"].map((label) => ({ name: join(directory, label), original: Buffer.from(`original-${label}`), staged: Buffer.from(`staged-${label}`) }));
    for (const file of files) await writeFile(file.name, file.original);
    await run(files);
    assert.deepEqual((await readdir(directory)).sort(), ["checkpoint.json", "export.json"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("Shekalim cache audit verifies pinned/measured PDFs and separately inventories unchanged unresolved unpinned PDFs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shekalim-cache-audit-test-"));
  try {
    await mkdir(join(directory, "pdf-cache"));
    await mkdir(join(directory, "pdfs"));
    const bytes = Buffer.from("%PDF-cache-test");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const snapshots = new Map([["shas-work/example.json", Buffer.from(JSON.stringify({ slug: "example", pages: {
      "2a": { page: { name: "example-2a", sha256: hash } }, "2b": { error: "unresolved" },
    } }))]]);
    const pinned = join(directory, "pdf-cache", `example-2a-${hash}.pdf`);
    const measured = join(directory, "pdfs", "example-2a.pdf");
    const unresolved = join(directory, "pdf-cache", "example-2b.pdf");
    for (const file of [pinned, measured, unresolved]) await writeFile(file, bytes);
    const audit = await auditCachedPdfs(directory, snapshots);
    assert.equal(Object.keys(audit.hashes).length, 3);
    assert.deepEqual(audit.withoutSavedFingerprint, ["pdf-cache/example-2b.pdf"]);
    assert.deepEqual(await auditCachedPdfs(directory, snapshots), audit);
    await writeFile(measured, "%PDF-changed");
    await assert.rejects(auditCachedPdfs(directory, snapshots), /saved fingerprint mismatch/);
    await writeFile(measured, bytes);
    await writeFile(pinned, "%PDF-changed");
    await assert.rejects(auditCachedPdfs(directory, snapshots), /filename hash mismatch/);
    await writeFile(pinned, bytes);
    await writeFile(join(directory, "pdf-cache", "stray-2a.pdf"), bytes);
    await assert.rejects(auditCachedPdfs(directory, snapshots), /no saved measured or unresolved entry/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Shekalim replacement commits both files while open read-only descriptors retain complete originals", async () => {
  await temporaryFiles(async (files) => {
    const { open } = await import("node:fs/promises");
    const reader = await open(files[0].name, "r");
    try {
      await replaceSavedFiles(files);
      assert.ok((await reader.readFile()).equals(files[0].original));
      for (const file of files) assert.ok((await readFile(file.name)).equals(file.staged));
    } finally { await reader.close(); }
  });
});

test("Shekalim replacement restores both originals after a second-file rename failure", async () => {
  await temporaryFiles(async (files) => {
    let attempts = 0;
    await assert.rejects(replaceSavedFiles(files, { renameFile: async (from, to) => {
      attempts++;
      if (attempts === 2) throw new Error("injected second rename failure");
      await rename(from, to);
    } }), /injected second rename failure/);
    for (const file of files) assert.ok((await readFile(file.name)).equals(file.original));
  });
});

test("Shekalim replacement rolls back both files if post-replacement reporting fails", async () => {
  await temporaryFiles(async (files) => {
    await assert.rejects(replaceSavedFiles(files, { afterReplace: async () => { throw new Error("report write failed"); } }), /report write failed/);
    for (const file of files) assert.ok((await readFile(file.name)).equals(file.original));
  });
});

test("Shekalim replacement aborts before either rename when inputs change or validation fails", async () => {
  for (const concurrentChange of [false, true]) {
    await temporaryFiles(async (files) => {
      await assert.rejects(replaceSavedFiles(files, { validateInputs: async () => {
        if (concurrentChange) await writeFile(files[1].name, "user modification");
        throw new Error("input validation failed");
      } }), /input validation failed/);
      assert.ok((await readFile(files[0].name)).equals(files[0].original));
      assert.equal((await readFile(files[1].name)).toString(), concurrentChange ? "user modification" : files[1].original.toString());
    });
  }
});