import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { classifierVersion, nedarimAmudReferences, preserveRetryPage, processNedarimPage, reviewedNedarimMainAlignments } from "./measure-corpus.mjs";
import { replaceSavedFiles } from "./migrate-shekalim-frame.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";
import { buildShasExport, readShasData } from "./shas-export.mjs";
import { shasDefinition } from "./shas-profiles.mjs";

export const nedarimAuditVersion = 1;
const policy = "nedarim-marginal-tosafot-not-recognized-or-measured";
const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serialize = (value) => JSON.stringify(value, null, 2);
const keptEntryFields = ["classifierVersion", "page", "recovery", "lastClassificationError", "error", "mainRecoveryError"];
const commentaryEntryFields = ["confirmedAbsent", "unknownCategories", "inferredAbsent", "excludedCategories", "rashiEvidence", "tosafotEvidence", "commentaryRetry", "overlapRetry", "previousClassification"];
// Fields that only describe a failed or replaced classification; the recomputed entry keeps them in previousClassification.
const classificationFailureFields = ["recovery", "lastClassificationError", "error", "mainRecoveryError"];
const keptPageFields = ["name", "sha256", "view", "mainMatch"];
const commentaryPageFields = ["matches", "fragmentOwnership", "frameRows", "commentaryAttribution", "areas"];
const groupKinds = ["main", "rashi", "tosafot", "other"];
const units = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];

export function nedarimWikisourceTitle(amud) {
  const [, digits, side] = /^(\d+)([ab])$/.exec(amud);
  const daf = Number(digits);
  assert.ok(daf >= 2 && daf < 100, `${amud}: unsupported daf`);
  const numeral = daf === 15 ? "טו" : daf === 16 ? "טז" : `${tens[Math.floor(daf / 10)]}${units[daf % 10]}`;
  return `נדרים ${numeral} ${side === "a" ? "א" : "ב"}`;
}

export function nedarimAmudIndex(amud) {
  const [, digits, side] = /^(\d+)([ab])$/.exec(amud);
  return (Number(digits) - 2) * 2 + (side === "b" ? 1 : 0);
}

class Skip extends Error {}

function savedPins(entry) {
  const pdf = new Set(), revision = new Set();
  for (let current = entry; current; current = current.previousClassification) {
    for (const hash of [current.page?.sha256, current.rashiEvidence?.pdfSha256, current.tosafotEvidence?.pdfSha256]) if (hash) pdf.add(hash);
    // Whole-page revision ids only; no Tosafot text is read or compared.
    for (const value of [current.rashiEvidence?.revision, current.tosafotEvidence?.revision]) if (value != null) revision.add(value);
  }
  return { pdf: [...pdf], revision: [...revision] };
}

function withoutCommentary(amud, entry) {
  const unknown = Object.keys(entry).filter((key) => !keptEntryFields.includes(key) && !commentaryEntryFields.includes(key));
  assert.equal(unknown.length, 0, `${amud}: unrecognized saved fields ${unknown.join(", ")}`);
  const next = {};
  for (const key of keptEntryFields) if (Object.hasOwn(entry, key)) next[key] = structuredClone(entry[key]);
  if (entry.page) {
    const unknownPage = Object.keys(entry.page).filter((key) => key !== "groups" && !keptPageFields.includes(key) && !commentaryPageFields.includes(key));
    assert.equal(unknownPage.length, 0, `${amud}: unrecognized saved page fields ${unknownPage.join(", ")}`);
    const unknownGroups = Object.keys(entry.page.groups || {}).filter((key) => !groupKinds.includes(key));
    assert.equal(unknownGroups.length, 0, `${amud}: unrecognized saved groups ${unknownGroups.join(", ")}`);
    assert.ok(entry.page.groups.main?.length, `${amud}: measured page lacks main rows`);
    assert.equal(entry.page.name, `nedarim-${amud}`, `${amud}: mismatched measured page`);
    next.page = Object.fromEntries(keptPageFields.filter((key) => Object.hasOwn(entry.page, key)).map((key) => [key, structuredClone(entry.page[key])]));
    next.page.groups = { main: structuredClone(entry.page.groups.main), rashi: [], tosafot: [], other: [] };
  }
  return next;
}

function fallbackEntry(amud, entry, reason) {
  return { ...withoutCommentary(amud, entry), unknownCategories: ["rashi"], inferredAbsent: [], confirmedAbsent: [], excludedCategories: ["tosafot"],
    nedarimAudit: { version: nedarimAuditVersion, policy, outcome: "fallback", reason, rashi: "unknown", tosafot: "excluded" },
    previousClassification: structuredClone(entry) };
}

function wikisourcePage(wikiPages, amud) {
  const page = wikiPages?.[amud];
  if (!page) return null;
  if (page.title !== nedarimWikisourceTitle(amud) || page.revisions?.length !== 1 || !Number.isInteger(page.revisions[0]?.revid)) {
    throw new Skip(`cached Wikisource page for ${amud} has an unexpected title or revision list`);
  }
  return page;
}

async function recomputeEntry(amud, entry, { definition, expected, wikiPages, loadPdf, processPage, mainPins = reviewedNedarimMainAlignments }) {
  const review = entry.page ? null : mainPins[`nedarim-${amud}`];
  if (!entry.page && !review) throw new Skip("no previously measured page, so no pinned PDF fingerprint");
  const pins = savedPins(entry);
  if (review) {
    if (pins.pdf.some((hash) => hash !== review.pdfSha256)) throw new Skip("saved PDF fingerprint conflicts with the reviewed main pin");
    if (pins.revision.some((revision) => revision !== review.revision)) throw new Skip("saved Wikisource revision conflicts with the reviewed main pin");
    pins.pdf = [review.pdfSha256];
  }
  if (pins.pdf.length !== 1) throw new Skip(`conflicting saved PDF fingerprints (${pins.pdf.length})`);
  const position = expected.indexOf(amud);
  const selected = {};
  for (const name of [expected[position - 1], amud, expected[position + 1]].filter(Boolean)) {
    const page = wikisourcePage(wikiPages, name);
    if (!page) throw new Skip(`Wikisource cache lacks ${name === amud ? "current" : "adjacent"} amud ${name}`);
    selected[name] = page;
  }
  if (pins.revision.length > 1) throw new Skip(`conflicting saved Wikisource revisions ${pins.revision.join("/")}`);
  const revision = selected[amud].revisions[0].revid;
  if (pins.revision.length && pins.revision[0] !== revision) throw new Skip(`cached Wikisource revision ${revision} differs from saved ${pins.revision[0]}`);
  let bytes;
  try {
    bytes = await loadPdf(definition, amud, pins.pdf[0]);
  } catch (error) {
    throw new Skip(`pinned PDF unavailable offline: ${error.message}`);
  }
  if (fingerprint(bytes) !== pins.pdf[0]) throw new Skip("cached PDF differs from the saved fingerprint");
  let references;
  try {
    references = nedarimAmudReferences(selected, nedarimAmudIndex(amud));
  } catch (error) {
    throw new Skip(`Wikisource references unusable: ${error.message}`);
  }
  if (!references.main || !references.rashi || !references.ran) throw new Skip("Wikisource references unusable: current amud lacks main, attributed Rashi or Ran text");
  if (review && (references.revision !== review.revision || references.sha256.main !== review.mainSha256)) throw new Skip("Wikisource main differs from the reviewed main pin");
  const sources = [references, ...references.adjacent].map(({ title, revision: revid, contentSha256 }) => ({ title, revision: revid, contentSha256 }));
  const name = `nedarim-${amud}`;
  let page;
  try {
    page = await processPage(definition, nedarimAmudIndex(amud), references, bytes);
  } catch (error) {
    if (!review || error.code === "ERR_ASSERTION") throw error;
    // Only the main text is recovered; commentary stays unknown exactly as before.
    const mainPage = await processPage(definition, nedarimAmudIndex(amud), references, bytes, { mainOnly: true });
    if (mainPage.name !== name || mainPage.sha256 !== pins.pdf[0] || !mainPage.groups.main.length) throw new Skip("recovered main page identity differs");
    if (mainPage.groups.rashi.length || mainPage.groups.tosafot.length || mainPage.groups.other.length) throw new Skip("recovered main page carries commentary rows");
    const fallback = fallbackEntry(amud, entry, `classifier rejected: ${error.message}`);
    // Main-only failures are now superseded; they remain in previousClassification.
    delete fallback.error;
    delete fallback.mainRecoveryError;
    fallback.page = mainPage;
    fallback.nedarimAudit.mainRecovery = { basis: mainPage.mainMatch.basis || "main-glyph-fragments", pdfSha256: review.pdfSha256, revision: review.revision, mainSha256: review.mainSha256, sources };
    return { entry: fallback, outcome: "fallback" };
  }
  if (page.name !== name || page.sha256 !== pins.pdf[0]) throw new Skip("recomputed page identity differs");
  if (entry.page && JSON.stringify(page.groups.main) !== JSON.stringify(entry.page.groups.main)) throw new Skip("saved main rows were not exactly reproduced");
  if (!page.groups.main.length) throw new Skip("no main rows recomputed");
  if (!page.groups.rashi?.length) throw new Skip("no attributed Rashi rows recomputed");
  if (page.groups.tosafot?.length || page.frameRows || page.fragmentOwnership || page.commentaryAttribution?.tosafot !== null) {
    throw new Skip("recomputed page carries Tosafot or frame-only rows");
  }
  if (entry.page) {
    const candidate = { page: structuredClone(page) };
    preserveRetryPage({ page: { name: entry.page.name, sha256: pins.pdf[0], groups: { main: entry.page.groups.main, rashi: [], tosafot: [], other: [] } } }, candidate);
  }
  const next = withoutCommentary(amud, entry);
  for (const key of classificationFailureFields) delete next[key];
  return { entry: { ...next, page, unknownCategories: [], inferredAbsent: [], confirmedAbsent: [], excludedCategories: ["tosafot"],
    nedarimAudit: { version: nedarimAuditVersion, policy, outcome: "recomputed", reason: null, rashi: "measured", tosafot: "excluded",
      pdfSha256: pins.pdf[0], sources, ...(review ? { mainRecovery: { basis: page.mainMatch.basis || "main-glyph-fragments", pdfSha256: review.pdfSha256, revision: review.revision, mainSha256: review.mainSha256 } } : {}) },
    previousClassification: structuredClone(entry) }, outcome: "recomputed" };
}

export async function auditNedarimEntry(amud, entry, { recompute = true, retryUnknown = false, ...context } = {}) {
  let retryReason;
  if (entry.nedarimAudit && retryUnknown && recompute && entry.nedarimAudit.outcome === "fallback") {
    assert.equal(entry.nedarimAudit.version, nedarimAuditVersion, `${amud}: unknown audit version`);
    assert.ok(entry.previousClassification, `${amud}: fallback lacks its previous classification`);
    try {
      const result = await recomputeEntry(amud, structuredClone(entry.previousClassification), context);
      // A main-only recovery that is already saved is not new evidence.
      if (result.outcome === "recomputed" || !entry.page) {
        result.entry.nedarimAudit.retriedFallbackReason = entry.nedarimAudit.reason;
        return { entry: result.entry, outcome: result.outcome === "recomputed" ? "retry-recomputed" : "retry-main-recovered" };
      }
      retryReason = result.entry.nedarimAudit.reason;
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      retryReason = error instanceof Skip ? error.message : `classifier rejected: ${error.message}`;
    }
  }
  if (entry.nedarimAudit) {
    assert.equal(entry.nedarimAudit.version, nedarimAuditVersion, `${amud}: unknown audit version`);
    const updated = structuredClone(entry);
    for (const key of ["unknownCategories", "inferredAbsent", "confirmedAbsent"]) {
      if (updated[key]) updated[key] = updated[key].filter((kind) => kind !== "tosafot");
    }
    updated.excludedCategories = [...new Set([...(updated.excludedCategories || []), "tosafot"])];
    updated.nedarimAudit = { ...updated.nedarimAudit, policy, tosafot: "excluded" };
    return { entry: updated, outcome: "already-audited", ...(retryReason ? { retryReason } : {}) };
  }
  if (!recompute) return { entry: fallbackEntry(amud, entry, "recomputation disabled"), outcome: "fallback" };
  try {
    return await recomputeEntry(amud, entry, context);
  } catch (error) {
    if (error.code === "ERR_ASSERTION") throw error;
    const reason = error instanceof Skip ? error.message : `classifier rejected: ${error.message}`;
    return { entry: fallbackEntry(amud, entry, reason), outcome: "fallback" };
  }
}

function validateEntry(amud, original, staged, outcome, mainPins) {
  const before = original.nedarimAudit ? original.previousClassification : original;
  assert.deepEqual(staged.previousClassification, before, `${amud}: previous classification not preserved intact`);
  assert.equal(staged.classifierVersion, classifierVersion, `${amud}: stale classifier version`);
  const review = mainPins[`nedarim-${amud}`];
  if (!before.page && staged.page) {
    assert.ok(review && staged.page.sha256 === review.pdfSha256 && staged.nedarimAudit.mainRecovery?.pdfSha256 === review.pdfSha256
      && staged.page.groups.main.length, `${amud}: unpinned main recovery`);
    assert.equal(staged.page.groups.tosafot.length, 0, `${amud}: Tosafot rows retained`);
  } else {
    assert.equal(Boolean(staged.page), Boolean(before.page), `${amud}: measured page presence changed`);
  }
  if (outcome === "already-audited" && original.nedarimAudit) assert.equal(serialize(staged.page ?? null), serialize(original.page ?? null), `${amud}: audited page changed without a retry`);
  if (before.page) {
    assert.equal(JSON.stringify(staged.page.groups.main), JSON.stringify(before.page.groups.main), `${amud}: main rows changed`);
    assert.equal(staged.page.sha256, before.page.sha256, `${amud}: PDF fingerprint changed`);
    assert.equal(staged.page.groups.tosafot.length, 0, `${amud}: Tosafot rows retained`);
    assert.ok(!staged.page.frameRows && !staged.page.fragmentOwnership, `${amud}: legacy frame rows retained`);
  }
  assert.ok(staged.excludedCategories.includes("tosafot") && !staged.unknownCategories.includes("tosafot") && !staged.confirmedAbsent.includes("tosafot") && !staged.inferredAbsent.includes("tosafot"), `${amud}: invalid Tosafot exclusion`);
  assert.ok(!staged.confirmedAbsent.includes("rashi"), `${amud}: Rashi zero retained`);
  assert.ok(!staged.tosafotEvidence && !staged.rashiEvidence && !staged.commentaryRetry, `${amud}: legacy evidence retained outside history`);
  if (staged.nedarimAudit.outcome === "recomputed") assert.ok(staged.page.groups.rashi.length && !staged.unknownCategories.includes("rashi"), `${amud}: recomputed Rashi missing`);
  else assert.ok(staged.unknownCategories.includes("rashi") && (!staged.page || !staged.page.groups.rashi.length), `${amud}: unverified Rashi retained`);
}

const reasonGroup = (reason) => reason.replace(/nedarim-\d+[ab]: /g, "").replace(/ at [\d./, -]+$/, "").replace(/\d+(?:\.\d+)?/g, "#");

export async function stageNedarimAudit({ data, checkpoint, existingExport, wikiPages, loadPdf, recompute = true, retryUnknown = false, processPage = processNedarimPage, catalog = tractates,
  mainPins = reviewedNedarimMainAlignments }) {
  const book = catalog.find((entry) => entry.slug === "nedarim");
  assert.ok(book, "Catalog lacks Nedarim");
  const definition = shasDefinition(book);
  const expected = amudim(book);
  assert.equal(checkpoint.slug, "nedarim", "Wrong checkpoint slug");
  assert.deepEqual(Object.keys(checkpoint.pages).sort(), [...expected].sort(), "Checkpoint must contain exactly the expected Nedarim sides");
  assert.deepEqual(data.nedarim, checkpoint.pages, "Saved Nedarim entries were filtered or differ from loaded data");
  const stagedCheckpoint = structuredClone(checkpoint);
  const outcomes = {}, retryReasons = {};
  for (const amud of expected) {
    const original = checkpoint.pages[amud];
    assert.equal(original.classifierVersion, classifierVersion, `${amud}: stale classifier version`);
    const result = await auditNedarimEntry(amud, structuredClone(original), { recompute, retryUnknown, definition, expected, wikiPages, loadPdf, processPage, mainPins });
    validateEntry(amud, original, result.entry, result.outcome, mainPins);
    stagedCheckpoint.pages[amud] = result.entry;
    outcomes[amud] = result.outcome;
    if (result.retryReason) (retryReasons[reasonGroup(result.retryReason)] ||= []).push(amud);
  }
  const newlyMeasured = expected.filter((amud) => stagedCheckpoint.pages[amud].page && !checkpoint.pages[amud].page);
  assert.deepEqual({ ...stagedCheckpoint, pages: null }, { ...checkpoint, pages: null }, "Checkpoint metadata changed");
  const stagedData = { ...structuredClone(data), nedarim: structuredClone(stagedCheckpoint.pages) };
  const stagedExport = buildShasExport(catalog, stagedData);
  const oldBook = existingExport.tractates.find((entry) => entry.id === "nedarim");
  const newBook = stagedExport.tractates.find((entry) => entry.id === "nedarim");
  assert.ok(oldBook, "Existing export lacks Nedarim");
  assert.deepEqual(newBook.pages.map((page) => page.amud), oldBook.pages.map((page) => page.amud), "Export side order changed");
  for (const [index, page] of newBook.pages.entries()) {
    const saved = stagedCheckpoint.pages[page.amud];
    assert.equal(page.fractions?.tosafot, 0, `${page.amud}: exported Tosafot is not excluded as zero`);
    assert.ok(page.excludedCategories.includes("tosafot"), `${page.amud}: exclusion not exported`);
    assert.notEqual(page.fractions?.rashi, 0, `${page.amud}: exported Rashi zero`);
    if (oldBook.pages[index].fractions?.main != null) assert.ok(saved.page, `${page.amud}: previously measured main dropped`);
    if (saved.page) {
      const area = saved.page.groups.main.reduce((sum, row) => sum + (row.right - row.left) * row.pitch, 0);
      assert.equal(page.fractions.main, area / newBook.frame.area, `${page.amud}: main fraction not derived from the saved main rows`);
    }
  }
  assert.equal(newBook.coverage.measured, oldBook.coverage.measured + newlyMeasured.length, "Measured Nedarim side count changed beyond pinned main recoveries");
  const oldUnrelated = existingExport.tractates.filter((entry) => entry.id !== "nedarim");
  const newUnrelated = stagedExport.tractates.filter((entry) => entry.id !== "nedarim");
  assert.equal(serialize(newUnrelated), serialize(oldUnrelated), "Non-Nedarim tractate export bytes changed");
  assert.deepEqual({ ...stagedExport, tractates: [], coverage: null }, { ...existingExport, tractates: [], coverage: null }, "Export metadata outside Nedarim changed");
  const fallbacks = expected.filter((amud) => outcomes[amud] === "fallback");
  const reasons = {};
  for (const amud of fallbacks) (reasons[reasonGroup(stagedCheckpoint.pages[amud].nedarimAudit.reason)] ||= []).push(amud);
  return { checkpoint: stagedCheckpoint, output: stagedExport, report: {
    policy, sides: expected.length,
    recomputed: expected.filter((amud) => outcomes[amud] === "recomputed"),
    fallback: fallbacks.length, fallbackReasons: reasons,
    alreadyAudited: expected.filter((amud) => outcomes[amud] === "already-audited").length,
    ...(retryUnknown ? { retry: { attempted: expected.filter((amud) => checkpoint.pages[amud].nedarimAudit?.outcome === "fallback").length,
      recomputed: expected.filter((amud) => outcomes[amud] === "retry-recomputed"), mainRecovered: expected.filter((amud) => outcomes[amud] === "retry-main-recovered"),
      stillFallback: expected.filter((amud) => stagedCheckpoint.pages[amud].nedarimAudit.outcome === "fallback").length, reasons: retryReasons } } : {}),
    newlyMeasured,
    previousClassificationsPreserved: expected.length, mainRowsUnchanged: expected.filter((amud) => checkpoint.pages[amud].page).length,
    nonNedarimTractatesByteIdentical: newUnrelated.length,
    knownByCategory: { before: oldBook.coverage.knownByCategory, after: newBook.coverage.knownByCategory },
    zeroes: Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { before: oldBook.pages.filter((page) => page.fractions?.[kind] === 0).length,
      after: newBook.pages.filter((page) => page.fractions?.[kind] === 0).length }])),
    frame: { before: oldBook.frame, after: newBook.frame }, totals: { before: oldBook.totals, after: newBook.totals },
  } };
}

async function requireNoMeasurementWriter() {
  const { stdout } = await promisify(execFile)("ps", ["-axo", "pid=,command="]);
  const writers = stdout.split("\n").filter((line) => /(?:^|\s)(?:\S*\/)?node\s.*(?:measure-shas|measure-corpus|shas-export|migrate-shekalim-frame)\.mjs(?:\s|$)/.test(line));
  assert.equal(writers.length, 0, `Active measurement/export writer: ${writers.join("; ")}`);
}

async function snapshotInputs(resultsDirectory, includeWiki = false) {
  const work = (await readdir(join(resultsDirectory, "shas-work"))).filter((name) => name.endsWith(".json")).sort().map((name) => join("shas-work", name));
  const names = ["corpus-measurements.json", "shas-metrics.json", ...work, ...(includeWiki ? [join("wikisource-cache", "nedarim.json")] : [])];
  const entries = [];
  for (const name of names) {
    try {
      entries.push([name, await readFile(join(resultsDirectory, name))]);
    } catch (error) {
      if (error.code !== "ENOENT" || name !== "corpus-measurements.json") throw error;
    }
  }
  return new Map(entries);
}

export async function auditNedarim({ resultsDirectory = "results", workspaceDirectory = process.cwd(), apply = false, recompute = true, retryUnknown = false,
  catalog = tractates, processPage = processNedarimPage, checkWriters = requireNoMeasurementWriter, beforeReplace = async () => {} } = {}) {
  resultsDirectory = resolve(resultsDirectory);
  if (catalog === tractates) assert.equal(amudim(catalog.find((entry) => entry.slug === "nedarim")).length, 180, "Audit requires the 180 Nedarim sides");
  const lockName = join(resultsDirectory, "shas-work", "nedarim.json.audit.lock");
  const lock = apply ? await open(lockName, "wx") : null;
  let stagingDirectory;
  try {
    await checkWriters();
    let snapshots = await snapshotInputs(resultsDirectory);
    const initialCheckpoint = JSON.parse(snapshots.get(join("shas-work", "nedarim.json")));
    const includeWiki = recompute && Object.values(initialCheckpoint.pages).some((entry) => !entry.nedarimAudit || (retryUnknown && entry.nedarimAudit.outcome === "fallback"));
    if (includeWiki) snapshots = await snapshotInputs(resultsDirectory, true);
    const originalCheckpoint = snapshots.get(join("shas-work", "nedarim.json"));
    assert.ok(originalCheckpoint, "Saved Nedarim checkpoint missing");
    const checkpoint = JSON.parse(originalCheckpoint);
    assert.ok(originalCheckpoint.equals(Buffer.from(JSON.stringify(checkpoint))), "Nedarim checkpoint is not compact JSON; byte-safe rewrite cannot be guaranteed");
    const originalExport = snapshots.get("shas-metrics.json");
    const existingExport = JSON.parse(originalExport);
    assert.ok(originalExport.equals(Buffer.from(serialize(existingExport))), "Existing export is not canonical two-space JSON");
    const wikiPages = includeWiki ? JSON.parse(snapshots.get(join("wikisource-cache", "nedarim.json"))) : null;
    const data = await readShasData({ resultsDirectory });
    const loadPdf = async (definition, amud, expectedHash) => (await getCachedPdf(definition, amud, { expectedHash, cacheOnly: true,
      cacheDirectory: join(resultsDirectory, "pdf-cache"), corpusDirectory: join(resultsDirectory, "pdfs"),
      fetcher: () => { throw new Error("Nedarim audit forbids source requests"); } })).bytes;
    const staged = await stageNedarimAudit({ data, checkpoint, existingExport, wikiPages, loadPdf, recompute, retryUnknown, processPage, catalog });
    stagingDirectory = await mkdtemp(join(tmpdir(), `nedarim-audit-${new Date().toISOString().replaceAll(":", "-")}-`));
    const stagingRelative = relative(resolve(workspaceDirectory), stagingDirectory);
    assert.ok(stagingRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(stagingRelative), "Staging directory must be outside the workspace");
    const files = [
      { name: join(resultsDirectory, "shas-work", "nedarim.json"), original: originalCheckpoint, staged: Buffer.from(JSON.stringify(staged.checkpoint)), label: "nedarim.json" },
      { name: join(resultsDirectory, "shas-metrics.json"), original: originalExport, staged: Buffer.from(serialize(staged.output)), label: "shas-metrics.json" },
    ];
    for (const file of files) {
      await writeFile(join(stagingDirectory, `original-${file.label}`), file.original, { flag: "wx", mode: 0o600 });
      await writeFile(join(stagingDirectory, `staged-${file.label}`), file.staged, { flag: "wx", mode: 0o600 });
    }
    const unchanged = files.every((file) => file.original.equals(file.staged));
    const report = { ...staged.report, stagingDirectory, sourceRequests: 0, unchanged,
      inputs: Object.fromEntries([...snapshots].map(([name, bytes]) => [name, fingerprint(bytes)])),
      files: files.map((file) => ({ name: file.name, before: fingerprint(file.original), after: fingerprint(file.staged) })) };
    await writeFile(join(stagingDirectory, "validation.json"), serialize(report), { flag: "wx", mode: 0o600 });
    if (!apply || unchanged) return { applied: false, dryRun: !apply, ...report };
    await beforeReplace();
    await replaceSavedFiles(files, { validateInputs: async () => {
      await checkWriters();
      const current = await snapshotInputs(resultsDirectory, includeWiki);
      assert.deepEqual([...current.keys()], [...snapshots.keys()], "Saved input file inventory changed during staging");
      for (const [name, bytes] of snapshots) assert.ok(current.get(name).equals(bytes), `Saved input changed during staging: ${name}`);
    }, afterReplace: async () => {
      await writeFile(join(stagingDirectory, "applied.json"), serialize({ applied: true, files: report.files }), { flag: "wx", mode: 0o600 });
    } });
    return { applied: true, dryRun: false, ...report };
  } catch (error) {
    error.message = `${error.message}${stagingDirectory ? `; staging: ${stagingDirectory}` : ""}`;
    throw error;
  } finally {
    if (lock) {
      await lock.close();
      await rm(lockName, { force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const flags = process.argv.slice(2);
    assert.ok(flags.every((flag) => ["--apply", "--no-recompute", "--retry-unknown"].includes(flag)), "Usage: node experiments/nedarim-audit.mjs [--apply] [--no-recompute] [--retry-unknown] (run at workspace root; default is a dry run)");
    assert.ok(!(flags.includes("--retry-unknown") && flags.includes("--no-recompute")), "--retry-unknown requires recomputation");
    const { inputs, files, ...summary } = await auditNedarim({ apply: flags.includes("--apply"), recompute: !flags.includes("--no-recompute"), retryUnknown: flags.includes("--retry-unknown") });
    console.log(serialize({ ...summary, files }));
  } catch (error) {
    console.error(error.stack);
    process.exitCode = 1;
  }
}
