import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { calculateAreas, calculateFrame, classifierVersion, frameForPage, rebuildShekalimFrame } from "./measure-corpus.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";
import { buildShasExport, readShasData } from "./shas-export.mjs";

const kinds = ["main", "rashi", "tosafot"];
const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => JSON.stringify(value, null, 2);

function withoutFrameGeometry(value) {
  const copy = structuredClone(value);
  for (const entry of Object.values(copy.pages || copy)) {
    if (!entry.page) continue;
    delete entry.page.frameRows;
    delete entry.page.frameGeometry;
  }
  return copy;
}

export async function stageShekalimMigration({ data, checkpoint, existingExport, loadPdf, rebuildPage = rebuildShekalimFrame, catalog = tractates }) {
  const definition = catalog.find((book) => book.slug === "shekalim");
  assert.ok(definition, "Catalog lacks Shekalim");
  const expected = amudim(definition);
  assert.equal(expected.length, 42, "Migration requires exactly 42 expected Shekalim sides");
  assert.equal(checkpoint.slug, "shekalim", "Wrong checkpoint slug");
  assert.deepEqual(Object.keys(checkpoint.pages).sort(), [...expected].sort(), "Checkpoint must contain exactly the 42 expected sides");
  assert.deepEqual(data.shekalim, checkpoint.pages, "Saved Shekalim entries were filtered or differ from loaded data");
  const stagedData = structuredClone(data);
  const stagedCheckpoint = structuredClone(checkpoint);
  const pdfHashes = {};
  for (const amud of expected) {
    const original = checkpoint.pages[amud];
    assert.equal(original.classifierVersion, classifierVersion, `${amud}: stale classifier version`);
    assert.equal(original.page?.name, `shekalim-${amud}`, `${amud}: missing or mismatched measured page`);
    const bytes = await loadPdf(definition, amud, original.page.sha256);
    assert.equal(fingerprint(bytes), original.page.sha256, `${amud}: cached PDF hash mismatch`);
    pdfHashes[amud] = original.page.sha256;
    stagedCheckpoint.pages[amud].page = await rebuildPage(structuredClone(original.page), bytes);
    assert.deepEqual(withoutFrameGeometry({ [amud]: stagedCheckpoint.pages[amud] }), withoutFrameGeometry({ [amud]: original }), `${amud}: fields outside frameRows/frameGeometry changed`);
    stagedData.shekalim[amud] = structuredClone(stagedCheckpoint.pages[amud]);
  }
  assert.deepEqual(withoutFrameGeometry(stagedCheckpoint), withoutFrameGeometry(checkpoint), "Checkpoint changed outside frame geometry");
  assert.deepEqual({ ...stagedData, shekalim: withoutFrameGeometry(stagedData.shekalim) }, { ...data, shekalim: withoutFrameGeometry(data.shekalim) }, "Other saved entries changed");
  const pages = expected.map((amud) => structuredClone(stagedData.shekalim[amud].page));
  const frame = calculateFrame(pages, { horizontal: 2, vertical: 2 });
  const denominator = calculateAreas(pages, frame);
  for (const page of pages) {
    const placed = frameForPage(frame, page);
    assert.ok(Math.abs((placed.right - placed.left) * (placed.top - placed.bottom) - denominator) < 1e-7, `${page.name}: unequal side denominator`);
    for (const row of [...Object.values(page.groups).flat(), ...page.frameRows]) {
      assert.ok(row.left >= placed.left && row.right <= placed.right && (row.bottom ?? row.baseline - row.pitch / 2) >= placed.bottom && row.baseline + row.pitch * 0.7 <= placed.top, `${page.name}: frame clips a saved row`);
    }
  }
  const stagedExport = buildShasExport(catalog, stagedData);
  const oldBook = existingExport.tractates.find((book) => book.id === "shekalim");
  const book = stagedExport.tractates.find((entry) => entry.id === "shekalim");
  assert.ok(oldBook, "Existing export lacks Shekalim");
  assert.equal(oldBook.pages.length, 42, "Existing export must contain all 42 sides");
  assert.equal(book.frame.area, denominator, "Export uses an unexpected denominator");
  const stripFractions = (entry) => {
    const copy = structuredClone(entry);
    delete copy.frame;
    delete copy.totals;
    for (const page of copy.pages) delete page.fractions;
    return copy;
  };
  assert.deepEqual(stripFractions(book), stripFractions(oldBook), "Shekalim export evidence, category states, or coverage changed");
  for (let index = 0; index < expected.length; index++) {
    const saved = checkpoint.pages[expected[index]].page;
    const oldPage = oldBook.pages[index];
    const nextPage = book.pages[index];
    assert.equal(oldPage.amud, expected[index], "Existing export side order differs");
    assert.deepEqual(pages[index].groups.main, saved.groups.main, `${oldPage.amud}: main raw groups changed`);
    for (const kind of kinds) {
      const rawArea = saved.groups[kind].reduce((sum, row) => sum + (row.right - row.left) * row.pitch, 0);
      assert.equal(pages[index].areas[kind].area, rawArea, `${oldPage.amud}: ${kind} numerator changed`);
      if (oldPage.fractions[kind] === null || oldPage.fractions[kind] === 0) {
        assert.equal(nextPage.fractions[kind], oldPage.fractions[kind], `${oldPage.amud}: ${kind} zero/unknown changed`);
      } else {
        assert.equal(oldPage.fractions[kind], rawArea / oldBook.frame.area, `${oldPage.amud}: existing ${kind} fraction cannot be reconciled with saved numerator`);
        assert.equal(nextPage.fractions[kind], rawArea / denominator, `${oldPage.amud}: ${kind} fraction has wrong denominator`);
      }
    }
  }
  const oldUnrelated = existingExport.tractates.filter((entry) => entry.id !== "shekalim");
  const newUnrelated = stagedExport.tractates.filter((entry) => entry.id !== "shekalim");
  assert.equal(serialize(newUnrelated), serialize(oldUnrelated), "Non-Shekalim tractate export bytes changed");
  assert.deepEqual({ ...stagedExport, tractates: [] }, { ...existingExport, tractates: [] }, "Export metadata outside Shekalim changed");
  assert.equal(serialize(stagedData.shekalim), serialize(stagedCheckpoint.pages), "Staged checkpoint/data mismatch");
  return { checkpoint: stagedCheckpoint, output: stagedExport, report: {
    measuredSides: expected.length,
    mainGroupsUnchanged: expected.length,
    entriesUnchangedExceptFrameGeometry: expected.length,
    allOtherSavedEntriesUnchanged: true,
    nonShekalimTractatesByteIdentical: newUnrelated.length,
    metadataAndEvidenceUnchanged: true,
    commonDenominatorVerified: true,
    allCategoryNumeratorsUnchanged: true,
    zeroesAndUnknownsUnchanged: true,
    categoryCounts: Object.fromEntries(kinds.map((kind) => [kind, {
      known: book.pages.filter((page) => page.fractions[kind] !== null).length,
      unknown: book.pages.filter((page) => page.fractions[kind] === null).length,
      zeroes: book.pages.filter((page) => page.fractions[kind] === 0).length,
    }])),
    frame: book.frame,
    totals: book.totals,
    pdfHashes,
  } };
}

async function durableTemporary(file, bytes, mode) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
  return temporary;
}

export async function replaceSavedFiles(files, { validateInputs = async () => {}, afterReplace = async () => {}, renameFile = rename } = {}) {
  const prepared = [];
  const replaced = [];
  try {
    for (const file of files) {
      const mode = (await stat(file.name)).mode & 0o777;
      prepared.push({ ...file, mode, temporary: await durableTemporary(file.name, file.staged, mode) });
    }
    await validateInputs();
    for (const file of prepared) {
      assert.ok((await readFile(file.name)).equals(file.original), `Input changed before replacement: ${file.name}`);
      await renameFile(file.temporary, file.name);
      replaced.push(file);
    }
    for (const file of prepared) assert.ok((await readFile(file.name)).equals(file.staged), `Replacement verification failed: ${file.name}`);
    await afterReplace();
  } catch (error) {
    const rollbackErrors = [];
    for (const file of replaced.reverse()) {
      try {
        const temporary = await durableTemporary(file.name, file.original, file.mode);
        try { await renameFile(temporary, file.name); }
        finally { await rm(temporary, { force: true }); }
        assert.ok((await readFile(file.name)).equals(file.original), `Rollback verification failed: ${file.name}`);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "Replacement failed and rollback was incomplete; restore the external backups");
    throw error;
  } finally {
    for (const file of prepared) await rm(file.temporary, { force: true });
  }
}

async function requireNoMeasurementWriter() {
  const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,command="]);
  const writers = stdout.split("\n").filter((line) => /(?:^|\s)(?:\S*\/)?node\s.*(?:measure-shas|measure-corpus|shas-export)\.mjs(?:\s|$)/.test(line));
  assert.equal(writers.length, 0, `Active measurement/export writer: ${writers.join("; ")}`);
}

async function snapshotInputs(resultsDirectory) {
  const names = ["corpus-measurements.json", "shas-metrics.json", ...(await readdir(join(resultsDirectory, "shas-work"))).filter((name) => name.endsWith(".json")).sort().map((name) => join("shas-work", name))];
  return new Map(await Promise.all(names.map(async (name) => [name, await readFile(join(resultsDirectory, name))])));
}

export async function auditCachedPdfs(resultsDirectory, snapshots) {
  const references = new Map();
  const unresolved = new Set();
  for (const [name, bytes] of snapshots) {
    if (name === "shas-metrics.json") continue;
    const saved = JSON.parse(bytes);
    if (!Array.isArray(saved.pages)) {
      for (const [amud, entry] of Object.entries(saved.pages)) {
        if (!entry.page) unresolved.add(`${saved.slug}-${amud}`);
      }
    }
    const pages = Array.isArray(saved.pages) ? saved.pages : Object.values(saved.pages).map((entry) => entry.page).filter(Boolean);
    for (const page of pages) {
      if (!references.has(page.name)) references.set(page.name, new Set());
      if (page.sha256) references.get(page.name).add(page.sha256);
    }
  }
  const hashes = {};
  const withoutSavedFingerprint = [];
  for (const directory of ["pdf-cache", "pdfs"]) {
    const files = (await readdir(join(resultsDirectory, directory))).filter((name) => name.endsWith(".pdf")).sort();
    for (const name of files) {
      const file = join(directory, name);
      const bytes = await readFile(join(resultsDirectory, file));
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-", `Cached file is not a PDF: ${file}`);
      const hash = fingerprint(bytes);
      const pinned = /^(.*)-([a-f0-9]{64})\.pdf$/.exec(name);
      if (pinned) assert.equal(hash, pinned[2], `Cached PDF filename hash mismatch: ${file}`);
      else if (references.has(name.slice(0, -4))) assert.ok(references.get(name.slice(0, -4)).has(hash), `Cached PDF saved fingerprint mismatch: ${file}`);
      else {
        assert.ok(unresolved.has(name.slice(0, -4)), `Unpinned cached PDF has no saved measured or unresolved entry: ${file}`);
        withoutSavedFingerprint.push(file);
      }
      hashes[file] = hash;
    }
  }
  return { hashes, withoutSavedFingerprint };
}

export async function migrateShekalimFrame({ resultsDirectory = "results", workspaceDirectory = process.cwd() } = {}) {
  resultsDirectory = resolve(resultsDirectory);
  const lockName = join(resultsDirectory, "shas-work", "shekalim.json.migration.lock");
  const lock = await open(lockName, "wx");
  let backupDirectory;
  try {
    await requireNoMeasurementWriter();
    const snapshots = await snapshotInputs(resultsDirectory);
    const originalCheckpoint = snapshots.get(join("shas-work", "shekalim.json"));
    assert.ok(originalCheckpoint, "Saved Shekalim checkpoint missing");
    const originalExport = snapshots.get("shas-metrics.json");
    const existingExport = JSON.parse(originalExport);
    assert.ok(originalExport.equals(Buffer.from(serialize(existingExport))), "Existing export is not canonical two-space JSON; byte-identical non-Shekalim serialization cannot be guaranteed");
    const cacheAudit = await auditCachedPdfs(resultsDirectory, snapshots);
    const cachedPdfHashes = cacheAudit.hashes;
    const data = await readShasData({ resultsDirectory });
    const staged = await stageShekalimMigration({ data, checkpoint: JSON.parse(originalCheckpoint), existingExport,
      loadPdf: async (definition, amud, expectedHash) => (await getCachedPdf(definition, amud, { expectedHash, cacheOnly: true,
        cacheDirectory: join(resultsDirectory, "pdf-cache"), corpusDirectory: join(resultsDirectory, "pdfs"),
        fetcher: () => { throw new Error("Migration forbids source requests"); } })).bytes });
    backupDirectory = await mkdtemp(join(tmpdir(), `shekalim-frame-${new Date().toISOString().replaceAll(":", "-")}-`));
    const backupRelative = relative(resolve(workspaceDirectory), backupDirectory);
    assert.ok(backupRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(backupRelative), "Backup directory must be outside the workspace");
    const files = [
      { name: join(resultsDirectory, "shas-work", "shekalim.json"), original: originalCheckpoint, staged: Buffer.from(JSON.stringify(staged.checkpoint)), label: "shekalim.json" },
      { name: join(resultsDirectory, "shas-metrics.json"), original: originalExport, staged: Buffer.from(serialize(staged.output)), label: "shas-metrics.json" },
    ];
    for (const file of files) {
      await writeFile(join(backupDirectory, `original-${file.label}`), file.original, { flag: "wx", mode: 0o600 });
      await writeFile(join(backupDirectory, `staged-${file.label}`), file.staged, { flag: "wx", mode: 0o600 });
      assert.ok((await readFile(join(backupDirectory, `original-${file.label}`))).equals(file.original), "Backup verification failed");
      assert.ok((await readFile(join(backupDirectory, `staged-${file.label}`))).equals(file.staged), "Staging verification failed");
    }
    const report = { ...staged.report, backupDirectory, cachedPdfsHashChecked: Object.keys(cachedPdfHashes).length, cachedPdfHashes,
      cachedPdfsWithoutSavedFingerprint: cacheAudit.withoutSavedFingerprint,
      inputs: Object.fromEntries([...snapshots].map(([name, bytes]) => [name, fingerprint(bytes)])),
      files: files.map((file) => ({ name: file.name, before: fingerprint(file.original), after: fingerprint(file.staged) })),
      classificationPerformed: false, sourceRequests: 0, coverage: staged.output.coverage };
    await writeFile(join(backupDirectory, "validation.json"), serialize(report), { flag: "wx", mode: 0o600 });
    await replaceSavedFiles(files, { validateInputs: async () => {
      await requireNoMeasurementWriter();
      const current = await snapshotInputs(resultsDirectory);
      assert.deepEqual([...current.keys()], [...snapshots.keys()], "Saved input file inventory changed during staging");
      for (const [name, bytes] of snapshots) assert.ok(current.get(name).equals(bytes), `Saved input changed during staging: ${name}`);
      assert.deepEqual(await auditCachedPdfs(resultsDirectory, snapshots), cacheAudit, "PDF cache changed during staging");
    }, afterReplace: async () => {
      await writeFile(join(backupDirectory, "applied.json"), serialize({ applied: true, files: report.files }), { flag: "wx", mode: 0o600 });
    } });
    const { pdfHashes, cachedPdfHashes: omittedHashes, inputs, ...summary } = report;
    return { applied: true, ...summary };
  } catch (error) {
    error.message = `${error.message}${backupDirectory ? `; backups/staging: ${backupDirectory}` : ""}`;
    throw error;
  } finally {
    await lock.close();
    await rm(lockName, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 2, "Usage: node experiments/migrate-shekalim-frame.mjs (run at workspace root)");
    console.log(serialize(await migrateShekalimFrame()));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}