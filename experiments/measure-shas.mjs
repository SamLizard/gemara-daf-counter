import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyReviewedGittin76bEvidence, checkOverlap, classifierVersion, classifyHorayotTosafot, classifyMissingCategories, isAmbiguousRetryCandidate, isCommentaryRetryCandidate, isLegacyCommentaryAuditCandidate, isOverlapRetryCandidate, loadMainTexts, loadTexts, preserveRetryPage, preserveRetryTosafot, processMainPage, processPage, verifyOverlapRetrySources } from "./measure-corpus.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { amudim, amudIndex, tractates } from "./shas-catalog.mjs";
import { readShasData, writeShasExport } from "./shas-export.mjs";
import { shasDefinition } from "./shas-profiles.mjs";
import { applyWikisourceAbsence, applyWikisourceRashiAbsence, classifyWikisourceTosafot, loadWikisourcePages, needsWikisourceAbsence, needsWikisourceRashiAbsence } from "./sotah-wikisource.mjs";

const args = process.argv.slice(2);
if (args.includes("--confirm-yerushalmi-absence")) {
  if (args.length !== 2 || !args.includes("shekalim")) throw new Error("--confirm-yerushalmi-absence requires only shekalim; no measurement or source-fetch flags are allowed");
  const { saveShekalimAbsence } = await import("./shekalim-absence.mjs");
  const confirmation = await saveShekalimAbsence();
  const coverage = confirmation.changed.length ? await writeShasExport() : null;
  console.log(JSON.stringify({ ...confirmation, coverage }, null, 2));
  if (confirmation.conflicts.length) process.exitCode = 1;
  process.exit(process.exitCode || 0);
}
const limitArg = args.find((argument) => argument.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
if (!(limit > 0)) throw new Error("--limit must be a positive number");
const retry = args.includes("--retry-unresolved");
const retryOverlaps = args.includes("--retry-overlaps");
const retryCommentary = args.includes("--retry-commentary");
const retryAmbiguous = args.includes("--retry-ambiguous");
const includeClassified = args.includes("--include-classified");
const recoverMain = args.includes("--recover-main");
const refreshMain = args.includes("--refresh-main");
const sotahWikisource = args.includes("--sotah-wikisource");
const allWikisource = args.includes("--wikisource");
const recheckAbsences = args.includes("--recheck-absences");
const recheckRashiAbsences = args.includes("--recheck-rashi-absences");
const recheckingAbsences = recheckAbsences || recheckRashiAbsences;
const refreshWikisource = args.includes("--refresh-wikisource");
const cachedPdfsOnly = args.includes("--cached-pdfs-only");
const amudsArg = args.find((argument) => argument.startsWith("--amudim="));
const selectedAmudim = amudsArg?.slice("--amudim=".length).split(",");
const useWikisource = sotahWikisource || allWikisource;
const runIdArg = args.find((argument) => argument.startsWith("--run-id="));
const runId = allWikisource ? (runIdArg?.slice("--run-id=".length) || new Date().toISOString()) : null;
const specialMainReferences = ["shekalim", "kinim", "tamid", "middos"];
const requested = args.filter((argument) => !argument.startsWith("--"));
if (requested.includes("nedarim")) throw new Error("Nedarim requires the offline Nedarim audit; the generic runner does not respect its marginal Tosafot exclusion");
if (requested.includes("kereisos")) throw new Error("Keritot requires the offline Keritot staging runner; the generic runner uses a main-only profile");
if (sotahWikisource && (requested.length !== 1 || requested[0] !== "sotah" || recoverMain)) throw new Error("--sotah-wikisource requires sotah and cannot be combined with --recover-main");
if (allWikisource && (sotahWikisource || recoverMain)) throw new Error("--wikisource cannot be combined with --sotah-wikisource or --recover-main");
if ((recheckingAbsences && (useWikisource || recoverMain)) || (recheckAbsences && recheckRashiAbsences)) throw new Error("Absence rechecks cannot be combined with measurement modes or each other");
if (retryOverlaps && (!allWikisource || retry)) throw new Error("--retry-overlaps requires --wikisource and cannot be combined with --retry-unresolved");
if (retryCommentary && (!allWikisource || retryOverlaps || retry || recheckAbsences || requested.length !== 1 || !Number.isInteger(limit) || !Number.isFinite(limit) || !runIdArg?.slice("--run-id=".length).trim())) throw new Error("--retry-commentary requires --wikisource, one tractate, a finite integer --limit, and an explicit --run-id; it cannot be combined with other retry modes");
if (includeClassified && (!retryCommentary || !["bava-basra", "pesachim"].includes(requested[0]))) throw new Error("--include-classified requires --retry-commentary for bava-basra or pesachim");
if (selectedAmudim && (!(retryCommentary || retryOverlaps) || requested.length !== 1
  || !selectedAmudim.length || selectedAmudim.some((amud) => !amudim(tractates.find((tractate) => tractate.slug === requested[0]) || {}).includes(amud)))) throw new Error("--amudim requires a protected retry and valid pages in one tractate");
if (retryAmbiguous && (!allWikisource || !cachedPdfsOnly || retryOverlaps || retryCommentary || retry || recheckAbsences || requested.length !== 1 || requested[0] !== "eruvin" || !Number.isInteger(limit) || !Number.isFinite(limit) || !runIdArg?.slice("--run-id=".length).trim())) throw new Error("--retry-ambiguous requires --wikisource --cached-pdfs-only eruvin, a finite integer --limit, and an explicit --run-id; it cannot be combined with other retry modes");
for (const slug of requested) if (!tractates.some((tractate) => tractate.slug === slug)) throw new Error(`Unknown tractate: ${slug}`);
const selected = tractates.filter((tractate) => !["nedarim", "kereisos"].includes(tractate.slug) && (!requested.length || requested.includes(tractate.slug)));
if (!requested.length) console.log("Nedarim and Keritot skipped: use their offline staging runners");
const workDirectory = join("results", "shas-work");
const wikiOptions = { cacheDirectory: join("results", "wikisource-cache"), refresh: refreshWikisource, requestDelay: 5000, cacheOnly: args.includes("--cached-wikisource-only") };
await mkdir(workDirectory, { recursive: true });
const initialData = allWikisource ? await readShasData() : {};
if (runId) console.log(`Shas run ID: ${runId}`);

async function save(work) {
  const target = join(workDirectory, `${work.slug}.json`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(work));
  await rename(temporary, target);
}

async function download(tractate, amud, entry) {
  const expectedHash = entry?.page?.sha256 || entry?.tosafotEvidence?.pdfSha256 || entry?.rashiEvidence?.pdfSha256;
  return (await getCachedPdf(tractate, amud, { expectedHash, cacheOnly: cachedPdfsOnly })).bytes;
}

let attempted = 0;
let stop = false;
let sourceZeroes = 0;
let unavailable = 0;
for (const tractate of selected) {
  if (!allWikisource && !recheckingAbsences && ["horayos", "rosh-hashanah"].includes(tractate.slug)) continue;
  const workFile = join(workDirectory, `${tractate.slug}.json`);
  let work;
  try {
    work = JSON.parse(await readFile(workFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    work = { slug: tractate.slug, pages: Object.fromEntries(Object.entries(initialData[tractate.slug] || {}).map(([amud, entry]) => [amud, { ...entry, classifierVersion }])) };
  }
  if (recheckingAbsences) {
    const candidates = amudim(tractate).filter((amud) => {
      const entry = work.pages[amud];
      return recheckRashiAbsences ? needsWikisourceRashiAbsence(entry) : tractate.slug !== "horayos" && needsWikisourceAbsence(entry);
    }).slice(0, limit - attempted);
    if (!candidates.length) continue;
    try {
      const wikiPages = await loadWikisourcePages(tractate, { ...wikiOptions, selectedAmudim: candidates });
      let updated = 0;
      for (const amud of candidates) {
        const entry = work.pages[amud];
        const reference = wikiPages[amud];
        if (recheckRashiAbsences ? applyWikisourceRashiAbsence(entry, reference) : applyWikisourceAbsence(entry, reference)) updated++;
      }
      attempted += candidates.length;
      sourceZeroes += updated;
      await save(work);
      await writeShasExport();
      console.log(`${tractate.slug}: ${candidates.length} checked, ${updated} new zeroes`);
    } catch (error) {
      unavailable++;
      console.error(`${tractate.slug}: absence check unavailable: ${error.message}`);
      if (error.status === 403 || error.status === 429 || error.status >= 500) {
        stop = true;
        break;
      }
    }
    if (attempted >= limit) break;
    continue;
  }
  const horayotSefaria = allWikisource && tractate.slug === "horayos";
  const usePageWikisource = useWikisource && !horayotSefaria;
  const protectedRetry = retryOverlaps || retryCommentary || retryAmbiguous;
  const retryTodo = protectedRetry ? amudim(tractate).filter((amud) => (!selectedAmudim || selectedAmudim.includes(amud)) && (retryCommentary ? isCommentaryRetryCandidate(work.pages[amud], runId) || (includeClassified && amudIndex(amud) >= amudIndex(tractate.slug === "pesachim" ? "99b" : "29a") && isLegacyCommentaryAuditCandidate(work.pages[amud], runId)) : retryAmbiguous ? isAmbiguousRetryCandidate(work.pages[amud], runId) : isOverlapRetryCandidate(work.pages[amud], runId))).slice(0, limit - attempted) : null;
  if (protectedRetry && !retryTodo.length) continue;
  const nextAmud = (amud) => amudim(tractate)[amudim(tractate).indexOf(amud) + 1];
  const mainOnly = recoverMain || (allWikisource && [...specialMainReferences, "kereisos"].includes(tractate.slug));
  const wikiTodo = protectedRetry && !mainOnly ? [...new Set([...retryTodo, ...retryTodo.map(nextAmud).filter(Boolean)])] : retryTodo;
  const wikiPages = usePageWikisource ? await loadWikisourcePages(tractate, { ...wikiOptions, ...(protectedRetry ? { selectedAmudim: wikiTodo } : {}) }) : null;
  const todo = protectedRetry ? retryTodo : amudim(tractate).filter((amud) => allWikisource
    ? work.pages[amud]?.tosafotEvidence?.runId !== runId || work.pages[amud]?.tosafotEvidence?.state === "pending" || (retry && work.pages[amud]?.tosafotEvidence?.decision === "unknown")
    : sotahWikisource
    ? work.pages[amud]?.classifierVersion !== classifierVersion || work.pages[amud]?.tosafotEvidence?.version !== 2 || work.pages[amud]?.tosafotEvidence?.state !== "processed" || work.pages[amud]?.tosafotEvidence?.revision !== wikiPages[amud].revision || (retry && work.pages[amud]?.tosafotEvidence?.decision === "unknown")
    : recoverMain
    ? work.pages[amud]?.classifierVersion === classifierVersion && ((work.pages[amud]?.error && (specialMainReferences.includes(tractate.slug) || !work.pages[amud].error.startsWith("Commentary references unavailable:"))) || (refreshMain && work.pages[amud]?.recovery))
    : !work.pages[amud] || work.pages[amud].classifierVersion !== classifierVersion || (retry && (work.pages[amud].error || work.pages[amud].recovery)));
  if (!todo.length) continue;
  if (useWikisource && !protectedRetry) {
    for (const amud of todo) {
      const entry = work.pages[amud] || { classifierVersion };
      if (entry.confirmedAbsent?.length) continue;
      const reference = wikiPages?.[amud];
      entry.unknownCategories = [...new Set([...(entry.unknownCategories || []), "rashi", "tosafot"])];
      entry.confirmedAbsent = [];
      entry.tosafotEvidence = { version: 2, runId, state: "pending", sourceType: horayotSefaria ? "sefaria" : "wikisource", title: reference?.title || null, revision: reference?.revision || null, source: reference?.revision ? `https://he.wikisource.org/?oldid=${reference.revision}` : null, sourceStatus: reference?.status || "unknown", decision: "unknown", basis: null };
      work.pages[amud] = entry;
    }
    await save(work);
    await writeShasExport();
  }
  let texts;
  try {
    const gittin76bRetry = retryCommentary && tractate.slug === "gittin" && selectedAmudim?.length === 1 && selectedAmudim[0] === "76b";
    const works = [...(usePageWikisource && !gittin76bRetry ? ["Rashi"] : ["Rashi", "Tosafot"]), ...(["bava-basra", "pesachim"].includes(tractate.slug) ? ["Rashbam"] : [])];
    texts = mainOnly ? await loadMainTexts(tractate) : await loadTexts(tractate, { works });
  } catch (error) {
    if (!/HTTP 404/.test(error.message)) {
      console.error(`${tractate.slug}: reference download stopped: ${error.message}`);
      stop = true;
      break;
    }
    if (useWikisource) {
      if (protectedRetry) {
        console.log(`${tractate.slug}: retry reference unavailable: ${error.message}`);
        continue;
      }
      for (const amud of todo) {
        if (work.pages[amud].confirmedAbsent?.length) {
          work.pages[amud].lastClassificationError = `Reference unavailable: ${error.message}`;
          continue;
        }
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
      if (work.pages[amud]?.recovery || work.pages[amud]?.confirmedAbsent?.length) work.pages[amud].lastClassificationError = reason;
      else work.pages[amud] = { classifierVersion, error: reason };
    }
    await save(work);
    console.log(`${tractate.slug}: commentary references unavailable`);
    continue;
  }
  const definition = shasDefinition(tractate, { mainOnly });
  for (let offset = 0; offset < todo.length && attempted < limit && !stop; offset += 4) {
    const batch = todo.slice(offset, offset + Math.min(4, limit - attempted));
    attempted += batch.length;
    await Promise.all(batch.map(async (amud) => {
      const safeguardPrevious = protectedRetry || Boolean(work.pages[amud]?.confirmedAbsent?.length);
      try {
        const index = amudIndex(amud) - 4;
        if (mainOnly) {
          const reference = texts.texts[texts.scope === "tractate" ? 0 : index + 2] || "";
          const page = await processMainPage(definition, index, reference, await download(tractate, amud, safeguardPrevious ? work.pages[amud] : null));
          if (safeguardPrevious) verifyOverlapRetrySources(work.pages[amud], page, wikiPages?.[amud]);
          const tosafotEvidence = useWikisource ? { ...work.pages[amud].tosafotEvidence, state: "processed", basis: "main-only", pdfSha256: page.sha256 } : null;
          const next = { classifierVersion, page, unknownCategories: ["rashi", "tosafot"], inferredAbsent: [], recovery: { reason: work.pages[amud].error || work.pages[amud].recovery?.reason, mainMatch: { ...page.mainMatch, referenceScope: texts.scope, source: texts.source } }, ...(useWikisource ? { confirmedAbsent: [], tosafotEvidence } : {}) };
          if (safeguardPrevious && useWikisource) preserveRetryTosafot(work.pages[amud], page, tosafotEvidence, next.unknownCategories, next.confirmedAbsent, runId);
          if (usePageWikisource) {
            applyWikisourceAbsence(next, wikiPages[amud]);
            applyWikisourceRashiAbsence(next, wikiPages[amud]);
          }
          if (retryOverlaps) next.overlapRetry = { runId, state: "resolved" };
          if (retryCommentary || retryAmbiguous) next.commentaryRetry = { runId, state: "resolved" };
          if (safeguardPrevious) preserveRetryPage(work.pages[amud], next);
          work.pages[amud] = next;
          return;
        }
        const references = { rashi: texts.rashi[index + 2], tosafot: usePageWikisource ? wikiPages[amud].text : texts.tosafot[index + 2], other: texts.rashbam?.[index + 2], otherSource: texts.rashbam ? "Rashbam" : undefined };
        if (retryCommentary && tractate.slug === "gittin" && selectedAmudim?.length === 1 && selectedAmudim[0] === "76b" && amud === "76b") {
          references.sefariaTosafot = texts.tosafot[index + 2];
          if (typeof references.sefariaTosafot !== "string") throw new Error("gittin-76b: pinned Sefaria Tosafot is unavailable");
        }
        if (usePageWikisource) references.commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, {
          current: wikiPages[amud]?.commentarySources?.[kind], next: wikiPages[nextAmud(amud)]?.commentarySources?.[kind],
        }]));
        if (tractate.slug === "arachin" && protectedRetry && wikiPages) Object.assign(references, { main: wikiPages[amud].mainText, nextMain: wikiPages[nextAmud(amud)]?.mainText });
        const page = await processPage(definition, index, references, await download(tractate, amud, safeguardPrevious ? work.pages[amud] : null));
        if (safeguardPrevious) verifyOverlapRetrySources(work.pages[amud], page, wikiPages?.[amud], wikiPages?.[nextAmud(amud)]);
        const tosafotEvidence = useWikisource ? { ...applyReviewedGittin76bEvidence(page, horayotSefaria ? classifyHorayotTosafot(amud, page, references.tosafot) : classifyWikisourceTosafot(tractate, amud, page, wikiPages[amud])), runId } : null;
        checkOverlap(page);
        const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, references, { useWikisource, tosafotEvidence });
        const confirmedAbsent = tosafotEvidence?.decision === "absent" ? ["tosafot"] : [];
        if (safeguardPrevious) preserveRetryTosafot(work.pages[amud], page, tosafotEvidence, unknownCategories, confirmedAbsent, runId);
        const next = { classifierVersion, page, unknownCategories, inferredAbsent, ...(useWikisource ? { confirmedAbsent, tosafotEvidence } : {}) };
        if (usePageWikisource && page.fragmentOwnership?.some((fragment) => !fragment.commentary)) next.mainFragmentEvidence = { revision: wikiPages[amud].revision, source: `https://he.wikisource.org/?oldid=${wikiPages[amud].revision}`,
          nextAmud: nextAmud(amud), nextRevision: wikiPages[nextAmud(amud)]?.revision || null,
          nextSource: wikiPages[nextAmud(amud)]?.revision ? `https://he.wikisource.org/?oldid=${wikiPages[nextAmud(amud)].revision}` : null };
        if (usePageWikisource) {
          if (tosafotEvidence.decision === "unknown") applyWikisourceAbsence(next, wikiPages[amud]);
          applyWikisourceRashiAbsence(next, wikiPages[amud]);
        }
        if (retryOverlaps) next.overlapRetry = { runId, state: "resolved" };
        if (retryCommentary || retryAmbiguous) next.commentaryRetry = { runId, state: "resolved" };
        if (safeguardPrevious) preserveRetryPage(work.pages[amud], next);
        work.pages[amud] = next;
      } catch (error) {
        const serverFailure = /PDF HTTP (403|429|5\d\d)/.test(error.message);
        if (serverFailure) {
          stop = true;
        }
        if (useWikisource) {
          if (protectedRetry && !serverFailure) {
            const field = retryCommentary || retryAmbiguous ? "commentaryRetry" : "overlapRetry";
            const previousAttempt = work.pages[amud][field];
            work.pages[amud][field] = { runId, state: "error", error: error.message, ...(previousAttempt ? { previousAttempt } : {}),
              ...(previousAttempt?.legacyAudit || work.pages[amud].commentaryRetry?.legacyAudit || (includeClassified && amudIndex(amud) >= amudIndex(tractate.slug === "pesachim" ? "99b" : "29a")) ? { legacyAudit: true } : {}) };
          }
          else if (protectedRetry) return;
          else if (safeguardPrevious) work.pages[amud].lastClassificationError = error.message;
          else {
            work.pages[amud].tosafotEvidence.state = "error";
            work.pages[amud].lastClassificationError = error.message;
            if (usePageWikisource) {
              applyWikisourceAbsence(work.pages[amud], wikiPages[amud]);
              applyWikisourceRashiAbsence(work.pages[amud], wikiPages[amud]);
            }
          }
        } else if (/PDF HTTP (403|429|5\d\d)/.test(error.message)) {
          return;
        } else if (recoverMain) {
          work.pages[amud].mainRecoveryError = error.message;
        } else if (safeguardPrevious) {
          work.pages[amud].lastClassificationError = error.message;
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
console.log(JSON.stringify({ runId, attempted, ...(recheckingAbsences ? { sourceZeroes, unavailableTractates: unavailable } : {}), stoppedForServer: stop, coverage }, null, 2));
if (stop || (recheckingAbsences && unavailable)) process.exitCode = 1;