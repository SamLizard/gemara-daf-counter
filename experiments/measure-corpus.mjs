import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { shasDefinition } from "./shas-profiles.mjs";

const archive = "https://raw.githubusercontent.com/Sefaria/Sefaria-Export-Archive/3f1013631fdfe452e953a93a2c5f921319e394ed/";
const decoder = new TextDecoder("windows-1255");
export const classifierVersion = 2;
export function isOverlapRetryCandidate(entry, runId) {
  const error = entry?.lastClassificationError || entry?.error || entry?.recovery?.reason || "";
  return error.startsWith("overlap between ") && entry?.overlapRetry?.runId !== runId;
}

export function isCommentaryRetryCandidate(entry, runId) {
  return Boolean(entry && entry.commentaryRetry?.runId !== runId && (entry.error || entry.lastClassificationError || entry.recovery
    || (entry.commentaryRetry?.state === "error" && entry.commentaryRetry.legacyAudit)
    || [...(entry.unknownCategories || []), ...(entry.inferredAbsent || [])].some((kind) => kind === "rashi" || kind === "tosafot")));
}

export function isLegacyCommentaryAuditCandidate(entry, runId) {
  return Boolean(entry?.page && entry.commentaryRetry?.runId !== runId);
}

export function isAmbiguousRetryCandidate(entry, runId) {
  const error = entry?.commentaryRetry?.error || entry?.lastClassificationError || entry?.error || entry?.recovery?.reason || "";
  return (error.includes("ambiguous commentary stream") || error.includes("ambiguous commentary substream boundaries")) && entry?.commentaryRetry?.runId !== runId;
}

export function verifyOverlapRetrySources(entry, page, reference, nextReference = null) {
  const hashes = [entry?.page?.sha256, entry?.tosafotEvidence?.pdfSha256, entry?.rashiEvidence?.pdfSha256].filter(Boolean);
  if (entry?.page && !entry.page.sha256) throw new Error("Previously measured PDF fingerprint unavailable");
  if (hashes.some((hash) => page.sha256 !== hash)) throw new Error("PDF differs from the previously measured file");
  const revision = entry?.tosafotEvidence?.revision;
  if (revision && reference?.revision !== revision) throw new Error("Wikisource revision differs from the previous classification");
  const rashiRevision = entry?.rashiEvidence?.revision;
  if (rashiRevision && reference?.revision !== rashiRevision) throw new Error("Rashi Wikisource revision differs from the previous classification");
  const nextRevision = entry?.mainFragmentEvidence?.nextRevision;
  if (nextRevision && nextReference?.revision !== nextRevision) throw new Error("Next main-text revision differs from the previous classification");
  const commentaryFragments = [...(entry?.page?.fragmentOwnership?.filter((fragment) => fragment.commentary) || []),
    ...(page.fragmentOwnership?.filter((fragment) => fragment.commentary && fragment.previousKind) || [])];
  for (const saved of commentaryFragments) {
    for (const [field, candidate] of [["currentSource", reference], ["nextSource", nextReference]]) {
      const source = candidate?.commentarySources?.[saved.commentary];
      if (!source || typeof source.text !== "string"
        || createHash("sha256").update(JSON.stringify([source.text, source.openingWord])).digest("hex") !== source.sha256
        || ["amud", "tractate", "commentary", "title", "revision", "source", "sha256", "contentSha256"].some((key) => source[key] !== saved[field]?.[key])) {
        throw new Error(`${field}: commentary source fingerprint differs from the previous classification`);
      }
    }
  }
}

export function preserveRetryTosafot(entry, page, evidence, unknownCategories, confirmedAbsent, runId) {
  const previousUnknown = [...(entry?.unknownCategories || []), ...(entry?.inferredAbsent || [])].includes("tosafot");
  if (!previousUnknown && entry?.page?.groups?.tosafot?.length && page.groups.tosafot.length && evidence?.decision !== "present") {
    throw new Error("Previously measured Tosafot could not be reproduced");
  }
  preserveKnownCommentary(entry, page, ["tosafot"]);
  if (entry?.confirmedAbsent?.includes("tosafot")) {
    if (page.groups.tosafot.length) throw new Error("PDF Tosafot conflicts with a previously recorded zero");
    if (!confirmedAbsent.includes("tosafot")) {
      confirmedAbsent.push("tosafot");
      const unknownIndex = unknownCategories.indexOf("tosafot");
      if (unknownIndex !== -1) unknownCategories.splice(unknownIndex, 1);
      Object.assign(evidence, entry.tosafotEvidence, { runId, state: "processed", pdfSha256: page.sha256 });
    }
  }
}

export function classifyMissingCategories(page, references, { useWikisource = false, tosafotEvidence = null } = {}) {
  const missing = ["rashi", "tosafot"].filter((kind) => useWikisource && kind === "tosafot" ? tosafotEvidence.decision === "unknown" : !page.groups[kind].length);
  return { inferredAbsent: [], unknownCategories: missing };
}

const megillahCatchwordReviews = {
  "megillah-10b": {
    pdfSha256: "f5554c5796cb4c35cfe5b6064d5a71186051f112ab17227f6959c43079513a06",
    text: "\u05e9\u05dc\u05e9\u05d4", itemIndex: 179, baseline: 600.7172096591428, left: 420.0587480825802, right: 435.4763541772482,
    current: ["10b", 1312862, "942797984744b4758e91cc50e90998ed83ceeadc80ef7de46a4f6f9e5939b305", "a45ed49a09390d774140590d3a4b5ee0fe27ef064a7b5389adc2228bc3fd5510", "\u05de\u05d2\u05d9\u05dc\u05d4 \u05d9 \u05d1"],
    next: ["11a", 1442990, "3bba50f1f1960c62732660bf8b693b851e2301026d8cc9001e2e38ac19f79735", "d730bb0f5f8cc0140e338ca421c70df607337b76d4559bfbe738aa75cf361bf1", "\u05de\u05d2\u05d9\u05dc\u05d4 \u05d9\u05d0 \u05d0"],
  },
  "megillah-16a": {
    pdfSha256: "3a525c2606be3fc98a5f8e369e851d4cc2db92254ac2da03b9ee75b8c2f14226",
    text: "\u05e6\u05e8\u05d9\u05da", itemIndex: 182, baseline: 764.93672022935, left: 126.59962269022199, right: 138.41859785608912,
    current: ["16a", 2844020, "9cff53f3aed24342996fed6e95fc946db60e41330dbf3f2ed65b2823f5aca7fe", "4a360e4aa83891157c6a6dce86a9df6c3d6fb2eed378bd1f4e12db7853207e38", "\u05de\u05d2\u05d9\u05dc\u05d4 \u05d8\u05d6 \u05d0"],
    next: ["16b", 1312857, "f7b9b0b57ecac7c1c41162df218ce8a597b556e93e7c1e38fef373a9ddcba54a", "166ca09c4e546aadb45e542994ebdfba2f7804fd6599a0920fd08900a2fbe300", "\u05de\u05d2\u05d9\u05dc\u05d4 \u05d8\u05d6 \u05d1"],
  },
};

function reviewedMegillahCatchword(page, fragment) {
  const review = megillahCatchwordReviews[page.name];
  return review && page.sha256 === review.pdfSha256 && fragment.kind === "catchword" && fragment.commentary === "tosafot"
    && fragment.basis === "standalone-commentary-tail-current-source-ending-and-fingerprinted-next-opening"
    && fragment.text === review.text && fragment.itemIndex === review.itemIndex && fragment.frameRow?.kind === "tosafot"
    && fragment.frameRow.pitch === 9.94 && ["baseline", "left", "right"].every((key) => fragment.frameRow[key] === review[key])
    && ["current", "next"].every((field) => {
      const source = fragment[`${field}Source`], [amud, revision, sha256, contentSha256, title] = review[field];
      return source?.tractate === "megillah" && source.commentary === "tosafot" && source.amud === amud && source.revision === revision
        && source.source === `https://he.wikisource.org/?oldid=${revision}` && source.sha256 === sha256 && source.contentSha256 === contentSha256 && source.title === title;
    });
}

const reviewedSmallTosafotBlocks = {
  "kiddushin-77a": {
    pdfSha256: "2c5d4545598b6239c25bfdad68a141b310404167caf7319d80fc514387337731",
    firstItem: 312, lastItem: 331, sizes: [11.88, 9.36, 8.88], pitch: 8.46,
    window: { left: 120, right: 245, bottom: 1020, top: 1090 },
    baselines: [1078.1995687200001, 1069.79957208, 1061.2795754879999, 1052.879578848, 1044.3595822559998, 1035.9595856159997, 1027.4395890239998],
    tosafotReferenceSha256: "b7f27f747cfcb04625b473d4837906cbdfb59e317de8f6298aaf6e1e4bb49d8d",
    rashi: ["77a", 1182042, "de850b2118693c8c5988728e988a08d935072c644128801d7a2bd8c7a79aa60a", "7a164abc1a4b30056bebcedb1c6961329089b820a136995bde174604ccd31235", "\u05e7\u05d9\u05d3\u05d5\u05e9\u05d9\u05df \u05e2\u05d6 \u05d0"],
    nextTosafot: ["77b", 1182043, "a070264eaaba40c234a17d1acf9ddcb1e80a55f851b7daa169d2723c37afb9f0", "ff5b612cbf8f4e20ecdd6b5ab33d5617bda2a315709f9bd792df4ad8d7291d4f", "\u05e7\u05d9\u05d3\u05d5\u05e9\u05d9\u05df \u05e2\u05d6 \u05d1"],
  },
};

function pinnedCommentarySource(source, tractate, commentary, [amud, revision, sha256, contentSha256, title]) {
  return Boolean(source && typeof source.text === "string" && source.tractate === tractate && source.commentary === commentary
    && source.amud === amud && source.revision === revision && source.source === `https://he.wikisource.org/?oldid=${revision}`
    && source.sha256 === sha256 && source.contentSha256 === contentSha256 && source.title === title
    && createHash("sha256").update(JSON.stringify([source.text, source.openingWord])).digest("hex") === sha256);
}

const gittin76bReview = {
  pdfSha256: "ecabe93ef0a62c88fc211c182e4d30c92086b96e6c19eb92321da0f1512c6c3c",
  rashiSha256: "082c78fdf71d1322e20890a0de5f73e78b8f1d14e14ad13719dd891429f4b77f",
  tosafotSha256: "9e1419549c78d8186b6805f7c86d9f271e4152524bf8ced3858269d93c4069e0",
  currentRashi: ["76b", 1179049, "b0bc06f82f252f29d9d7d8cf2c7c7a40d67f034f9d15ef37b887195aa846450a", "78086374fe8a839a85279b8d34fe240529447f17802a64fc43c01a619ff15137", "גיטין עו ב"],
  nextRashi: ["77a", 1179052, "574cb331dca8592483388696e08ed2448d9a7ca6acfaa9774e967ff6e8121938", "80ef30033a80dd290b742832de6a7ce98d2c5960f88cf56341f14b538290f3a8", "גיטין עז א"],
  nextTosafot: ["77a", 1179052, "5dc3bec8f7100865af5f9ef667506fe0605d46c7081b151253aadb30d718925f", "80ef30033a80dd290b742832de6a7ce98d2c5960f88cf56341f14b538290f3a8", "גיטין עז א"],
  geometrySha256: "51348d677b8476f77cf0854d84954c530659327f41d84c454ca5acac0af93e8a",
};

function reviewedGittin76bReferences(name, sha256, references) {
  if (references.sefariaTosafot === undefined) return null;
  const review = gittin76bReview;
  const sources = references.commentarySources;
  const hash = (text) => typeof text === "string" && createHash("sha256").update(text).digest("hex");
  if (name !== "gittin-76b" || sha256 !== review.pdfSha256 || references.tosafot !== "" || references.other !== undefined || references.main !== undefined
    || hash(references.rashi) !== review.rashiSha256 || hash(references.sefariaTosafot) !== review.tosafotSha256
    || sources?.tosafot?.current !== undefined || !pinnedCommentarySource(sources?.rashi?.current, "gittin", "rashi", review.currentRashi)
    || !pinnedCommentarySource(sources?.rashi?.next, "gittin", "rashi", review.nextRashi)
    || !pinnedCommentarySource(sources?.tosafot?.next, "gittin", "tosafot", review.nextTosafot)) {
    throw new Error(`${name}: sources or PDF differ from the pinned Gittin review`);
  }
  return review;
}

export function applyReviewedGittin76bEvidence(page, evidence) {
  const review = page.reviewedGittin76b;
  if (!review) return evidence;
  if (page.name !== "gittin-76b" || page.sha256 !== gittin76bReview.pdfSha256 || evidence?.revision !== gittin76bReview.currentRashi[1]
    || evidence.title !== gittin76bReview.currentRashi[4] || evidence.sourceStatus !== "unknown" || evidence.decision !== "unknown"
    || evidence.pdfSha256 !== page.sha256) throw new Error("gittin-76b: Wikisource evidence differs from the pinned review");
  return { ...evidence, sourceType: "sefaria-and-wikisource", decision: "present", basis: review.basis, sefariaTosafot: review.sefariaTosafot,
    wikisourceContentSha256: review.wikisource.contentSha256 };
}

function reviewedSmallTosafotBlock(name, sha256, items, streams, mainItems, references, groups) {
  const review = reviewedSmallTosafotBlocks[name];
  if (!review || sha256 !== review.pdfSha256 || groups.tosafot.length || streams.some((stream) => stream.kind === "tosafot")) return null;
  const tractate = name.replace(/-\d+[ab]$/, "");
  const sources = references.commentarySources;
  if (typeof references.tosafot !== "string" || createHash("sha256").update(references.tosafot).digest("hex") !== review.tosafotReferenceSha256
    || sources?.tosafot?.current !== undefined || !pinnedCommentarySource(sources?.rashi?.current, tractate, "rashi", review.rashi)
    || !pinnedCommentarySource(sources?.tosafot?.next, tractate, "tosafot", review.nextTosafot)) return null;
  const block = items.slice(review.firstItem, review.lastItem + 1);
  const inWindow = items.filter((item) => item.transform[4] >= review.window.left && item.transform[4] + item.width <= review.window.right
    && item.transform[5] >= review.window.bottom && item.transform[5] <= review.window.top);
  const claimed = new Set([...mainItems, ...streams.flatMap((stream) => [...stream.run, ...stream.expanded])]);
  if (block.length !== review.lastItem - review.firstItem + 1 || inWindow.length !== block.length || inWindow.some((item) => !block.includes(item))
    || block.some((item) => claimed.has(item) || !review.sizes.some((size) => Math.abs(item.height - size) < 0.02))) return null;
  const rows = groupRows(block, 2);
  if (rows.length !== review.baselines.length || rows.some((row, index) => Math.abs(row.baseline - review.baselines[index]) > 0.01)) return null;
  const others = [references.rashi, references.other, sources.rashi.current.text].filter((text) => typeof text === "string");
  let evidenceRows = 0;
  let letters = 0;
  for (const row of rows) {
    const text = normalizeHebrew([...row.items].sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" "));
    if (!text) continue;
    if (!references.tosafot.includes(text) || others.some((other) => other.includes(text))) return null;
    if (text.length >= 16) evidenceRows++;
    letters += text.length;
  }
  if (evidenceRows < 5 || letters < 120) return null;
  const scores = Object.fromEntries(["rashi", "tosafot", "other"].map((kind) => [kind, matchScore(block, references[kind])]));
  if (scores.tosafot < 32 || ["rashi", "other"].some((kind) => scores.tosafot < 4 * scores[kind])) return null;
  const basis = "pinned-small-tosafot-block-wikisource-text-and-pdf-geometry";
  const tosafotRows = lines(block, review.pitch, "tosafot", 2);
  return {
    rows: tosafotRows,
    match: { kind: "tosafot", scores, basis, rows: tosafotRows.map(({ baseline, left, right }) => ({ baseline, left, right })) },
    provenance: { commentary: "tosafot", basis, itemIndices: [review.firstItem, review.lastItem], rows: tosafotRows.length, evidenceRows, letters,
      wikisourceTosafotSha256: review.tosafotReferenceSha256,
      currentSource: { amud: review.rashi[0], revision: review.rashi[1], contentSha256: review.rashi[3], source: `https://he.wikisource.org/?oldid=${review.rashi[1]}` },
      nextSource: { amud: review.nextTosafot[0], revision: review.nextTosafot[1], sha256: review.nextTosafot[2], contentSha256: review.nextTosafot[3], source: `https://he.wikisource.org/?oldid=${review.nextTosafot[1]}` } },
  };
}

// Sefaria Rashi is empty for these pages; each is pinned to its exact PDF, Wikisource revisions and resulting row geometry.
const reviewedPages = {
  "nazir-33b": {
    pdfSha256: "6213ebcd474ac37bc4b70c23b16843f1431487f46b388a4c8d2896f3dd9604da",
    basis: "pinned-pdf-without-main-type-and-wikisource-explicitly-empty-main-and-rivan-sections", zeroCategories: ["main", "rashi"],
    tosafotReferenceSha256: "09bacf8e51b919da776154fdfff3fef0edb8c937b39b681d5e4aad83d217b423",
    current: { rashi: null, tosafot: ["33b", 2968152, "3fe1b61f8b2013572dae37a95c70e62353f0f6e0115a58069bd28d99de865c25", "8d46df845fa109c7dd897c99d73c61c1506d971b3fe4ddb24c4b27b23b05adfc", "\u05e0\u05d6\u05d9\u05e8 \u05dc\u05d2 \u05d1"] },
    next: { rashi: null, tosafot: ["34a", 2968153, "110c6063b15065c2e274b75cbaa6d8663ce18b1940d92a04a843e4d335cb149e", "01afe3bdb3c5dd998baf536d3f2fbb191d3da95eb149edb7380d190bdce5ee93", "\u05e0\u05d6\u05d9\u05e8 \u05dc\u05d3 \u05d0"] },
    rows: { main: 0, rashi: 0, tosafot: 148, other: 0 }, geometrySha256: "e5a04e2bf97feeff18bfc1bb534f1a113ac8a24c712d093cefb912c7807e5a0c",
  },
  "zevachim-51b": {
    pdfSha256: "722b36bfc5274c8544016ca8d11bfca350eeb53598b31adaa6e877fdc2604c3b", basis: "pinned-page-wikisource-rashi-where-sefaria-rashi-is-empty",
    tosafotReferenceSha256: "21a70fe2e294a3110edf8d45bb22f9dae78d3edd129b8f8c25900e040f35fa1b",
    current: { rashi: ["51b", 1062607, "e30997bca4f2a93f579170e23a2aac65209bd49e6f291864acbee71aafc83f06", "87f172d0faedd9a2965f038dcf14b11f0bed253af5d372cf83c48d6042a5428d", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e0\u05d0 \u05d1"],
      tosafot: ["51b", 1062607, "2d8ccd783d2972f43298cb3a7f9351885869834166f453d7cc5c85122dbff399", "87f172d0faedd9a2965f038dcf14b11f0bed253af5d372cf83c48d6042a5428d", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e0\u05d0 \u05d1"] },
    next: { rashi: ["52a", 1062608, "f50103442efa2be1515fcfd0118a6afa077cff1bc4075c5b80d80906fadb7d39", "bd8b8050ed29829af57ef5ce86bf3d266aa01c9cbf6e70acc3351df8c9ab774b", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e0\u05d1 \u05d0"],
      tosafot: ["52a", 1062608, "26505447cc1c06790c6ed35c93a6bf4ec31d0095ac5c7d90e508f3a4949aa3c5", "bd8b8050ed29829af57ef5ce86bf3d266aa01c9cbf6e70acc3351df8c9ab774b", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e0\u05d1 \u05d0"] },
    rows: { main: 3, rashi: 6, tosafot: 58, other: 0 }, geometrySha256: "744f5f67d053fb8b6f08e18f8f14511db0ec55d7029e3854b57ef035aafe8fe5",
  },
  "zevachim-71a": {
    pdfSha256: "ded08e98895114bf29ef0e5ae50e8cbb2bd99735d7df2e7dae6400a1be1044c0", basis: "pinned-page-wikisource-rashi-where-sefaria-rashi-is-empty",
    tosafotReferenceSha256: "49128a723655bc4f5c3d779a95a5d6cafd7c5929cb24e716763ef530d289e150",
    current: { rashi: ["71a", 1062646, "a2c8510ad7b3864eb429049cfcd23557b827a87a3617f25c9381c2f980946f32", "5b57e1313ff4cf396fa619dd4cc26e87e26c625c0021de7a1a0c3f35f05bea38", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e2\u05d0 \u05d0"],
      tosafot: ["71a", 1062646, "e46d563b72a915c90ebeecc59b2a0c3197bf366409e1fa482e87a23e53077d45", "5b57e1313ff4cf396fa619dd4cc26e87e26c625c0021de7a1a0c3f35f05bea38", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e2\u05d0 \u05d0"] },
    next: { rashi: null, tosafot: ["71b", 1062647, "9ae6b3ab7aa601ab3b5a4802726003e41a52206bc8d06d0c74947331741acac2", "0293d2263a53c377b8c2f00d9b18c8058a247b18545bf0dedeeb4101eae30ad4", "\u05d6\u05d1\u05d7\u05d9\u05dd \u05e2\u05d0 \u05d1"] },
    rows: { main: 2, rashi: 13, tosafot: 66, other: 0 }, geometrySha256: "b85579e21d959e719cd4fcb9941a438f8ee66097e957173ccae5d98ddbd1153c",
  },
};

function reviewedPage(name, sha256, references) {
  const review = reviewedPages[name];
  if (!review || sha256 !== review.pdfSha256) return null;
  if (references.rashi !== undefined && references.rashi !== "") throw new Error(`${name}: Sefaria Rashi conflicts with the pinned page review`);
  const tractate = name.replace(/-\d+[ab]$/, "");
  const sources = references.commentarySources;
  if (references.other !== undefined || references.main !== undefined || typeof references.tosafot !== "string"
    || createHash("sha256").update(references.tosafot).digest("hex") !== review.tosafotReferenceSha256
    || ["current", "next"].some((field) => ["rashi", "tosafot"].some((kind) => review[field][kind]
      ? !pinnedCommentarySource(sources?.[kind]?.[field], tractate, kind, review[field][kind]) : sources?.[kind]?.[field] !== undefined))) {
    throw new Error(`${name}: sources differ from the pinned page review`);
  }
  return review;
}

const marginHeadings = {
  "avodah-zarah": { glyphs: ["\u00cf\u2021\u000e\u000e\u00c1\u00c2\u000e\u00c8\u00b7\u00af"], label: "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d7\u05e0\u05e0\u05d0\u05dc" },
  bechoros: { glyphs: ["\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0014\u00c8\u00b7\u00af"], label: "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d2\u05e8\u05e9\u05d5\u05dd" },
  arachin: { glyphs: ["\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0011\u00c8\u00b7\u00af"], label: "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d2\u05e8\u05e9\u05d5\u05dd" },
  menachos: { glyphs: ["\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0002\u00c8\u00b7\u00af"], label: "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d2\u05e8\u05e9\u05d5\u05dd" },
};

export function findMarginHeadings(slug, items, commentaryItems) {
  const heading = marginHeadings[slug];
  if (!heading) return [];
  const candidates = commentaryItems.filter((item) => heading.glyphs.includes(item.str));
  const others = commentaryItems.filter((item) => !candidates.includes(item));
  if (!candidates.length || !others.length) return [];
  const left = Math.min(...others.map((item) => item.transform[4])), right = Math.max(...others.map((item) => item.transform[4] + item.width));
  return candidates.filter((item) => item.transform[4] + item.width < left || item.transform[4] > right).map((item) => ({
    item, provenance: { itemIndex: items.indexOf(item), label: heading.label, basis: "exact-margin-heading-glyphs-outside-page-commentary-span",
      baseline: item.transform[5], left: item.transform[4], right: item.transform[4] + item.width, height: item.height, commentarySpan: { left, right } },
  }));
}

function requireIndependentStreamEvidence(name, stream, references) {
  const kinds = ["rashi", "tosafot", "other"];
  const unique = new Set(groupRows(stream.run, 2).map((row) => normalizeHebrew([...row.items].sort((first, second) => second.transform[4] - first.transform[4])
    .map((item) => decodePdfText(item.str)).join(" "))).filter((text) => text.length >= 8 && references[stream.kind]?.includes(text)
    && !kinds.some((other) => other !== stream.kind && references[other]?.includes(text))));
  if (unique.size < 2 || [...unique].reduce((sum, text) => sum + text.length, 0) < 32) {
    throw new Error(`${name}: ${stream.kind} stream lacks independent evidence after margin heading exclusion`);
  }
}

// Whole Wikisource Tosafot section shorter than the identification threshold; pinned to exact PDF items, sources and resulting geometry.
const reviewedShortTosafotSections = {
  "sanhedrin-57a": {
    pdfSha256: "a17288213ae2441346cb2a69ad7c410c24b0491c5b0b7f6e5d970f402541abe0",
    runItems: [269, 273, 274, 275, 276, 277], blockItems: [266, 267, 268, 269, 273, 274, 275, 276, 277], previousRun: [5, 264], excludedCatchword: 278,
    window: { left: 85, right: 200, bottom: 1060, top: 1085 },
    current: ["57a", 1181252, "caae56cab3caf7e1b59da7a836f01b3446b85c77f3b3da9fc8353cfc830d38e0", "8a86fe6e7452fedbeb8d3fada20e9cb4791b8690c064a29c74a652df9bce464c", "\u05e1\u05e0\u05d4\u05d3\u05e8\u05d9\u05df \u05e0\u05d6 \u05d0"],
    next: ["57b", 1181254, "6011aacc7bd860f6b0bf25a93d29c08993ae13371e266f933332ab8428264b20", "e4ba0a532377fa1b91d35a37d438efa1f71842537c0cbee6162430a15b12712a", "\u05e1\u05e0\u05d4\u05d3\u05e8\u05d9\u05df \u05e0\u05d6 \u05d1"],
    rows: { main: 38, rashi: 76, tosafot: 2, other: 0 }, geometrySha256: "a4e989729bf9f2c53119ead4c5e3b7cebbabd2f1a1b307cc0ed92a280696cbaa",
  },
};

function reviewedShortTosafotSection(name, sha256, items, run, expanded, streams, commentaryItems, references, error) {
  const review = reviewedShortTosafotSections[name];
  if (!review || sha256 !== review.pdfSha256 || !error.message.startsWith(`${name}: ambiguous commentary stream`)) throw error;
  const tractate = name.replace(/-\d+[ab]$/, "");
  const sources = references.commentarySources;
  const indices = (part) => part.map((item) => items.indexOf(item)).sort((first, second) => first - second);
  const sectionText = references.tosafot;
  const rowText = groupRows(expanded, 2).map((row) => normalizeHebrew([...row.items].sort((first, second) => second.transform[4] - first.transform[4])
    .map((item) => decodePdfText(item.str)).join(" "))).join("");
  const inWindow = commentaryItems.filter((item) => item.transform[4] >= review.window.left && item.transform[4] + item.width <= review.window.right
    && item.transform[5] >= review.window.bottom && item.transform[5] <= review.window.top);
  const catchword = items[review.excludedCatchword];
  if (!pinnedCommentarySource(sources?.tosafot?.current, tractate, "tosafot", review.current) || !pinnedCommentarySource(sources?.tosafot?.next, tractate, "tosafot", review.next)
    || typeof sectionText !== "string" || sectionText !== sources.tosafot.current.text || typeof references.rashi !== "string" || !references.rashi
    || [references.rashi, references.other, sources?.rashi?.current?.text].some((text) => typeof text === "string" && text.includes(sectionText))
    || streams.length !== 1 || streams[0].kind !== "rashi" || JSON.stringify([items.indexOf(streams[0].run[0]), items.indexOf(streams[0].run.at(-1))]) !== JSON.stringify(review.previousRun)
    || JSON.stringify(indices(run)) !== JSON.stringify(review.runItems) || JSON.stringify(indices(expanded)) !== JSON.stringify(review.blockItems)
    || JSON.stringify(indices(inWindow)) !== JSON.stringify(review.runItems) || rowText !== sectionText
    || expanded.includes(catchword) || normalizeHebrew(decodePdfText(catchword?.str || "")) !== sources.tosafot.next.openingWord) {
    throw new Error(`${name}: short Tosafot section differs from the pinned review`);
  }
  const basis = "pinned-short-whole-wikisource-tosafot-section-and-pdf-items";
  const scores = Object.fromEntries(["rashi", "tosafot", "other"].map((kind) => [kind, matchScore(run, references[kind])]));
  const source = (value) => ({ amud: value.amud, revision: value.revision, source: value.source, sha256: value.sha256, contentSha256: value.contentSha256 });
  return { kind: "tosafot", scores, basis, review, provenance: { commentary: "tosafot", basis, pdfSha256: review.pdfSha256, itemIndices: review.blockItems,
    excludedCatchwordItem: review.excludedCatchword, letters: sectionText.length, currentSource: source(sources.tosafot.current), nextSource: source(sources.tosafot.next) } };
}

function preservesReviewedMegillahCatchword(entry, page, kind, saved) {
  return kind === "rashi" && saved.kind === kind && entry.page.name === page.name && entry.page.sha256 === page.sha256
    && page.fragmentOwnership?.some((fragment) => reviewedMegillahCatchword(page, fragment) && fragment.previousKind === kind
      && fragment.commentaryContext?.fragments >= 2 && fragment.commentaryContext.letters >= 32
      && fragment.precedingRow?.kind === "tosafot" && fragment.precedingRow.pitch === saved.pitch
      && fragment.precedingRow.baseline - saved.baseline >= saved.pitch * 0.8
      && fragment.precedingRow.baseline - saved.baseline <= saved.pitch * 1.2
      && saved.left - fragment.precedingRow.left >= saved.pitch * 0.8 && saved.left - fragment.precedingRow.left <= saved.pitch * 2
      && saved.right <= fragment.precedingRow.right + 0.02
      && page.groups.tosafot?.some((row) => row.pitch === saved.pitch && Math.abs(row.baseline - fragment.precedingRow.baseline) < 0.02
        && row.left <= fragment.precedingRow.left + 0.02 && row.right >= fragment.precedingRow.right - 0.02)
      && page.matches?.some((match) => match.kind === "tosafot" && match.scores?.tosafot >= 32
        && ["rashi", "other"].every((other) => match.scores.tosafot >= 4 * match.scores[other])
        && match.rows?.some((row) => Math.abs(row.baseline - fragment.precedingRow.baseline) < 0.02
          && row.left <= fragment.precedingRow.left + 0.02 && row.right >= fragment.precedingRow.right - 0.02))
      && fragment.previousRow?.kind === kind && ["baseline", "left", "right", "pitch", "top", "bottom", "tallFragments"].every((key) =>
        JSON.stringify(fragment.previousRow[key]) === JSON.stringify(saved[key]))
      && ["baseline", "left", "right", "pitch", "top", "bottom", "tallFragments"].every((key) =>
        JSON.stringify(fragment.frameRow[key]) === JSON.stringify(saved[key])));
}

function preserveKnownCommentary(entry, page, kinds) {
  for (const kind of kinds) {
    for (const saved of entry?.page?.groups?.[kind] || []) {
      if (preservesReviewedMegillahCatchword(entry, page, kind, saved)) continue;
      if (entry.page.sha256 && entry.page.sha256 === page.sha256 && page.fragmentOwnership?.some((fragment) => fragment.kind === "catchword" && !fragment.previousKind
        && fragment.commentary === kind && fragment.currentSource?.sha256 && fragment.nextSource?.sha256
        && ["baseline", "left", "right", "pitch"].every((key) => fragment.frameRow?.[key] === saved[key]))) continue;
      const mainFragments = entry.page.sha256 && entry.page.sha256 === page.sha256 ? (page.fragmentOwnership || []).filter((fragment) =>
        fragment.previousKind === kind && fragment.frameRow?.pitch === saved.pitch && Math.abs(fragment.frameRow.baseline - saved.baseline) < 0.02
        && fragment.mainContext?.fragments >= 2 && fragment.mainContext?.letters >= 30 && /^[a-f0-9]{64}$/.test(fragment.mainSourceSha256 || "")
        && ((fragment.kind === "catchword" && fragment.basis === "bounded-main-tail-next-source-and-current-context"
          && /^[a-f0-9]{64}$/.test(fragment.nextMainSourceSha256 || ""))
          || (fragment.kind === "main" && ["direct-main-source-unique-row-and-source-context", "bounded-main-footnote-marker-and-source-context"].includes(fragment.basis)
            && page.groups.main?.some((row) => Math.abs(row.baseline - fragment.frameRow.baseline) < 2
              && row.left <= fragment.frameRow.left + 0.02 && row.right >= fragment.frameRow.right - 0.02)))).map((fragment) => fragment.frameRow) : [];
      const covered = [...mainFragments, ...["rashi", "tosafot", "other"].flatMap((target) => (page.groups[target] || []).filter((row) =>
        Math.abs(row.baseline - saved.baseline) < 2 && row.pitch === saved.pitch && (target === kind || page.matches?.some((match) =>
          match.kind === target && match.scores?.[target] >= 16
          && ["rashi", "tosafot", "other"].every((other) => other === target || match.scores[target] >= 2 * match.scores[other])
          && match.rows?.some((evidence) => Math.abs(evidence.baseline - row.baseline) < 0.02
            && evidence.left <= row.left + 0.02 && evidence.right >= row.right - 0.02)))))];
      let right = saved.left;
      for (const row of covered.sort((first, second) => first.left - second.left)) {
        if (row.left > right + 0.02) break;
        right = Math.max(right, row.right);
      }
      if (!Number.isFinite(right) || right < saved.right - 0.02) {
        const original = page.fragmentOwnership?.find((fragment) => mainFragments.includes(fragment.frameRow)
          && ["baseline", "left", "right", "pitch"].every((key) => fragment.previousRow?.[key] === saved[key]))?.previousRow;
        if (original?.fragments?.length && original.fragments.every((part) => covered.some((row) => Math.abs(row.baseline - part.baseline) < 2
          && row.left <= part.left + 0.02 && row.right >= part.right - 0.02))) continue;
        throw new Error(`Previously measured ${kind === "tosafot" ? "Tosafot" : kind} could not be reproduced or positively reattributed`);
      }
    }
  }
}

export function preserveRetryPage(entry, next) {
  for (const kind of entry?.confirmedAbsent || []) {
    if (next.page.groups[kind]?.length) throw new Error(`PDF ${kind} conflicts with a previously recorded zero`);
    next.confirmedAbsent = [...new Set([...(next.confirmedAbsent || []), kind])];
    next.unknownCategories = (next.unknownCategories || []).filter((unknown) => unknown !== kind);
    if (kind === "rashi" && entry.rashiEvidence) next.rashiEvidence = entry.rashiEvidence;
    if (kind === "tosafot" && entry.tosafotEvidence?.sourceType === "user-attestation") next.tosafotEvidence = entry.tosafotEvidence;
  }
  for (const saved of entry?.page?.groups?.main || []) {
    if (!next.page.groups.main.some((row) => Math.abs(row.baseline - saved.baseline) < 0.02
      && row.left <= saved.left + 0.02 && row.right >= saved.right - 0.02 && row.pitch === saved.pitch)) {
      throw new Error("Previously measured main text could not be reproduced");
    }
  }
  preserveKnownCommentary(entry, next.page, ["rashi", "tosafot", "other"]);
  next.previousClassification = entry;
}

export function checkOverlap(page) {
  const kinds = ["main", "rashi", "tosafot", "other"];
  for (let first = 0; first < kinds.length; first++) for (let second = first + 1; second < kinds.length; second++) {
    for (const a of page.groups[kinds[first]] || []) for (const b of page.groups[kinds[second]] || []) {
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.baseline + a.pitch / 2, b.baseline + b.pitch / 2) - Math.max(a.baseline - a.pitch / 2, b.baseline - b.pitch / 2);
      if (width > 0.1 && height > 0.1) throw new Error(`overlap between ${kinds[first]} and ${kinds[second]}`);
    }
  }
}
const definitions = [
  { slug: "horayos", title: "Horayot", order: "Nezikin", count: 25, mainSize: 12.24, mainPitch: 10.66825, commentaryPitch: 8.69562, tosafotPitch: 6.72 },
  { slug: "rosh-hashanah", title: "Rosh Hashanah", order: "Moed", count: 67, mainSize: 13.68, mainPitch: 11.88, commentaryPitch: 10.44 },
];

export function decodePdfText(text) {
  if (/[\u00c0-\u00fa]/.test(text) && [...text].every((character) => character.charCodeAt(0) < 256)) {
    return [...decoder.decode(Buffer.from(text, "latin1"))].reverse().join("");
  }
  return text;
}

export function normalizeHebrew(text) {
  return text.normalize("NFD").replace(/[^\u05d0-\u05ea]/g, "");
}

export function groupRows(items, tolerance = 0.8) {
  const rows = [];
  for (const item of [...items].sort((first, second) => second.transform[5] - first.transform[5])) {
    let row = rows.find((candidate) => Math.abs(candidate.baseline - item.transform[5]) < tolerance);
    if (!row) {
      row = { baseline: item.transform[5], left: Infinity, right: -Infinity, items: [] };
      rows.push(row);
    }
    row.left = Math.min(row.left, item.transform[4]);
    row.right = Math.max(row.right, item.transform[4] + item.width);
    row.items.push(item);
  }
  return rows;
}

export function splitRuns(items) {
  const runs = [];
  for (const item of items) {
    let run = runs.at(-1);
    if (!run || item.transform[5] - run.at(-1).transform[5] > 30) {
      run = [];
      runs.push(run);
    }
    run.push(item);
  }
  return runs;
}

export function matchScore(items, reference) {
  if (!reference) return 0;
  const fragments = items.map((item) => decodePdfText(item.str));
  const rows = groupRows(items).map((row) => row.items.sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" "));
  return [...fragments, ...rows].reduce((score, fragment) => {
    const text = normalizeHebrew(fragment);
    return score + (text.length >= 8 && reference.includes(text) ? text.length : 0);
  }, 0);
}

export function splitCommentaryRuns(items, references, name) {
  const kinds = ["rashi", "tosafot", "other"];
  const supportedKinds = (part) => {
    const fragments = groupRows(part).map((row) => normalizeHebrew([...row.items]
      .sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" ")));
    return kinds.filter((kind) => {
      const matched = new Set(fragments.filter((text) => text.length >= 8 && references[kind]?.includes(text)));
      return matched.size >= 2 && [...matched].reduce((sum, text) => sum + text.length, 0) >= 32;
    });
  };
  const independentKind = (part) => {
    const fragments = groupRows(part).map((row) =>
      [...row.items].sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" "));
    const evidence = Object.fromEntries(kinds.map((kind) => {
      const unique = new Set(fragments.map(normalizeHebrew).filter((text) => text.length >= 8 && references[kind]?.includes(text)
        && !kinds.some((other) => other !== kind && references[other]?.includes(text))));
      return [kind, { count: unique.size, letters: [...unique].reduce((sum, text) => sum + text.length, 0) }];
    }));
    const scores = Object.fromEntries(kinds.map((kind) => [kind, matchScore(part, references[kind])]));
    const candidates = kinds.filter((kind) => evidence[kind].count >= 2 && evidence[kind].letters >= 32
      && kinds.every((other) => other === kind || scores[kind] >= 4 * scores[other]));
    if (candidates.length !== 1) return null;
    try {
      return identifyRun(part, references, name).kind === candidates[0] ? candidates[0] : null;
    } catch {
      return null;
    }
  };
  const bounds = (part) => ({
    left: Math.min(...part.map((item) => item.transform[4])),
    right: Math.max(...part.map((item) => item.transform[4] + item.width)),
    bottom: Math.min(...part.map((item) => item.transform[5])),
    top: Math.max(...part.map((item) => item.transform[5])),
  });
  return splitRuns(items).flatMap((run) => {
    const cuts = [];
    let conflictingOwnership = false;
    for (let index = 1; index < run.length; index++) {
      const first = run.slice(0, index), second = run.slice(index);
      const firstKind = independentKind(first), secondKind = independentKind(second);
      const firstBounds = bounds(first), secondBounds = bounds(second);
      const verticalGap = Math.max(firstBounds.bottom - secondBounds.top, secondBounds.bottom - firstBounds.top);
      const horizontalGap = Math.max(firstBounds.left - secondBounds.right, secondBounds.left - firstBounds.right);
      if (!firstKind || !secondKind) {
        if ((verticalGap > 30 || horizontalGap > 20)
          && ((firstKind && supportedKinds(second).some((kind) => kind !== firstKind))
            || (secondKind && supportedKinds(first).some((kind) => kind !== secondKind)))) {
          throw new Error(`${name}: ambiguous commentary substream boundaries: separated block lacks independent ownership`);
        }
        continue;
      }
      if (firstKind === secondKind) continue;
      conflictingOwnership = true;
      if (verticalGap <= 30 && horizontalGap <= 20) continue;
      cuts.push(index);
    }
    if (cuts.length > 1 || (!cuts.length && conflictingOwnership)) throw new Error(`${name}: ambiguous commentary substream boundaries`);
    return cuts.length ? [run.slice(0, cuts[0]), run.slice(cuts[0])] : [run];
  });
}

export function decodeMainGlyphText(text) {
  const encoded = [..."\u00ce\u00c8\u0005\u00c2\u201e\u00af\u00cc\u00c1\u00d3\u02d8\u00b7\u00da\u02d9\u00ca\u2030\u2021\u00cf\u00cd\u00d9\u02dc\u201a\u00d4"];
  const decoded = [..."\u05db\u05d9\u05e0\u05d5\u05d3\u05e8\u05dd\u05d7\u05de\u05e9\u05d1\u05e2\u05ea\u05d6\u05d4\u05d0\u05dc\u05da\u05e4\u05e7\u05d2\u05df"];
  const glyphs = new Map(encoded.map((character, index) => [character, decoded[index]]));
  return [...text].reverse().map((character) => glyphs.get(character) || (/^[\s.,:;'"()\-]$/.test(character) ? character : "|")).join("");
}

export function matchMainGlyphs(items, reference) {
  const matches = new Set();
  for (const item of items) {
    const text = decodeMainGlyphText(item.str);
    for (const part of text.split("|")) {
      const fragment = normalizeHebrew(part);
      if (fragment.length >= 10 && reference.includes(fragment)) matches.add(fragment);
    }
  }
  return { fragments: matches.size, letters: [...matches].reduce((sum, fragment) => sum + fragment.length, 0) };
}

export function resolveMainStreamFragments(items, streams, mainItems, mainRows, pitch, references, commentaryPitch = pitch) {
  if (!references.main) return [];
  const rows = groupRows(mainItems);
  const distance = (item, row) => Math.max(0, row.left - item.transform[4] - item.width, item.transform[4] - row.right);
  const nearCommentary = (item) => streams.some((stream) => groupRows(stream.run, 2).some((row) =>
    Math.abs(row.baseline - item.transform[5]) < 2 && distance(item, row) < 20));
  const fragmentMatches = (item, reference) => reference && [decodePdfText(item.str), decodeMainGlyphText(item.str)]
    .filter((text) => !text.includes("|")).map(normalizeHebrew).some((text) => text.length >= 8 && reference.includes(text));
  const conflictingCommentary = (item) => ["rashi", "tosafot", "other"].some((kind) => fragmentMatches(item, references[kind]));
  const contextMatch = (row, radius = 3.1) => matchMainGlyphs(rows.filter((candidate) => Math.abs(candidate.baseline - row.baseline) < pitch * radius)
    .flatMap((candidate) => candidate.items), references.main || "");
  const previousRows = new Map(streams.map((stream) => [stream, groupRows(stream.expanded, 2).map((row) => ({
    baseline: row.baseline, left: row.left, right: row.right, pitch: commentaryPitch,
    fragments: row.items.map((item) => ({ itemIndex: items.indexOf(item), baseline: item.transform[5], left: item.transform[4], right: item.transform[4] + item.width })),
  }))]));
  const provenance = (item, stream, evidence) => ({ previousKind: stream.kind, frameRow: lines([item], commentaryPitch, stream.kind, 2)[0],
    previousRow: previousRows.get(stream).find((row) => row.fragments.some((fragment) => fragment.itemIndex === items.indexOf(item))),
    mainContext: evidence, mainSourceSha256: createHash("sha256").update(references.main).digest("hex") });
  const ownership = [];
  for (const stream of streams) {
    const detached = stream.expanded.filter((item) => !stream.run.includes(item));
    for (const item of detached) {
      const nearby = rows.filter((row) => Math.abs(row.baseline - item.transform[5]) < 2 && distance(item, row) < 20);
      if (nearby.length !== 1 || nearCommentary(item)) continue;
      const markerParts = detached.filter((part) => Math.abs(part.transform[5] - item.transform[5]) < 0.02
        && Math.max(0, item.transform[4] - part.transform[4] - part.width, part.transform[4] - item.transform[4] - item.width) < 2);
      const marker = markerParts.every((part) => part.height < pitch && part.width < pitch)
        && distance(item, nearby[0]) < 5 && /^[\u05d0-\u05ea]\[$/.test([...markerParts].sort((first, second) => second.transform[4] - first.transform[4]).map((part) => decodePdfText(part.str)).join(""));
      const directMatch = fragmentMatches(item, references.main);
      if ((!directMatch && !marker) || conflictingCommentary(item)) throw new Error("ambiguous detached fragment near main text: direct ownership not established");
      const evidence = contextMatch(nearby[0]);
      if (evidence.fragments < 2 || evidence.letters < 30) throw new Error("ambiguous detached fragment near main text");
      const target = mainRows.find((row) => row.baseline === nearby[0].baseline);
      target.left = Math.min(target.left, item.transform[4]);
      target.right = Math.max(target.right, item.transform[4] + item.width);
      target.top = Math.max(target.top, item.transform[5] + item.height);
      target.bottom = Math.min(target.bottom, item.transform[5] - item.height / 4);
      stream.expanded = stream.expanded.filter((candidate) => candidate !== item);
      ownership.push({ itemIndex: items.indexOf(item), kind: "main", basis: directMatch ? "direct-main-source-unique-row-and-source-context" : "bounded-main-footnote-marker-and-source-context",
        ...provenance(item, stream, evidence) });
    }
  }
  const last = rows.at(-1);
  if (!last || !references.nextMain || !references.main) return ownership;
  const lastIndex = Math.max(...last.items.map((item) => items.indexOf(item)));
  const firstCommentary = Math.min(...streams.map((stream) => items.indexOf(stream.run[0])));
  const trailing = streams.flatMap((stream) => stream.expanded.filter((item) => !stream.run.includes(item)
    && items.indexOf(item) > lastIndex && items.indexOf(item) < firstCommentary
    && last.baseline - item.transform[5] > pitch * 0.6 && last.baseline - item.transform[5] < pitch * 1.2
    && item.transform[4] >= last.left - 0.1 && item.transform[4] + item.width <= last.right + 0.1));
  if (trailing.length !== 1 || nearCommentary(trailing[0])) return ownership;
  const catchword = trailing[0], decoded = decodeMainGlyphText(catchword.str), text = normalizeHebrew(decoded);
  const evidence = contextMatch(last, 4.1);
  if (decoded.includes("|") || text.length < 2 || !references.nextMain.startsWith(text)
    || conflictingCommentary(catchword) || evidence.fragments < 2 || evidence.letters < 30) return ownership;
  const previousStream = streams.find((stream) => stream.expanded.includes(catchword));
  for (const stream of streams) stream.expanded = stream.expanded.filter((item) => item !== catchword);
  ownership.push({ itemIndex: items.indexOf(catchword), kind: "catchword", text, basis: "bounded-main-tail-next-source-and-current-context",
    left: catchword.transform[4], right: catchword.transform[4] + catchword.width, baseline: catchword.transform[5], height: catchword.height,
    ...provenance(catchword, previousStream, evidence), nextMainSourceSha256: createHash("sha256").update(references.nextMain).digest("hex") });
  return ownership;
}

export function resolveCommentaryCatchwords(items, streams, defaultPitch, references) {
  const ownership = [];
  const fingerprint = (source) => source?.text && /^[a-f0-9]{64}$/.test(source.sha256 || "")
    && createHash("sha256").update(JSON.stringify([source.text, source.openingWord])).digest("hex") === source.sha256
    && /^[a-f0-9]{64}$/.test(source.contentSha256 || "") && source.tractate
    && Number.isInteger(source.revision) && source.revision > 0 && source.title
    && source.source === `https://he.wikisource.org/?oldid=${source.revision}`;
  const pageIndex = (amud) => /^(\d+)([ab])$/.test(amud || "") ? Number(amud.slice(0, -1)) * 2 + (amud.endsWith("b") ? 1 : 0) : NaN;
  for (const stream of streams) {
    const sources = references.commentarySources?.[stream.kind];
    const pitch = stream.pitch ?? defaultPitch;
    if (!["rashi", "tosafot"].includes(stream.kind) || !fingerprint(sources?.current) || !fingerprint(sources?.next)
      || sources.current.tractate !== sources.next.tractate || sources.current.commentary !== stream.kind || sources.next.commentary !== stream.kind
      || pageIndex(sources.next.amud) !== pageIndex(sources.current.amud) + 1) continue;
    const rows = groupRows([...new Set(stream.expanded)], 2);
    const terminal = rows.at(-1), preceding = rows.at(-2);
    if (!terminal || !preceding || terminal.items.length !== 1) continue;
    const catchword = terminal.items[0], decoded = decodePdfText(catchword.str).trim(), text = normalizeHebrew(decoded);
    // A short last line can end at the catchword's x; measure the indent from the column edge of the rows above.
    const edge = Math.min(preceding.left, ...rows.slice(-4, -2).filter((row) => row.left <= terminal.left && row.right >= terminal.right).map((row) => row.left));
    if (stream.run.at(-1) !== catchword || streams.filter((candidate) => candidate.expanded.includes(catchword)).length !== 1
      || !/^[\u05d0-\u05ea]{2,8}$/.test(decoded) || text !== sources.next.openingWord || !sources.next.text.startsWith(text)
      || terminal.right - terminal.left > pitch * 4 || catchword.height > pitch * 1.2 || !(catchword.height > 0)
      || preceding.baseline - terminal.baseline < pitch * 0.8 || preceding.baseline - terminal.baseline > pitch * 1.2
      || terminal.left - edge < pitch * 0.8 || terminal.left - edge > pitch * 2
      || terminal.right > preceding.right + 0.02) continue;
    const precedingText = [...preceding.items].sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" ");
    const ending = normalizeHebrew(precedingText);
    // The commentary may continue mid-sentence on the next amud; the exact source ending and next opening are the evidence.
    if (ending.length < 8 || !sources.current.text.endsWith(ending)) continue;
    if (references[stream.kind]?.includes(ending + text)) continue;
    const body = stream.expanded.filter((item) => item !== catchword);
    const unique = new Set(groupRows(body, 2).map((row) => normalizeHebrew([...row.items].sort((first, second) => second.transform[4] - first.transform[4])
      .map((item) => decodePdfText(item.str)).join(" "))).filter((fragment) => fragment.length >= 8 && sources.current.text.includes(fragment)
      && !["main", "rashi", "tosafot", "other"].some((kind) => kind !== stream.kind && references[kind]?.includes(fragment))));
    if (unique.size < 2 || [...unique].reduce((sum, fragment) => sum + fragment.length, 0) < 32) continue;
    stream.expanded = body;
    const provenance = ({ text: sourceText, openingWord, ...source }) => source;
    ownership.push({ itemIndex: items.indexOf(catchword), kind: "catchword", commentary: stream.kind, text,
      basis: "standalone-commentary-tail-current-source-ending-and-fingerprinted-next-opening",
      currentSource: provenance(sources.current), nextSource: provenance(sources.next),
      commentaryContext: { fragments: unique.size, letters: [...unique].reduce((sum, fragment) => sum + fragment.length, 0) },
      precedingRow: lines(preceding.items, pitch, stream.kind, 2)[0],
      frameRow: lines([catchword], pitch, stream.kind, 2)[0] });
  }
  return ownership;
}

function lines(items, pitch, kind, tolerance) {
  return groupRows(items, tolerance).map(({ baseline, left, right, items: fragments }) => ({
    baseline, left, right, pitch, kind,
    top: Math.max(baseline + pitch / 2, ...fragments.map((fragment) => fragment.transform[5] + fragment.height)),
    bottom: Math.min(baseline - pitch / 2, ...fragments.map((fragment) => fragment.transform[5] - fragment.height / 4)),
    tallFragments: fragments.filter((fragment) => fragment.height > pitch * 1.4).map((fragment) => ({
      left: fragment.transform[4], right: fragment.transform[4] + fragment.width,
      top: fragment.transform[5] + fragment.height * 0.65, bottom: fragment.transform[5] - fragment.height / 4,
    })),
  }));
}

function itemsOfSize(items, sizes) {
  return items.filter((item) => sizes.some((size) => Math.abs(item.height - size) < 0.02));
}

export function includeStreamFragments(items, run, sizes, start) {
  const end = items.indexOf(run.at(-1));
  if (end < start) throw new Error("Commentary stream is not in PDF text order");
  return [...run, ...itemsOfSize(items.slice(start, end + 1), sizes)];
}

export function redistributeLeadingFragments(items, previous, current, { references = {}, mainRows = [] } = {}) {
  const first = items.indexOf(current.run[0]);
  const leading = current.expanded.filter((item) => items.indexOf(item) < first);
  const previousRows = groupRows(previous.run, 2);
  const currentRows = groupRows(current.run, 2);
  const distance = (fragment, rows, verticalTolerance) => Math.min(Infinity, ...rows.filter((row) => Math.abs(row.baseline - fragment.baseline) < verticalTolerance)
    .map((row) => Math.max(0, row.left - fragment.right, fragment.left - row.right)));
  const fragments = groupRows(leading, 2).flatMap((row) => {
    const segments = [];
    for (const item of [...row.items].sort((firstItem, secondItem) => firstItem.transform[4] - secondItem.transform[4])) {
      let segment = segments.at(-1);
      if (!segment || item.transform[4] - segment.right >= 20) {
        segment = { baseline: row.baseline, left: item.transform[4], right: item.transform[4] + item.width, items: [] };
        segments.push(segment);
      }
      segment.right = Math.max(segment.right, item.transform[4] + item.width);
      segment.items.push(item);
    }
    return segments;
  });
  for (const fragment of fragments) {
    if (fragment.baseline > previous.run.at(-1).transform[5] + 2) continue;
    const previousDistance = distance(fragment, previousRows, 15);
    if (previousDistance < 20 && previousDistance < distance(fragment, currentRows, 2)) {
      if (previous.kind !== current.kind && references[current.kind] && [fragment.items, ...fragment.items.map((item) => [item])].some((items) => {
        const currentScore = matchScore(items, references[current.kind]);
        return currentScore > matchScore(items, references[previous.kind]);
      })) continue;
      if (distance(fragment, mainRows, 2) < 20 && !matchScore(fragment.items, references[previous.kind])) throw new Error("ambiguous leading fragment near main text");
      const moved = new Set(fragment.items);
      previous.expanded.push(...fragment.items);
      previousRows.push(fragment);
      current.expanded = current.expanded.filter((item) => !moved.has(item));
    }
  }
}

export function commentarySource(definition, work) {
  const file = `json/Talmud/Bavli/Rishonim on Talmud/${work}/Seder ${definition.order}/${work} on ${definition.title}/Hebrew/merged.json`;
  return archive + file.split("/").map(encodeURIComponent).join("/");
}

export async function loadTexts(definition, { works = ["Rashi", "Tosafot"], fetcher = fetch } = {}) {
  const texts = {};
  for (const work of works) {
    const response = await fetcher(commentarySource(definition, work), { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${work} on ${definition.title}: HTTP ${response.status}`);
    const data = await response.json();
    if (data.title !== `${work} on ${definition.title}` || !Array.isArray(data.text)) throw new Error(`Unexpected ${work} export`);
    texts[work.toLowerCase()] = data.text.map((segments) => Array.isArray(segments) ? normalizeHebrew(segments.flat(Infinity).join(" ")) : undefined);
  }
  return texts;
}

export async function loadMainTexts(definition) {
  const special = {
    shekalim: ["Jerusalem Talmud Shekalim", "json/Talmud/Yerushalmi/Seder Moed/Jerusalem Talmud Shekalim/Hebrew/Venice Edition.json"],
    kinim: ["Mishnah Kinnim", "json/Mishnah/Seder Kodashim/Mishnah Kinnim/Hebrew/Mishnah, ed. Romm, Vilna 1913.json"],
    tamid: ["Tamid", "json/Talmud/Bavli/Seder Kodashim/Tamid/Hebrew/Wikisource Talmud Bavli.json"],
    middos: ["Mishnah Middot", "json/Mishnah/Seder Kodashim/Mishnah Middot/Hebrew/Mishnah, ed. Romm, Vilna 1913.json"],
  }[definition.slug];
  const title = special?.[0] || definition.title;
  const file = special?.[1] || `json/Talmud/Bavli/Seder ${definition.order}/${definition.title}/Hebrew/merged.json`;
  const response = await fetch(archive + file.split("/").map(encodeURIComponent).join("/"), { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${title}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.title !== title || !Array.isArray(data.text)) throw new Error(`Unexpected ${title} export`);
  return {
    scope: special ? "tractate" : "page",
    source: archive + file.split("/").map(encodeURIComponent).join("/"),
    texts: special ? [normalizeHebrew(data.text.flat(Infinity).join(" "))] : data.text.map((segments) => normalizeHebrew((segments || []).flat(Infinity).join(" "))),
  };
}

export function selectFrameItems(items, definition, side) {
  if (!definition.frameWindow) return items;
  const offset = side === "a" ? definition.frameSideOffset : 0;
  return items.filter((item) => item.transform[4] - offset >= definition.frameWindow.left
    && item.transform[4] + item.width - offset <= definition.frameWindow.right);
}

function mainOnlyFrameGeometry(items, definition, side) {
  return {
    frameRows: definition.frameSizes ? lines(selectFrameItems(itemsOfSize(items, definition.frameSizes), definition, side), definition.framePitch, "unclassified") : [],
    ...(definition.slug === "shekalim" && definition.frameWindow ? { frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: side === "a" ? definition.frameSideOffset : 0 } } : {}),
  };
}

async function rebuildMainOnlyFrame(page, pdfBytes, slug, label) {
  const match = new RegExp(`^${slug}-\\d+([ab])$`).exec(page.name);
  if (!match || createHash("sha256").update(pdfBytes).digest("hex") !== page.sha256) throw new Error(`${label} frame rebuild requires the saved PDF fingerprint`);
  const task = getDocument({ data: new Uint8Array(pdfBytes) });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${label} frame rebuild requires one PDF page`);
    const pdfPage = await document.getPage(1);
    if (JSON.stringify(pdfPage.view) !== JSON.stringify(page.view)) throw new Error(`${label} frame rebuild PDF view differs from the checkpoint`);
    const items = (await pdfPage.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    return { ...structuredClone(page), ...mainOnlyFrameGeometry(items, shasDefinition({ slug }, { mainOnly: true }), match[1]) };
  } finally {
    await task.destroy();
  }
}

export const rebuildShekalimFrame = (page, pdfBytes) => rebuildMainOnlyFrame(page, pdfBytes, "shekalim", "Shekalim");
export const rebuildMiddotFrame = (page, pdfBytes) => rebuildMainOnlyFrame(page, pdfBytes, "middos", "Middot");

export async function processMainPage(definition, index, reference, pdfBytes) {
  const daf = Math.floor(index / 2) + 2;
  const side = index % 2 ? "b" : "a";
  const name = `${definition.slug}-${daf}${side}`;
  const packageUrl = import.meta.resolve("pdfjs-dist/package.json");
  const task = getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", packageUrl)),
    wasmUrl: fileURLToPath(new URL("wasm/", packageUrl)),
  });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${name}: expected one page`);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const mainItems = itemsOfSize(items, [definition.mainSize]);
    const evidence = matchMainGlyphs(mainItems, reference);
    if (evidence.fragments < 2 || evidence.letters < 30) throw new Error(`${name}: insufficient main-text match`);
    return { name, sha256: createHash("sha256").update(pdfBytes).digest("hex"), view: page.view, groups: { main: lines(mainItems, definition.mainPitch, "main"), rashi: [], tosafot: [] },
      ...mainOnlyFrameGeometry(items, definition, side), matches: [], mainMatch: evidence };
  } finally {
    await task.destroy();
  }
}

export function identifyRun(run, references, name) {
  const scores = Object.fromEntries(["rashi", "tosafot", "other"].map((kind) => [kind, matchScore(run, references[kind])]));
  const [kind, runnerUp] = Object.keys(scores).sort((first, second) => scores[second] - scores[first]);
  if (scores[kind] < 16 || scores[kind] < 2 * scores[runnerUp]) throw new Error(`${name}: ambiguous commentary stream ${JSON.stringify(scores)}`);
  return { kind, scores, ...(kind === "other" && references.otherSource ? { source: references.otherSource } : {}) };
}

export function identifyCommentaryRun(items, run, sizes, references, name) {
  try {
    return identifyRun(run, references, name);
  } catch (error) {
    if (!error.message.startsWith(`${name}: ambiguous commentary stream`)) throw error;
    if (!references.rashi || !references.tosafot) throw error;
    const scored = (fragments) => Object.fromEntries(["rashi", "tosafot", "other"].map((kind) => [kind, matchScore(fragments, references[kind])]));
    const bodyScores = scored(run);
    const [bodyKind, bodyRunner] = Object.keys(bodyScores).sort((first, second) => bodyScores[second] - bodyScores[first]);
    if (bodyScores[bodyKind] < 16 || bodyScores[bodyKind] <= bodyScores[bodyRunner]) throw error;
    const first = items.indexOf(run[0]);
    const last = items.indexOf(run.at(-1));
    if (first < 0 || last < first) throw new Error("Commentary stream is not in PDF text order");
    const runItems = new Set(run);
    const supplements = itemsOfSize(items.slice(first, last + 1), sizes).filter((item) => !runItems.has(item) && run.some((anchor) =>
      Math.abs(item.transform[5] - anchor.transform[5]) < 2 && Math.max(0, anchor.transform[4] - item.transform[4] - item.width, item.transform[4] - anchor.transform[4] - anchor.width) < 20));
    if (!supplements.length) throw error;
    const supplementalMatch = identifyRun(supplements, references, name);
    if (supplementalMatch.kind !== bodyKind) throw error;
    const combinedMatch = identifyRun([...run, ...supplements], references, name);
    if (combinedMatch.kind !== bodyKind) throw error;
    return combinedMatch;
  }
}

function identifyShortSourceBackedCommentary(expanded, references, name) {
  const source = references.commentarySources?.tosafot?.current;
  const text = source?.text;
  if (typeof text !== "string" || text.length < 32 || text.length > 120 || source.commentary !== "tosafot"
    || `${source.tractate}-${source.amud}` !== name || !Number.isInteger(source.revision) || source.revision <= 0
    || source.source !== `https://he.wikisource.org/?oldid=${source.revision}` || !source.title
    || !/^[a-f0-9]{64}$/.test(source.contentSha256 || "")
    || createHash("sha256").update(JSON.stringify([text, source.openingWord])).digest("hex") !== source.sha256
    || !references.tosafot?.startsWith(text) || [references.rashi, references.other].some((other) => other?.includes(text))) return null;
  const rows = groupRows(expanded, 2);
  if (rows.length < 2 || rows.length > 12 || Math.max(...rows.map((row) => row.right)) - Math.min(...rows.map((row) => row.left)) > 240
    || rows[0].baseline - rows.at(-1).baseline > 120) return null;
  const printed = rows.map((row) => normalizeHebrew([...row.items].sort((first, second) => second.transform[4] - first.transform[4])
    .map((item) => decodePdfText(item.str)).join(" "))).join("");
  if (!printed.startsWith(text) || !/^(?:דף[א-ת]{1,3})?$/.test(printed.slice(text.length))) return null;
  const scores = Object.fromEntries(["rashi", "tosafot", "other"].map((kind) => [kind, matchScore(expanded, references[kind])]));
  if (scores.tosafot < 32 || scores.tosafot < 4 * Math.max(scores.rashi, scores.other)) return null;
  return { kind: "tosafot", scores, basis: "complete-short-wikisource-section-and-pdf-block",
    source: { amud: source.amud, revision: source.revision, source: source.source, sha256: source.sha256, contentSha256: source.contentSha256 } };
}

export function findLabelledVariant(items, spec, name) {
  const found = [];
  for (let index = 0; index + spec.label.length <= items.length; index++) {
    const run = items.slice(index, index + spec.label.length);
    if (run.every((item, offset) => item.str === spec.label[offset] && Math.abs(item.height - spec.labelSize) < 0.03
      && Math.abs(item.transform[5] - run[0].transform[5]) < 0.5)) found.push({ name: spec.name, itemIndex: index, baseline: run[0].transform[5] });
  }
  if (found.length > 1) throw new Error(`${name}: multiple ${spec.name} labels`);
  return found[0] || null;
}

export function runPitch(run, layout) {
  if (!layout.runPitches) return layout.commentaryPitch;
  const counts = layout.runPitches.map(([size]) => run.filter((item) => Math.abs(item.height - size) < 0.02).length);
  const best = Math.max(...counts);
  if (counts.filter((count) => count === best).length > 1) throw new Error("Commentary run has no dominant body size");
  return layout.runPitches[counts.indexOf(best)][1];
}

export function findBottomTosafotBlock(items, spec, references, name) {
  const sized = (item, sizes) => sizes.some((size) => Math.abs(item.height - size) < 0.02);
  const labels = items.filter((item) => sized(item, [spec.labelSize]) && item.str === spec.label);
  if (!labels.length) return null;
  if (labels.length !== 1) throw new Error(`${name}: multiple bottom Tosafot labels`);
  const [label] = labels;
  const start = items.indexOf(label);
  let end = start;
  while (end + 1 < items.length && sized(items[end + 1], spec.sizes)) end++;
  const block = items.slice(start, end + 1);
  const body = block.filter((item) => sized(item, [spec.bodySize]));
  if (!body.length) throw new Error(`${name}: bottom Tosafot label without body text`);
  if (block.some((item) => item.transform[4] < spec.window.left || item.transform[4] + item.width > spec.window.right
    || item.transform[5] > label.transform[5] + 0.5)) throw new Error(`${name}: bottom Tosafot block leaves its band`);
  const rows = groupRows(body, 2).sort((first, second) => second.baseline - first.baseline);
  if (rows.some((row, index) => index && Math.abs(rows[index - 1].baseline - row.baseline - spec.pitch) > 0.4)) throw new Error(`${name}: bottom Tosafot block has an irregular pitch`);
  for (const item of block.filter((candidate) => !body.includes(candidate))) {
    const row = rows.find((candidate) => Math.abs(candidate.baseline - item.transform[5]) <= 2);
    if (!row) throw new Error(`${name}: bottom Tosafot item outside the body rows`);
    row.items.push(item);
  }
  const blockItems = new Set(block);
  if (items.some((item) => !blockItems.has(item) && item.transform[4] + item.width > spec.window.left && item.transform[4] < spec.window.right
    && item.transform[5] < rows[0].baseline + spec.pitch / 2 && item.transform[5] > rows.at(-1).baseline - spec.pitch / 2)) throw new Error(`${name}: foreign text inside the bottom Tosafot block`);
  const tosafot = references.tosafot;
  if (typeof tosafot !== "string" || !tosafot) throw new Error(`${name}: bottom Tosafot block requires a Tosafot reference`);
  const others = [references.rashi, references.other].filter((text) => typeof text === "string" && text);
  const texts = block.map((item) => normalizeHebrew(decodePdfText(item.str))).filter((text) => text.length >= 8)
    .flatMap((text) => Array.from({ length: Math.floor(text.length / 8) }, (_, index) => text.slice(index * 8, index * 8 + 8)));
  const letters = texts.reduce((sum, text) => sum + text.length, 0);
  const matched = texts.filter((text) => tosafot.includes(text));
  const unique = matched.filter((text) => !others.some((other) => other.includes(text)));
  const matchedLetters = matched.reduce((sum, text) => sum + text.length, 0);
  const uniqueLetters = unique.reduce((sum, text) => sum + text.length, 0);
  if (!letters || matchedLetters < 0.9 * letters || uniqueLetters < 32) {
    throw new Error(`${name}: bottom Tosafot block text is not Wikisource Tosafot ${JSON.stringify({ letters, matchedLetters, uniqueLetters })}`);
  }
  const match = identifyRun(block, references, name);
  if (match.kind !== "tosafot") throw new Error(`${name}: bottom Tosafot block matched ${match.kind}`);
  const basis = "labelled-bottom-tosafot-block-and-wikisource-text";
  const tosafotRows = rows.map((row) => ({ ...lines(row.items, spec.pitch, "tosafot", Infinity)[0], baseline: row.baseline,
    bottom: Math.min(row.baseline - spec.pitch / 2, ...row.items.map((item) => item.transform[5] - item.height / 4)) }));
  return { items: block, rows: tosafotRows,
    match: { ...match, basis, rows: tosafotRows.map(({ baseline, left, right }) => ({ baseline, left, right })) },
    provenance: { commentary: "tosafot", basis, itemIndices: [start, end], rows: tosafotRows.length, letters, matchedLetters, uniqueLetters } };
}

export function classifyHorayotTosafot(amud, page, reference) {
  const match = /^(\d+)([ab])$/.exec(amud);
  if (!match) throw new Error(`Invalid Horayot amud: ${amud}`);
  const afterTosafot = Number(match[1]) > 8;
  const detected = page.groups.tosafot.length > 0;
  const rashiRuns = page.matches.filter((entry) => entry.kind === "rashi").length;
  const decision = detected && reference ? "present" : afterTosafot && !reference && !detected && rashiRuns === 2 ? "absent" : "unknown";
  return {
    version: 1, state: "processed", sourceType: "sefaria",
    source: "https://github.com/Sefaria/Sefaria-Export-Archive/tree/3f1013631fdfe452e953a93a2c5f921319e394ed",
    sourceStatus: reference ? "present" : "absent", decision,
    basis: decision === "present" ? "sefaria-text-and-pdf-match" : decision === "absent" ? "historical-horayot-pdf-layout" : null,
    pdfSha256: page.sha256,
  };
}

export async function processPage(definition, index, references, pdfBytes) {
  const daf = Math.floor(index / 2) + 2;
  const side = index % 2 ? "b" : "a";
  const name = `${definition.slug}-${daf}${side}`;
  const bytes = pdfBytes || await readFile(join("results", "pdfs", `${name}.pdf`));
  const packageUrl = import.meta.resolve("pdfjs-dist/package.json");
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", packageUrl)),
    wasmUrl: fileURLToPath(new URL("wasm/", packageUrl)),
  });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${name}: expected one page`);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const gittinReview = reviewedGittin76bReferences(name, createHash("sha256").update(bytes).digest("hex"), references);
    if (gittinReview) references = { ...references, tosafot: references.sefariaTosafot };
    const review = definition.slug === "horayos" ? null : reviewedPage(name, createHash("sha256").update(bytes).digest("hex"), references);
    if (review?.current.rashi) references = { ...references, rashi: references.commentarySources.rashi.current.text };
    const main = lines(itemsOfSize(items, [definition.mainSize]), definition.mainPitch, "main");
    if (!main.length && !review?.zeroCategories?.includes("main")) throw new Error(`${name}: main type not found`);
    const groups = { main, rashi: [], tosafot: [], other: [] };
    const matches = [];
    let fragmentOwnership = [];
    const frameRows = [];
    let reviewedBlock = null;
    let reviewedSection = null;
    let excludedHeadings = [];
    let bottomTosafot = null;
    let labelledVariant = null;
    if (definition.slug === "horayos") {
      const rashiRuns = splitRuns(itemsOfSize(items, [9.84]));
      if (rashiRuns.length !== 2) throw new Error(`${name}: expected two Rashi runs, found ${rashiRuns.length}`);
      for (const run of rashiRuns) {
        const result = identifyRun(run, references, name);
        if (result.kind !== "rashi") throw new Error(`${name}: side commentary did not match Rashi`);
        matches.push(result);
        groups.rashi.push(...lines(run, definition.commentaryPitch, "rashi"));
      }
      let tosafot = itemsOfSize(items, [7.56]);
      if (index === 0) tosafot = tosafot.filter((item) => item.transform[5] < 480);
      if (tosafot.length) {
        const result = identifyRun(tosafot, references, name);
        if (result.kind !== "tosafot") throw new Error(`${name}: lower commentary did not match Tosafot`);
        matches.push(result);
        const start = Math.max(0, items.indexOf(tosafot[0]) - 2);
        const expanded = includeStreamFragments(items, tosafot, [7.08, 8.04], start).filter((item) => index !== 0 || item.transform[5] < 480);
        if (expanded.some((item) => item.transform[4] < 330 && item.transform[4] + item.width > 330)) throw new Error(`${name}: Tosafot crosses the column divider`);
        for (const side of ["left", "right"]) {
          const column = expanded.filter((item) => side === "left" ? item.transform[4] < 330 : item.transform[4] >= 330);
          groups.tosafot.push(...lines(column, definition.tosafotPitch, "tosafot"));
        }
      }
    } else {
      labelledVariant = definition.labelledVariant ? findLabelledVariant(items, definition.labelledVariant, name) : null;
      const layout = labelledVariant ? { ...definition, ...definition.labelledVariant } : definition;
      bottomTosafot = definition.bottomTosafot ? findBottomTosafotBlock(items, definition.bottomTosafot, references, name) : null;
      const bottomItems = new Set(bottomTosafot?.items || []);
      const commentaryItems = itemsOfSize(items, layout.commentarySizes || [11.16, 11.4]).filter((item) => !bottomItems.has(item));
      excludedHeadings = findMarginHeadings(definition.slug, items, commentaryItems);
      if (excludedHeadings.length && (typeof references.rashi !== "string" || !references.rashi || typeof references.tosafot !== "string" || !references.tosafot)) {
        throw new Error(`${name}: margin heading exclusion requires non-empty Rashi and Tosafot references`);
      }
      const headingItems = new Set(excludedHeadings.map((heading) => heading.item));
      const runs = splitCommentaryRuns(commentaryItems.filter((item) => !headingItems.has(item)), references, name);
      if (!runs.length) throw new Error(`${name}: commentary type not found`);
      if (bottomTosafot && runs.some((run) => items.indexOf(run[0]) < bottomTosafot.provenance.itemIndices[1] && items.indexOf(run.at(-1)) > bottomTosafot.provenance.itemIndices[0])) {
        throw new Error(`${name}: commentary stream spans the bottom Tosafot block`);
      }
      let start = 0;
      const streams = [];
      for (const run of runs) {
        const boldSizes = layout.boldSizes || [8.88, 8.94, 11.88, 11.94, 13.92, 16.32, 16.38];
        const rows = groupRows(run);
        const expanded = includeStreamFragments(items, run, boldSizes, start).filter((item) => {
          if (bottomItems.has(item)) return false;
          if (!(layout.adjacentBoldSizes || [13.92]).some((size) => Math.abs(item.height - size) < 0.02)) return true;
          return rows.some((row) => Math.abs(row.baseline - item.transform[5]) < 2 && Math.max(0, row.left - item.transform[4] - item.width, item.transform[4] - row.right) < 20);
        });
        let result;
        try {
          result = identifyCommentaryRun(items, run, boldSizes, references, name);
        } catch (error) {
          result = identifyShortSourceBackedCommentary(expanded, references, name);
          if (!result) {
            const { review, provenance, ...match } = reviewedShortTosafotSection(name, createHash("sha256").update(bytes).digest("hex"), items, run, expanded, streams, commentaryItems, references, error);
            result = match;
            reviewedSection = { review, provenance };
          }
        }
        matches.push(result);
        const stream = { run, expanded, kind: result.kind, match: result, pitch: runPitch(run, layout) };
        if (streams.length) redistributeLeadingFragments(items, streams.at(-1), stream, { references, mainRows: main });
        streams.push(stream);
        start = items.indexOf(run.at(-1)) + 1;
      }
      if (excludedHeadings.length) for (const stream of streams) requireIndependentStreamEvidence(name, stream, references);
      fragmentOwnership = resolveMainStreamFragments(items, streams, itemsOfSize(items, [definition.mainSize]), main, definition.mainPitch, references, definition.commentaryPitch);
      const catchwords = resolveCommentaryCatchwords(items, streams, definition.commentaryPitch, references);
      for (const fragment of catchwords.filter((candidate) => reviewedMegillahCatchword({ name, sha256: createHash("sha256").update(bytes).digest("hex") }, candidate))) {
        let legacyStart = 0;
        for (const run of splitRuns(itemsOfSize(items, [10.14, 10.62]))) {
          if (run.at(-1) === items[fragment.itemIndex]) {
            const previousKind = identifyCommentaryRun(items, run, [10.86], references, name).kind;
            const previousRow = lines(includeStreamFragments(items, run, [10.86], legacyStart), 9.94, previousKind, 2)
              .find((row) => ["baseline", "left", "right", "pitch"].every((key) => row[key] === fragment.frameRow[key]));
            if (previousKind === "rashi" && previousRow) Object.assign(fragment, { previousKind, previousRow });
          }
          legacyStart = items.indexOf(run.at(-1)) + 1;
        }
      }
      fragmentOwnership.push(...catchwords);
      frameRows.push(...catchwords.map((entry) => entry.frameRow));
      for (const stream of streams) {
        const rows = lines(stream.expanded, stream.pitch, stream.kind, 2);
        stream.match.rows = rows.map(({ baseline, left, right }) => ({ baseline, left, right }));
        groups[stream.kind].push(...rows);
      }
      if (bottomTosafot) {
        groups.tosafot.push(...bottomTosafot.rows);
        matches.push(bottomTosafot.match);
      }
      reviewedBlock = reviewedSmallTosafotBlock(name, createHash("sha256").update(bytes).digest("hex"), items, streams, itemsOfSize(items, [definition.mainSize]), references, groups);
      if (reviewedBlock) {
        groups.tosafot.push(...reviewedBlock.rows);
        matches.push(reviewedBlock.match);
      }
    }
    if (reviewedSection) {
      const rows = Object.fromEntries(["main", "rashi", "tosafot", "other"].map((kind) => [kind, groups[kind].length]));
      const geometrySha256 = createHash("sha256").update(JSON.stringify(groups)).digest("hex");
      if (review || reviewedBlock || fragmentOwnership.length || frameRows.length || excludedHeadings.length || geometrySha256 !== reviewedSection.review.geometrySha256
        || Object.entries(reviewedSection.review.rows).some(([kind, count]) => rows[kind] !== count)) throw new Error(`${name}: PDF geometry differs from the pinned short Tosafot review ${JSON.stringify({ rows, geometrySha256 })}`);
      Object.assign(reviewedSection.provenance, { rows, geometrySha256 });
    }
    let gittinProvenance = null;
    if (gittinReview) {
      const rows = Object.fromEntries(["main", "rashi", "tosafot", "other"].map((kind) => [kind, groups[kind].length]));
      const geometrySha256 = createHash("sha256").update(JSON.stringify(groups)).digest("hex");
      if (geometrySha256 !== gittinReview.geometrySha256 || JSON.stringify(rows) !== JSON.stringify({ main: 44, rashi: 65, tosafot: 21, other: 0 })
        || fragmentOwnership.length || frameRows.length || reviewedBlock || review || excludedHeadings.length
        || !["rashi", "tosafot"].every((kind) => matches.some((match) => match.kind === kind && match.scores[kind] >= 32
          && ["rashi", "tosafot", "other"].every((other) => other === kind || match.scores[kind] >= 4 * match.scores[other])))) {
        throw new Error(`${name}: PDF geometry or commentary matches differ from the pinned Gittin review`);
      }
      checkOverlap({ groups });
      gittinProvenance = { basis: "pinned-sefaria-tosafot-and-pdf-with-missing-wikisource-section", pdfSha256: gittinReview.pdfSha256,
        sefariaRashi: { source: commentarySource(definition, "Rashi"), textSha256: gittinReview.rashiSha256 },
        sefariaTosafot: { source: commentarySource(definition, "Tosafot"), textSha256: gittinReview.tosafotSha256 },
        wikisource: { revision: gittinReview.currentRashi[1], source: `https://he.wikisource.org/?oldid=${gittinReview.currentRashi[1]}`,
          contentSha256: gittinReview.currentRashi[3], tosafot: "unavailable" },
        nextWikisource: { revision: gittinReview.nextRashi[1], source: `https://he.wikisource.org/?oldid=${gittinReview.nextRashi[1]}`,
          contentSha256: gittinReview.nextRashi[3] }, rows, geometrySha256 };
    }
    let reviewedPageProvenance = null;
    if (review) {
      const rows = Object.fromEntries(["main", "rashi", "tosafot", "other"].map((kind) => [kind, groups[kind].length]));
      const geometrySha256 = createHash("sha256").update(JSON.stringify(groups)).digest("hex");
      if (fragmentOwnership.length || frameRows.length || reviewedBlock || geometrySha256 !== review.geometrySha256
        || Object.entries(review.rows).some(([kind, count]) => rows[kind] !== count)) throw new Error(`${name}: PDF geometry differs from the pinned page review`);
      const source = (value) => value ? { amud: value.amud, revision: value.revision, source: value.source, sha256: value.sha256, contentSha256: value.contentSha256 } : null;
      reviewedPageProvenance = { basis: review.basis, pdfSha256: review.pdfSha256, sefariaRashi: "empty",
        sources: Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: source(references.commentarySources[kind]?.current), next: source(references.commentarySources[kind]?.next) }])),
        tosafotReferenceSha256: review.tosafotReferenceSha256, rows, geometrySha256, ...(review.zeroCategories ? { zeroCategories: review.zeroCategories } : {}) };
    }
    return { name, sha256: createHash("sha256").update(bytes).digest("hex"), view: page.view, groups, matches,
      ...(fragmentOwnership.length ? { fragmentOwnership } : {}), ...(frameRows.length ? { frameRows } : {}),
      ...(reviewedBlock ? { reviewedCommentaryBlocks: [reviewedBlock.provenance] } : {}), ...(reviewedPageProvenance ? { reviewedPage: reviewedPageProvenance } : {}),
      ...(reviewedSection ? { reviewedCommentarySections: [reviewedSection.provenance] } : {}),
      ...(gittinProvenance ? { reviewedGittin76b: gittinProvenance } : {}),
      ...(bottomTosafot ? { bottomTosafotBlocks: [bottomTosafot.provenance] } : {}),
      ...(labelledVariant ? { labelledVariant } : {}),
      ...(excludedHeadings.length ? { excludedMarginHeadings: excludedHeadings.map((heading) => heading.provenance) } : {}) };
  } finally {
    await task.destroy();
  }
}

export const nedarimAttributionVersion = 2;

function cleanNedarimSection(section, { dropTemplates = false } = {}) {
  let text = section.replace(/<!--[^]*?-->/g, " ")
    .replace(/\[\[קטגוריה:[^\[\]]*\]\]/g, " ")
    .replace(/\{\{מפרשים לדף גמרא[^{}]*\}\}/g, " ")
    .replace(/\{\{הפניה-גמ\|[^{}]*\}\}/g, " ")
    .replace(/\{\{ש\}\}/g, " ")
    .replace(/\{\{(?:גדול|מרכז)\|([^{}|]*)\}\}/g, "$1")
    .replace(/\[\[(?:[^\[\]|]*\|)?([^\[\]|]*)\]\]/g, "$1")
    .replace(/<[^>]*>/g, " ");
  // Main-text verse/cross references are editorial; dropping them can only reduce matching evidence.
  while (dropTemplates && /\{\{[^{}]*\}\}/.test(text)) text = text.replace(/\{\{[^{}]*\}\}/g, " ");
  return /\{\{|\}\}|\[\[|\]\]/.test(text) ? null : normalizeHebrew(text);
}

// Deliberately extracts only main text, attributed Rashi and Ran; Tosafot is never read.
export function nedarimReferences(wikiPage) {
  const revision = wikiPage?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  if (typeof content !== "string" || !Number.isInteger(revision?.revid) || revision.revid <= 0 || !/^נדרים /.test(wikiPage.title || "")) {
    throw new Error("Nedarim attribution requires a revisioned Nedarim Wikisource page");
  }
  const mainSection = /<קטע\s+התחלה\s*=\s*ג\s*\/\s*>([^]*?)<קטע\s+סוף\s*=\s*ג\s*\/\s*>/.exec(content)?.[1];
  const main = mainSection ? cleanNedarimSection(mainSection, { dropTemplates: true }) : null;
  const headings = [...content.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
  // Wikisource wraps each commentary in a gmara_<kind> container. On the pinned 11a revision the Ran text sits in
  // gmara_ran under a "מיוחס לרש"י" heading (Sefaria's Vilna Ran confirms it is Ran), so a container that
  // contradicts its heading wins only when no heading of that kind exists; the heading's own kind is then dropped.
  const containerKind = (heading) => {
    const container = /<div\s+class\s*=\s*['"]gmara_(rashi|ran|tosfot)['"]\s*>\s*$/.exec(content.slice(0, heading.index))?.[1];
    return container === "rashi" || container === "ran" ? container : null;
  };
  const headingKinds = { rashi: /^מיוחס לרש["״]י$/, ran: /^ר["״]ן$/ };
  const section = (kind) => {
    const labelled = headings.filter((heading) => heading[1].length === 2 && headingKinds[kind].test(heading[2].trim()));
    const own = labelled.filter((heading) => [null, kind].includes(containerKind(heading)));
    const relabelled = headings.filter((heading) => heading[1].length === 2 && containerKind(heading) === kind
      && Object.entries(headingKinds).some(([other, pattern]) => other !== kind && pattern.test(heading[2].trim())));
    const matching = labelled.length ? own : relabelled;
    if (matching.length !== 1) return null;
    const end = headings.find((candidate) => candidate.index > matching[0].index && candidate[1].length <= 2)?.index ?? content.length;
    let raw = content.slice(matching[0].index + matching[0][0].length, end);
    if (kind === "rashi" && wikiPage.title === "נדרים ב א" && revision.revid === 3006991) {
      if (createHash("sha256").update(raw).digest("hex") !== "4d8723ce8c44bfca9548de1fd2e2083dfddcd0d81f7e5a916df9bcdb4513807e") return null;
      raw = raw.replace("([[במדבר ל]])", " ");
    }
    const text = cleanNedarimSection(raw);
    return text && text.length >= 16 ? text : null;
  };
  const texts = { main: main && main.length >= 30 ? main : null, rashi: section("rashi"), ran: section("ran") };
  const hash = (text) => text ? createHash("sha256").update(text).digest("hex") : null;
  return { title: wikiPage.title, revision: revision.revid, source: `https://he.wikisource.org/?oldid=${revision.revid}`,
    contentSha256: hash(content), ...texts, sha256: Object.fromEntries(Object.entries(texts).map(([kind, text]) => [kind, hash(text)])) };
}

export function nedarimAmudReferences(wikiPages, index) {
  const amud = (offset) => `${Math.floor((index + offset) / 2) + 2}${(index + offset) % 2 ? "b" : "a"}`;
  return { ...nedarimReferences(wikiPages[amud(0)]),
    adjacent: [-1, 1].filter((offset) => index + offset >= 0 && wikiPages[amud(offset)]).map((offset) => nedarimReferences(wikiPages[amud(offset)])) };
}

// Main fonts on these exact PDFs print נ as a space and lack ס/ץ/ף glyph mappings; only these PDF + main-source pins may align them.
export const reviewedNedarimMainAlignments = Object.freeze({
  "nedarim-40b": Object.freeze({ pdfSha256: "918568cd564f90c19ecf25c921177924d02547cbcc6eb03e9844ede0bc074256", revision: 2967975, mainSha256: "2fdc6918c71020b5252a30c79e2fe84e86cee3ca5cd5cedf3250ad4fed19357f" }),
  "nedarim-45b": Object.freeze({ pdfSha256: "86193f9f61321386ec763e7019ab90fd6818f0107c9d5e2ca43f560de6b952b7", revision: 2967986, mainSha256: "8d608d0c2b1f527ddacabf2318a86887c65f9da95394ea023f85c7e90d13020d" }),
  "nedarim-86b": Object.freeze({ pdfSha256: "483adf52c24b3832488d0c2214594d1c6d6f3b82acfebb9820944cdb213ca105", revision: 2968070, mainSha256: "4af9bacafcf9b134a8b4cc72c019b6c8004ba549d2941fa03d92311918558fec" }),
});

// Every main item with at least 10 decoded letters must match the pinned main exactly once, in reading order, and no adjacent main.
export function alignNedarimMainGlyphs(items, reference, adjacent) {
  if (!reference || adjacent.length !== 2 || adjacent.some((text) => !text)) return { fragments: 0, letters: 0, rejected: "incomplete main sources" };
  const ordered = groupRows(items).flatMap((row) => [...row.items].sort((first, second) => second.transform[4] - first.transform[4]));
  let fragments = 0, letters = 0, last = -1;
  for (const item of ordered) {
    let known = 0;
    const source = [...decodeMainGlyphText(item.str)].map((character) => /[\u05d0-\u05ea]/.test(character) ? (known++, character)
      : character === "|" ? "[\u05d0-\u05ea]" : /\s/.test(character) ? "\u05e0?" : "").join("");
    if (known < 10) continue;
    const own = [...reference.matchAll(new RegExp(source, "g"))];
    if (own.length !== 1) return { fragments: 0, letters: 0, rejected: `${own.length} matches for a main item` };
    if (own[0].index <= last) return { fragments: 0, letters: 0, rejected: "main items out of source order" };
    if (adjacent.some((text) => new RegExp(source).test(text))) return { fragments: 0, letters: 0, rejected: "main item also matches an adjacent amud" };
    last = own[0].index;
    fragments++;
    letters += known;
  }
  return { fragments, letters };
}

export function splitNedarimRow(row, gutter) {
  const segments = [];
  for (const item of [...row.items].sort((first, second) => first.transform[4] - second.transform[4])) {
    const previous = segments.at(-1);
    if (previous && !(previous.right <= gutter.left && item.transform[4] >= gutter.right)) {
      previous.items.push(item);
      previous.right = Math.max(previous.right, item.transform[4] + item.width);
    } else {
      segments.push({ baseline: row.baseline, left: item.transform[4], right: item.transform[4] + item.width, items: [item] });
    }
  }
  return segments;
}

export function scoreNedarimSegment(segment, references) {
  const kinds = ["main", "rashi", "ran"];
  const ordered = [...segment.items].sort((first, second) => second.transform[4] - first.transform[4]);
  const fragments = new Set([...ordered.map((item) => decodePdfText(item.str)), ordered.map((item) => decodePdfText(item.str)).join(" ")]
    .map(normalizeHebrew).filter((text) => text.length >= 8));
  const scores = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  const adjacent = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  for (const text of fragments) {
    const current = kinds.filter((kind) => references[kind]?.includes(text));
    const nearby = kinds.filter((kind) => (references.adjacent || []).some((source) => source[kind]?.includes(text)));
    const owners = new Set([...current, ...nearby]);
    if (owners.size !== 1) continue;
    const [owner] = owners;
    if (current.length) scores[owner] += text.length;
    else adjacent[owner] += text.length;
  }
  return { ...scores, adjacent };
}

function nedarimRow(segment, pitch, kind) {
  return {
    baseline: segment.baseline, left: segment.left, right: segment.right, pitch, kind,
    top: Math.max(segment.baseline + pitch / 2, ...segment.items.map((item) => item.transform[5] + item.height)),
    bottom: Math.min(segment.baseline - pitch / 2, ...segment.items.map((item) => item.transform[5] - item.height / 4)),
    tallFragments: [],
  };
}

// Attaches small references and larger inline headings to the unique same-baseline segment they touch without crossing
// the column gutter. Items touching only main rows stay with the main text; isolated items remain unmeasured.
export function attachNedarimInlineItems(segments, items, pitch, { gutter, main = [], maximumGap = 12 } = {}) {
  let pending = [...items];
  const touching = (item, row) => {
    const left = item.transform[4], right = left + item.width;
    const gapLeft = Math.min(right, row.right), gapRight = Math.max(left, row.left);
    return Math.abs(row.baseline - item.transform[5]) < pitch * 0.6 && Math.max(row.left - right, left - row.right, 0) <= maximumGap
      && !(gutter && gapLeft <= gutter.left && gapRight >= gutter.right);
  };
  for (let progress = true; progress && pending.length;) {
    progress = false;
    pending = pending.filter((item) => {
      const owners = [...segments, ...main].filter((row) => touching(item, row));
      if (owners.length !== 1) return true;
      progress = true;
      if (main.includes(owners[0])) return false;
      owners[0].items.push(item);
      owners[0].left = Math.min(owners[0].left, item.transform[4]);
      owners[0].right = Math.max(owners[0].right, item.transform[4] + item.width);
      return false;
    });
  }
  const ambiguous = pending.filter((item) => [...segments, ...main].some((row) => touching(item, row)));
  return { ambiguous, isolated: pending.filter((item) => !ambiguous.includes(item)),
    // After attribution, an item bridging segments of one commentary merges them into one line; any other mix stays rejected.
    resolve: (name) => {
      for (const item of ambiguous) {
        const owners = [...segments, ...main].filter((row) => touching(item, row));
        if (owners.some((row) => main.includes(row) || !row.kind || row.kind !== owners[0].kind)) {
          throw new Error(`${name}: ambiguous Nedarim inline item at ${item.transform[5].toFixed(1)}/${item.transform[4].toFixed(0)}`);
        }
        const [owner, ...merged] = owners;
        for (const part of [...merged, { items: [item], left: item.transform[4], right: item.transform[4] + item.width }]) {
          owner.items.push(...part.items);
          owner.left = Math.min(owner.left, part.left);
          owner.right = Math.max(owner.right, part.right);
          if (part.scores) {
            for (const kind of ["main", "rashi", "ran"]) {
              owner.scores[kind] += part.scores[kind];
              owner.scores.adjacent[kind] += part.scores.adjacent[kind];
            }
          }
          if (segments.includes(part)) segments.splice(segments.indexOf(part), 1);
        }
      }
    } };
}

function uniqueNedarimInsertionMatch(sources, text, start, end) {
  const matches = new Map();
  for (const [sourceIndex, source] of sources.entries()) for (const kind of ["main", "rashi", "ran"]) {
    const value = source[kind];
    const record = (position, exact, extraInRange) => {
      const key = `${sourceIndex}/${kind}/${position}`;
      const hit = matches.get(key) || { sourceIndex, kind, exact: false, extraInRange: false };
      hit.exact ||= exact;
      hit.extraInRange ||= extraInRange;
      matches.set(key, hit);
    };
    for (let position = value.indexOf(text); position >= 0; position = value.indexOf(text, position + 1)) record(position, true, false);
    for (let index = 1; index < text.length; index++) {
      const prefix = text.slice(0, index), suffix = text.slice(index);
      for (let position = value.indexOf(prefix); position >= 0; position = value.indexOf(prefix, position + 1)) {
        if (value.startsWith(suffix, position + index + 1)) record(position, false, index >= start && index < end);
      }
    }
  }
  const [match] = matches.values();
  return matches.size === 1 && !match.exact && match.extraInRange ? match : null;
}

export function attributeNedarimSegments(segments, references, pitch, name = "nedarim", { ignoredSourceItems = new Set() } = {}) {
  const contiguous = (first, second) => Math.abs(first.baseline - second.baseline) <= pitch * 1.3 && first.baseline !== second.baseline
    && Math.min(first.right, second.right) - Math.max(first.left, second.left) >= 0.5 * Math.min(first.right - first.left, second.right - second.left);
  const neighbors = (segment, direction) => segments.filter((candidate) => contiguous(segment, candidate)
    && Math.sign(candidate.baseline - segment.baseline) === direction);
  const textOf = (segment) => [...segment.items].filter((item) => !ignoredSourceItems.has(item))
    .sort((first, second) => second.transform[4] - first.transform[4])
    .map((item) => normalizeHebrew(decodePdfText(item.str))).join("");
  const conflicts = [];
  for (const segment of segments) {
    segment.scores = scoreNedarimSegment(segment, references);
    // Commentary font sizes already exclude the main text; quotations of it are not evidence either way.
    const total = (kind) => segment.scores[kind] + segment.scores.adjacent[kind];
    const strong = (kind) => segment.scores[kind] >= 12 || segment.scores.adjacent[kind] >= 24;
    if (strong("rashi") && strong("ran")) {
      conflicts.push(segment);
      segment.kind = segment.basis = null;
      continue;
    }
    const [best, second] = total("rashi") >= total("ran") ? ["rashi", "ran"] : ["ran", "rashi"];
    segment.kind = total(best) >= 12 && total(best) >= 4 * total(second) ? best : null;
    segment.basis = !segment.kind ? null : segment.scores[best] >= 12 ? "unique-amud-source-text" : "unique-adjacent-amud-source-text";
    if (segment.basis === "unique-adjacent-amud-source-text" && segment.scores.adjacent[best] < 24) segment.kind = segment.basis = null;
  }
  for (const segment of conflicts) {
    const sources = [references, ...(references.adjacent || [])];
    const below = neighbors(segment, -1);
    const anchor = below.length === 1 ? below[0] : null;
    const opposite = anchor?.kind === "rashi" ? "ran" : "rashi";
    const firstPage = name === "nedarim-2a" && references.title === "נדרים ב א" && sources.length === 2 && sources[1].title === "נדרים ב ב";
    if ((sources.length === 3 || firstPage) && sources.every((source) => source.main && source.rashi && source.ran)
      && anchor?.basis === "unique-amud-source-text" && neighbors(anchor, 1).length === 1
      && !anchor.scores[opposite] && !anchor.scores.adjacent[opposite]) {
      const rowText = textOf(segment), anchorText = textOf(anchor);
      if (rowText.length >= 20 && anchorText.length >= 20) {
        const text = rowText + anchorText.slice(0, 20);
        const match = uniqueNedarimInsertionMatch(sources, text, 0, rowText.length);
        if (match?.sourceIndex === 0 && match.kind === anchor.kind) {
          Object.assign(segment, { kind: anchor.kind, basis: "unique-amud-source-one-insertion-continuation" });
          continue;
        }
      }
    }
    throw new Error(`${name}: Nedarim segment matches both attributed Rashi and Ran at ${segment.baseline.toFixed(1)}`);
  }
  if (references.adjacent?.length === 2 && [references, ...references.adjacent].every((source) => source.main && source.rashi && source.ran)) {
    for (const segment of segments.filter((candidate) => !candidate.kind)) {
      const fragments = [...segment.items].sort((first, second) => second.transform[4] - first.transform[4])
        .map((item) => normalizeHebrew(decodePdfText(item.str)));
      fragments.push(fragments.join(""));
      const owners = new Set(), current = new Set();
      for (const text of fragments) for (let index = 0; index + 24 <= text.length; index++) {
        const fragment = text.slice(index, index + 24);
        for (const [sourceIndex, source] of [references, ...references.adjacent].entries()) for (const kind of ["main", "rashi", "ran"]) {
          if (source[kind].includes(fragment)) {
            owners.add(kind);
            if (!sourceIndex) current.add(kind);
          }
        }
      }
      if (owners.size !== 1) continue;
      const [kind] = owners;
      const opposite = kind === "rashi" ? "ran" : "rashi";
      if (kind === "main" || !current.has(kind) || segment.scores[opposite] || segment.scores.adjacent[opposite]) continue;
      segment.scores[kind] += 24;
      segment.kind = kind;
      segment.basis = "unique-amud-source-fragment";
    }
  }
  const nearest = (segment, direction) => {
    const visited = new Set([segment]);
    let current = segment;
    while (true) {
      const candidates = segments.filter((candidate) => !visited.has(candidate) && contiguous(current, candidate)
        && Math.sign(candidate.baseline - current.baseline) === direction);
      if (candidates.length !== 1) return null;
      [current] = candidates;
      visited.add(current);
      if (current.basis?.endsWith("source-text")) return current.kind;
    }
  };
  // Displaced commentary may come from an adjacent amud, but never against same-amud evidence in the same column.
  for (const segment of segments.filter((candidate) => candidate.basis === "unique-adjacent-amud-source-text")) {
    const sameColumn = segments.filter((candidate) => candidate.basis === "unique-amud-source-text" && contiguous(segment, candidate)
      && Math.abs(candidate.right - segment.right) <= 12);
    if (sameColumn.some((candidate) => candidate.kind !== segment.kind)) {
      throw new Error(`${name}: adjacent-amud ${segment.kind} evidence contradicts its column at ${segment.baseline.toFixed(1)}`);
    }
  }
  for (const segment of segments.filter((candidate) => !candidate.kind)) {
    const above = nearest(segment, 1), below = nearest(segment, -1);
    const opposite = above === "rashi" ? "ran" : "rashi";
    if (above && above === below && !segment.scores[opposite] && !segment.scores.adjacent[opposite]) {
      Object.assign(segment, { kind: above, basis: "contiguous-column-between-same-source-rows" });
    }
  }
  if (references.adjacent?.length === 2 && [references, ...references.adjacent].every((source) => source.main && source.rashi && source.ran)) {
    const proposals = new Map();
    const insertionProposals = new Set();
    for (const segment of segments.filter((candidate) => !candidate.kind)) for (const direction of [-1, 1]) {
      const path = [segment];
      while (path.length <= 2) {
        const current = path.at(-1);
        if ([-1, 1].some((side) => neighbors(current, side).length > 1)) break;
        const next = neighbors(current, direction)[0];
        if (!next || neighbors(next, -direction).length !== 1) break;
        path.push(next);
        if (!next.kind) continue;
        if (next.basis !== "unique-amud-source-text") break;
        const kind = next.kind, opposite = kind === "rashi" ? "ran" : "rashi";
        if (path.slice(0, -1).some((row) => row.scores[opposite] || row.scores.adjacent[opposite])) break;
        const ordered = [...path].sort((first, second) => second.baseline - first.baseline);
        const parts = ordered.map(textOf);
        if (parts.some((text) => text.length < 8)) break;
        const own = references[kind];
        let text = parts.join("");
        if (!own.includes(text) && ordered.length === 2 && ordered[0] === next && parts[0].length >= 16 && parts[1].length >= 20
          && text.length >= 40 && !next.scores[opposite] && !next.scores.adjacent[opposite]) {
          const match = uniqueNedarimInsertionMatch([references, ...references.adjacent], text, parts[0].length, text.length);
          if (match?.sourceIndex === 0 && match.kind === kind) {
            const kinds = proposals.get(segment) || new Set();
            kinds.add(kind);
            proposals.set(segment, kinds);
            insertionProposals.add(segment);
            break;
          }
        }
        if (!own.includes(text) && ordered.length === 2 && ordered[1] === next) {
          for (let length = parts[1].length - 1; length >= 24; length--) {
            const prefix = parts[0] + parts[1].slice(0, length);
            if (own.includes(prefix)) { text = prefix; break; }
          }
        }
        if (text.length < 24 || own.indexOf(text) < 0 || own.indexOf(text) !== own.lastIndexOf(text)) break;
        if ([references, ...references.adjacent].some((source, sourceIndex) => ["main", "rashi", "ran"]
          .some((other) => (sourceIndex || other !== kind) && source[other].includes(text)))) break;
        const kinds = proposals.get(segment) || new Set();
        kinds.add(kind);
        proposals.set(segment, kinds);
        break;
      }
    }
    for (const [segment, kinds] of proposals) if (kinds.size === 1) {
      Object.assign(segment, { kind: [...kinds][0], basis: insertionProposals.has(segment) ? "unique-amud-source-one-insertion-continuation" : "unique-ordered-source-continuation" });
    }
  }
  return segments;
}

// Rashi and Ran share one body font in these PDFs, so size cannot separate them. Their layout can: on every accepted side,
// column rows follow inner Rashi / outer Ran (12207 rows, 2 below-main exceptions, both fixed by text). Segments the text
// leaves unresolved take their column's kind unless they carry strong opposite evidence or their column chain disagrees;
// full-width rows only take a kind when every attributed full-width neighbour in the chain agrees. Beside the main text,
// where the layout is enforced, a short fragment (< 24 matched letters) quoted by the other commentary is re-attributed to
// its column when the rows directly above and below it in that column agree.
export function assignNedarimColumnLayout(segments, { innerRashi, gutter, pitch, main = [], mainPitch = pitch }) {
  const column = (segment) => segment.right <= gutter.left + 1 ? "left" : segment.left >= gutter.right - 1 ? "right" : null;
  const contiguous = (first, second) => Math.abs(first.baseline - second.baseline) <= pitch * 1.3 && first.baseline !== second.baseline
    && Math.min(first.right, second.right) - Math.max(first.left, second.left) >= 0.5 * Math.min(first.right - first.left, second.right - second.left);
  const chainKinds = (segment) => {
    const kinds = new Set();
    for (const direction of [-1, 1]) {
      const visited = new Set([segment]);
      for (let current = segment; ;) {
        const candidates = segments.filter((candidate) => !visited.has(candidate) && contiguous(current, candidate)
          && Math.sign(candidate.baseline - current.baseline) === direction && column(candidate) === column(segment));
        if (candidates.length !== 1) break;
        [current] = candidates;
        visited.add(current);
        if (current.kind && current.basis !== "nedarim-column-layout") { kinds.add(current.kind); break; }
      }
    }
    return kinds;
  };
  const weakAgainst = (segment, kind) => {
    const opposite = kind === "rashi" ? "ran" : "rashi";
    return segment.scores[opposite] < 12 && segment.scores.adjacent[opposite] < 24;
  };
  const proposals = new Map();
  for (const segment of segments.filter((candidate) => candidate.kind && column(candidate))) {
    const kind = column(segment) === innerRashi ? "rashi" : "ran";
    if (segment.kind === kind || segment.scores[segment.kind] + segment.scores.adjacent[segment.kind] >= 24
      || !main.some((row) => Math.abs(row.baseline - segment.baseline) <= mainPitch)) continue;
    const around = [-1, 1].map((direction) => segments.filter((candidate) => contiguous(segment, candidate)
      && Math.sign(candidate.baseline - segment.baseline) === direction && column(candidate) === column(segment)));
    if (around.every((rows) => rows.length === 1 && rows[0].kind === kind)) proposals.set(segment, kind);
  }
  for (const segment of segments.filter((candidate) => !candidate.kind)) {
    const position = column(segment);
    const kinds = chainKinds(segment);
    const kind = position ? (position === innerRashi ? "rashi" : "ran") : kinds.size === 1 ? [...kinds][0] : null;
    if (kind && weakAgainst(segment, kind) && [...kinds].every((value) => value === kind)) proposals.set(segment, kind);
  }
  for (const [segment, kind] of proposals) {
    Object.assign(segment, { kind, basis: segment.kind ? "nedarim-column-layout-over-short-quotation" : "nedarim-column-layout" });
  }
  return segments;
}

export async function processNedarimPage(definition, index, references, pdfBytes, { mainOnly = false } = {}) {
  const layout = definition.nedarimLayout;
  if (definition.slug !== "nedarim" || !layout) throw new Error("Nedarim attribution requires the Nedarim profile");
  // A missing commentary section only removes text evidence; its rows then come from the column layout alone.
  if (!references?.main || (!references.rashi && !references.ran)) throw new Error("Nedarim attribution requires main and attributed Rashi or Ran sources");
  if (Object.hasOwn(references, "tosafot") || (references.adjacent || []).some((source) => Object.hasOwn(source, "tosafot"))) {
    throw new Error("Nedarim attribution does not accept Tosafot references");
  }
  const daf = Math.floor(index / 2) + 2;
  const side = index % 2 ? "b" : "a";
  const name = `nedarim-${daf}${side}`;
  const packageUrl = import.meta.resolve("pdfjs-dist/package.json");
  const task = getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", packageUrl)),
    wasmUrl: fileURLToPath(new URL("wasm/", packageUrl)),
  });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error(`${name}: expected one page`);
    const page = await document.getPage(1);
    const items = (await page.getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const mainItems = itemsOfSize(items, [definition.mainSize]);
    let mainMatch = matchMainGlyphs(mainItems, references.main);
    const review = reviewedNedarimMainAlignments[name];
    if ((mainMatch.fragments < 2 || mainMatch.letters < 30) && review
      && review.pdfSha256 === createHash("sha256").update(pdfBytes).digest("hex") && review.revision === references.revision
      && review.mainSha256 === references.sha256?.main && review.mainSha256 === createHash("sha256").update(references.main).digest("hex")) {
      const aligned = alignNedarimMainGlyphs(mainItems, references.main, (references.adjacent || []).map((source) => source.main));
      if (aligned.fragments >= 2 && aligned.letters >= 30) mainMatch = { fragments: aligned.fragments, letters: aligned.letters, basis: "reviewed-pinned-ambiguous-nun-alignment", standard: mainMatch };
    }
    if (mainMatch.fragments < 2 || mainMatch.letters < 30) throw new Error(`${name}: insufficient main-text match`);
    const main = lines(mainItems, definition.mainPitch, "main");
    if (mainOnly) {
      return { name, sha256: createHash("sha256").update(pdfBytes).digest("hex"), view: page.view, mainMatch, groups: { main, rashi: [], tosafot: [], other: [] } };
    }
    const inWindow = (item) => item.transform[4] >= layout.window.left && item.transform[4] + item.width <= layout.window.right;
    const pitch = definition.commentaryPitch;
    const segments = groupRows(itemsOfSize(items, [...layout.bodySizes, ...layout.boldSizes]).filter(inWindow), 2)
      .flatMap((row) => splitNedarimRow(row, layout.gutter)).sort((first, second) => second.baseline - first.baseline || first.left - second.left);
    const inlineItems = itemsOfSize(items, layout.inlineSizes).filter(inWindow);
    const inline = attachNedarimInlineItems(segments, inlineItems, pitch, { gutter: layout.gutter, main });
    attributeNedarimSegments(segments, references, pitch, name, { ignoredSourceItems: new Set(inlineItems) });
    const innerRashi = side === "b" ? "left" : "right";
    assignNedarimColumnLayout(segments, { innerRashi, gutter: layout.gutter, pitch, main, mainPitch: definition.mainPitch });
    const unresolved = segments.filter((segment) => !segment.kind);
    if (unresolved.length) {
      throw new Error(`${name}: unresolved Nedarim commentary segments at ${unresolved.map((segment) => `${segment.baseline.toFixed(1)}/${segment.left.toFixed(0)}-${segment.right.toFixed(0)}`).join(", ")}`);
    }
    inline.resolve(name);
    for (const segment of segments) {
      const beside = main.filter((row) => Math.abs(row.baseline - segment.baseline) <= definition.mainPitch);
      if (!beside.length) continue;
      const mainLeft = Math.min(...beside.map((row) => row.left)), mainRight = Math.max(...beside.map((row) => row.right));
      const position = segment.right <= mainLeft ? "left" : segment.left >= mainRight ? "right" : null;
      if (!position) throw new Error(`${name}: Nedarim commentary overlaps the main-text band at ${segment.baseline.toFixed(1)}`);
      if ((segment.kind === "rashi") !== (position === innerRashi)) throw new Error(`${name}: ${segment.kind} beside main text is not in the expected column`);
    }
    if (!segments.some((segment) => segment.kind === "rashi") || !segments.some((segment) => segment.kind === "ran")) {
      throw new Error(`${name}: attributed Rashi and Ran were not both located`);
    }
    const groups = { main, rashi: [], tosafot: [], other: [] };
    const matches = [];
    for (const kind of ["rashi", "ran"]) {
      const owned = segments.filter((segment) => segment.kind === kind);
      const rows = owned.map((segment) => nedarimRow(segment, pitch, kind === "ran" ? "other" : "rashi"));
      groups[kind === "ran" ? "other" : "rashi"].push(...rows);
      const total = (key) => owned.reduce((sum, segment) => sum + segment.scores[key] + segment.scores.adjacent[key], 0);
      matches.push({ kind: kind === "ran" ? "other" : "rashi", source: kind === "ran" ? "Ran" : "Attributed Rashi",
        scores: { rashi: total("rashi"), tosafot: null, other: total("ran") },
        rows: rows.map(({ baseline, left, right }) => ({ baseline, left, right })) });
    }
    const result = { name, sha256: createHash("sha256").update(pdfBytes).digest("hex"), view: page.view, groups, matches, mainMatch,
      commentaryAttribution: { version: nedarimAttributionVersion, layout: "nedarim-attributed-rashi-ran", tosafot: null,
        source: references.source || null, revision: references.revision || null, sourceSha256: references.sha256 || null,
        adjacentSources: (references.adjacent || []).map(({ title, revision, sha256 }) => ({ title, revision, sha256 })),
        segments: Object.fromEntries(["unique-amud-source-text", "unique-adjacent-amud-source-text", "unique-amud-source-fragment", "unique-amud-source-one-insertion-continuation", "contiguous-column-between-same-source-rows", "unique-ordered-source-continuation", "nedarim-column-layout", "nedarim-column-layout-over-short-quotation"].map((basis) =>
          [basis, segments.filter((segment) => segment.basis === basis).length])) } };
    checkOverlap(result);
    return result;
  } finally {
    await task.destroy();
  }
}

export function calculateFrame(pages, { horizontal = 0, vertical = 0 } = {}) {
  const aligned = pages.some((page) => page.name?.startsWith("shekalim-") || page.frameGeometry);
  const sideOffsets = { a: shasDefinition({ slug: "shekalim" }, { mainOnly: true }).frameSideOffset, b: 0 };
  if (aligned && pages.some((page) => !/^shekalim-\d+[ab]$/.test(page.name) || page.frameGeometry?.version !== "shekalim-aligned-v1"
    || page.frameGeometry.horizontalOffset !== sideOffsets[page.name.at(-1)])) {
    throw new Error("Shekalim frames require a fingerprint-verified geometry rebuild on every measured side");
  }
  const all = pages.flatMap((page) => [...Object.values(page.groups).flat(), ...(page.frameRows || [])]
    .map((row) => aligned ? { ...row, left: row.left - page.frameGeometry.horizontalOffset, right: row.right - page.frameGeometry.horizontalOffset } : row));
  if (!all.length) throw new Error("No measured lines");
  return {
    left: Math.min(...all.map((row) => row.left)) - horizontal,
    right: Math.max(...all.map((row) => row.right)) + horizontal,
    bottom: Math.min(...all.map((row) => row.bottom ?? row.baseline - row.pitch / 2)) - vertical,
    top: Math.max(...all.map((row) => row.baseline + row.pitch * 0.7)) + vertical,
    ...(aligned ? { coordinateSpace: "shekalim-aligned-v1", sideOffsets } : {}),
  };
}

export function frameForPage(frame, page) {
  if (frame.coordinateSpace !== "shekalim-aligned-v1") return frame;
  const expectedOffset = page.name?.endsWith("a") ? shasDefinition({ slug: "shekalim" }, { mainOnly: true }).frameSideOffset : 0;
  if (!/^shekalim-\d+[ab]$/.test(page.name) || page.frameGeometry?.version !== frame.coordinateSpace
    || page.frameGeometry.horizontalOffset !== expectedOffset) throw new Error("Shekalim frame placement requires matching page geometry");
  const offset = page.frameGeometry.horizontalOffset;
  return { ...frame, left: frame.left + offset, right: frame.right + offset };
}

export function calculateAreas(pages, frame) {
  const frameArea = (frame.right - frame.left) * (frame.top - frame.bottom);
  if (!(frameArea > 0)) throw new Error("Invalid reference rectangle");
  for (const page of pages) {
    page.areas = {};
    for (const [kind, rows] of Object.entries(page.groups)) {
      const area = rows.reduce((sum, row) => sum + (row.right - row.left) * row.pitch, 0);
      page.areas[kind] = { rows: rows.length, area, fraction: area / frameArea };
    }
  }
  return frameArea;
}

async function main() {
  const pages = [];
  for (const definition of definitions) {
    const texts = await loadTexts(definition);
    for (let index = 0; index < definition.count; index++) {
      const references = { rashi: texts.rashi[index + 2] || "", tosafot: texts.tosafot[index + 2] || "" };
      pages.push(await processPage(definition, index, references));
    }
  }
  const totals = {};
  const frames = {};
  const frameAreas = {};
  for (const definition of definitions) {
    const selected = pages.filter((page) => page.name.startsWith(`${definition.slug}-`));
    frames[definition.slug] = calculateFrame(selected, { horizontal: 2, vertical: 2 });
    frameAreas[definition.slug] = calculateAreas(selected, frames[definition.slug]);
    totals[definition.slug] = Object.fromEntries(["main", "rashi", "tosafot"].map((kind) => [kind, selected.reduce((sum, page) => sum + page.areas[kind].fraction, 0)]));
  }
  const report = { frames, frameAreas, definitions, totals, pages, warning: "Exploratory line-box estimates; ornaments and unrecognized type variants may be omitted." };
  await mkdir("results", { recursive: true });
  await writeFile(join("results", "corpus-measurements.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ frames, frameAreas, totals, pages: pages.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();