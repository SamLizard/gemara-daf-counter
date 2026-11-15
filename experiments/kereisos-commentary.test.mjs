import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findBottomTosafotBlock } from "./measure-corpus.mjs";
import { classifyKereisosPage, stageKereisos } from "./kereisos-commentary.mjs";
import { tractates } from "./shas-catalog.mjs";
import { shasDefinition } from "./shas-profiles.mjs";

const kereisos = tractates.find((tractate) => tractate.slug === "kereisos");
const spec = shasDefinition(kereisos).bottomTosafot;
const letters = "אבגדהוזחטיכלמנסעפצקרשת";
const prose = (seed, length) => {
  let state = seed;
  return Array.from({ length }, () => letters[(state = (state * 1103515245 + 12345) % 2147483648) % letters.length]).join("");
};
const tosafot = prose(7, 400), rashi = prose(11, 400);
const item = (str, height, x, y, width = 300) => ({ str, height, width, transform: [1, 0, 0, 1, x, y] });
const label = (y = 500) => item(spec.label, 9.84, 500.5, y, 23.3);
const body = (y, offset, text = tosafot) => item(text.slice(offset, offset + 40), 8.04, 150, y);
const page = (...blockItems) => [item("main", 12, 200, 900), ...blockItems, item("margin", 10.68, 540, 1150, 30)];
const references = { tosafot, rashi };

test("Keritot keeps the saved main-only profile and adds a separate full-page profile", () => {
  const mainOnly = shasDefinition(kereisos, { mainOnly: true });
  assert.deepEqual([mainOnly.mainSize, mainOnly.mainPitch, mainOnly.frameSizes, mainOnly.framePitch, mainOnly.bottomTosafot], [12, 10.44, [9.84, 8.04], 9.36, undefined]);
  const full = shasDefinition(kereisos);
  assert.deepEqual([full.mainSize, full.mainPitch, full.commentaryPitch, full.commentarySizes, full.frameSizes], [12, 10.44, 9.36, [9.84], undefined]);
  assert.deepEqual([spec.labelSize, spec.bodySize, spec.pitch, spec.sizes], [9.84, 8.04, 6.96, [9.84, 8.88, 8.04, 7.56]]);
  assert.equal(shasDefinition(tractates.find((tractate) => tractate.slug === "horayos")).bottomTosafot, undefined);
});

test("bottom Tosafot block is accepted only as a labelled, regularly pitched Tosafot block", () => {
  const items = page(label(), body(500, 0), body(493.04, 40), body(486.08, 80));
  const block = findBottomTosafotBlock(items, spec, references, "kereisos-x");
  assert.equal(block.rows.length, 3);
  assert.deepEqual(block.rows.map((row) => row.baseline), [500, 493.04, 486.08]);
  assert.ok(block.rows.every((row) => row.kind === "tosafot" && row.pitch === 6.96));
  assert.deepEqual(block.provenance.itemIndices, [1, 4]);
  assert.equal(block.match.kind, "tosafot");
});

test("bottom Tosafot block is absent without its label and refuses duplicated labels", () => {
  assert.equal(findBottomTosafotBlock(page(body(500, 0), body(493.04, 40)), spec, references, "kereisos-x"), null);
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0), label(400), body(400, 40)), spec, references, "kereisos-x"), /multiple bottom Tosafot labels/);
  assert.throws(() => findBottomTosafotBlock(page(label()), spec, references, "kereisos-x"), /without body text/);
});

test("bottom Tosafot block refuses irregular pitch, foreign text and stray items", () => {
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0), body(493.04, 40), body(484, 80)), spec, references, "kereisos-x"), /irregular pitch/);
  const foreign = page(label(), body(500, 0), body(493.04, 40), body(486.08, 80));
  foreign.push(item("גרשום", 5.76, 200, 490));
  assert.throws(() => findBottomTosafotBlock(foreign, spec, references, "kereisos-x"), /foreign text/);
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0), item("מ(", 7.56, 492, 496.5, 5), body(493.04, 40), body(486.08, 80)), spec, references, "kereisos-x"), /outside the body rows/);
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0), item("רחב", 8.04, 100, 493.04)), spec, references, "kereisos-x"), /leaves its band/);
});

test("bottom Tosafot block tolerates raised markers, symbols and adjacent text below it", () => {
  const items = page(label(), body(500, 0), item("מ(", 7.56, 492, 494.4, 5), body(493.04, 40), item("$", 8.88, 480, 486.08, 3), body(486.08, 80), body(479.12, 120));
  items.push(item("גרשום", 5.76, 200, 479.12 - 6.72));
  const block = findBottomTosafotBlock(items, spec, references, "kereisos-x");
  assert.deepEqual(block.rows.map((row) => row.baseline), [500, 493.04, 486.08, 479.12]);
  assert.equal(block.provenance.itemIndices[1], 7);
});

test("bottom Tosafot block text must be Tosafot, tolerating only isolated transcription variants", () => {
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0, rashi), body(493.04, 40, rashi), body(486.08, 80, rashi)), spec, references, "kereisos-x"), /not Wikisource Tosafot|ambiguous/);
  const variant = tosafot.slice(0, 13) + (tosafot[13] === "א" ? "ב" : "א") + tosafot.slice(14);
  const rows = [body(500, 0, variant), body(493.04, 40), body(486.08, 80), body(479.12, 120), body(472.16, 160)];
  assert.equal(findBottomTosafotBlock(page(label(), ...rows), spec, references, "kereisos-x").rows.length, 5);
  const damaged = prose(99, 40);
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0, damaged), body(493.04, 40), body(486.08, 80), body(479.12, 120)), spec, { tosafot, rashi }, "kereisos-x"), /not Wikisource Tosafot/);
  assert.throws(() => findBottomTosafotBlock(page(label(), body(500, 0)), spec, { rashi }, "kereisos-x"), /requires a Tosafot reference/);
});

test("Keritot rejects an unpinned Rashi source and the generic runner", async () => {
  await assert.rejects(classifyKereisosPage({ sefariaRashi: ["text"] }), /fingerprint required/);
  const command = spawnSync(process.execPath, ["experiments/measure-shas.mjs", "kereisos"], { encoding: "utf8" });
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /offline Keritot staging runner/);
});

test("staged Keritot runner refuses outputs inside results and PDFs with another fingerprint", async (context) => {
  await assert.rejects(stageKereisos({ outputDirectory: "results/stage", runId: "test" }), /outside the results directory/);
  await assert.rejects(stageKereisos({ outputDirectory: join(tmpdir(), "x") }), /explicit run ID/);
  try { await Promise.all([access("results/wikisource-cache/kereisos.json"), access("results/shas-work/kereisos.json")]); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Keritot cached fixtures unavailable"); return; } throw error; }
  const live = JSON.parse(await readFile("results/shas-work/kereisos.json", "utf8"));
  const pdf = `results/pdf-cache/kereisos-2a-${live.pages["2a"].page.sha256}.pdf`;
  try { await access(pdf); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Keritot cached PDF unavailable"); return; } throw error; }
  const root = await mkdtemp(join(tmpdir(), "kereisos-stage-test-"));
  const results = join(root, "results");
  await mkdir(join(results, "shas-work"), { recursive: true });
  await mkdir(join(results, "wikisource-cache"), { recursive: true });
  await mkdir(join(results, "pdfs"), { recursive: true });
  await copyFile("results/wikisource-cache/kereisos.json", join(results, "wikisource-cache", "kereisos.json"));
  await copyFile(pdf, join(results, "pdfs", "kereisos-2a.pdf"));
  live.pages["2a"].page.sha256 = "0".repeat(64);
  await writeFile(join(results, "shas-work", "kereisos.json"), JSON.stringify(live));
  const report = await stageKereisos({ resultsDirectory: results, outputDirectory: join(root, "stage"), runId: "test", selected: ["2a"] });
  assert.match(report.errors["2a"].error, /expected fingerprint/);
  const staged = JSON.parse(await readFile(join(root, "stage", "kereisos.json"), "utf8"));
  assert.deepEqual(staged.pages["2a"], live.pages["2a"]);
});

test("staged Keritot run recovers 7a commentary without touching the live checkpoint", async (context) => {
  try { await Promise.all([access("results/wikisource-cache/kereisos.json"), access("results/shas-work/kereisos.json")]); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Keritot cached fixtures unavailable"); return; } throw error; }
  const fingerprint = async () => createHash("sha256").update(await readFile("results/shas-work/kereisos.json")).digest("hex");
  const before = await fingerprint();
  const live = JSON.parse(await readFile("results/shas-work/kereisos.json", "utf8"));
  try { await access(`results/pdf-cache/kereisos-7a-${live.pages["7a"].page.sha256}.pdf`); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Keritot cached PDF unavailable"); return; } throw error; }
  const output = await mkdtemp(join(tmpdir(), "kereisos-stage-7a-"));
  const report = await stageKereisos({ outputDirectory: output, runId: "test-7a", selected: ["7a"] });
  assert.equal(await fingerprint(), before);
  assert.deepEqual(report.outcomes["7a"], { state: "resolved", rows: { main: 54, rashi: 76, tosafot: 16 }, bottomTosafotRows: 16, unknownCategories: [], confirmedAbsent: [], tosafotDecision: "present" });
  const staged = JSON.parse(await readFile(join(output, "kereisos.json"), "utf8"));
  assert.deepEqual(staged.pages["7a"].page.groups.main, live.pages["7a"].page.groups.main);
  assert.equal(staged.pages["7a"].page.sha256, live.pages["7a"].page.sha256);
  assert.deepEqual(staged.pages["7a"].previousClassification.page, live.pages["7a"].page);
  assert.deepEqual(staged.pages["7b"], live.pages["7b"]);
});
