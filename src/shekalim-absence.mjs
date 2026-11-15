import assert from "node:assert/strict";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { classifierVersion } from "./measure-corpus.mjs";
import { amudim, tractates } from "./shas-catalog.mjs";

export const yerushalmiAbsenceBasis = "user-confirmed-yerushalmi-no-rashi-or-tosafot";
const expected = amudim(tractates.find((tractate) => tractate.slug === "shekalim"));
const kinds = ["rashi", "tosafot"];

export function confirmShekalimAbsence(work) {
  assert.equal(work.slug, "shekalim", "User attestation is authorized only for Shekalim");
  assert.deepEqual(Object.keys(work.pages).sort(), [...expected].sort(), "Requires exactly Shekalim 2a-22b (42 sides)");
  const next = structuredClone(work);
  const changed = [];
  const conflicts = [];
  for (const amud of expected) {
    const entry = next.pages[amud];
    assert.equal(entry.classifierVersion, classifierVersion, `${amud}: unsupported classifier version`);
    const hashes = [entry.page?.sha256, entry.rashiEvidence?.pdfSha256, entry.tosafotEvidence?.pdfSha256].filter(Boolean);
    if (!hashes.length || hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash) || hash !== hashes[0]) || (entry.page && !entry.page.sha256)) {
      conflicts.push({ amud, reason: "missing or disagreeing saved PDF fingerprints" });
      continue;
    }
    for (const kind of kinds) {
      const evidence = entry[`${kind}Evidence`];
      if (entry.confirmedAbsent?.includes(kind) || (evidence?.decision && evidence.decision !== "unknown")) continue;
      const unknown = [...(entry.unknownCategories || []), ...(entry.inferredAbsent || [])].includes(kind) || !entry.page;
      if (!unknown || typeof entry.fractions?.[kind] === "number" || typeof entry.page?.areas?.[kind]?.fraction === "number") continue;
      if (entry.page?.groups?.[kind]?.length || entry.page?.matches?.some((match) => match.kind === kind && match.rows?.length)) {
        conflicts.push({ amud, kind, reason: "detected commentary rows" });
        continue;
      }
      if (evidence?.source || evidence?.revision || evidence?.sourceSha256 || evidence?.contentSha256) continue;
      entry[`${kind}Evidence`] = { version: 2, state: "processed", sourceType: "user-attestation", source: null,
        decision: "absent", basis: yerushalmiAbsenceBasis, pdfSha256: hashes[0], previousEvidence: evidence ?? null };
      entry.confirmedAbsent = [...new Set([...(entry.confirmedAbsent || []), kind])];
      entry.unknownCategories = (entry.unknownCategories || []).filter((unknownKind) => unknownKind !== kind);
      entry.inferredAbsent = (entry.inferredAbsent || []).filter((unknownKind) => unknownKind !== kind);
      changed.push({ amud, kind });
    }
  }
  return { work: next, changed, conflicts };
}

export async function saveShekalimAbsence({ workDirectory = join("results", "shas-work") } = {}) {
  const target = join(workDirectory, "shekalim.json");
  const original = await readFile(target, "utf8");
  const result = confirmShekalimAbsence(JSON.parse(original));
  if (result.changed.length) {
    assert.equal(await readFile(target, "utf8"), original, "Shekalim checkpoint changed during confirmation");
    await writeFile(`${target}.tmp`, JSON.stringify(result.work));
    await rename(`${target}.tmp`, target);
  }
  return { checked: expected.length, changed: result.changed, conflicts: result.conflicts };
}