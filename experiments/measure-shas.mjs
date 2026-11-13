import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifierVersion, loadMainTexts, loadTexts, processMainPage, processPage } from "./measure-corpus.mjs";
import { amudim, amudIndex, tractates } from "./shas-catalog.mjs";
import { readShasData, writeShasExport } from "./shas-export.mjs";
import { classifyWikisourceTosafot, loadWikisourcePages } from "./sotah-wikisource.mjs";

const args = process.argv.slice(2);
const limitArg = args.find((argument) => argument.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
if (!(limit > 0)) throw new Error("--limit must be a positive number");
const retry = args.includes("--retry-unresolved");
const recoverMain = args.includes("--recover-main");
const refreshMain = args.includes("--refresh-main");
const sotahWikisource = args.includes("--sotah-wikisource");
const allWikisource = args.includes("--wikisource");
const useWikisource = sotahWikisource || allWikisource;
const runIdArg = args.find((argument) => argument.startsWith("--run-id="));
const runId = allWikisource ? (runIdArg?.slice("--run-id=".length) || new Date().toISOString()) : null;
const specialMainReferences = ["shekalim", "kinim", "tamid", "middos"];
const requested = args.filter((argument) => !argument.startsWith("--"));
if (sotahWikisource && (requested.length !== 1 || requested[0] !== "sotah" || recoverMain)) throw new Error("--sotah-wikisource requires sotah and cannot be combined with --recover-main");
if (allWikisource && (sotahWikisource || recoverMain)) throw new Error("--wikisource cannot be combined with --sotah-wikisource or --recover-main");
for (const slug of requested) if (!tractates.some((tractate) => tractate.slug === slug)) throw new Error(`Unknown tractate: ${slug}`);
const selected = tractates.filter((tractate) => !requested.length || requested.includes(tractate.slug));
const workDirectory = join("results", "shas-work");
await mkdir(workDirectory, { recursive: true });
const initialData = allWikisource ? await readShasData() : {};
if (runId) console.log(`Wikisource run ID: ${runId}`);

async function save(work) {
  const target = join(workDirectory, `${work.slug}.json`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(work));
  await rename(temporary, target);
}

function checkOverlap(page) {
  const kinds = ["main", "rashi", "tosafot"];
  for (let first = 0; first < kinds.length; first++) for (let second = first + 1; second < kinds.length; second++) {
    for (const a of page.groups[kinds[first]]) for (const b of page.groups[kinds[second]]) {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.baseline + a.pitch / 2, b.baseline + b.pitch / 2) - Math.max(a.baseline - a.pitch / 2, b.baseline - b.pitch / 2);
      if (width > 0.1 && height > 0.1) throw new Error(`overlap between ${kinds[first]} and ${kinds[second]}`);
    }
  }
}

async function download(tractate, amud) {
  const match = /^(\d+)([ab])$/.exec(amud);
  const url = new URL("https://www.shas.org/daf-pdf/api/");
  url.search = new URLSearchParams({ masechta: tractate.sourceSlug, daf: match[1], amud: match[2] });
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Response is not a PDF");
  return bytes;
}

let attempted = 0;
let stop = false;
for (const tractate of selected) {
  if (!allWikisource && ["horayos", "rosh-hashanah"].includes(tractate.slug)) continue;
  const workFile = join(workDirectory, `${tractate.slug}.json`);
  let work;
  try {
    work = JSON.parse(await readFile(workFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    work = { slug: tractate.slug, pages: Object.fromEntries(Object.entries(initialData[tractate.slug] || {}).map(([amud, entry]) => [amud, { ...entry, classifierVersion }])) };
  }
  const wikiPages = useWikisource ? await loadWikisourcePages(tractate) : null;
  const todo = amudim(tractate).filter((amud) => allWikisource
    ? work.pages[amud]?.tosafotEvidence?.runId !== runId || work.pages[amud]?.tosafotEvidence?.state === "pending" || (retry && work.pages[amud]?.tosafotEvidence?.decision === "unknown")
    : sotahWikisource
    ? work.pages[amud]?.classifierVersion !== classifierVersion || work.pages[amud]?.tosafotEvidence?.version !== 2 || work.pages[amud]?.tosafotEvidence?.state !== "processed" || work.pages[amud]?.tosafotEvidence?.revision !== wikiPages[amud].revision || (retry && work.pages[amud]?.tosafotEvidence?.decision === "unknown")
    : recoverMain
    ? work.pages[amud]?.classifierVersion === classifierVersion && ((work.pages[amud]?.error && (specialMainReferences.includes(tractate.slug) || !work.pages[amud].error.startsWith("Commentary references unavailable:"))) || (refreshMain && work.pages[amud]?.recovery))
    : !work.pages[amud] || work.pages[amud].classifierVersion !== classifierVersion || (retry && (work.pages[amud].error || work.pages[amud].recovery)));
  if (!todo.length) continue;
  if (useWikisource) {
    for (const amud of todo) {
      const entry = work.pages[amud] || { classifierVersion };
      const reference = wikiPages[amud];
      entry.unknownCategories = [...new Set([...(entry.unknownCategories || []), "rashi", "tosafot"])];
      entry.confirmedAbsent = [];
      entry.tosafotEvidence = { version: 2, runId, state: "pending", title: reference.title, revision: reference.revision, source: reference.revision ? `https://he.wikisource.org/?oldid=${reference.revision}` : null, sourceStatus: reference.status, decision: "unknown", basis: null };
      work.pages[amud] = entry;
    }
    await save(work);
    await writeShasExport();
  }
  const mainOnly = recoverMain || (allWikisource && [...specialMainReferences, "kereisos"].includes(tractate.slug));
  let texts;
  try {
    texts = mainOnly ? await loadMainTexts(tractate) : await loadTexts(tractate, useWikisource ? { works: ["Rashi"] } : undefined);
  } catch (error) {
    if (!/HTTP 404/.test(error.message)) {
      console.error(`${tractate.slug}: reference download stopped: ${error.message}`);
      stop = true;
      break;
    }
    if (useWikisource) {
      for (const amud of todo) {
        work.pages[amud].tosafotEvidence.state = "error";
        work.pages[amud].lastClassificationError = `Reference unavailable: ${error.message}`;
      }
      await save(work);
      console.log(`${tractate.slug}: reference unavailable`);
      continue;
    }
    if (recoverMain) {
      console.log(`${tractate.slug}: main-text reference unavailable`);
      continue;
    }
    for (const amud of todo) {
      const reason = `Commentary references unavailable: ${error.message}`;
      if (work.pages[amud]?.recovery) work.pages[amud].lastClassificationError = reason;
      else work.pages[amud] = { classifierVersion, error: reason };
    }
    await save(work);
    console.log(`${tractate.slug}: commentary references unavailable`);
    continue;
  }
  for (const [amud, entry] of Object.entries(recoverMain || useWikisource ? {} : work.pages)) {
    if (!entry.page || !entry.unknownCategories?.length || entry.page.matches.length < 2) continue;
    const index = amudIndex(amud) - 2;
    const inferred = entry.unknownCategories.filter((kind) => !texts[kind][index]);
    entry.inferredAbsent = [...new Set([...(entry.inferredAbsent || []), ...inferred])];
    entry.unknownCategories = entry.unknownCategories.filter((kind) => !inferred.includes(kind));
  }
  const profile = tractate.slug === "meilah"
    ? { mainSize: 12.6, mainPitch: 10.32, commentaryPitch: 9.48, commentarySizes: [10.2, 9.96] }
    : mainOnly && tractate.slug === "shekalim"
    ? { mainSize: 11.4, mainPitch: 9.72, frameSizes: [7.68, 8.4, 8.64, 8.88, 9.12, 9.36], framePitch: 9 }
    : mainOnly && tractate.slug === "kinim"
    ? { mainSize: 12.6, mainPitch: 10.44, frameSizes: [10.68, 10.44], framePitch: 10 }
    : mainOnly && tractate.slug === "tamid"
    ? { mainSize: 13.44, mainPitch: 11.88, frameSizes: [10.68, 10.92], framePitch: 10.44 }
    : mainOnly && tractate.slug === "middos"
    ? { mainSize: 13.68, mainPitch: 11.88, frameSizes: [10.2, 9.96], framePitch: 9.48 }
    : mainOnly && tractate.slug === "kereisos"
    ? { mainSize: 12, mainPitch: 10.44, frameSizes: [9.84, 8.04], framePitch: 9.36 }
    : tractate.slug === "megillah"
    ? { mainSize: 12.96, mainPitch: 11.26, commentaryPitch: 9.94, commentarySizes: [10.14, 10.62], boldSizes: [10.86] }
    : tractate.slug === "avodah-zarah"
    ? { mainSize: 13.2, mainPitch: 11.88, commentaryPitch: 10.44 }
    : tractate.slug === "menachos"
    ? { mainSize: 11.65, mainPitch: 10.67, commentaryPitch: 9.42, commentarySizes: [9.64, 9.84], boldSizes: [8.05, 9.41, 10.74], adjacentBoldSizes: [9.41, 10.74] }
    : ["bechoros", "arachin", "temurah"].includes(tractate.slug)
    ? { mainSize: 13.44, mainPitch: tractate.slug === "arachin" ? 11.7 : 11.88, commentaryPitch: tractate.slug === "arachin" ? 10.2 : 10.44, commentarySizes: [10.92, 10.68], boldSizes: [8.4, 8.88, 11.88, 13.92, 14.4, 16.32], adjacentBoldSizes: [13.92, 14.4] }
    : tractate.slug === "horayos"
    ? { mainSize: 12.24, mainPitch: 10.66825, commentaryPitch: 8.69562, tosafotPitch: 6.72 }
    : { mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44 };
  const definition = { ...tractate, ...profile };
  for (let offset = 0; offset < todo.length && attempted < limit && !stop; offset += 4) {
    const batch = todo.slice(offset, offset + Math.min(4, limit - attempted));
    attempted += batch.length;
    await Promise.all(batch.map(async (amud) => {
      try {
        const index = amudIndex(amud) - 4;
        if (mainOnly) {
          const reference = texts.texts[texts.scope === "tractate" ? 0 : index + 2] || "";
          const page = await processMainPage(definition, index, reference, await download(tractate, amud));
          const tosafotEvidence = useWikisource ? { ...work.pages[amud].tosafotEvidence, state: "processed", basis: "main-only", pdfSha256: page.sha256 } : null;
          work.pages[amud] = { classifierVersion, page, unknownCategories: ["rashi", "tosafot"], inferredAbsent: [], recovery: { reason: work.pages[amud].error || work.pages[amud].recovery?.reason, mainMatch: { ...page.mainMatch, referenceScope: texts.scope, source: texts.source } }, ...(useWikisource ? { confirmedAbsent: [], tosafotEvidence } : {}) };
          return;
        }
        const references = { rashi: texts.rashi[index + 2] || "", tosafot: useWikisource ? wikiPages[amud].text : texts.tosafot[index + 2] || "" };
        const page = await processPage(definition, index, references, await download(tractate, amud));
        const tosafotEvidence = useWikisource ? { ...classifyWikisourceTosafot(tractate, amud, page, wikiPages[amud]), runId } : null;
        checkOverlap(page);
        const missing = ["rashi", "tosafot"].filter((kind) => useWikisource && kind === "tosafot" ? tosafotEvidence.decision === "unknown" : !page.groups[kind].length);
        const inferredAbsent = missing.filter((kind) => !references[kind] && page.matches.length >= 2);
        if (useWikisource && inferredAbsent.includes("tosafot")) inferredAbsent.splice(inferredAbsent.indexOf("tosafot"), 1);
        const unknownCategories = missing.filter((kind) => !inferredAbsent.includes(kind));
        const confirmedAbsent = tosafotEvidence?.decision === "absent" ? ["tosafot"] : [];
        work.pages[amud] = { classifierVersion, page, unknownCategories, inferredAbsent, ...(useWikisource ? { confirmedAbsent, tosafotEvidence } : {}) };
      } catch (error) {
        if (/PDF HTTP (403|429|5\d\d)/.test(error.message)) {
          stop = true;
        }
        if (useWikisource) {
          work.pages[amud].tosafotEvidence.state = "error";
          work.pages[amud].lastClassificationError = error.message;
        } else if (/PDF HTTP (403|429|5\d\d)/.test(error.message)) {
          return;
        } else if (recoverMain) {
          work.pages[amud].mainRecoveryError = error.message;
        } else if (work.pages[amud]?.recovery) {
          work.pages[amud].lastClassificationError = error.message;
        } else {
          work.pages[amud] = { classifierVersion, error: error.message };
        }
      }
    }));
    await save(work);
    const outcomes = Object.values(work.pages).filter((entry) => entry.classifierVersion === classifierVersion);
    if ((offset + batch.length) % 20 < batch.length || offset + batch.length === todo.length || attempted >= limit || stop) console.log(`${tractate.slug}: ${offset + batch.length}/${todo.length} attempted, ${outcomes.filter((entry) => entry.error || entry.tosafotEvidence?.state === "error").length} unresolved`);
  }
  await writeShasExport();
  if (attempted >= limit || stop) break;
}
const coverage = await writeShasExport();
console.log(JSON.stringify({ runId, attempted, stoppedForServer: stop, coverage }, null, 2));