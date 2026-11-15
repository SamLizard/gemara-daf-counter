import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkOverlap, classifierVersion, classifyMissingCategories, loadTexts, preserveRetryPage, preserveRetryTosafot, processPage, verifyOverlapRetrySources } from "./measure-corpus.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { amudim, amudIndex, tractates } from "./shas-catalog.mjs";
import { buildShasExport } from "./shas-export.mjs";
import { shasDefinition } from "./shas-profiles.mjs";
import { applyWikisourceAbsence, applyWikisourceRashiAbsence, classifyWikisourceTosafot, loadWikisourcePages } from "./sotah-wikisource.mjs";

export async function loadLocalSefariaRashi(tractate, file, expectedSha256) {
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("Local Sefaria Rashi export fingerprint mismatch");
  return (await loadTexts(shasDefinition(tractate), { works: ["Rashi"], fetcher: async () => ({ ok: true, json: async () => JSON.parse(bytes.toString("utf8")) }) })).rashi;
}

export function kereisosReferences(wikiPages, amud, next, sefariaRashi = null) {
  const current = wikiPages[amud];
  return {
    rashi: sefariaRashi ? sefariaRashi[amudIndex(amud) - 2] : current?.commentarySources?.rashi?.text, tosafot: current?.text, main: current?.mainText || undefined, nextMain: wikiPages[next]?.mainText || undefined,
    commentarySources: Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: current?.commentarySources?.[kind], next: wikiPages[next]?.commentarySources?.[kind] }])),
  };
}

export async function classifyKereisosPage({ tractate, amud, entry, wikiPages, runId, pdfBytes, sefariaRashi = null, sefariaRashiSha256 = null }) {
  if (sefariaRashi && !/^[a-f0-9]{64}$/.test(sefariaRashiSha256 || "")) throw new Error("Sefaria Rashi fingerprint required");
  if (!entry?.page?.sha256) throw new Error(`${amud}: saved PDF fingerprint unavailable`);
  const pages = amudim(tractate);
  const next = pages[pages.indexOf(amud) + 1];
  const references = kereisosReferences(wikiPages, amud, next, sefariaRashi);
  if (typeof references.rashi !== "string" || !references.rashi) throw new Error(`${amud}: ${sefariaRashi ? "Sefaria" : "Wikisource"} Rashi text unavailable`);
  const page = await processPage(shasDefinition(tractate), amudIndex(amud) - 4, references, pdfBytes);
  verifyOverlapRetrySources(entry, page, wikiPages[amud], wikiPages[next]);
  const tosafotEvidence = { ...classifyWikisourceTosafot(tractate, amud, page, wikiPages[amud]), runId };
  checkOverlap(page);
  const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, references, { useWikisource: true, tosafotEvidence });
  const confirmedAbsent = tosafotEvidence.decision === "absent" ? ["tosafot"] : [];
  preserveRetryTosafot(entry, page, tosafotEvidence, unknownCategories, confirmedAbsent, runId);
  const result = { classifierVersion, page, unknownCategories, inferredAbsent, confirmedAbsent, tosafotEvidence };
  if (page.fragmentOwnership?.some((fragment) => !fragment.commentary)) result.mainFragmentEvidence = { revision: wikiPages[amud].revision, source: `https://he.wikisource.org/?oldid=${wikiPages[amud].revision}`,
    nextAmud: next, nextRevision: wikiPages[next]?.revision || null, nextSource: wikiPages[next]?.revision ? `https://he.wikisource.org/?oldid=${wikiPages[next].revision}` : null };
  if (tosafotEvidence.decision === "unknown") applyWikisourceAbsence(result, wikiPages[amud]);
  applyWikisourceRashiAbsence(result, wikiPages[amud]);
  result.commentaryRetry = { runId, state: "resolved", basis: `staged-kereisos-full-profile-${sefariaRashi ? "sefaria" : "wikisource"}-rashi-wikisource-tosafot`,
    ...(sefariaRashi ? { rashiSource: "https://github.com/Sefaria/Sefaria-Export-Archive/tree/3f1013631fdfe452e953a93a2c5f921319e394ed", rashiSourceSha256: sefariaRashiSha256 } : {}) };
  preserveRetryPage(entry, result);
  return result;
}

function summary(book) {
  return { status: book.status, coverage: book.coverage, frame: book.frame && { left: book.frame.left, right: book.frame.right, top: book.frame.top, bottom: book.frame.bottom, area: book.frame.area, referenceBasis: book.frame.referenceBasis },
    totals: book.totals, pages: Object.fromEntries(book.pages.map((page) => [page.amud, { method: page.method, status: page.status, fractions: page.fractions, unknownCategories: page.unknownCategories }])) };
}

export async function stageKereisos({ resultsDirectory = "results", outputDirectory, runId, selected = null, sefariaRashiFile = null, sefariaRashiSha256 = null } = {}) {
  if (!runId?.trim()) throw new Error("An explicit run ID is required");
  const output = resolve(outputDirectory || "");
  if (!outputDirectory || !relative(resolve(resultsDirectory), output).startsWith("..")) throw new Error("The staged output directory must be outside the results directory");
  const tractate = tractates.find((entry) => entry.slug === "kereisos");
  const work = JSON.parse(await readFile(join(resultsDirectory, "shas-work", "kereisos.json"), "utf8"));
  const original = JSON.stringify(work);
  const wikiPages = await loadWikisourcePages(tractate, { cacheDirectory: join(resultsDirectory, "wikisource-cache"), cacheOnly: true });
  const sefariaRashi = sefariaRashiFile ? await loadLocalSefariaRashi(tractate, sefariaRashiFile, sefariaRashiSha256) : null;
  const staged = structuredClone(work);
  const outcomes = {};
  for (const amud of amudim(tractate).filter((candidate) => !selected || selected.includes(candidate))) {
    const entry = work.pages[amud];
    try {
      const { bytes } = await getCachedPdf(tractate, amud, { expectedHash: entry?.page?.sha256, cacheDirectory: join(resultsDirectory, "pdf-cache"), corpusDirectory: join(resultsDirectory, "pdfs"), cacheOnly: true });
      const result = await classifyKereisosPage({ tractate, amud, entry: structuredClone(entry), wikiPages, runId, pdfBytes: bytes, sefariaRashi, sefariaRashiSha256 });
      staged.pages[amud] = result;
      outcomes[amud] = { state: "resolved", rows: Object.fromEntries(["main", "rashi", "tosafot"].map((kind) => [kind, result.page.groups[kind].length])),
        bottomTosafotRows: result.page.bottomTosafotBlocks?.[0]?.rows || 0, unknownCategories: result.unknownCategories, confirmedAbsent: result.confirmedAbsent, tosafotDecision: result.tosafotEvidence.decision };
    } catch (error) {
      outcomes[amud] = { state: "error", error: error.message };
    }
  }
  if (JSON.stringify(work) !== original) throw new Error("The saved checkpoint was modified in memory");
  const before = buildShasExport([tractate], { kereisos: work.pages }).tractates[0];
  const after = buildShasExport([tractate], { kereisos: staged.pages }).tractates[0];
  const report = { runId, inputs: { checkpoint: join(resultsDirectory, "shas-work", "kereisos.json"), wikisource: "cache-only", pdfs: "cache-only, saved sha256",
    rashi: sefariaRashi ? { source: "pinned Sefaria archive export (local copy)", sha256: sefariaRashiSha256 } : "wikisource cache" },
    resolved: Object.keys(outcomes).filter((amud) => outcomes[amud].state === "resolved"), errors: Object.fromEntries(Object.entries(outcomes).filter(([, outcome]) => outcome.state === "error")),
    outcomes, before: summary(before), after: summary(after) };
  await mkdir(output, { recursive: true });
  for (const [file, value] of [["kereisos.json", staged], ["report.json", report]]) {
    const target = join(output, file);
    await writeFile(`${target}.tmp`, JSON.stringify(value, null, file === "report.json" ? 2 : 0), { flag: "w" });
    await rename(`${target}.tmp`, target);
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const report = await stageKereisos({ outputDirectory: option("output"), runId: option("run-id"), selected: option("amudim")?.split(",") || null,
    sefariaRashiFile: option("sefaria-rashi") || null, sefariaRashiSha256: option("sefaria-rashi-sha256") || null });
  console.log(JSON.stringify({ resolved: report.resolved.length, errors: report.errors }, null, 2));
}
