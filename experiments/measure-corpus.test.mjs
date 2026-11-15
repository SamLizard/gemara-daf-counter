import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyReviewedGittin76bEvidence, calculateAreas, calculateFrame, checkOverlap, classifyHorayotTosafot, classifyMissingCategories, decodeMainGlyphText, decodePdfText, groupRows, identifyCommentaryRun, identifyRun, includeStreamFragments, isAmbiguousRetryCandidate, isCommentaryRetryCandidate, isLegacyCommentaryAuditCandidate, isOverlapRetryCandidate, loadTexts, matchMainGlyphs, matchScore, normalizeHebrew, preserveRetryPage, preserveRetryTosafot, processPage, redistributeLeadingFragments, resolveCommentaryCatchwords, resolveMainStreamFragments, splitCommentaryRuns, splitRuns, verifyOverlapRetrySources } from "./measure-corpus.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { shasDefinition } from "./shas-profiles.mjs";
import { amudIndex, tractates } from "./shas-catalog.mjs";
import { applySotahPdfReview, applyWikisourceAbsence, applyWikisourceRashiAbsence, classifySotahTosafot, classifyWikisourceTosafot, hasEmptyRegularTosafotSection, hasNoTosafotSections, loadWikisourcePages, needsWikisourceAbsence, needsWikisourceRashiAbsence, parseTosafotSection, regularRashiAbsenceBasis, sotahWikiTitle, wikisourceTitle } from "./sotah-wikisource.mjs";

const item = (text, x, y, width = 20) => ({ str: text, transform: [0, 0, 0, 0, x, y], width });

test("Shekalim filters marginal frame items before grouping without filtering wide main items", async () => {
  const { selectFrameItems } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "shekalim" }, { mainOnly: true });
  const fragments = [item("margin", 29.64, 900, 67.97), item("commentary", 106.19, 900, 119.06),
    item("wide main", 106.19, 890, 425.19), item("right commentary", 413, 900, 118.5), item("outer", 539.88, 900, 76.62)];
  const before = structuredClone(fragments);
  assert.deepEqual(selectFrameItems(fragments, definition, "b"), fragments.slice(1, 4));
  const shifted = fragments.map((fragment) => ({ ...fragment, transform: [0, 0, 0, 0, fragment.transform[4] + 85.08, fragment.transform[5]] }));
  assert.deepEqual(selectFrameItems(shifted, definition, "a"), shifted.slice(1, 4));
  assert.equal(groupRows(selectFrameItems(fragments, definition, "b"))[0].left, 106.19);
  assert.deepEqual(selectFrameItems(fragments, shasDefinition({ slug: "tamid" }, { mainOnly: true }), "b"), fragments);
  assert.deepEqual(fragments, before);
});

test("Middot filters right marginal frame items on both sides", async () => {
  const { selectFrameItems } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "middos" }, { mainOnly: true });
  const fragments = [item("body", 90, 900, 420), item("right margin", 530, 900, 50)];
  assert.deepEqual(selectFrameItems(fragments, definition, "a"), fragments.slice(0, 1));
  assert.deepEqual(selectFrameItems(fragments, definition, "b"), fragments.slice(0, 1));
});

test("Middot cached sides preserve main rows and fit the reviewed right edge", async (context) => {
  const { rebuildMiddotFrame } = await import("./measure-corpus.mjs");
  let work;
  try { work = JSON.parse(await readFile("results/shas-work/middos.json", "utf8")); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Middot checkpoint unavailable"); return; } throw error; }
  const definition = tractates.find((tractate) => tractate.slug === "middos");
  const pages = [];
  for (const [amud, expectedRows] of [["34a", 100], ["34b", 117], ["35a", 101], ["35b", 109], ["36a", 76], ["36b", 93], ["37a", 50], ["37b", 44]]) {
    const saved = work.pages[amud].page;
    let bytes;
    try { bytes = (await getCachedPdf(definition, amud, { expectedHash: saved.sha256, cacheOnly: true })).bytes; }
    catch (error) { if (error.message.includes("not available in the local cache")) { context.skip(`Pinned PDF fixture unavailable: ${amud}`); return; } throw error; }
    const rebuilt = await rebuildMiddotFrame(saved, bytes);
    assert.deepEqual(rebuilt.groups, saved.groups);
    assert.equal(rebuilt.frameRows.length, expectedRows);
    await assert.rejects(rebuildMiddotFrame({ ...saved, sha256: "0".repeat(64) }, bytes), /saved PDF fingerprint/);
    pages.push(rebuilt);
  }
  const frame = calculateFrame(pages, { horizontal: 2, vertical: 2 });
  assert.ok(Math.abs(frame.right - 515.2148289105725) < 0.001);
  assert.ok(Math.abs(frame.top - 1140.355547312) < 0.001);
});

test("Shekalim common frame translates sides without changing numerators or denominators", async () => {
  const { frameForPage } = await import("./measure-corpus.mjs");
  const row = { left: 106.19, right: 531.38, baseline: 900, pitch: 9.72 };
  const pages = ["a", "b"].map((side) => ({ name: `shekalim-2${side}`,
    frameGeometry: { version: "shekalim-aligned-v1", horizontalOffset: side === "a" ? 85.08 : 0 },
    groups: { main: [{ ...row, left: row.left + (side === "a" ? 85.08 : 0), right: row.right + (side === "a" ? 85.08 : 0) }], rashi: [], tosafot: [] } }));
  const before = structuredClone(pages);
  const frame = calculateFrame(pages, { horizontal: 2, vertical: 2 });
  const placed = pages.map((page) => frameForPage(frame, page));
  assert.ok(Math.abs(placed[0].left - placed[1].left - 85.08) < 1e-10);
  assert.ok(Math.abs(placed[0].right - placed[1].right - 85.08) < 1e-10);
  assert.equal(placed[0].top, placed[1].top);
  assert.equal(placed[0].bottom, placed[1].bottom);
  for (const rectangle of placed) assert.ok(Math.abs(calculateAreas(structuredClone(pages), rectangle) - calculateAreas(pages, frame)) < 1e-8);
  assert.ok(Math.abs(pages[0].areas.main.fraction - pages[1].areas.main.fraction) < 1e-14);
  for (let index = 0; index < pages.length; index++) assert.deepEqual(pages[index].groups, before[index].groups);
  assert.throws(() => calculateFrame([{ ...pages[0], frameGeometry: undefined }, pages[1]]), /geometry rebuild/);
  assert.throws(() => frameForPage(frame, { ...pages[0], frameGeometry: undefined }), /matching page geometry/);
  const unrelated = { name: "tamid-2a", groups: { main: [row] } };
  const legacy = calculateFrame([unrelated], { horizontal: 2, vertical: 2 });
  assert.deepEqual(legacy, { left: 104.19, right: 533.38, bottom: 893.14, top: 908.804 });
  assert.equal(frameForPage(legacy, unrelated), legacy);
});

test("Shekalim pinned cached sides preserve every main row and genuine commentary in aligned frames", async (context) => {
  const { processMainPage, rebuildShekalimFrame, frameForPage } = await import("./measure-corpus.mjs");
  const fixtures = [
    ["2a", "82ef64ca9f7fd05bf9af160f1c91094cfc103b591ff179008ac6184d2c412973", 329, 159],
    ["2b", "38128e6d46a86fa8081faffa7c6f154b4d46bd1643949cd243c5c198d10d843b", 294, 130],
    ["9b", "577e1c37c77b752750392753cbf788ffdb438795297622b173e5ae1d3ce18a06", 318, 76],
    ["14a", "ff36180c30f5b772ac5ab69a0416dd3ac07effca617c36625fc4dfe4ccc3213c", 312, 127],
    ["22b", "68a0ca1e7e742e0392f26b74bca037e204b4d7bb220082e0b6eedc00c748722e", 57, 36],
  ];
  const definition = shasDefinition({ slug: "shekalim" }, { mainOnly: true });
  const pages = [];
  for (const [amud, sha256, retained, removed] of fixtures) {
    let bytes;
    try {
      bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true,
        fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
    } catch (error) {
      if (error.message.includes("not available in the local cache")) { context.skip(`Pinned PDF fixture unavailable: ${amud}`); return; }
      throw error;
    }
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
    const task = getDocument({ data: new Uint8Array(bytes) });
    let items;
    try {
      items = (await (await task.promise).getPage(1).then((page) => page.getTextContent())).items.filter((fragment) => fragment.str?.trim() && fragment.width > 0 && fragment.height > 0);
    } finally { await task.destroy(); }
    const mainItems = items.filter((fragment) => Math.abs(fragment.height - definition.mainSize) < 0.02);
    const reference = mainItems.map((fragment) => normalizeHebrew(decodeMainGlyphText(fragment.str))).join("");
    const before = await processMainPage({ ...definition, frameWindow: undefined }, amudIndex(amud) - 4, reference, bytes);
    const after = await processMainPage(definition, amudIndex(amud) - 4, reference, bytes);
    assert.deepEqual(after.groups, before.groups);
    assert.deepEqual(after.mainMatch, before.mainMatch);
    const candidates = items.filter((fragment) => definition.frameSizes.some((size) => Math.abs(fragment.height - size) < 0.02));
    const kept = (await import("./measure-corpus.mjs")).selectFrameItems(candidates, definition, amud.at(-1));
    assert.equal(kept.length, retained);
    assert.equal(candidates.length - kept.length, removed);
    const saved = { ...before, matches: [{ kind: "existing-evidence" }], areas: { main: { area: 123, fraction: 0.1 } } };
    const snapshot = structuredClone(saved);
    const rebuilt = await rebuildShekalimFrame(saved, bytes);
    assert.deepEqual(rebuilt, { ...saved, frameRows: after.frameRows, frameGeometry: after.frameGeometry });
    assert.deepEqual(saved, snapshot);
    await assert.rejects(rebuildShekalimFrame({ ...saved, sha256: "0".repeat(64) }, bytes), /saved PDF fingerprint/);
    await assert.rejects(rebuildShekalimFrame({ ...saved, view: [0, 0, 1, 1] }, bytes), /view differs/);
    if (amud === "9b") assert.ok(after.frameRows.some((row) => row.left < 107 && row.right > 225 && row.baseline > 880));
    if (amud === "14a") assert.ok(after.groups.main.some((row) => row.right > 616.37 && row.right < 616.39));
    pages.push(after);
  }
  const frame = calculateFrame(pages, { horizontal: 2, vertical: 2 });
  assert.ok(Math.abs(frame.left - 104.18843913259376) < 0.001);
  assert.ok(Math.abs(frame.right - 533.8030914660592) < 0.001);
  const denominator = calculateAreas(pages, frame);
  for (const page of pages) {
    const placed = frameForPage(frame, page);
    assert.ok(Math.abs(calculateAreas([structuredClone(page)], placed) - denominator) < 1e-7);
    for (const row of [...page.groups.main, ...page.frameRows]) {
      assert.ok(row.left >= placed.left && row.right <= placed.right, `${page.name}: full-width row clipped`);
      assert.ok(row.bottom >= placed.bottom && row.baseline + row.pitch * 0.7 <= placed.top);
    }
  }
});

test("commentary catchwords require standalone terminal geometry and fingerprinted source endings", () => {
  const body = [item("ביאוררשימובהקראשוןארוך", 100, 120, 100), item("ביאוררשימובהקשניארוך:", 100, 110, 100)];
  const tail = { ...item("עובד", 114, 100, 14), height: 10 };
  const snapshot = (text, amud, revision, openingWord = "") => ({ text, amud, revision, openingWord, title: `ערכין ${amud}`, tractate: "arachin", commentary: "rashi",
    source: `https://he.wikisource.org/?oldid=${revision}`, contentSha256: "1".repeat(64), sha256: createHash("sha256").update(JSON.stringify([text, openingWord])).digest("hex") });
  const current = snapshot(normalizeHebrew(body.map((item) => item.str).join(" ")), "2a", 42);
  const next = snapshot("עובדכוכביםוחבירו", "2b", 43, "עובד");
  const references = { rashi: current.text, commentarySources: { rashi: { current, next } } };
  const items = [...body, tail];
  const makeStreams = (expanded = items) => [{ run: items, expanded: [...expanded], kind: "rashi" }];
  const streams = makeStreams();
  const result = resolveCommentaryCatchwords(items, streams, 10, references);
  assert.equal(result.length, 1);
  assert.deepEqual(streams[0].expanded, body);
  assert.equal(result[0].nextSource.sha256, next.sha256);
  assert.equal(result[0].frameRow.baseline, 100);
  for (const changed of [
    {}, { ...references, commentarySources: {} },
    { ...references, commentarySources: { rashi: { current, next: { ...next, sha256: "0".repeat(64) } } } },
    { ...references, commentarySources: { rashi: { current, next: { ...next, openingWord: "עובדכוכבים" } } } },
    { ...references, commentarySources: { rashi: { current, next: { ...next, amud: "3a" } } } },
    { ...references, commentarySources: { rashi: { current, next: { ...next, tractate: "menachos" } } } },
    { ...references, commentarySources: { rashi: { current, next: { ...next, commentary: "tosafot" } } } },
    { ...references, commentarySources: { rashi: { current, next: { ...next, contentSha256: undefined } } } },
    { ...references, commentarySources: { rashi: { current: snapshot(current.text + "עובד", "2a", 42), next } } },
    { ...references, tosafot: current.text },
  ]) {
    const negative = makeStreams();
    assert.deepEqual(resolveCommentaryCatchwords(items, negative, 10, changed), []);
    assert.deepEqual(negative[0].expanded, items);
  }
  for (const changed of [
    [...items, { ...item("כוכבים", 130, 100), height: 10 }],
    [...body, { ...tail, transform: [0, 0, 0, 0, 114, 109] }],
    [...body, { ...tail, width: 60 }],
    [...body, { ...tail, transform: [0, 0, 0, 0, 99, 100] }],
  ]) {
    const negative = [{ run: changed, expanded: [...changed], kind: "rashi" }];
    assert.deepEqual(resolveCommentaryCatchwords(changed, negative, 10, references), []);
    assert.deepEqual(negative[0].expanded, changed);
  }
  assert.deepEqual(resolveCommentaryCatchwords(items, [], 10, references), []);
});

test("mid-sentence catchwords under a short last line use the column edge and exact source ending", () => {
  const body = [item("פירושראשוןארוךמאד", 100, 120, 100), item("פירוששניארוךמאד", 100, 110, 100), item("ומיהובריש", 114, 100, 86)];
  const tail = { ...item("פירקין", 114, 90, 14), height: 10 };
  const snapshot = (text, amud, revision, openingWord = "") => ({ text, amud, revision, openingWord, title: `מנחות ${amud}`, tractate: "menachos", commentary: "tosafot",
    source: `https://he.wikisource.org/?oldid=${revision}`, contentSha256: "1".repeat(64), sha256: createHash("sha256").update(JSON.stringify([text, openingWord])).digest("hex") });
  const current = snapshot(normalizeHebrew(body.map((fragment) => fragment.str).join(" ")), "60a", 42);
  const commentarySources = { tosafot: { current, next: snapshot("פירקיןהמשך", "60b", 43, "פירקין") } };
  const items = [...body, tail];
  const streams = [{ run: items, expanded: [...items], kind: "tosafot" }];
  const result = resolveCommentaryCatchwords(items, streams, 10, { tosafot: current.text, commentarySources });
  assert.equal(result.length, 1);
  assert.deepEqual(streams[0].expanded, body);
  const flush = [item(body[0].str, 114, 120, 86), item(body[1].str, 114, 110, 86), body[2], tail];
  assert.deepEqual(resolveCommentaryCatchwords(flush, [{ run: flush, expanded: [...flush], kind: "tosafot" }], 10, { tosafot: current.text, commentarySources }), []);
  const joined = [{ run: items, expanded: [...items], kind: "tosafot" }];
  assert.deepEqual(resolveCommentaryCatchwords(items, joined, 10, { tosafot: `${current.text}פירקין`, commentarySources }), []);
});

test("Menachot manuscript-Rashi label switches commentary sizes and run pitch only on an exact single label", async () => {
  const { findLabelledVariant, runPitch } = await import("./measure-corpus.mjs");
  const spec = shasDefinition(tractates.find((tractate) => tractate.slug === "menachos")).labelledVariant;
  const label = spec.label.map((text, index) => ({ ...item(text, 300 - index * 5, 742, 4), height: 12.53 }));
  assert.deepEqual(findLabelledVariant([item("x", 0, 0), ...label], spec, "menachos-x"), { name: "rashi-manuscript", itemIndex: 1, baseline: 742 });
  assert.equal(findLabelledVariant(label.map((part, index) => index === 2 ? { ...part, str: "x" } : part), spec, "menachos-x"), null);
  assert.equal(findLabelledVariant(label.map((part) => ({ ...part, height: 9.64 })), spec, "menachos-x"), null);
  assert.equal(findLabelledVariant(label.map((part, index) => index === 4 ? { ...part, transform: [0, 0, 0, 0, 280, 700] } : part), spec, "menachos-x"), null);
  assert.throws(() => findLabelledVariant([...label, ...label], spec, "menachos-x"), /multiple rashi-manuscript labels/);
  const sized = (height, count) => Array.from({ length: count }, (_, index) => ({ ...item("a", index, 0), height }));
  const layout = { commentaryPitch: 9.42, ...spec };
  assert.equal(runPitch([...sized(8.05, 3), ...sized(9.64, 1)], layout), 7.17);
  assert.equal(runPitch([...sized(8.05, 1), ...sized(9.64, 3)], layout), 9.42);
  assert.throws(() => runPitch([...sized(8.05, 2), ...sized(9.64, 2)], layout), /no dominant body size/);
  assert.equal(runPitch(sized(8.05, 3), { commentaryPitch: 9.42 }), 9.42);
});

test("synthetic Sefaria current Rashi continuation overrides a true same-commentary Wikisource next opening", () => {
  const body = [item("ביאוררשימובהקראשוןארוך", 100, 120, 100), item("ביאוררשימובהקשניארוך:", 100, 110, 100)];
  const tail = { ...item("עובד", 114, 100, 14), height: 10 };
  const currentText = normalizeHebrew(body.map((fragment) => fragment.str).join(" "));
  const snapshot = (text, amud, revision, openingWord = "") => ({ text, amud, revision, openingWord, title: `ערכין ${amud}`, tractate: "arachin", commentary: "rashi",
    source: `https://he.wikisource.org/?oldid=${revision}`, contentSha256: "1".repeat(64), sha256: createHash("sha256").update(JSON.stringify([text, openingWord])).digest("hex") });
  const commentarySources = { rashi: { current: snapshot(currentText, "2a", 42), next: snapshot("עובדכוכביםוחבירו", "2b", 43, "עובד") } };
  const items = [...body, tail];
  const streams = () => [{ kind: "rashi", run: items, expanded: [...items] }];
  const sefariaCurrent = currentText + "עובדכוכביםהמשךהפירוש";
  const conflicted = streams();
  assert.deepEqual(resolveCommentaryCatchwords(items, conflicted, 10, { rashi: sefariaCurrent, commentarySources }), []);
  assert.deepEqual(conflicted[0].expanded, items);
  for (const rashi of [currentText, "עובדהוזכרמוקדםיותר" + currentText]) {
    const unconflicted = streams();
    assert.equal(resolveCommentaryCatchwords(items, unconflicted, 10, { rashi, commentarySources }).length, 1);
    assert.deepEqual(unconflicted[0].expanded, body);
  }
});

test("splits downward contiguous commentary only with independent source and geometry", () => {
  const upper = [item("ביאורתוספותמובהקראשון", 100, 100), item("ביאורתוספותמובהקשני", 100, 90)];
  const lower = [item("ביאוררשבםמובהקראשון", 100, 40), item("ביאוררשבםמובהקשני", 100, 30)];
  const run = [...upper, ...lower];
  const references = { tosafot: normalizeHebrew(upper.map((item) => item.str).join(" ")), other: normalizeHebrew(lower.map((item) => item.str).join(" ")) };
  assert.equal(splitRuns(run).length, 1);
  assert.deepEqual(splitCommentaryRuns(run, references, "test"), [upper, lower]);
  assert.deepEqual(splitCommentaryRuns(run, { tosafot: references.tosafot + references.other }, "test"), [run]);
  const contaminated = { ...references, tosafot: references.tosafot + references.other };
  assert.equal(identifyRun(run, contaminated, "test").kind, "tosafot");
  assert.throws(() => splitCommentaryRuns(run, contaminated, "test"), /separated block lacks independent ownership/);
  assert.throws(() => splitCommentaryRuns(run, { ...references, rashi: references.other }, "test"), /separated block lacks independent ownership/);
  const nearby = [...upper, ...lower.map((item) => ({ ...item, transform: [0, 0, 0, 0, 100, item.transform[5] + 40] }))];
  assert.throws(() => splitCommentaryRuns(nearby, references, "test"), /ambiguous commentary substream boundaries/);
  const close = [...upper, ...lower.map((item) => ({ ...item, transform: [0, 0, 0, 0, 100, item.transform[5] + 30] }))];
  assert.throws(() => splitCommentaryRuns(close, references, "test"), /ambiguous commentary substream boundaries/);
  assert.deepEqual(splitCommentaryRuns(close, { tosafot: references.tosafot + references.other, other: references.other }, "test"), [close]);
  assert.equal(identifyRun(close, contaminated, "test").kind, "tosafot");
  const separateColumns = [...upper, ...close.slice(2).map((item) => ({ ...item, transform: [0, 0, 0, 0, 200, item.transform[5]] }))];
  assert.deepEqual(splitCommentaryRuns(separateColumns, references, "test"), [upper, separateColumns.slice(2)]);
});

test("rejects multiple independently supported cut points and insufficient single-row evidence", () => {
  const upper = [item("ביאורתוספותמובהקראשון", 100, 200), item("ביאורתוספותמובהקשני", 100, 190)];
  const middle = [item("", 100, 140)];
  const lower = [item("ביאוררשבםמובהקראשון", 100, 90), item("ביאוררשבםמובהקשני", 100, 80)];
  const references = { tosafot: normalizeHebrew(upper.map((item) => item.str).join(" ")), other: normalizeHebrew(lower.map((item) => item.str).join(" ")) };
  assert.throws(() => splitCommentaryRuns([...upper, ...middle, ...lower], references, "test"), /ambiguous commentary substream boundaries/);
  const run = [upper[0], ...lower];
  assert.deepEqual(splitCommentaryRuns(run, references, "test"), [run]);
});

test("catchword ownership requires bounded main context, not a next-page word match alone", () => {
  assert.equal(decodeMainGlyphText("\u00d4\u00c8\u00cf\u2021\u00c2\u201a\u00c2"), "וגואלין");
  const mainItems = [item("\u00ce".repeat(18), 100, 110), item("\u00c2".repeat(18), 100, 100)];
  const reference = [...mainItems].map((item) => normalizeHebrew(decodeMainGlyphText(item.str))).join("");
  const tail = { ...item("\u201e\u00b7\u00c2\u00da", 100, 90), height: 12 };
  const body = item("וגואלין לעולם פירוש רשי", 200, 130);
  const items = [...mainItems, tail, body];
  const makeStream = () => [{ run: [body], expanded: [body, tail], kind: "rashi" }];
  const mainRows = groupRows(mainItems).map((row) => ({ ...row, pitch: 10, top: row.baseline + 10, bottom: row.baseline - 5 }));
  let streams = makeStream();
  const ownership = resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, { main: reference, nextMain: "עובדכוכבים" });
  assert.equal(ownership.at(-1)?.kind, "catchword");
  assert.deepEqual(streams[0].expanded, [body]);
  const saved = ownership[0].frameRow;
  const previous = { unknownCategories: ["rashi"], page: { sha256: "pdf", groups: { main: mainRows, rashi: [saved] } } };
  const page = { sha256: "pdf", groups: { main: mainRows, rashi: [] }, fragmentOwnership: ownership };
  assert.doesNotThrow(() => preserveRetryPage(previous, { page }));
  for (const changed of [
    { ...page, fragmentOwnership: [] }, { ...page, sha256: "different" },
    { ...page, fragmentOwnership: [{ ...ownership[0], mainContext: { fragments: 1, letters: 18 } }] },
    { ...page, fragmentOwnership: [{ ...ownership[0], nextMainSourceSha256: undefined }] },
    { ...page, fragmentOwnership: [{ ...ownership[0], previousKind: "tosafot" }] },
  ]) assert.throws(() => preserveRetryPage(previous, { page: changed }), /rashi could not/);
  assert.throws(() => preserveRetryPage({ ...previous, page: { ...previous.page, groups: { ...previous.page.groups, rashi: [{ ...saved, right: saved.right + 1 }] } } }, { page }), /rashi could not/);
  for (const references of [{ main: "", nextMain: "עובד" }, { main: reference, nextMain: "אחר" }]) {
    streams = makeStream();
    assert.deepEqual(resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, references), []);
    assert.ok(streams[0].expanded.includes(tail));
  }
  streams = [{ run: [body, tail], expanded: [body, tail], kind: "rashi" }];
  assert.deepEqual(resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, { main: reference, nextMain: "עובד" }), []);
  assert.ok(streams[0].expanded.includes(tail));
  const twin = { ...tail, width: 10, transform: [0, 0, 0, 0, 105, 90] };
  streams = [{ run: [body], expanded: [body, tail, twin], kind: "rashi" }];
  assert.deepEqual(resolveMainStreamFragments([...mainItems, tail, twin, body], streams, mainItems, mainRows, 10, { main: reference, nextMain: "עובד" }), []);
});

test("main catchword retry coverage requires every real fragment of a previously merged row", () => {
  const mainItems = [item("\u00ce".repeat(18), 100, 110), item("\u00c2".repeat(18), 100, 100)];
  const reference = mainItems.map((fragment) => normalizeHebrew(decodeMainGlyphText(fragment.str))).join("");
  const tail = { ...item("\u201e\u00b7\u00c2\u00da", 100, 90), height: 12 };
  const body = { ...item("ביאוררשימובהקראשון", 200, 130), height: 10 };
  const genuine = { ...item("פירושרשימובהקאמיתי", 200, 90), height: 10 };
  const items = [...mainItems, tail, body, genuine];
  const streams = [{ run: [body, genuine], expanded: [body, genuine, tail], kind: "rashi" }];
  const mainRows = groupRows(mainItems).map((row) => ({ ...row, pitch: 10, top: row.baseline + 10, bottom: row.baseline - 5 }));
  const ownership = resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, { main: reference, nextMain: "עובדכוכבים" });
  assert.equal(ownership[0].kind, "catchword");
  const saved = ownership[0].previousRow;
  assert.equal(saved.left, 100);
  assert.equal(saved.right, 220);
  const retained = { baseline: 90, left: 200, right: 220, pitch: 10 };
  const previous = { page: { sha256: "pdf", groups: { main: mainRows, rashi: [saved] } } };
  const page = { sha256: "pdf", groups: { main: mainRows, rashi: [retained] }, fragmentOwnership: ownership };
  assert.doesNotThrow(() => preserveRetryPage(previous, { page }));
  assert.throws(() => preserveRetryPage(previous, { page: { ...page, groups: { ...page.groups, rashi: [] } } }), /rashi could not/);
  assert.throws(() => preserveRetryPage(previous, { page: { ...page, groups: { ...page.groups, rashi: [{ ...retained, right: 219 }] } } }), /rashi could not/);
  assert.throws(() => preserveRetryPage({ page: { ...previous.page, groups: { ...previous.page.groups, rashi: [{ ...saved, right: 221 }] } } }, { page }), /rashi could not/);
  assert.throws(() => preserveRetryPage(previous, { page: { ...page, fragmentOwnership: [{ ...ownership[0], previousRow: undefined }] } }), /rashi could not/);
});

test("detached main fragments require direct source ownership and reject commentary conflicts", () => {
  const mainItems = [item("\u00ce".repeat(18), 100, 110), item("\u00c2".repeat(18), 100, 100)];
  const context = mainItems.map((item) => normalizeHebrew(decodeMainGlyphText(item.str))).join("");
  const body = item("ביאוררשימובהקראשון", 200, 150);
  const mainText = "קטעמקורראשימובהק";
  const commentaryText = "קטעפירושרשימובהק";
  const encoded = "\u00b7".repeat(12);
  const encodedText = normalizeHebrew(decodeMainGlyphText(encoded));
  for (const [text, references, accepted] of [
    ["לאמופיעבמקורכלל", { main: context }, false],
    [commentaryText, { main: context, rashi: commentaryText }, false],
    [mainText, { main: context + mainText, rashi: mainText }, false],
    [encoded, { main: context, rashi: encodedText }, false],
    [mainText, { main: context + mainText }, true],
    [encoded, { main: context + encodedText }, true],
  ]) {
    const fragment = { ...item(text, 125, 100), height: 12 };
    const items = [...mainItems, fragment, body];
    const streams = [{ run: [body], expanded: [body, fragment], kind: "rashi" }];
    const mainRows = groupRows(mainItems).map((row) => ({ ...row, pitch: 10, top: row.baseline + 10, bottom: row.baseline - 5 }));
    const resolve = () => resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, references);
    if (accepted) {
      const ownership = resolve();
      assert.equal(ownership[0].kind, "main");
      assert.equal(mainRows[1].right, 145);
      assert.deepEqual(streams[0].expanded, [body]);
      const saved = ownership[0].frameRow;
      const previous = { page: { sha256: "pdf", groups: { main: [{ ...mainRows[1], right: 120 }], rashi: [saved] } } };
      const page = { sha256: "pdf", groups: { main: mainRows, rashi: [] }, fragmentOwnership: ownership };
      assert.doesNotThrow(() => preserveRetryPage(previous, { page }));
      assert.throws(() => preserveRetryPage(previous, { page: { ...page, groups: { ...page.groups, main: [{ ...mainRows[1], right: 120 }] } } }), /rashi could not/);
    } else {
      assert.throws(resolve, /direct ownership not established/);
      assert.equal(mainRows[1].right, 120);
      assert.deepEqual(streams[0].expanded, [body, fragment]);
    }
  }
});

test("nonlexical main markers require a complete tightly bounded letter-and-bracket marker", () => {
  const mainItems = [item("\u00ce".repeat(18), 100, 110, 40), item("\u00c2".repeat(18), 100, 100, 40)];
  const reference = mainItems.map((item) => normalizeHebrew(decodeMainGlyphText(item.str))).join("");
  const body = item("ביאוררשימובהקראשון", 200, 150);
  for (const [parts, accepted] of [
    [[{ ...item("א[", 120, 100, 8), height: 8 }], true],
    [[{ ...item("א", 124, 100, 4), height: 8 }, { ...item("[", 120, 100, 3), height: 8 }], true],
    [[{ ...item("א", 120, 100, 4), height: 8 }], false],
    [[{ ...item("א[", 148, 100, 8), height: 8 }], false],
  ]) {
    const items = [...mainItems, ...parts, body];
    const streams = [{ run: [body], expanded: [body, ...parts], kind: "rashi" }];
    const mainRows = groupRows(mainItems).map((row) => ({ ...row, pitch: 10, top: row.baseline + 10, bottom: row.baseline - 5 }));
    const resolve = () => resolveMainStreamFragments(items, streams, mainItems, mainRows, 10, { main: reference });
    if (accepted) {
      assert.equal(resolve().length, parts.length);
      assert.deepEqual(streams[0].expanded, [body]);
    } else assert.throws(resolve, /direct ownership not established/);
  }
});

test("cached Pesachim, Bava Batra and Arakhin regressions preserve main, bold fragments and real Rashi", async (context) => {
  const cases = [
    ["pesachim", "110a", "21c63f89a3875ef1449f1e3975b348b1128cd833886158578f392a5d4fa02b81", 2891045, [37, 31, 16, 33]],
    ["pesachim", "111a", "47398ac89e87e5e0f3828235debdb15808b79c13d3cf2ae4b94577d10c7386ff", 1066324, [40, 36, 12, 26]],
    ["pesachim", "111b", "a07e6a7d0210384ea6456aceeaaf422527bae6e9b2faad965fa2593002514e6b", 1066325, [42, 37, 14, 25]],
    ["pesachim", "113a", "0a2849a1c757185616f6fea5f251b50507a2f0f7cdc65c5393205470d1d016f1", 1066329, [32, 44, 18, 17]],
    ["pesachim", "118b", "e181048b1b74fa4657fe10701a3ed83d4e4da9a4a83b6a023de89ebf963d5e63", 1066337, [48, 16, 9, 49]],
    ["pesachim", "119a", "62e0dcfcad65fd1a1b28c559322c17b5977eab9efcaa688319df046069335152", 1066338, [37, 27, 4, 31]],
    ["bava-basra", "29a", "c5f51accbda5f56bf3c870b877249f720e1281e393718d6a27bbc2ae08cead6b", 1180204, [38, 14, 39, 48]],
    ["bava-basra", "29b", "12d5ab7e9b4dcc4af6c6d8aa2f6ea3ebf0f222b66e6ece457b8535493670c1a4", 1180207, [27, 0, 66, 64]],
    ["arachin", "2a", "d2ceda04982c9b7059fb567b3026a61e6f2a0838cf48d73a45f35428e9d63145", 1422501, [35, 57, 72, 0], "2b"],
    ["arachin", "2b", "0cf92b0515e60277ab54c3077a765f78006c399fc8809e1e338fa2db293b1a6e", 1066024, [41, 42, 74, 0], "3a"],
    ["arachin", "3b", "f32aa7068cb8af4fb76fa35ddc8af1a297c4f714a3ed8bbf9efecd93b7af9851", 1066026, [44, 45, 71, 0], "4a"],
  ];
  for (const [slug, amud, sha256, revision, counts, nextAmud] of cases) await context.test(`${slug} ${amud}`, async (check) => {
    const definition = shasDefinition(tractates.find((tractate) => tractate.slug === slug));
    let bytes, cached;
    try {
      bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true })).bytes;
      cached = JSON.parse(await readFile(join("results", "wikisource-cache", `${slug}.json`), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error.message.includes("not available in the local cache")) return check.skip("Matching local fixtures unavailable; no network fetch permitted");
      throw error;
    }
    assert.equal(cached[amud]?.revisions?.[0]?.revid, revision);
    const content = cached[amud].revisions[0].slots.main.content;
    const section = (heading) => {
      const headings = [...content.matchAll(/^(={2,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/gm)];
      const index = headings.findIndex((entry) => entry[2] === heading);
      if (index < 0) return "";
      const end = headings.slice(index + 1).find((entry) => entry[1].length <= headings[index][1].length)?.index ?? content.length;
      return normalizeHebrew(content.slice(headings[index].index + headings[index][0].length, end).replace(/<[^>]*>/g, " "));
    };
    const wiki = await loadWikisourcePages(definition, { cacheDirectory: "results/wikisource-cache", cacheOnly: true, selectedAmudim: [amud, ...(nextAmud ? [nextAmud] : [])], fetcher: () => { throw new Error("Fixture network access forbidden"); } });
    const references = { rashi: section('רש"י'), tosafot: wiki[amud].text, other: section('רשב"ם'), otherSource: "Rashbam",
      ...(nextAmud ? { main: wiki[amud].mainText, nextMain: wiki[nextAmud].mainText } : {}) };
    const page = await processPage(definition, amudIndex(amud) - 4, references, bytes);
    verifyOverlapRetrySources({ page: { sha256 }, tosafotEvidence: { revision } }, page, wiki[amud]);
    if (slug === "arachin" && amud === "2a") assert.throws(() => checkOverlap(page), /overlap between rashi and tosafot/);
    else checkOverlap(page);
    assert.deepEqual(["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind].length), counts);
    if (slug === "pesachim" || slug === "bava-basra") {
      const checkpoint = JSON.parse(await readFile(join("results", "shas-work", `${slug}.json`), "utf8")).pages[amud];
      for (const previous of [checkpoint, checkpoint.previousClassification].filter((entry) => entry?.page)) {
        preserveRetryTosafot(previous, page, { decision: "present" }, [], [], "fixture-retry");
        preserveRetryPage(previous, { page });
      }
    }
    const task = getDocument({ data: new Uint8Array(bytes) });
    try {
      const pdf = await task.promise;
      const items = (await (await pdf.getPage(1)).getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
      const savedMain = groupRows(items.filter((item) => Math.abs(item.height - definition.mainSize) < 0.02)).map((row) => ({ ...row, pitch: definition.mainPitch }));
      preserveRetryPage({ page: { groups: { main: savedMain } } }, { page });
      for (const item of items.filter((item) => definition.commentarySizes?.some((size) => Math.abs(item.height - size) < 0.02)
        || (!definition.commentarySizes && [11.16, 11.4].some((size) => Math.abs(item.height - size) < 0.02)))) {
        assert.ok(["rashi", "tosafot", "other"].some((kind) => page.groups[kind].some((row) => Math.abs(row.baseline - item.transform[5]) < 2
          && row.left <= item.transform[4] + 0.02 && row.right >= item.transform[4] + item.width - 0.02)), "Regular commentary item lost");
      }
      if (slug === "pesachim" && amud === "110a") {
        assert.ok(page.groups.tosafot.every((row) => row.left >= 128.8 && row.right <= 239.6 && row.baseline >= 890.4 && row.baseline <= 1047.6));
        assert.ok(page.groups.other.every((row) => row.baseline < 756));
      }
      if (slug === "bava-basra" && amud === "29b") assert.deepEqual(classifyMissingCategories(page, references), { inferredAbsent: [], unknownCategories: ["rashi"] });
      {
        const commentarySizes = definition.commentarySizes || [11.16, 11.4];
        const boldSizes = definition.boldSizes || [8.88, 8.94, 11.88, 11.94, 13.92, 16.32, 16.38];
        const adjacentBoldSizes = definition.adjacentBoldSizes || [13.92];
        const streams = splitCommentaryRuns(items.filter((item) => commentarySizes.some((size) => Math.abs(item.height - size) < 0.02)), references, page.name);
        let start = 0;
        for (const run of streams) {
          const excluded = new Set((page.fragmentOwnership || []).filter((entry) => entry.kind === "catchword").map((entry) => entry.itemIndex));
          const rows = groupRows(run);
          const expanded = includeStreamFragments(items, run, boldSizes, start).filter((item) => !adjacentBoldSizes.some((size) => Math.abs(item.height - size) < 0.02)
            || rows.some((row) => Math.abs(row.baseline - item.transform[5]) < 2 && Math.max(0, row.left - item.transform[4] - item.width, item.transform[4] - row.right) < 20));
          for (const item of expanded.filter((item) => !excluded.has(items.indexOf(item)))) assert.ok(Object.values(page.groups).flat().some((row) => Math.abs(row.baseline - item.transform[5]) < 2
            && row.left <= item.transform[4] + 0.02 && row.right >= item.transform[4] + item.width - 0.02), "Relevant bold item lost");
          start = items.indexOf(run.at(-1)) + 1;
        }
      }
      if (slug === "arachin") {
        assert.equal(page.fragmentOwnership.filter((entry) => entry.kind === "catchword").length, 1);
        const beforeMainOwnership = await processPage(definition, amudIndex(amud) - 4, { ...references, main: undefined, nextMain: undefined }, bytes);
        assert.doesNotThrow(() => preserveRetryPage({ page: beforeMainOwnership }, { page }));
        if (amud === "3b") assert.ok(items.filter((item) => normalizeHebrew(decodePdfText(item.str)).includes("וגואליןלעולם")).some((item) => page.groups.rashi.some((row) =>
          Math.abs(row.baseline - item.transform[5]) < 2 && row.left <= item.transform[4] && row.right >= item.transform[4] + item.width)));
      }
    } finally {
      await task.destroy();
    }
  });
});

test("fingerprinted cached commentary catchwords clear only verified overlaps without changing frames or genuine Rashi", async (context) => {
  const cases = [
    ["arachin", "2a", "2b", "d2ceda04982c9b7059fb567b3026a61e6f2a0838cf48d73a45f35428e9d63145", 1422501, 1066024,
      "404adde265cb601c6ff1d8b7e10f320453b48873d63426bc3ce0cac89c37cf88", "06b41440661bde26fba0517430f1344a7f536696e7908472609cd479b052e236", [[240, "rashi", "עובד"], [438, "tosafot", "עובד"]]],
    ["menachos", "6a", "6b", "c7bd1def666cfe701d68bf5483d3fa1071f1a36c986cfc6b8c8a455e3bfe06a7", 1422179, 1063984,
      "00b22dc07edf46300e048ab9de715138f22638468f12333990fc701321fef2bb", "0ae31aee7796885fca69126a08629f5bceec319a85f9120fb2961c67f16686dc", [[408, "tosafot", "שלא"]]],
    ["arachin", "3b", "4a", "f32aa7068cb8af4fb76fa35ddc8af1a297c4f714a3ed8bbf9efecd93b7af9851", 1066026, 3011324,
      "49bee6cf9e02773240fdd6e2e53f247007ffb2a7d1755e8c2ab317a600c6597b", "8b8c22a8538cbb0de9c63784390b76dfedeb82d7808e3ecdadac0e2a6b282e4b", []],
  ];
  for (const [slug, amud, nextAmud, sha256, revision, nextRevision, contentSha256, nextContentSha256, expected] of cases) await context.test(`${slug} ${amud}`, async (check) => {
    const definition = shasDefinition(tractates.find((tractate) => tractate.slug === slug));
    let bytes, wiki;
    try {
      bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true })).bytes;
      wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud], cacheDirectory: "results/wikisource-cache", cacheOnly: true,
        fetcher: () => { throw new Error("Fixture network access forbidden"); } });
    } catch (error) {
      if (error.code === "ENOENT" || /not available in the local cache|revisions unavailable in local cache/.test(error.message)) return check.skip("Fingerprinted local fixtures unavailable; no network permitted");
      throw error;
    }
    assert.equal(wiki[amud].revision, revision);
    assert.equal(wiki[nextAmud].revision, nextRevision);
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki[amud].commentarySources[kind], next: wiki[nextAmud].commentarySources[kind] }]));
    for (const sources of Object.values(commentarySources)) {
      assert.equal(sources.current.contentSha256, contentSha256);
      assert.equal(sources.next.contentSha256, nextContentSha256);
    }
    const references = { rashi: commentarySources.rashi.current.text, tosafot: wiki[amud].text,
      ...(slug === "arachin" ? { main: wiki[amud].mainText, nextMain: wiki[nextAmud].mainText } : {}) };
    const before = await processPage(definition, amudIndex(amud) - 4, references, bytes);
    const after = await processPage(definition, amudIndex(amud) - 4, { ...references, commentarySources }, bytes);
    const removed = after.fragmentOwnership.filter((entry) => entry.commentary);
    assert.deepEqual(removed.map((entry) => [entry.itemIndex, entry.commentary, entry.text]), expected);
    assert.equal(after.sha256, sha256);
    assert.equal(after.frameRows?.length || 0, expected.length);
    assert.deepEqual(calculateFrame([after]), calculateFrame([before]));
    assert.deepEqual(calculateFrame([after], { horizontal: 2, vertical: 2 }), calculateFrame([before], { horizontal: 2, vertical: 2 }));
    checkOverlap(after);
    if (amud !== "3b") assert.throws(() => checkOverlap(before), /overlap between/);
    for (const [kind, rows] of Object.entries(before.groups)) {
      const excluded = removed.filter((entry) => entry.commentary === kind).map((entry) => entry.frameRow);
      assert.deepEqual(after.groups[kind], rows.filter((row) => !excluded.some((entry) => entry.baseline === row.baseline && entry.left === row.left && entry.right === row.right)));
    }
    preserveRetryPage({ page: before }, { page: after });
    preserveRetryTosafot({ page: before }, after, { decision: "present" }, [], [], "catchword-fixture");
    if (expected.length) {
      const noEvidence = { ...after, fragmentOwnership: after.fragmentOwnership.filter((entry) => !entry.commentary) };
      assert.throws(() => preserveRetryPage({ page: before }, { page: noEvidence }), /could not be reproduced/);
      assert.throws(() => preserveRetryPage({ page: { ...before, sha256: "different" } }, { page: after }), /could not be reproduced/);
      const enlarged = structuredClone(before);
      enlarged.groups[expected[0][1]].find((row) => row.baseline === removed[0].frameRow.baseline).right += 1;
      assert.throws(() => preserveRetryPage({ page: enlarged }, { page: after }), /could not be reproduced/);
    }
    const frame = calculateFrame([before]);
    calculateAreas([before, after], frame);
    for (const kind of ["rashi", "tosafot"]) {
      const excludedArea = removed.filter((entry) => entry.commentary === kind).reduce((sum, entry) => sum + (entry.frameRow.right - entry.frameRow.left) * entry.frameRow.pitch, 0);
      assert.ok(Math.abs(before.areas[kind].area - after.areas[kind].area - excludedArea) < 1e-8);
    }
    verifyOverlapRetrySources({ page: after }, after, wiki[amud], wiki[nextAmud]);
    if (expected.length) {
      assert.throws(() => verifyOverlapRetrySources({ page: after }, after, wiki[amud], null), /commentary source fingerprint differs/);
      for (const field of ["revision", "sha256", "contentSha256"]) {
        const changed = structuredClone(wiki[nextAmud]);
        changed.commentarySources[expected[0][1]][field] = field === "revision" ? 999 : "0".repeat(64);
        assert.throws(() => verifyOverlapRetrySources({ page: after }, after, wiki[amud], changed), /commentary source fingerprint differs/);
      }
    }
    if (amud === "2a") {
      for (const altered of [
        { ...commentarySources, rashi: { ...commentarySources.rashi, next: undefined } },
        { ...commentarySources, rashi: { ...commentarySources.rashi, next: { ...commentarySources.rashi.next, sha256: "0".repeat(64) } } },
        { ...commentarySources, rashi: { ...commentarySources.rashi, current: { ...commentarySources.rashi.current, text: "" } } },
      ]) {
        const unverified = await processPage(definition, amudIndex(amud) - 4, { ...references, commentarySources: altered }, bytes);
        assert.throws(() => checkOverlap(unverified), /overlap between rashi and tosafot/);
      }
    }
    if (amud === "3b") {
      const task = getDocument({ data: new Uint8Array(bytes) });
      try {
        const pdf = await task.promise;
        const items = (await (await pdf.getPage(1)).getTextContent()).items;
        const genuine = items.filter((item) => normalizeHebrew(decodePdfText(item.str)).includes("וגואליןלעולם"));
        assert.ok(genuine.length > 0);
        assert.ok(genuine.some((item) => after.groups.rashi.some((row) => Math.abs(row.baseline - item.transform[5]) < 2
          && row.left <= item.transform[4] && row.right >= item.transform[4] + item.width)));
      } finally { await task.destroy(); }
    }
  });
});

test("Megillah pinned cached Tosafot catchwords permit only exact protected Rashi reattribution", async (context) => {
  const cases = [
    ["10b", "11a", "f5554c5796cb4c35cfe5b6064d5a71186051f112ab17227f6959c43079513a06", 1312862, 1442990, "\u05e9\u05dc\u05e9\u05d4", 420.059, 435.476, 600.717],
    ["16a", "16b", "3a525c2606be3fc98a5f8e369e851d4cc2db92254ac2da03b9ee75b8c2f14226", 2844020, 1312857, "\u05e6\u05e8\u05d9\u05da", 126.6, 138.419, 764.937],
  ];
  const sourceHashes = {
    "10b": ["942797984744b4758e91cc50e90998ed83ceeadc80ef7de46a4f6f9e5939b305", "a45ed49a09390d774140590d3a4b5ee0fe27ef064a7b5389adc2228bc3fd5510"],
    "11a": ["3bba50f1f1960c62732660bf8b693b851e2301026d8cc9001e2e38ac19f79735", "d730bb0f5f8cc0140e338ca421c70df607337b76d4559bfbe738aa75cf361bf1"],
    "16a": ["9cff53f3aed24342996fed6e95fc946db60e41330dbf3f2ed65b2823f5aca7fe", "4a360e4aa83891157c6a6dce86a9df6c3d6fb2eed378bd1f4e12db7853207e38"],
    "16b": ["f7b9b0b57ecac7c1c41162df218ce8a597b556e93e7c1e38fef373a9ddcba54a", "166ca09c4e546aadb45e542994ebdfba2f7804fd6599a0920fd08900a2fbe300"],
  };
  const definition = shasDefinition(tractates.find((tractate) => tractate.slug === "megillah"));
  const checkpoint = JSON.parse(await readFile("results/shas-work/megillah.json", "utf8"));
  for (const [amud, nextAmud, sha256, revision, nextRevision, text, left, right, baseline] of cases) await context.test(amud, async () => {
    let previous = checkpoint.pages[amud];
    while (previous && !previous.page?.groups?.rashi?.some((row) => Math.abs(row.baseline - baseline) < 0.001)) previous = previous.previousClassification;
    assert.ok(previous, "The prior Rashi-owned catchword checkpoint is required");
    checkpoint.pages[amud] = previous;
    const bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
    const wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud], cacheDirectory: "results/wikisource-cache", cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } });
    assert.equal(wiki[amud].revision, revision);
    assert.equal(wiki[nextAmud].revision, nextRevision);
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, {
      current: wiki[amud].commentarySources[kind], next: wiki[nextAmud].commentarySources[kind],
    }]));
    for (const [field, sourceAmud] of [["current", amud], ["next", nextAmud]]) {
      const source = commentarySources.tosafot[field];
      assert.deepEqual([source.sha256, source.contentSha256], sourceHashes[sourceAmud]);
      assert.equal(createHash("sha256").update(JSON.stringify([source.text, source.openingWord])).digest("hex"), source.sha256);
    }
    const references = { rashi: commentarySources.rashi.current.text, tosafot: wiki[amud].text, commentarySources };
    const before = await processPage(definition, amudIndex(amud) - 4, { ...references, commentarySources: undefined }, bytes);
    const page = await processPage(definition, amudIndex(amud) - 4, references, bytes);
    assert.equal(page.sha256, sha256);
    assert.deepEqual(["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind].length), amud === "10b" ? [51, 39, 8, 0] : [50, 26, 5, 0]);
    const targetCatchword = (candidate) => candidate.fragmentOwnership.find((fragment) => fragment.commentary === "tosafot" && fragment.text === text);
    const catchword = targetCatchword(page);
    assert.ok(catchword, "Source-supported Tosafot catchword must be identified");
    for (const [key, expected] of Object.entries({ left, right, baseline })) assert.ok(Math.abs(catchword.frameRow[key] - expected) < 0.001);
    verifyOverlapRetrySources(checkpoint.pages[amud], page, wiki[amud], wiki[nextAmud]);
    checkOverlap(page);
    preserveRetryPage(checkpoint.pages[amud], { page });
    const tosafotEvidence = classifyWikisourceTosafot(definition, amud, page, wiki[amud]);
    assert.equal(tosafotEvidence.decision, "present");
    preserveRetryTosafot(checkpoint.pages[amud], page, tosafotEvidence, [], [], "megillah-fixture");
    assert.equal(catchword.previousKind, "rashi");
    const original = checkpoint.pages[amud].page.groups.rashi.find((row) => row.baseline === catchword.frameRow.baseline);
    assert.deepEqual(catchword.previousRow, original);
    assert.deepEqual(page.groups.main, checkpoint.pages[amud].page.groups.main);
    for (const kind of ["rashi", "tosafot"]) {
      const excluded = page.fragmentOwnership.filter((fragment) => fragment.commentary === kind);
      assert.deepEqual(page.groups[kind], before.groups[kind].filter((row) => !excluded.some((fragment) =>
        ["baseline", "left", "right", "pitch"].every((key) => row[key] === fragment.frameRow[key]))));
    }
    assert.deepEqual(calculateFrame([page]), calculateFrame([before]));
    const frame = calculateFrame([before]);
    calculateAreas([before, page], frame);
    assert.equal(before.areas.main.area, page.areas.main.area);
    for (const kind of ["rashi", "tosafot"]) {
      const excludedArea = page.fragmentOwnership.filter((fragment) => fragment.commentary === kind)
        .reduce((sum, fragment) => sum + (fragment.frameRow.right - fragment.frameRow.left) * fragment.frameRow.pitch, 0);
      assert.ok(Math.abs(before.areas[kind].area - page.areas[kind].area - excludedArea) < 1e-8);
    }
    for (const kind of ["main", "rashi", "tosafot", "other"]) assert.ok(!page.groups[kind].some((row) => row.baseline === catchword.frameRow.baseline
      && row.left <= catchword.frameRow.left && row.right >= catchword.frameRow.right), "True catchword included in a measured area");
    for (const mutate of [
      (changed) => { changed.sha256 = "0".repeat(64); },
      (changed) => { changed.name = "megillah-11a"; },
      (changed) => { changed.fragmentOwnership = []; },
      (changed) => { targetCatchword(changed).previousKind = "other"; },
      (changed) => { delete targetCatchword(changed).previousRow; },
      (changed) => { targetCatchword(changed).previousRow.right += 0.001; },
      (changed) => { targetCatchword(changed).frameRow.baseline += 0.001; },
      (changed) => { targetCatchword(changed).frameRow.pitch += 0.001; },
      (changed) => { targetCatchword(changed).basis = "next-word-only"; },
      (changed) => { targetCatchword(changed).text = "unknown"; },
      (changed) => { targetCatchword(changed).itemIndex += 1; },
      (changed) => { targetCatchword(changed).commentary = "rashi"; },
      (changed) => { targetCatchword(changed).commentaryContext.fragments = 1; },
      (changed) => { targetCatchword(changed).commentaryContext.letters = 31; },
      (changed) => { targetCatchword(changed).precedingRow.baseline += 3; },
      (changed) => { targetCatchword(changed).precedingRow.left += 15; },
      (changed) => { targetCatchword(changed).precedingRow.right = left - 1; },
      (changed) => { changed.matches = changed.matches.filter((match) => match.kind !== "tosafot"); },
      (changed) => { changed.matches.find((match) => match.kind === "tosafot").scores.rashi = 1000; },
      (changed) => { changed.matches.find((match) => match.kind === "tosafot").rows = []; },
    ]) {
      const changed = structuredClone(page);
      mutate(changed);
      assert.throws(() => preserveRetryPage(checkpoint.pages[amud], { page: changed }), /could not be reproduced/);
    }
    for (const field of ["currentSource", "nextSource"]) for (const key of ["amud", "tractate", "commentary", "title", "revision", "source", "sha256", "contentSha256"]) {
      const changed = structuredClone(page);
      targetCatchword(changed)[field][key] = key === "revision" ? 999 : "mismatched";
      assert.throws(() => preserveRetryPage(checkpoint.pages[amud], { page: changed }), /rashi could not/);
      assert.throws(() => verifyOverlapRetrySources(checkpoint.pages[amud], changed, wiki[amud], wiki[nextAmud]), /commentary source fingerprint differs/);
    }
    for (const field of ["current", "next"]) for (const key of ["sha256", "contentSha256", "revision", "text", "openingWord"]) {
      const changed = structuredClone(wiki[field === "current" ? amud : nextAmud]);
      changed.commentarySources.tosafot[key] = key === "revision" ? 999 : "0".repeat(64);
      assert.throws(() => verifyOverlapRetrySources(checkpoint.pages[amud], page,
        field === "current" ? changed : wiki[amud], field === "next" ? changed : wiki[nextAmud]), /commentary source fingerprint differs/);
    }
    for (const key of ["baseline", "left", "right", "pitch", "top", "bottom"]) {
      const changed = structuredClone(checkpoint.pages[amud]);
      changed.page.groups.rashi.find((row) => row.baseline === original.baseline)[key] += 0.001;
      assert.throws(() => preserveRetryPage(changed, { page }), /rashi could not/);
    }
    const missingRashi = structuredClone(page);
    missingRashi.groups.rashi.splice(0, 1);
    assert.throws(() => preserveRetryPage(checkpoint.pages[amud], { page: missingRashi }), /rashi could not/);
    const unknown = structuredClone(checkpoint.pages[amud]);
    unknown.page.groups.other = [{ ...original, kind: "other" }];
    assert.throws(() => preserveRetryPage(unknown, { page }), /other could not/);
    assert.throws(() => verifyOverlapRetrySources(checkpoint.pages[amud], { ...page, sha256: "0".repeat(64) }, wiki[amud], wiki[nextAmud]), /PDF differs/);
    const task = getDocument({ data: new Uint8Array(bytes) });
    try {
      const items = (await (await (await task.promise).getPage(1)).getTextContent()).items.filter((fragment) => fragment.str?.trim() && fragment.width > 0 && fragment.height > 0);
      const excluded = new Set(page.fragmentOwnership.map((fragment) => fragment.itemIndex));
      const covered = (fragment, kind) => page.groups[kind].some((row) => Math.abs(row.baseline - fragment.transform[5]) < 2
        && row.left <= fragment.transform[4] + 0.02 && row.right >= fragment.transform[4] + fragment.width - 0.02);
      for (const [size, kind, count] of [[10.13997, "rashi", amud === "10b" ? 94 : 88], [10.61997, "tosafot", amud === "10b" ? 19 : 14]]) {
        const fragments = items.filter((fragment) => Math.abs(fragment.height - size) < 0.00001);
        assert.equal(fragments.length, count);
        for (const fragment of fragments.filter((candidate) => !excluded.has(items.indexOf(candidate)))) assert.ok(covered(fragment, kind), `${size}: ${kind} body item lost or relabeled`);
      }
      const retainedBold = items.filter((fragment) => Math.abs(fragment.height - 11.34) < 0.02 && covered(fragment, "tosafot"));
      assert.deepEqual(retainedBold.map((fragment) => items.indexOf(fragment)), amud === "10b" ? [150, 151, 166, 167] : []);
      for (const fragment of retainedBold) assert.ok(items.some((anchor) => Math.abs(anchor.height - 10.61997) < 0.00001
        && Math.abs(anchor.transform[5] - fragment.transform[5]) < 2
        && Math.max(0, anchor.transform[4] - fragment.transform[4] - fragment.width, fragment.transform[4] - anchor.transform[4] - anchor.width) < 20));
      for (const index of amud === "10b" ? [149, 165, 168, 415, 2223] : [162, 163, 164, 330, 1344]) {
        assert.ok(!["rashi", "tosafot", "other"].some((kind) => covered(items[index], kind)), "Detached heading or marginal bold item admitted without adjacency");
      }
      assert.ok(!definition.boldSizes.includes(15.6), "Separate 15.60-point heading rows have not met the same-line adjacency guard");
    } finally { await task.destroy(); }
  });
});

test("Kiddushin 36b pinned indented Tosafot heading parses without Rashi crossing the Tosafot boundary", async () => {
  const definition = tractates.find((tractate) => tractate.slug === "kiddushin");
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  const wiki = await loadWikisourcePages(definition, { selectedAmudim: ["36b", "37a"], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
  const rawSha256 = "345d02744d96340314dd24a6f10cb7342a1d661c87f9f8d4728e98a1026cda57";
  assert.equal(wiki["36b"].revision, 1181821);
  assert.equal(wiki["37a"].revision, 1181824);
  assert.equal(wiki["36b"].status, "present");
  assert.ok(wiki["36b"].text.startsWith(normalizeHebrew("חוץ ממנחת סוטה ונזירה")));
  const { rashi, tosafot } = wiki["36b"].commentarySources;
  assert.equal(tosafot.openingWord, normalizeHebrew("חוץ"));
  assert.ok(tosafot.text.startsWith(normalizeHebrew("חוץ ממנחת סוטה ונזירה")) && tosafot.text.endsWith(normalizeHebrew("דהיינו אחר י\"ו")));
  assert.ok(rashi.text.endsWith(normalizeHebrew("בגמ' מפרש להו")));
  assert.ok(!rashi.text.includes(normalizeHebrew("חוץ ממנחת סוטה")));
  for (const source of [rashi, tosafot]) assert.equal(source.contentSha256, rawSha256);
  const cached = JSON.parse(await readFile("results/wikisource-cache/kiddushin.json", "utf8"))["36b"];
  const content = cached.revisions[0].slots.main.content;
  assert.equal(createHash("sha256").update(content).digest("hex"), rawSha256);
  for (const changed of [{ revid: 999, content }, { revid: 1181821, content: `${content}\n` }]) {
    const page = { ...cached, revisions: [{ ...cached.revisions[0], revid: changed.revid, slots: { main: { content: changed.content } } }] };
    const reparsed = (await loadWikisourcePages(definition, { selectedAmudim: ["36b"], fetcher: async () => ({ ok: true, json: async () => ({ query: { pages: [page] } }) }) }))["36b"];
    assert.equal(reparsed.status, "unknown");
    assert.equal(reparsed.commentarySources.tosafot, undefined);
    assert.equal(reparsed.commentarySources.rashi, undefined, "Unreviewed indentation must not let Rashi absorb Tosafot");
  }
});

test("Kiddushin pinned 36b and 77a cached PDFs reproduce saved rows and count the reviewed 77a Tosafot block fail-closed", async (context) => {
  const definition = shasDefinition(tractates.find((tractate) => tractate.slug === "kiddushin"));
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  const checkpoint = JSON.parse(await readFile("results/shas-work/kiddushin.json", "utf8"));
  const load = async (amud, nextAmud, sha256) => {
    assert.equal(checkpoint.pages[amud].page.sha256, sha256);
    const bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true, fetcher: offline })).bytes;
    const wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki[amud].commentarySources[kind], next: wiki[nextAmud].commentarySources[kind] }]));
    return { bytes, wiki, references: { rashi: commentarySources.rashi.current.text, tosafot: wiki[amud].text, commentarySources } };
  };
  const counts = (page) => ["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind]?.length || 0);
  const retry = (amud, nextAmud, entry, page, wiki) => {
    verifyOverlapRetrySources(entry, page, wiki[amud], wiki[nextAmud]);
    checkOverlap(page);
    const evidence = classifyWikisourceTosafot(definition, amud, page, wiki[amud]);
    preserveRetryTosafot(entry, page, evidence, [], [], "kiddushin-fixture");
    preserveRetryPage(entry, { page });
    return evidence;
  };
  await context.test("36b", async () => {
    const { bytes, wiki, references } = await load("36b", "37a", "081173f7a5cfd8cd7bba70216a085a04aa26ed381a0fb6ebeb7e2792ae9f7057");
    const entry = checkpoint.pages["36b"];
    const page = await processPage(definition, amudIndex("36b") - 4, references, bytes);
    assert.deepEqual(counts(page), [20, 32, 65, 0]);
    for (const kind of ["main", "rashi", "tosafot"]) assert.deepEqual(page.groups[kind], entry.page.groups[kind]);
    assert.equal(page.reviewedCommentaryBlocks, undefined);
    assert.equal(retry("36b", "37a", entry, page, wiki).decision, "present");
  });
  await context.test("77a", async () => {
    const sha256 = "2c5d4545598b6239c25bfdad68a141b310404167caf7319d80fc514387337731";
    const { bytes, wiki, references } = await load("77a", "77b", sha256);
    const entry = checkpoint.pages["77a"];
    assert.equal(wiki["77a"].revision, 1182042);
    assert.equal(wiki["77b"].revision, 1182043);
    assert.equal(wiki["77a"].commentarySources.tosafot, undefined, "Bracketed 77a Tosafot has no catchword source");
    const page = await processPage(definition, amudIndex("77a") - 4, references, bytes);
    assert.deepEqual(counts(page), [42, 67, 7, 0]);
    for (const kind of ["main", "rashi"]) assert.deepEqual(page.groups[kind], entry.page.groups[kind]);
    assert.deepEqual(page.groups.tosafot.map((row) => [row.baseline, row.left, row.pitch, row.kind]), [1078.1995687200001, 1069.79957208, 1061.2795754879999,
      1052.879578848, 1044.3595822559998, 1035.9595856159997, 1027.4395890239998].map((baseline) => [baseline, 127.439949024, 8.46, "tosafot"]));
    assert.ok(page.groups.tosafot.every((row) => row.right <= 238.02));
    const [block] = page.reviewedCommentaryBlocks;
    assert.deepEqual([block.itemIndices, block.rows, block.evidenceRows, block.letters], [[312, 331], 7, 5, 141]);
    assert.deepEqual(page.matches.at(-1).scores, { rashi: 0, tosafot: 236, other: 0 });
    const evidence = retry("77a", "77b", entry, page, wiki);
    assert.deepEqual([evidence.decision, evidence.basis, evidence.revision], ["present", "wikisource-text-and-pdf-match", 1182042]);
    const altered = (kind, field, change) => ({ ...references.commentarySources, [kind]: { ...references.commentarySources[kind], [field]: change(references.commentarySources[kind][field]) } });
    for (const [label, changed, changedBytes = bytes] of [
      ["PDF fingerprint", references, Buffer.concat([bytes, Buffer.from("\n")])],
      ["Tosafot text", { ...references, tosafot: `${references.tosafot}א` }],
      ["current Tosafot source", { ...references, commentarySources: altered("tosafot", "current", () => references.commentarySources.rashi.current) }],
      ["Rashi revision", { ...references, commentarySources: altered("rashi", "current", (source) => ({ ...source, revision: 1182041 })) }],
      ["Rashi text", { ...references, commentarySources: altered("rashi", "current", (source) => ({ ...source, text: `${source.text}א` })) }],
      ["missing next Tosafot", { ...references, commentarySources: altered("tosafot", "next", () => undefined) }],
      ["next Tosafot content", { ...references, commentarySources: altered("tosafot", "next", (source) => ({ ...source, contentSha256: "0".repeat(64) })) }],
      ["Rashi reference contains block row", { ...references, rashi: `${references.rashi} ${normalizeHebrew("זרעו יוכיח וחזר הדין וכו' ושמא אין כאן")}` }],
    ]) {
      const unreviewed = await processPage(definition, amudIndex("77a") - 4, changed, changedBytes);
      assert.deepEqual(counts(unreviewed), [42, 67, 0, 0], label);
      assert.equal(unreviewed.reviewedCommentaryBlocks, undefined, label);
    }
  });
});

test("Chullin 138a recognizes the source-backed short Tosafot block", async () => {
  const definition = shasDefinition(tractates.find((tractate) => tractate.slug === "chullin"));
  const checkpoint = JSON.parse(await readFile("results/shas-work/chullin.json", "utf8"));
  const previous = checkpoint.pages["138a"];
  const bytes = (await getCachedPdf(definition, "138a", { expectedHash: "869be6614112d17aa240f05c3e32924e38ccf568b7a840cc13d8a2e9cd0c73f7", cacheOnly: true })).bytes;
  const wiki = await loadWikisourcePages(definition, { selectedAmudim: ["138a", "138b"], cacheDirectory: "results/wikisource-cache", cacheOnly: true });
  const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki["138a"].commentarySources[kind], next: wiki["138b"].commentarySources[kind] }]));
  const references = { rashi: commentarySources.rashi.current.text, tosafot: wiki["138a"].text, commentarySources };
  const page = await processPage(definition, amudIndex("138a") - 4, references, bytes);
  assert.deepEqual([page.groups.main.length, page.groups.rashi.length, page.groups.tosafot.length], [52, 136, 4]);
  assert.deepEqual(page.groups.main, previous.page.groups.main);
  assert.equal(page.matches.at(-1).basis, "complete-short-wikisource-section-and-pdf-block");
  preserveRetryPage(previous, { page });
  checkOverlap(page);
  const source = commentarySources.tosafot.current;
  for (const changedSource of [undefined, { ...source, sha256: "0".repeat(64) }, { ...source, revision: source.revision + 1 },
    { ...source, text: `${source.text}א` }, { ...source, amud: "138b" }]) {
    const changed = { ...references, commentarySources: { ...commentarySources, tosafot: { ...commentarySources.tosafot, current: changedSource } } };
    await assert.rejects(processPage(definition, amudIndex("138a") - 4, changed, bytes), /ambiguous commentary stream/);
  }
  await assert.rejects(processPage(definition, amudIndex("138a") - 4, { ...references, rashi: references.rashi + source.text }, bytes), /ambiguous commentary stream/);
});

test("Nazir 33b and Zevachim 51b/71a pinned pages measure with empty Sefaria Rashi and fail closed", async (context) => {
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  const load = async (slug, amud, nextAmud, sha256) => {
    const definition = shasDefinition(tractates.find((tractate) => tractate.slug === slug));
    const checkpoint = JSON.parse(await readFile(`results/shas-work/${slug}.json`, "utf8"));
    const bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true, fetcher: offline })).bytes;
    const wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki[amud].commentarySources[kind], next: wiki[nextAmud].commentarySources[kind] }]));
    const saved = checkpoint.pages[amud];
    // Entries rewritten by the pinned retry keep the pre-retry entry as previousClassification.
    const entry = saved.page?.reviewedPage ? saved.previousClassification : saved;
    const references = { rashi: "", tosafot: wiki[amud].text, commentarySources };
    const measure = (changed = references, changedBytes = bytes) => processPage(definition, amudIndex(amud) - 4, changed, changedBytes);
    return { definition, bytes, wiki, saved, entry, references, measure };
  };
  const counts = (page) => ["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind].length);
  const retry = ({ definition, wiki, entry, references }, amud, nextAmud, page) => {
    const previous = structuredClone(entry);
    verifyOverlapRetrySources(previous, page, wiki[amud], wiki[nextAmud]);
    checkOverlap(page);
    const tosafotEvidence = classifyWikisourceTosafot(definition, amud, page, wiki[amud]);
    const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, references, { useWikisource: true, tosafotEvidence });
    preserveRetryTosafot(previous, page, tosafotEvidence, unknownCategories, [], "pinned-fixture");
    const next = { page, unknownCategories, inferredAbsent, confirmedAbsent: [], tosafotEvidence };
    applyWikisourceRashiAbsence(next, wiki[amud]);
    preserveRetryPage(previous, next);
    return next;
  };
  const altered = (references, kind, field, change) => ({ ...references, commentarySources: { ...references.commentarySources,
    [kind]: { ...references.commentarySources[kind], [field]: change(references.commentarySources[kind][field]) } } });
  const rejects = async (fixture, label, changed, pattern, changedBytes) => assert.rejects(fixture.measure(changed, changedBytes), pattern, label);

  await context.test("Nazir 33b: explicit empty main and Rivan, two Tosafot columns", async () => {
    const fixture = await load("nazir", "33b", "34a", "6213ebcd474ac37bc4b70c23b16843f1431487f46b388a4c8d2896f3dd9604da");
    const raw = JSON.parse(await readFile("results/wikisource-cache/nazir.json", "utf8"))["33b"].revisions[0];
    const content = raw.slots.main.content;
    assert.deepEqual([raw.revid, createHash("sha256").update(content).digest("hex")], [2968152, "8d46df845fa109c7dd897c99d73c61c1506d971b3fe4ddb24c4b27b23b05adfc"]);
    assert.ok(content.includes("<\u05e7\u05d8\u05e2 \u05d4\u05ea\u05d7\u05dc\u05d4=\u05d2/><\u05e7\u05d8\u05e2 \u05e1\u05d5\u05e3=\u05d2/>"), "empty main section");
    assert.ok(content.includes("==\u05e8\u05e9\"\u05d9 (\u05e8\u05d9\u05d1\"\u05df)==\n<\u05e7\u05d8\u05e2 \u05d4\u05ea\u05d7\u05dc\u05d4=\u05e8/><\u05e7\u05d8\u05e2 \u05e1\u05d5\u05e3=\u05e8/>"), "empty Rivan section");
    assert.equal(fixture.wiki["33b"].commentarySources.rashi, undefined);
    const page = await fixture.measure();
    assert.deepEqual(counts(page), [0, 0, 148, 0]);
    assert.deepEqual(page.reviewedPage.zeroCategories, ["main", "rashi"]);
    assert.equal(page.reviewedPage.sefariaRashi, "empty");
    const columns = Object.groupBy(page.groups.tosafot, (row) => row.left > 300 ? "outer" : "inner");
    assert.deepEqual([columns.outer.length, columns.inner.length], [74, 74]);
    assert.ok(page.groups.tosafot.every((row) => row.pitch === 10.44));
    if (fixture.saved.page) assert.deepEqual(fixture.saved.page.groups, page.groups);
    const next = retry(fixture, "33b", "34a", page);
    assert.deepEqual([next.tosafotEvidence.decision, next.unknownCategories, next.confirmedAbsent], ["present", [], ["rashi"]]);
    assert.equal(next.rashiEvidence.basis, "wikisource-no-regular-rashi-section");
    for (const [label, changed, pattern, changedBytes] of [
      ["Sefaria Rashi present", { ...fixture.references, rashi: "\u05d0" }, /Sefaria Rashi conflicts/],
      ["Tosafot text", { ...fixture.references, tosafot: `${fixture.references.tosafot}\u05d0` }, /sources differ/],
      ["Tosafot revision", altered(fixture.references, "tosafot", "current", (source) => ({ ...source, revision: 2968151 })), /sources differ/],
      ["unexpected Rashi source", altered(fixture.references, "rashi", "current", () => fixture.wiki["33b"].commentarySources.tosafot), /sources differ/],
      ["missing next Tosafot", altered(fixture.references, "tosafot", "next", () => undefined), /sources differ/],
      ["PDF fingerprint", fixture.references, /main type not found/, Buffer.concat([fixture.bytes, Buffer.from("\n")])],
    ]) await rejects(fixture, label, changed, pattern, changedBytes);
  });

  for (const [amud, nextAmud, sha256, expected] of [
    ["51b", "52a", "722b36bfc5274c8544016ca8d11bfca350eeb53598b31adaa6e877fdc2604c3b", [3, 6, 58, 0]],
    ["71a", "71b", "ded08e98895114bf29ef0e5ae50e8cbb2bd99735d7df2e7dae6400a1be1044c0", [2, 13, 66, 0]],
  ]) await context.test(`Zevachim ${amud}: page Wikisource Rashi replaces the empty Sefaria Rashi`, async () => {
    const fixture = await load("zevachim", amud, nextAmud, sha256);
    const rashi = fixture.wiki[amud].commentarySources.rashi;
    const page = await fixture.measure();
    assert.deepEqual(counts(page), expected);
    assert.equal(page.reviewedPage.basis, "pinned-page-wikisource-rashi-where-sefaria-rashi-is-empty");
    assert.deepEqual([page.reviewedPage.sources.rashi.current.revision, page.reviewedPage.sources.rashi.current.sha256], [rashi.revision, rashi.sha256]);
    assert.ok(page.matches.some((match) => match.kind === "rashi" && match.scores.rashi >= 2 * match.scores.tosafot));
    if (fixture.saved.page?.reviewedPage) assert.deepEqual(fixture.saved.page.groups, page.groups);
    if (fixture.entry.page) {
      assert.deepEqual(counts(fixture.entry.page), [3, 0, 64, 0], "saved pre-review 51b rows");
      assert.deepEqual(page.groups.main, fixture.entry.page.groups.main);
    }
    const next = retry(fixture, amud, nextAmud, page);
    assert.deepEqual([next.tosafotEvidence.decision, next.unknownCategories], ["present", []]);
    for (const [label, changed, pattern, changedBytes] of [
      ["Sefaria Rashi present", { ...fixture.references, rashi: rashi.text }, /Sefaria Rashi conflicts/],
      ["Tosafot text", { ...fixture.references, tosafot: `${fixture.references.tosafot}\u05d0` }, /sources differ/],
      ["Rashi text", altered(fixture.references, "rashi", "current", (source) => ({ ...source, text: `${source.text}\u05d0` })), /sources differ/],
      ["Rashi revision", altered(fixture.references, "rashi", "current", (source) => ({ ...source, revision: source.revision - 1 })), /sources differ/],
      ["next Tosafot content", altered(fixture.references, "tosafot", "next", (source) => ({ ...source, contentSha256: "0".repeat(64) })), /sources differ/],
      ["Rashbam reference", { ...fixture.references, other: "\u05d0" }, /sources differ/],
    ]) await rejects(fixture, label, changed, pattern, changedBytes);
    const unpinned = await fixture.measure(fixture.references, Buffer.concat([fixture.bytes, Buffer.from("\n")])).catch((error) => error);
    assert.ok(unpinned instanceof Error || unpinned.reviewedPage === undefined, "changed PDF is never treated as reviewed");
    if (!(unpinned instanceof Error)) assert.equal(unpinned.groups.rashi.length, 0, "without the pin the empty Sefaria Rashi still yields no Rashi rows");
  });
});

test("synthetic Tosafot font distinction never licenses unreviewed catchword ownership deletion", () => {
  const rashi = [{ ...item("\u05d1\u05d9\u05d0\u05d5\u05e8\u05e8\u05e9\u05d9\u05de\u05d5\u05d1\u05d4\u05e7\u05e8\u05d0\u05e9\u05d5\u05df\u05d0\u05e8\u05d5\u05da", 100, 180, 100), height: 10.14 },
    { ...item("\u05d1\u05d9\u05d0\u05d5\u05e8\u05e8\u05e9\u05d9\u05de\u05d5\u05d1\u05d4\u05e7\u05e9\u05e0\u05d9\u05d0\u05e8\u05d5\u05da", 100, 170, 100), height: 10.14 }];
  const body = [{ ...item("\u05d1\u05d9\u05d0\u05d5\u05e8\u05ea\u05d5\u05e1\u05e4\u05d5\u05ea\u05de\u05d5\u05d1\u05d4\u05e7\u05e8\u05d0\u05e9\u05d5\u05df", 100, 120, 100), height: 10.62 },
    { ...item("\u05d1\u05d9\u05d0\u05d5\u05e8\u05ea\u05d5\u05e1\u05e4\u05d5\u05ea\u05de\u05d5\u05d1\u05d4\u05e7\u05e9\u05e0\u05d9\u05d0\u05e8\u05d5\u05da:", 100, 110, 100), height: 10.62 }];
  const tail = { ...item("\u05e6\u05e8\u05d9\u05da", 114, 100, 14), height: 10.14 };
  const all = [...rashi, ...body, tail];
  const snapshot = (text, amud, revision, openingWord = "") => ({ text, amud, revision, openingWord, title: `synthetic ${amud}`, tractate: "megillah", commentary: "tosafot",
    source: `https://he.wikisource.org/?oldid=${revision}`, contentSha256: "1".repeat(64), sha256: createHash("sha256").update(JSON.stringify([text, openingWord])).digest("hex") });
  const current = snapshot(normalizeHebrew(body.map((fragment) => fragment.str).join(" ")), "16a", 42);
  const next = snapshot("\u05e6\u05e8\u05d9\u05da\u05dc\u05d0\u05d5\u05de\u05e8\u05df\u05d1\u05e0\u05e9\u05d9\u05de\u05d4\u05d0\u05d7\u05ea", "16b", 43, tail.str);
  const references = { rashi: normalizeHebrew(rashi.map((fragment) => fragment.str).join(" ")), tosafot: current.text,
    commentarySources: { tosafot: { current, next } } };
  const split = splitCommentaryRuns(all, references, "synthetic");
  assert.deepEqual(split, [rashi, [...body, tail]]);
  assert.deepEqual(splitCommentaryRuns(all, { rashi: references.rashi + current.text }, "synthetic"), [all]);
  assert.equal(identifyRun(all, { rashi: references.rashi + current.text }, "synthetic").kind, "rashi");
  const streams = [{ run: [...body, tail], expanded: [...body, tail], kind: "tosafot" }];
  const ownership = resolveCommentaryCatchwords(all, streams, 10, references);
  assert.equal(ownership.length, 1);
  for (const kind of ["rashi", "other"]) {
    const saved = { ...ownership[0].frameRow, kind };
    const previous = { page: { name: "megillah-16a", sha256: "3a525c2606be3fc98a5f8e369e851d4cc2db92254ac2da03b9ee75b8c2f14226", groups: { [kind]: [saved] } } };
    const page = { ...previous.page, groups: { rashi: [], tosafot: [], other: [] }, fragmentOwnership: [{ ...ownership[0], previousKind: kind, previousRow: saved }] };
    assert.throws(() => preserveRetryPage(previous, { page }), /could not be reproduced/);
  }
  for (const changed of [
    { ...tail, transform: [0, 0, 0, 0, 114, 109] },
    { ...tail, transform: [0, 0, 0, 0, 99, 100] },
    { ...tail, width: 60 },
  ]) {
    const run = [...body, changed], negative = [{ kind: "tosafot", run, expanded: [...run] }];
    assert.deepEqual(resolveCommentaryCatchwords(run, negative, 10, references), []);
    assert.deepEqual(negative[0].expanded, run);
  }
  for (const mutate of [
    (changed) => { changed.tosafot.next.amud = "17a"; },
    (changed) => { changed.tosafot.next.sha256 = "0".repeat(64); },
    (changed) => { changed.tosafot.current.text += tail.str; },
    (changed) => { changed.tosafot.next.commentary = "rashi"; },
  ]) {
    const commentarySources = structuredClone(references.commentarySources);
    mutate(commentarySources);
    const negative = [{ kind: "tosafot", run: [...body, tail], expanded: [...body, tail] }];
    assert.deepEqual(resolveCommentaryCatchwords(all, negative, 10, { ...references, commentarySources }), []);
  }
});

test("identifies other commentary only with unambiguous source evidence", () => {
  const run = [item("מרים המתינה למשה שעה אחת", 10, 100)];
  const other = normalizeHebrew("מרים המתינה למשה שעה אחת");
  assert.equal(identifyRun(run, { other }, "test").kind, "other");
  assert.equal(identifyRun(run, { other, otherSource: "Rashbam" }, "test").source, "Rashbam");
  assert.throws(() => identifyRun(run, { other, rashi: other }, "test"), /ambiguous commentary stream/);
  assert.throws(() => identifyRun(run, {}, "test"), /ambiguous commentary stream/);
});

test("uses only bounded same-line supplements to identify an ambiguous commentary run", () => {
  const preceding = { ...item("דיבוררשימובהק", 100, 100, 40), height: 11.88 };
  const body = { ...item("דיבורהמשותף", 100, 100, 40), height: 11.4 };
  const supplement = { ...item("ביאורתוספותמובהקביאורתוספותמובהקביאורתוספותמובהק", 141, 100, 80), height: 11.88 };
  const last = { ...item("דיבורהמשותף", 100, 90, 40), height: 11.4 };
  const bodyEvidence = { ...item("ראייתוספותמובהקת", 100, 80, 40), height: 11.4 };
  const items = [preceding, body, supplement, last, bodyEvidence];
  const references = { rashi: "דיבורהמשותףדיבוררשימובהק", tosafot: "דיבורהמשותףביאורתוספותמובהקביאורתוספותמובהקביאורתוספותמובהקראייתוספותמובהקת" };
  assert.equal(identifyCommentaryRun(items, [body, last, bodyEvidence], [11.88], references, "test").kind, "tosafot");
  assert.throws(() => identifyCommentaryRun([preceding, body, last], [body, last], [11.88], references, "test"), /ambiguous commentary stream/);
  assert.throws(() => identifyCommentaryRun(items, [body, last], [11.88], references, "test"), /ambiguous commentary stream/);
});

test("selects unresolved and partially inferred commentary only once per retry run", () => {
  assert.equal(isCommentaryRetryCandidate({ recovery: {} }, "retry"), true);
  assert.equal(isCommentaryRetryCandidate({ inferredAbsent: ["rashi"], page: { groups: { tosafot: [{}] } } }, "retry"), true);
  assert.equal(isCommentaryRetryCandidate({ lastClassificationError: "failed" }, "retry"), true);
  assert.equal(isCommentaryRetryCandidate({ inferredAbsent: ["rashi"], commentaryRetry: { runId: "retry" } }, "retry"), false);
  assert.equal(isCommentaryRetryCandidate({ page: {} }, "retry"), false);
  assert.equal(isCommentaryRetryCandidate(undefined, "retry"), false);
});

test("checks other commentary against each measured category", () => {
  const row = { left: 0, right: 10, baseline: 5, pitch: 10 };
  for (const kind of ["main", "rashi", "tosafot"]) {
    assert.throws(() => checkOverlap({ groups: { [kind]: [row], other: [row] } }), /overlap between .* and other/);
  }
  assert.doesNotThrow(() => checkOverlap({ groups: { main: [row], other: [{ ...row, left: 20, right: 30 }] } }));
});

test("preserves source-only Tosafot zeroes and refuses lost measured Tosafot", () => {
  const previous = { confirmedAbsent: ["tosafot"], tosafotEvidence: { revision: 42, decision: "absent", basis: "source-only" } };
  const page = { sha256: "pdf", groups: { tosafot: [] } };
  const evidence = { decision: "unknown" };
  const unknown = ["rashi", "tosafot"];
  const confirmed = [];
  preserveRetryTosafot(previous, page, evidence, unknown, confirmed, "retry");
  assert.deepEqual(unknown, ["rashi"]);
  assert.deepEqual(confirmed, ["tosafot"]);
  assert.deepEqual(evidence, { revision: 42, decision: "absent", basis: "source-only", runId: "retry", state: "processed", pdfSha256: "pdf" });
  assert.throws(() => preserveRetryTosafot(previous, { ...page, groups: { tosafot: [{}] } }, {}, [], [], "retry"), /conflicts/);
  assert.throws(() => preserveRetryTosafot({ page: { groups: { tosafot: [{}] } } }, page, { decision: "unknown" }, [], [], "retry"), /could not be reproduced/);
});

test("retry coverage rejects narrowed known commentary but allows source-bound reattribution", () => {
  const saved = { baseline: 100, left: 100, right: 200, pitch: 10 };
  const retained = { ...saved, right: 120 };
  const moved = { ...saved, left: 120 };
  const previous = { page: { groups: { tosafot: [saved] } } };
  const page = { groups: { main: [], rashi: [], tosafot: [retained], other: [] }, matches: [] };
  const preserve = () => preserveRetryTosafot(previous, page, { decision: "present" }, [], [], "retry");
  assert.throws(preserve, /could not be reproduced/);
  page.groups.other = [moved];
  assert.throws(preserve, /positively reattributed/);
  const match = { kind: "other", scores: { rashi: 0, tosafot: 4, other: 40 }, rows: [moved] };
  page.matches = [match];
  assert.doesNotThrow(preserve);
  page.matches = [{ ...match, scores: { rashi: 0, tosafot: 30, other: 40 } }];
  assert.throws(preserve, /positively reattributed/);
  page.matches = [{ ...match, rows: [{ ...moved, left: 150 }] }];
  assert.throws(preserve, /positively reattributed/);
  page.matches = [match];
  page.groups.tosafot = [];
  page.groups.other = [saved];
  page.matches = [{ ...match, rows: [saved] }];
  assert.doesNotThrow(() => preserveRetryTosafot(previous, page, { decision: "unknown" }, [], [], "retry"));
  assert.throws(() => preserveRetryPage({ page: { groups: { rashi: [saved] } } }, { page: { groups: { main: [], rashi: [retained] } } }), /rashi could not/);
  for (const uncertainty of [{ unknownCategories: ["tosafot"] }, { inferredAbsent: ["tosafot"] }]) {
    assert.throws(() => preserveRetryPage({ ...previous, ...uncertainty }, { page: { groups: { main: [], tosafot: [retained] } } }), /could not be reproduced/);
    assert.doesNotThrow(() => preserveRetryPage({ ...previous, ...uncertainty }, { page }));
  }
});

test("unknown categories cannot silently drop 136 Rashi and four Tosafot rows", () => {
  const rows = (count, left) => Array.from({ length: count }, (_, index) => ({ baseline: 1500 - index * 10, left, right: left + 100, pitch: 10 }));
  const previous = { unknownCategories: ["rashi", "tosafot"], page: { groups: { main: [], rashi: rows(136, 100), tosafot: rows(4, 300) } } };
  const snapshot = structuredClone(previous);
  const empty = { page: { groups: { main: [], rashi: [], tosafot: [], other: [] } } };
  assert.throws(() => preserveRetryPage(previous, empty), /rashi could not be reproduced/);
  assert.throws(() => preserveRetryPage(previous, { page: { groups: { ...empty.page.groups, rashi: previous.page.groups.rashi } } }), /Tosafot could not be reproduced/);
  assert.deepEqual(previous, snapshot);
  const next = { page: structuredClone(previous.page), unknownCategories: ["rashi", "tosafot"] };
  assert.doesNotThrow(() => preserveRetryPage(previous, next));
  assert.equal(next.page.groups.rashi.length, 136);
  assert.equal(next.page.groups.tosafot.length, 4);
});

test("keeps missing Rashi and missing source entries unknown", () => {
  const page = { groups: { rashi: [], tosafot: [] }, matches: [{ kind: "other" }, { kind: "other" }] };
  assert.deepEqual(classifyMissingCategories(page, {}), { inferredAbsent: [], unknownCategories: ["rashi", "tosafot"] });
  assert.deepEqual(classifyMissingCategories(page, { rashi: "", tosafot: "" }), { inferredAbsent: [], unknownCategories: ["rashi", "tosafot"] });
  assert.deepEqual(classifyMissingCategories(page, {}, { useWikisource: true, tosafotEvidence: { decision: "unknown" } }), { inferredAbsent: [], unknownCategories: ["rashi", "tosafot"] });
});

test("bounded commentary retries preserve old data and skip attempts in the same run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "commentary-retry-test-"));
  try {
    await mkdir(join(directory, "results", "shas-work"), { recursive: true });
    await writeFile(join(directory, "measure-shas.mjs"), await readFile(new URL("./measure-shas.mjs", import.meta.url)));
    const corpusModule = new URL("./measure-corpus.mjs", import.meta.url).href;
    const modules = {
      "measure-corpus.mjs": `export { applyReviewedGittin76bEvidence, checkOverlap, classifierVersion, classifyMissingCategories, isAmbiguousRetryCandidate, isCommentaryRetryCandidate, isLegacyCommentaryAuditCandidate, isOverlapRetryCandidate, preserveRetryPage, preserveRetryTosafot, verifyOverlapRetrySources } from ${JSON.stringify(corpusModule)};
    export const classifyHorayotTosafot = () => ({}), loadMainTexts = async () => ({ texts: [], scope: "tractate", source: "fixture" });
    export async function processMainPage(_definition, _index, _reference, bytes) { const amud = bytes.toString(); return { name: "tamid-" + amud, sha256: "sha" + amud, groups: { main: [{ left: 0, right: amud === "2a" ? 5 : 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] }, matches: [] }; }
export async function loadTexts(_tractate, options) { if (process.env.FIXTURE_404) throw Error("HTTP 404"); if (!options.works.includes("Rashbam")) throw Error("missing Rashbam"); return { rashi: [], rashbam: ["rashbam"] }; }
export async function processPage(_definition, _index, _references, bytes) { const amud = bytes.toString(); if (amud === "2a") throw Error("ambiguous commentary stream"); return { name: "bava-basra-" + amud, sha256: "sha" + amud, groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: amud === "3b" ? [{ left: 20, right: 30, baseline: 5, pitch: 10 }] : [], other: [] }, matches: [] }; }`,
      "pdf-cache.mjs": `export async function getCachedPdf(_tractate, amud) { return { bytes: Buffer.from(amud) }; }`,
      "shas-catalog.mjs": `export const tractates = [{ slug: "bava-basra", title: "Bava Batra", order: "Nezikin" }, { slug: "tamid", title: "Tamid", order: "Kodashim" }]; export const amudim = () => ["2a", "2b", "3a", "3b", "4a"]; export function amudIndex(amud) { return Number(amud.slice(0, -1)) * 2 + (amud.endsWith("b") ? 1 : 0); }`,
      "shas-export.mjs": `export async function readShasData() { return {}; } export async function writeShasExport() {}`,
      "shas-profiles.mjs": `export function shasDefinition(tractate) { return tractate; }`,
      "sotah-wikisource.mjs": `export function applyWikisourceAbsence() {} export function applyWikisourceRashiAbsence() {} export function needsWikisourceAbsence() {} export function needsWikisourceRashiAbsence() {} export function classifyWikisourceTosafot(_tractate, _amud, page, reference) { return { revision: reference.revision, decision: page.groups.tosafot.length ? "present" : "unknown" }; } export async function loadWikisourcePages(_tractate, options) { if (options.selectedAmudim?.length > 4) throw Error("limit exceeded"); const selected = options.selectedAmudim || ["2a", "2b", "3a", "3b", "4a"]; return Object.fromEntries(selected.map(amud => [amud, { revision: amud === "2b" ? 99 : 42, text: "", status: "unknown" }])); }`,
    };
    await Promise.all(Object.entries(modules).map(([name, content]) => writeFile(join(directory, name), content)));
    const main = [{ left: 0, right: 10, baseline: 5, pitch: 10 }];
    const oldPage = (amud, tosafot = []) => ({ name: `bava-basra-${amud}`, sha256: `sha${amud}`, groups: { main, rashi: [], tosafot }, matches: [] });
    const work = { slug: "bava-basra", pages: {
      "2a": { page: oldPage("2a"), tosafotEvidence: { revision: 42 }, commentaryRetry: { runId: "audit", state: "error", legacyAudit: true } },
      "2b": { page: oldPage("2b"), unknownCategories: ["rashi"], tosafotEvidence: { revision: 42 } },
      "3a": { error: "old error", confirmedAbsent: ["tosafot"], tosafotEvidence: { revision: 42, decision: "absent", basis: "source-only" } },
      "3b": { page: oldPage("3b", [{ left: 20, right: 30, baseline: 5, pitch: 10 }]), inferredAbsent: ["rashi"], tosafotEvidence: { revision: 42, decision: "present" }, commentaryRetry: { runId: "audit", state: "error", legacyAudit: true } },
      "4a": { error: "still pending" },
    } };
    const workFile = join(directory, "results", "shas-work", "bava-basra.json");
    await writeFile(workFile, JSON.stringify(work));
    const run = promisify(execFile);
    const args = ["measure-shas.mjs", "bava-basra", "--wikisource", "--retry-commentary", "--limit=2", "--run-id=test"];
    await run(process.execPath, args, { cwd: directory });
    let updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.deepEqual(updated.pages["2a"].page, work.pages["2a"].page);
    assert.match(updated.pages["2a"].commentaryRetry.error, /ambiguous/);
    assert.deepEqual(updated.pages["2b"].page, work.pages["2b"].page);
    assert.match(updated.pages["2b"].commentaryRetry.error, /revision differs/);
    assert.equal(updated.pages["3a"].commentaryRetry, undefined);
    const firstAttempts = [updated.pages["2a"], updated.pages["2b"]];
    await run(process.execPath, args, { cwd: directory });
    updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.deepEqual([updated.pages["2a"], updated.pages["2b"]], firstAttempts);
    assert.deepEqual(updated.pages["3a"].confirmedAbsent, ["tosafot"]);
    assert.equal(updated.pages["3a"].tosafotEvidence.basis, "source-only");
    assert.deepEqual(updated.pages["3b"].unknownCategories, ["rashi"]);
    assert.equal(updated.pages["3b"].page.groups.tosafot.length, 1);
    assert.equal(updated.pages["3b"].commentaryRetry.state, "resolved");
    assert.equal(updated.pages["3b"].commentaryRetry.legacyAudit, undefined);
    assert.equal(updated.pages["4a"].commentaryRetry, undefined);
    assert.equal(updated.pages["2a"].commentaryRetry.legacyAudit, true);
    await run(process.execPath, [...args.slice(0, -1), "--run-id=failed-again"], { cwd: directory });
    updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.equal(updated.pages["2a"].commentaryRetry.legacyAudit, true);
    assert.equal(updated.pages["2a"].commentaryRetry.previousAttempt.legacyAudit, true);
    assert.deepEqual(updated.pages["2a"].page, work.pages["2a"].page);
    await assert.rejects(run(process.execPath, ["measure-shas.mjs", "bava-basra", "--wikisource", "--retry-commentary", "--run-id=test"], { cwd: directory }), /finite integer --limit/);
    const sourceOnly = { error: "old error", confirmedAbsent: ["tosafot"], tosafotEvidence: { revision: 42, decision: "absent", basis: "source-only" } };
    await writeFile(workFile, JSON.stringify({ slug: "bava-basra", pages: { "2a": sourceOnly } }));
    await run(process.execPath, ["measure-shas.mjs", "bava-basra", "--wikisource", "--limit=1", "--run-id=ordinary"], { cwd: directory });
    updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.deepEqual(updated.pages["2a"].confirmedAbsent, ["tosafot"]);
    assert.deepEqual(updated.pages["2a"].tosafotEvidence, sourceOnly.tosafotEvidence);
    assert.match(updated.pages["2a"].lastClassificationError, /ambiguous/);
    const rashiOnly = { error: "old error", confirmedAbsent: ["rashi"], rashiEvidence: { revision: 42, decision: "absent", basis: "wikisource-no-regular-rashi-section" } };
    await writeFile(workFile, JSON.stringify({ slug: "bava-basra", pages: { "2a": rashiOnly } }));
    await run(process.execPath, ["measure-shas.mjs", "bava-basra", "--wikisource", "--limit=1", "--run-id=missing"], { cwd: directory, env: { ...process.env, FIXTURE_404: "1" } });
    updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.deepEqual(updated.pages["2a"].confirmedAbsent, ["rashi"]);
    assert.deepEqual(updated.pages["2a"].rashiEvidence, rashiOnly.rashiEvidence);
    assert.match(updated.pages["2a"].lastClassificationError, /HTTP 404/);
    const unknownCheckpoint = { page: oldPage("3b"), unknownCategories: ["rashi", "tosafot"], tosafotEvidence: { revision: 42 }, checkpoint: "user" };
    unknownCheckpoint.page.groups.rashi = Array.from({ length: 136 }, (_, index) => ({ left: 40, right: 50, baseline: 1500 - index * 10, pitch: 10 }));
    unknownCheckpoint.page.groups.tosafot = Array.from({ length: 4 }, (_, index) => ({ left: 20, right: 30, baseline: 5 - index * 10, pitch: 10 }));
    await writeFile(workFile, JSON.stringify({ slug: "bava-basra", pages: { "3b": unknownCheckpoint } }));
    await run(process.execPath, [...args.slice(0, -1), "--run-id=unknown-coverage"], { cwd: directory });
    updated = JSON.parse(await readFile(workFile, "utf8"));
    assert.deepEqual(updated.pages["3b"].page, unknownCheckpoint.page);
    assert.deepEqual(updated.pages["3b"].unknownCategories, ["rashi", "tosafot"]);
    assert.equal(updated.pages["3b"].checkpoint, "user");
    assert.match(updated.pages["3b"].commentaryRetry.error, /could not be reproduced/);
    const commentary = [{ left: 20, right: 30, baseline: 5, pitch: 10 }];
    const mainWork = { slug: "tamid", pages: Object.fromEntries(["2a", "2b", "3a", "3b"].map((amud) => [amud, {
      checkpoint: "user", lastClassificationError: "overlap between main and rashi",
      page: { ...oldPage(amud, amud === "3a" ? commentary : []), groups: { ...oldPage(amud, amud === "3a" ? commentary : []).groups, rashi: amud === "2b" ? commentary : [] } },
      ...(amud === "3b" ? { confirmedAbsent: ["rashi", "tosafot"] } : {}),
      tosafotEvidence: { revision: amud === "2b" ? 99 : 42, decision: amud === "3a" ? "present" : "unknown" },
    }])) };
    const mainWorkFile = join(directory, "results", "shas-work", "tamid.json");
    await writeFile(mainWorkFile, JSON.stringify(mainWork));
    const mainArgs = ["measure-shas.mjs", "tamid", "--wikisource", "--retry-overlaps", "--cached-pdfs-only", "--limit=2", "--run-id=main-only"];
    await run(process.execPath, mainArgs, { cwd: directory });
    await run(process.execPath, mainArgs, { cwd: directory });
    const mainUpdated = JSON.parse(await readFile(mainWorkFile, "utf8"));
    for (const [amud, error] of [["2a", /main text could not/], ["2b", /rashi could not/], ["3a", /Tosafot could not/]]) {
      assert.deepEqual(mainUpdated.pages[amud].page, mainWork.pages[amud].page);
      assert.match(mainUpdated.pages[amud].overlapRetry.error, error);
    }
    assert.deepEqual(mainUpdated.pages["3b"].confirmedAbsent, ["tosafot", "rashi"]);
    assert.deepEqual(mainUpdated.pages["3b"].unknownCategories, []);
    assert.deepEqual(mainUpdated.pages["3b"].overlapRetry, { runId: "main-only", state: "resolved" });
    assert.deepEqual(mainUpdated.pages["3b"].previousClassification, mainWork.pages["3b"]);
    assert.match((await run(process.execPath, mainArgs, { cwd: directory })).stdout, /"attempted": 0/);
    assert.deepEqual(JSON.parse(await readFile(mainWorkFile, "utf8")), mainUpdated);
    await writeFile(mainWorkFile, JSON.stringify(mainWork));
    await run(process.execPath, ["measure-shas.mjs", "tamid", "--wikisource", "--retry-commentary", "--amudim=2a", "--limit=2", "--run-id=selected"], { cwd: directory });
    const selected = JSON.parse(await readFile(mainWorkFile, "utf8"));
    assert.equal(selected.pages["2a"].commentaryRetry.runId, "selected");
    assert.deepEqual(selected.pages["2a"].page, mainWork.pages["2a"].page);
    assert.equal(selected.pages["2b"].commentaryRetry, undefined);
    await assert.rejects(run(process.execPath, ["measure-shas.mjs", "tamid", "--wikisource", "--retry-commentary", "--include-classified", "--limit=2", "--run-id=selected"], { cwd: directory }), /--include-classified requires/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("selects only overlap failures not already attempted in the retry run", () => {
  assert.equal(isOverlapRetryCandidate({ lastClassificationError: "overlap between main and tosafot" }, "retry"), true);
  assert.equal(isOverlapRetryCandidate({ recovery: { reason: "overlap between main and rashi" } }, "retry"), true);
  assert.equal(isOverlapRetryCandidate({ lastClassificationError: "ambiguous commentary stream" }, "retry"), false);
  assert.equal(isOverlapRetryCandidate({ lastClassificationError: "overlap between main and tosafot", overlapRetry: { runId: "retry" } }, "retry"), false);
});

test("selects ambiguous failures once per retry run", () => {
  const entry = { lastClassificationError: "96b: ambiguous commentary stream" };
  assert.equal(isAmbiguousRetryCandidate(entry, "next"), true);
  assert.equal(isAmbiguousRetryCandidate({ ...entry, commentaryRetry: { runId: "next" } }, "next"), false);
  assert.equal(isAmbiguousRetryCandidate({ lastClassificationError: "overlap between main and rashi" }, "next"), false);
  for (const entry of [{ error: "ambiguous commentary substream boundaries" }, { recovery: { reason: "page: ambiguous commentary substream boundaries" } }, { commentaryRetry: { runId: "old", error: "ambiguous commentary substream boundaries" } }]) {
    assert.equal(isAmbiguousRetryCandidate(entry, "next"), true);
    assert.equal(isAmbiguousRetryCandidate({ ...entry, commentaryRetry: { runId: "next" } }, "next"), false);
  }
});

test("audits already classified mixed streams once per run even with other commentary", () => {
  const entry = { page: { matches: [{ kind: "rashi" }, { kind: "tosafot" }] } };
  assert.equal(isLegacyCommentaryAuditCandidate(entry, "next"), true);
  assert.equal(isLegacyCommentaryAuditCandidate({ ...entry, commentaryRetry: { runId: "next" } }, "next"), false);
  assert.equal(isLegacyCommentaryAuditCandidate({ page: { matches: [{ kind: "other" }] } }, "next"), true);
  const failedAudit = { ...entry, commentaryRetry: { runId: "audit", state: "error", legacyAudit: true } };
  assert.equal(isCommentaryRetryCandidate(failedAudit, "next"), true);
  assert.equal(isCommentaryRetryCandidate(failedAudit, "audit"), false);
  assert.equal(isCommentaryRetryCandidate({ ...entry, commentaryRetry: { runId: "audit", state: "resolved" } }, "next"), false);
});

test("protected retries retain checkpoints, all confirmed zeroes, and saved main area", () => {
  const row = { baseline: 100, left: 100, right: 200, pitch: 10 };
  const previous = { checkpoint: "user", confirmedAbsent: ["rashi", "tosafot"], rashiEvidence: { revision: 42, basis: "wikisource-empty-regular-rashi-section" }, page: { groups: { main: [row] } } };
  const next = { confirmedAbsent: [], unknownCategories: ["rashi", "tosafot"], page: { groups: { main: [row], rashi: [], tosafot: [] } } };
  preserveRetryPage(previous, next);
  assert.deepEqual(next.confirmedAbsent, ["rashi", "tosafot"]);
  assert.deepEqual(next.rashiEvidence, previous.rashiEvidence);
  assert.deepEqual(next.unknownCategories, []);
  assert.equal(next.previousClassification, previous);
  assert.throws(() => preserveRetryPage(previous, { page: { groups: { main: [], rashi: [], tosafot: [] } } }), /main text could not/);
  assert.throws(() => preserveRetryPage(previous, { page: { groups: { main: [row], rashi: [row] } } }), /recorded zero/);
});

test("rejects overlap retries when saved PDF or source fingerprints differ", () => {
  const entry = { page: { sha256: "original" }, tosafotEvidence: { revision: 42 } };
  assert.doesNotThrow(() => verifyOverlapRetrySources(entry, { sha256: "original" }, { revision: 42 }));
  assert.throws(() => verifyOverlapRetrySources(entry, { sha256: "different" }, { revision: 42 }), /PDF differs/);
  assert.throws(() => verifyOverlapRetrySources(entry, { sha256: "original" }, { revision: 43 }), /Wikisource revision differs/);
  assert.throws(() => verifyOverlapRetrySources(entry, { sha256: "original" }, null), /Wikisource revision differs/);
  assert.throws(() => verifyOverlapRetrySources({ page: {} }, { sha256: "original" }, null), /fingerprint unavailable/);
  assert.throws(() => verifyOverlapRetrySources({ page: { sha256: "original" }, tosafotEvidence: { pdfSha256: "different" } }, { sha256: "original" }, null), /PDF differs/);
  assert.throws(() => verifyOverlapRetrySources({ ...entry, mainFragmentEvidence: { nextRevision: 44 } }, { sha256: "original" }, { revision: 42 }, { revision: 45 }), /Next main-text revision differs/);
  assert.throws(() => verifyOverlapRetrySources({ ...entry, rashiEvidence: { revision: 43 } }, { sha256: "original" }, { revision: 42 }), /Rashi Wikisource revision differs/);
  assert.throws(() => verifyOverlapRetrySources({ rashiEvidence: { pdfSha256: "original" } }, { sha256: "different" }), /PDF differs/);
  assert.doesNotThrow(() => verifyOverlapRetrySources({ ...entry, mainFragmentEvidence: { nextRevision: 44 } }, { sha256: "original" }, { revision: 42 }, { revision: 44 }));
});

test("detects text in regular and other Tosafot-named sections", () => {
  assert.equal(hasNoTosafotSections('==רש"י==\nרשי'), true);
  assert.equal(hasNoTosafotSections("==תוספות==\n<קטע התחלה=ת/>\n==רש\"י==\nרשי"), true);
  assert.equal(hasNoTosafotSections("==תוספות==\nטקסט"), false);
  assert.equal(hasNoTosafotSections("==ראשונים נוספים==\n===תוספות שאנץ===\nטקסט"), false);
  assert.equal(hasNoTosafotSections("==ראשונים נוספים==\n===תוספות שאנץ===\n<!-- ריק -->\n==רש\"י==\nרשי"), true);
  assert.equal(hasNoTosafotSections("==ראשונים נוספים==\n===תוס' ר\"י הזקן===\nטקסט"), false);
  assert.equal(hasNoTosafotSections("==תוספות==\n{{transcluded}}"), false);
  assert.equal(hasNoTosafotSections("==תוספות==\n( אין תוספות לפרק זה )"), true);
  assert.equal(hasNoTosafotSections("==תוספות==\n<קטע התחלה=ת/><center>'''פרק תשיעי - עגלה ערופה'''</center>\n ( אין תוספות לפרק זה ) <קטע סוף=ת/>"), true);
  assert.equal(hasNoTosafotSections("==תוספות==\n<center>'''פרק תשיעי'''</center>\n( אין תוספות לפרק זה )\nטקסט"), false);
});

test("recognizes an empty regular section even with other Tosafot commentary", () => {
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n<קטע התחלה=ת/>\n==ראשונים נוספים==\n===תוספות שאנץ===\nטקסט"), true);
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\nטקסט\n==תוספות שאנץ==\nטקסט"), false);
  assert.equal(hasEmptyRegularTosafotSection("==תוספות שאנץ==\nטקסט"), false);
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n{{transcluded}}"), false);
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n( אין תוספות לפרק זה )"), true);
});

test("detects only an empty or missing regular Rashi section", () => {
  assert.equal(regularRashiAbsenceBasis('==רש"י==\n<קטע התחלה=ר/><קטע סוף=ר/>\n==רשב"ם==\nטקסט'), "wikisource-empty-regular-rashi-section");
  assert.equal(regularRashiAbsenceBasis('==רשב"ם==\nטקסט'), "wikisource-no-regular-rashi-section");
  assert.equal(regularRashiAbsenceBasis('==רש״י==\n(אין)'), "wikisource-empty-regular-rashi-section");
  assert.equal(regularRashiAbsenceBasis('==מיוחס לרש"י==\nטקסט'), null);
  assert.equal(regularRashiAbsenceBasis('==רש״י==\n(אין)\n==פירוש המיוחס לרש״י==\nטקסט'), null);
  assert.equal(regularRashiAbsenceBasis('==מיוחס לרש"י==\n'), null);
  assert.equal(regularRashiAbsenceBasis('==רש"י==\n===דיבור המתחיל===\nטקסט'), null);
  assert.equal(regularRashiAbsenceBasis('==רש"י==\n{{transcluded}}'), null);
  assert.equal(regularRashiAbsenceBasis('==רש"י==\nטקסט\n==רש"י==\n(אין)'), null);
});

test("does not treat a populated subsection of regular Tosafot as empty", () => {
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n===דיבור המתחיל===\nטקסט\n==רש\"י==\nרשי"), false);
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n===כותרת===\n<!-- ריק -->\n==רש\"י==\nרשי"), true);
});

test("recognizes an explicit none marker without counting page navigation", () => {
  const source = "==תוספות==\n<קטע התחלה=ת/> (אין)\n<קטע סוף=ת/>\n</div>\n[[קטגוריה:בבלי מסכת פסחים]]\n{{מפרשים לדף גמרא|פסחים|ד|נז|ב}}";
  assert.equal(hasEmptyRegularTosafotSection(source), true);
  assert.deepEqual(parseTosafotSection(source), { status: "absent", text: "" });
  assert.equal(hasEmptyRegularTosafotSection("==תוספות==\n(אין)\nטקסט של תוספות"), false);
  assert.equal(parseTosafotSection("==תוספות==\n(אין תוספות לפרק זה)\nמרים המתינה למשה שעה אחת").status, "present");
});

test("rechecks only unknown values and preserves prior zeroes", () => {
  assert.equal(needsWikisourceAbsence({ page: { groups: { tosafot: [] } }, unknownCategories: ["tosafot"] }), true);
  assert.equal(needsWikisourceAbsence({ page: { groups: { tosafot: [] } }, confirmedAbsent: ["tosafot"] }), false);
  assert.equal(needsWikisourceAbsence({ confirmedAbsent: ["tosafot"] }), false);
  assert.equal(needsWikisourceAbsence({ page: { groups: { tosafot: [{}] } }, unknownCategories: ["tosafot"] }), false);
});

test("records a Rashi source-only zero without replacing detected or known values", () => {
  const reference = { title: "פסחים קכא ב", revision: 42, rashiAbsenceBasis: "wikisource-empty-regular-rashi-section" };
  const entry = { page: { sha256: "pdf", groups: { rashi: [], tosafot: [] } }, unknownCategories: ["rashi"], confirmedAbsent: ["tosafot"] };
  assert.equal(applyWikisourceRashiAbsence(entry, reference), true);
  assert.deepEqual(entry.confirmedAbsent, ["tosafot", "rashi"]);
  assert.deepEqual(entry.unknownCategories, []);
  assert.equal(entry.rashiEvidence.revision, 42);
  assert.equal(entry.rashiEvidence.pdfSha256, "pdf");
  assert.equal(needsWikisourceRashiAbsence(entry), false);
  assert.equal(applyWikisourceRashiAbsence({ unknownCategories: ["rashi"], page: { groups: { rashi: [{}] } } }, reference), false);
  assert.equal(applyWikisourceRashiAbsence({ page: { groups: { rashi: [] } }, unknownCategories: [] }, reference), false);
  assert.equal(applyWikisourceRashiAbsence({ error: "unresolved" }, { ...reference, revision: null }), false);
  assert.equal(applyWikisourceRashiAbsence({ error: "unresolved" }, { ...reference, rashiAbsenceBasis: null }), false);
  assert.equal(applyWikisourceRashiAbsence({ error: "unresolved" }, reference), true);
});

test("distinguishes regular Wikisource Tosafot from other commentaries and empty chapter markers", () => {
  assert.deepEqual(parseTosafotSection('==רש"י==\nרש"י\n==ראשונים נוספים==\n===תוספות שאנץ==='), { status: "unknown", text: "" });
  assert.deepEqual(parseTosafotSection('==רש"י==\nרש"י\n==ראשונים נוספים==\n===תוספות שאנץ===', { missingSectionStatus: "absent" }), { status: "absent", text: "" });
  assert.deepEqual(parseTosafotSection('==תוספות==\n<קטע התחלה=ת/> מרים המתינה למשה שעה אחת <קטע סוף=ת/>\n==רש"י=='), { status: "present", text: "מריםהמתינהלמשהשעהאחת" });
  assert.deepEqual(parseTosafotSection("==תוס'==\nמרים המתינה למשה שעה אחת\n==תוס' ר\"י הזקן==\nאחר"), { status: "present", text: "מריםהמתינהלמשהשעהאחת" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n<center>פרק תשיעי - עגלה ערופה</center>\n ( אין תוספות לפרק זה )"), { status: "absent", text: "" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n<קטע התחלה=ת/>"), { status: "unknown", text: "" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n<קטע התחלה=ת/>", { emptySectionStatus: "absent" }), { status: "absent", text: "" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n{{transcluded}}", { emptySectionStatus: "absent" }), { status: "unknown", text: "" });
});

test("constructs Sotah Wikisource titles including special Hebrew numerals", () => {
  assert.equal(sotahWikiTitle("9b"), "סוטה ט ב");
  assert.equal(sotahWikiTitle("11a"), "סוטה יא א");
  assert.equal(sotahWikiTitle("15b"), "סוטה טו ב");
  assert.equal(sotahWikiTitle("16a"), "סוטה טז א");
  assert.equal(sotahWikiTitle("43b"), "סוטה מג ב");
  assert.throws(() => sotahWikiTitle("50a"));
});

test("constructs page titles for the whole catalog and leaves unsupported pagination unknown", () => {
  assert.equal(wikisourceTitle({ slug: "bava-basra" }, "176b"), "בבא בתרא קעו ב");
  assert.equal(wikisourceTitle({ slug: "shabbos" }, "115a"), "שבת קטו א");
  assert.equal(wikisourceTitle({ slug: "shekalim" }, "2a"), "שקלים א א");
  assert.equal(wikisourceTitle({ slug: "shekalim" }, "2b"), "שקלים ב ב");
  assert.equal(wikisourceTitle({ slug: "kinim" }, "22b"), null);
  assert.throws(() => wikisourceTitle({ slug: "sotah" }, "1a"));
});

test("fetches Wikisource pages afresh and treats missing and redirect pages as unknown", async () => {
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls++;
    assert.equal(options.headers["Cache-Control"], "no-cache");
    return { ok: true, json: async () => ({ query: { pages: [
      { title: "שקלים א א", revisions: [{ revid: 1, slots: { main: { content: "#הפניה [[ירושלמי]]" } } }] },
      { title: "שקלים ב ב", missing: true },
    ] } }) };
  };
  const tractate = { slug: "shekalim", first: "2a", last: "2b" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const pages = await loadWikisourcePages(tractate, { fetcher });
    assert.equal(pages["2a"].status, "unknown");
    assert.equal(pages["2b"].status, "unknown");
    assert.equal(pages["2a"].absenceCandidate, false);
    assert.equal(pages["2b"].absenceCandidate, false);
  }
  assert.equal(calls, 2);
});

test("accepts the Shekalim 2a alternate title only when its source identifies the printed side", async () => {
  const tractate = { slug: "shekalim", first: "2a", last: "2a" };
  const load = (content) => loadWikisourcePages(tractate, {
    fetcher: async (url) => {
      assert.equal(url.searchParams.get("titles"), "שקלים א א");
      return { ok: true, json: async () => ({ query: { pages: [{ title: "שקלים א א", revisions: [{ revid: 42, slots: { main: { content } } }] }] } }) };
    },
  });
  const correct = (await load('{{כותרת לעמוד בגמרא|שקלים|ב|א||ב ב}}\n==קרבן העדה==\nטקסט'))["2a"];
  assert.equal(correct.usable, true);
  assert.equal(correct.absenceCandidate, true);
  assert.equal(correct.rashiAbsenceBasis, "wikisource-no-regular-rashi-section");
  for (const content of ['{{כותרת לעמוד בגמרא|שקלים|ב|ב||}}\n==קרבן העדה==\nטקסט', '==קרבן העדה==\nטקסט']) {
    const incorrect = (await load(content))["2a"];
    assert.equal(incorrect.usable, false);
    assert.equal(incorrect.absenceCandidate, false);
    assert.equal(incorrect.rashiAbsenceBasis, null);
  }
});

test("requests only selected Wikisource pages and propagates rate limits", async () => {
  const tractate = { slug: "berachos", first: "2a", last: "2b" };
  const pages = await loadWikisourcePages(tractate, {
    selectedAmudim: ["2b"],
    fetcher: async (url) => {
      assert.equal(url.searchParams.get("titles"), "ברכות ב ב");
      return { ok: true, json: async () => ({ query: { pages: [{ title: "ברכות ב ב", revisions: [{ revid: 42, slots: { main: { content: '==רש"י==\nרשי' } } }] }] } }) };
    },
  });
  assert.deepEqual(Object.keys(pages), ["2b"]);
  assert.equal(pages["2b"].absenceCandidate, true);
  await assert.rejects(loadWikisourcePages(tractate, { selectedAmudim: ["2b"], fetcher: async () => ({ ok: false, status: 429 }) }), { status: 429 });
});

test("caches Wikisource independently and can refresh it", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "wikisource-test-"));
  try {
    const tractate = { slug: "berachos", first: "2a", last: "2a" };
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { ok: true, json: async () => ({ query: { pages: [{ title: "ברכות ב א", revisions: [{ revid: calls, slots: { main: { content: '==רש"י==\nרשי' } } }] }] } }) };
    };
    assert.equal((await loadWikisourcePages(tractate, { cacheDirectory, fetcher }))["2a"].revision, 1);
    assert.equal((await loadWikisourcePages(tractate, { cacheDirectory, fetcher }))["2a"].revision, 1);
    assert.equal((await loadWikisourcePages(tractate, { cacheDirectory, fetcher, refresh: true }))["2a"].revision, 2);
    assert.equal(calls, 2);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

test("cached-only Wikisource rejects missing revisions without fetching", async () => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), "wiki-cache-only-"));
  try {
    await assert.rejects(loadWikisourcePages({ slug: "arachin" }, { selectedAmudim: ["2a"], cacheDirectory, cacheOnly: true,
      fetcher: () => { assert.fail("Must not fetch missing source revisions"); } }), /revisions unavailable in local cache/);
  } finally {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

test("records a source-only absence without requiring Sefaria or a successful PDF classification", () => {
  const reference = { title: "test", revision: 42, status: "unknown", absenceCandidate: true };
  const entry = { unknownCategories: ["rashi", "tosafot"], lastClassificationError: "failed" };
  assert.equal(applyWikisourceAbsence(entry, reference), true);
  assert.deepEqual(entry.unknownCategories, ["rashi"]);
  assert.deepEqual(entry.confirmedAbsent, ["tosafot"]);
  assert.equal(entry.lastClassificationError, "failed");
  assert.equal(entry.tosafotEvidence.basis, "wikisource-no-populated-tosafot-sections");
  assert.equal(applyWikisourceAbsence({}, { ...reference, absenceCandidate: false }), false);
  assert.equal(applyWikisourceAbsence({}, { ...reference, revision: null }), false);
  assert.equal(applyWikisourceAbsence({ page: { groups: { tosafot: [{}] } } }, reference), false);
});

test("distinguishes empty Sefaria pages from missing entries", async () => {
  const definition = { title: "Berakhot", order: "Zeraim" };
  const texts = await loadTexts(definition, { works: ["Tosafot"], fetcher: async () => ({
    ok: true, json: async () => ({ title: "Tosafot on Berakhot", text: [[], null, ["טקסט"]] }),
  }) });
  assert.equal(texts.tosafot[0], "");
  assert.equal(texts.tosafot[1], undefined);
  assert.equal(texts.tosafot[2], "טקסט");
  assert.equal(texts.tosafot[3], undefined);
});

test("applies reviewed Sotah PDF corrections only to the reviewed bytes", () => {
  const page = { sha256: "f70bff2057641ae9e7253a33c62ffe98fcbc761ab6af2fd2ca6f3a9f01bc94a4", groups: { rashi: [{ baseline: 594.5987621604, kind: "rashi" }, { baseline: 584.1587663364, kind: "rashi" }, { baseline: 648, kind: "rashi" }], tosafot: [] } };
  assert.equal(applySotahPdfReview("35a", page), "manual-pdf-review");
  assert.deepEqual(page.groups.rashi.map((row) => row.baseline), [648]);
  assert.deepEqual(page.groups.tosafot.map((row) => row.kind), ["tosafot", "tosafot"]);
  assert.equal(applySotahPdfReview("44a", { sha256: "changed", groups: { tosafot: [] } }), null);
  assert.equal(applySotahPdfReview("44a", { sha256: "6d67f2550bdf5959bd7c2008592937f102ed9030649aed6db0e2412acf9ca9d0", groups: { tosafot: [] } }), "manual-pdf-review");
});

test("requires source and PDF evidence to resolve Sotah Tosafot", () => {
  const page = { sha256: "pdf", groups: { tosafot: [] }, matches: [{ kind: "rashi" }] };
  const reference = { title: "test", revision: 42, status: "absent" };
  assert.equal(classifySotahTosafot("9b", page, reference).decision, "absent");
  assert.equal(classifySotahTosafot("9b", page, { ...reference, revision: null }).decision, "unknown");
  assert.equal(classifySotahTosafot("9b", { ...page, matches: [] }, reference).decision, "unknown");
  assert.equal(classifySotahTosafot("9b", page, { ...reference, status: "present" }).decision, "unknown");
  assert.equal(classifySotahTosafot("44a", page, { ...reference, status: "unknown" }).decision, "unknown");
});

test("uses the historical Horayot layout to distinguish absent and unrecognized Tosafot", () => {
  const page = { sha256: "pdf", groups: { tosafot: [] }, matches: [{ kind: "rashi" }, { kind: "rashi" }] };
  assert.equal(classifyHorayotTosafot("9a", page, "").decision, "absent");
  assert.equal(classifyHorayotTosafot("8b", page, "").decision, "unknown");
  assert.equal(classifyHorayotTosafot("9a", page, "reference").decision, "unknown");
  assert.equal(classifyHorayotTosafot("9a", { ...page, matches: [] }, "").decision, "unknown");
  assert.equal(classifyHorayotTosafot("8b", { ...page, groups: { tosafot: [{}] } }, "reference").decision, "present");
});

test("decodes Hebrew text and preserves already decoded Hebrew", () => {
  assert.equal(decodePdfText("àëä ïçëùàãë ïä éðú éúëåã ìëá"), "בכל דוכתי תני הן כדאשכחן הכא");
  assert.equal(decodePdfText("רבא אמר"), "רבא אמר");
});

test("matches a fragmented right-to-left line against commentary", () => {
  const items = [item("וירא", 80, 100), item("לולי", 50, 100), item("כי ידין", 10, 100)];
  assert.ok(matchScore(items, normalizeHebrew("זכור ירכבהו וירא לולי כי ידין ככתוב")) >= 8);
});

test("matches mapped main-text fragments without joining unknown glyphs", () => {
  const text = normalizeHebrew("כינויי נדרים כנדרים וחרמים כחרמים");
  const items = [item("\u00cc\u00c8\u00af\u201e\u0005\u00ce \u00cc\u00c8\u00af\u201e\u0005 \u00c8\u00c8\u00c2\u0005\u00c8\u00ce", 10, 100), item("\u00cc\u00c8\u00d3\u00af\u00c1\u00ce \u00cc\u00c8\u00d3\u00af\u00c1\u00c2", 10, 90)];
  assert.deepEqual(matchMainGlyphs(items, text), { fragments: 2, letters: 29 });
  assert.deepEqual(matchMainGlyphs([{ ...items[0], str: "\u00cc\u00c8\u00af\u201e\u0005?\u00c8\u00c8\u00c2\u0005\u00c8\u00ce" }], text), { fragments: 0, letters: 0 });
});

test("splits vertically restarted commentary and measures each line", () => {
  const items = [item("first", 10, 100), item("second", 10, 60), item("third", 70, 100)];
  const runs = splitRuns(items);
  assert.equal(runs.length, 2);
  assert.equal(groupRows(runs[0]).length, 2);
  assert.equal(groupRows(runs[1]).length, 1);
});

test("includes bold fragments in the commentary stream but not a following margin", () => {
  const bold = { ...item("bold", 155, 90, 15), height: 11.94 };
  const body = { ...item("body", 100, 90, 50), height: 11.16 };
  const margin = { ...item("margin", 300, 90, 10), height: 11.94 };
  const items = [bold, body, margin];
  assert.deepEqual(includeStreamFragments(items, [body], [11.94], 0), [body, bold]);
});

test("assigns trailing bold fragments to the adjacent preceding commentary", () => {
  const previousBody = item("previous", 221, 100, 93);
  const bold1 = item("bold1", 110, 100, 74);
  const bold2 = item("bold2", 191, 100, 24);
  const nextBody = item("next", 326, 100, 200);
  const items = [previousBody, bold1, bold2, nextBody];
  const previous = { run: [previousBody], expanded: [previousBody] };
  const current = { run: [nextBody], expanded: [nextBody, bold1, bold2] };
  redistributeLeadingFragments(items, previous, current);
  assert.deepEqual(previous.expanded, [previousBody, bold1, bold2]);
  assert.deepEqual(current.expanded, [nextBody]);
});

test("assigns the last bold-only line below a preceding commentary to that stream", () => {
  const previousBody = item("previous", 120, 638, 100);
  const lastRashi = item("last Rashi", 120, 627.5, 100);
  const nextBody = item("Tosafot", 420, 627.5, 100);
  const items = [previousBody, lastRashi, nextBody];
  const previous = { run: [previousBody], expanded: [previousBody] };
  const current = { run: [nextBody], expanded: [nextBody, lastRashi] };
  redistributeLeadingFragments(items, previous, current);
  assert.deepEqual(previous.expanded, [previousBody, lastRashi]);
  assert.deepEqual(current.expanded, [nextBody]);
});

test("follows consecutive leading lines without moving the next stream's opening", () => {
  const previousBody = item("previous", 420, 638, 100);
  const firstLine = item("first", 420, 627.5, 100);
  const secondLine = item("second", 420, 617, 100);
  const thirdLine = item("third", 420, 606.5, 100);
  const nextBold = item("next bold", 120, 606.5, 40);
  const nextBody = item("next body", 160, 606.5, 60);
  const items = [previousBody, firstLine, secondLine, thirdLine, nextBold, nextBody];
  const previous = { run: [previousBody], expanded: [previousBody] };
  const current = { run: [nextBody], expanded: [nextBody, firstLine, secondLine, thirdLine, nextBold] };
  redistributeLeadingFragments(items, previous, current);
  assert.deepEqual(previous.expanded, [previousBody, firstLine, secondLine, thirdLine]);
  assert.deepEqual(current.expanded, [nextBody, nextBold]);
});

test("does not assign an earlier line to a distant preceding stream", () => {
  const previousTop = item("previous top", 120, 1119, 100);
  const previousEnd = item("previous end", 120, 784.3, 100);
  const nextOpening = item("next opening", 120, 1108.6, 100);
  const previousTail = item("previous tail", 120, 773.9, 100);
  const nextBody = item("next body", 420, 1108.6, 100);
  const items = [previousTop, previousEnd, nextOpening, previousTail, nextBody];
  const previous = { run: [previousTop, previousEnd], expanded: [previousTop, previousEnd] };
  const current = { run: [nextBody], expanded: [nextBody, nextOpening, previousTail] };
  redistributeLeadingFragments(items, previous, current);
  assert.deepEqual(previous.expanded, [previousTop, previousEnd, previousTail]);
  assert.deepEqual(current.expanded, [nextBody, nextOpening]);
});

test("keeps leading fragments with matching current commentary even when geometry favors the previous stream", () => {
  const previousBody = item("previous", 100, 100, 50);
  const previousFragment = item("פרשנותראשונה", 155, 90, 25);
  const currentFragment = item("פירושהתוספות", 195, 90, 25);
  const nextBody = item("next", 235, 92.1, 50);
  const items = [previousBody, previousFragment, currentFragment, nextBody];
  const previous = { kind: "rashi", run: [previousBody], expanded: [previousBody] };
  const current = { kind: "tosafot", run: [nextBody], expanded: [nextBody, previousFragment, currentFragment] };
  redistributeLeadingFragments(items, previous, current, { references: { rashi: "פרשנותראשונה", tosafot: "פירושהתוספות" } });
  assert.deepEqual(previous.expanded, [previousBody]);
  assert.deepEqual(current.expanded, [nextBody, previousFragment, currentFragment]);
});

test("uses geometry to place a quotation shared by both commentary references", () => {
  const previousBody = item("previous", 100, 100, 50);
  const quotation = item("דיבורהמשותף", 100, 89, 50);
  const nextBody = item("next", 300, 89, 50);
  const items = [previousBody, quotation, nextBody];
  const previous = { kind: "rashi", run: [previousBody], expanded: [previousBody] };
  const current = { kind: "tosafot", run: [nextBody], expanded: [nextBody, quotation] };
  redistributeLeadingFragments(items, previous, current, { references: { rashi: "דיבורהמשותף", tosafot: "דיבורהמשותף" } });
  assert.deepEqual(previous.expanded, [previousBody, quotation]);
  assert.deepEqual(current.expanded, [nextBody]);
});

test("rejects a reassignment that could belong to nearby main text", () => {
  const previousBody = item("previous", 100, 100, 50);
  const fragment = item("ambiguous", 155, 89, 25);
  const nextBody = item("next", 300, 89, 50);
  const items = [previousBody, fragment, nextBody];
  const previous = { run: [previousBody], expanded: [previousBody] };
  const current = { run: [nextBody], expanded: [nextBody, fragment] };
  assert.throws(() => redistributeLeadingFragments(items, previous, current, { mainRows: [{ baseline: 89, left: 185, right: 250 }] }), /ambiguous leading fragment near main text/);
});

test("keeps a nearby bold fragment with its own commentary stream", () => {
  const previousBody = item("previous", 120, 638, 100);
  const nextBold = item("next bold", 420, 627.5, 40);
  const nextBody = item("next body", 460, 627.5, 60);
  const items = [previousBody, nextBold, nextBody];
  const previous = { run: [previousBody], expanded: [previousBody] };
  const current = { run: [nextBody], expanded: [nextBody, nextBold] };
  redistributeLeadingFragments(items, previous, current);
  assert.deepEqual(previous.expanded, [previousBody]);
  assert.deepEqual(current.expanded, [nextBody, nextBold]);
});

test("uses the same reference area for all pages in a tractate", () => {
  const pages = [
    { groups: { main: [{ left: 0, right: 10, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } },
    { groups: { main: [{ left: 0, right: 5, baseline: 5, pitch: 10 }], rashi: [], tosafot: [] } },
  ];
  const frame = { left: 0, right: 10, bottom: 0, top: 10 };
  assert.equal(calculateAreas(pages, frame), 100);
  assert.equal(pages[0].areas.main.fraction, 1);
  assert.equal(pages[1].areas.main.fraction, 0.5);
  assert.equal(calculateFrame(pages).top, 12);
  assert.deepEqual(calculateFrame(pages, { horizontal: 2, vertical: 4 }), { left: -2, right: 12, bottom: -4, top: 16 });
  pages[0].groups.main[0].top = 100;
  assert.equal(calculateFrame(pages, { vertical: 4 }).top, 16);
});

test("calibrated 10a and embedded 31a preserve the known classifications", async (context) => {
  let text;
  try {
    text = await readFile("results/corpus-measurements.json", "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    context.skip("Generate the local corpus report to run this integration check");
    return;
  }
  const report = JSON.parse(text);
  const horayot = report.pages.find((page) => page.name === "horayos-10a");
  const rosh = report.pages.find((page) => page.name === "rosh-hashanah-31a");
  const horayotFirst = report.pages.find((page) => page.name === "horayos-2a");
  const roshFirst = report.pages.find((page) => page.name === "rosh-hashanah-2a");
  assert.equal(horayot.groups.main.filter((row) => row.right - row.left < 250).length, 31);
  assert.equal(horayot.groups.main.filter((row) => row.right - row.left >= 250).length, 21);
  assert.equal(horayot.groups.rashi.filter((row) => row.right - row.left < 140).length, 76);
  assert.equal(horayot.groups.rashi.filter((row) => row.right - row.left >= 140).length, 8);
  assert.deepEqual(rosh.matches.map((match) => match.kind), ["rashi", "rashi", "tosafot"]);
  assert.equal(rosh.groups.tosafot.length, 7);
  assert.ok(horayotFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 479.2) < 1 && row.right > 519));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1129.6) < 1 && row.right > 330));
  assert.ok(roshFirst.groups.rashi.some((row) => Math.abs(row.baseline - 1129.6) < 1 && row.right > 548));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1129.6) < 1 && row.tallFragments.length > 0));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 826.2) < 1 && row.right > 190));
  assert.ok(roshFirst.groups.tosafot.some((row) => Math.abs(row.baseline - 1025) < 2 && row.right > 239.3));
  assert.ok(rosh.groups.tosafot.some((row) => Math.abs(row.baseline - 742) < 1 && row.right > 295));
  assert.equal(report.pages.length, 92);
  for (const page of report.pages) {
    assert.deepEqual(page.view, [0, 198.425, 643.575, 1191]);
    const slug = page.name.startsWith("horayos-") ? "horayos" : "rosh-hashanah";
    const frame = report.frames[slug];
    for (const row of Object.values(page.groups).flat()) {
      assert.ok(row.left > frame.left && row.right < frame.right);
      assert.ok(row.baseline - row.pitch / 2 > frame.bottom && row.baseline + row.pitch / 2 < frame.top);
      assert.ok(row.bottom > frame.bottom);
    }
    for (const firstKind of ["main", "rashi", "tosafot"]) {
      for (const secondKind of ["main", "rashi", "tosafot"]) {
        if (firstKind >= secondKind) continue;
        for (const first of page.groups[firstKind]) for (const second of page.groups[secondKind]) {
          const overlapX = Math.min(first.right, second.right) - Math.max(first.left, second.left);
          const overlapY = Math.min(first.baseline + first.pitch / 2, second.baseline + second.pitch / 2) - Math.max(first.baseline - first.pitch / 2, second.baseline - second.pitch / 2);
          assert.ok(overlapX <= 0 || overlapY <= 0, `${page.name}: ${firstKind} and ${secondKind} overlap`);
        }
      }
    }
  }
  assert.ok(report.frames["rosh-hashanah"].top < 1140);
  assert.ok(report.frames["rosh-hashanah"].top > 1138);
});

const nedarimRashiText = "פירוש מיוחס לרשי אומר דבר חדש על הנדר הזה ומבאר את לשון המשנה היטב בכל מקום";
const nedarimRanText = "הרן כותב שיטה אחרת לגמרי בענין כינויי נדרים וחולק על הפירוש הראשון בטעמים רבים";
const nedarimMainText = "כל כנויי נדרים כנדרים וחרמים כחרמים ושבועות כשבועות ונזירות כנזירות האומר לחבירו";
const nedarimTosafotText = "תוספות מקשים קושיא גדולה על זה ומתרצים בדרך אחרת שאינה כתובה בשום מקום אחר";
const nedarimWikiPage = (overrides = {}) => ({ title: "נדרים ב א", revisions: [{ revid: 77, slots: { main: { content: [
  "{{כותרת לעמוד בגמרא|מפרש1=מיוחס לרש\"י|מפרש2=ר\"ן|מפרש3=תוספות|נדרים|ב|א}}",
  `<קטע התחלה=ג/>${nedarimMainText} {{קטן|{{הפניה לפסוק|במדבר|ל|ג}}}}<קטע סוף=ג/>`,
  `==מיוחס לרש"י==\n${overrides.rashi ?? `'''${nedarimRashiText.slice(0, 9)}'''${nedarimRashiText.slice(9)} {{הפניה-גמ|נדרים|ב|א}}`}`,
  `==ר"ן==\n${overrides.ran ?? `[[קטגוריה:ר"ן]]${nedarimRanText}{{ש}}`}`,
  `==תוספות==\n${nedarimTosafotText}`,
  ...(overrides.extra ? [overrides.extra] : []),
].join("\n") } } }] });
const nedarimReferencesFixture = () => ({ main: normalizeHebrew(nedarimMainText), rashi: normalizeHebrew(nedarimRashiText), ran: normalizeHebrew(nedarimRanText) });
const nedarimSegment = (text, baseline, left, right) => ({ baseline, left, right, items: [item(text, left, baseline, right - left)] });

test("Nedarim references read only main text, attributed Rashi and Ran from one revision", async () => {
  const { nedarimReferences, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const references = nedarimReferences(nedarimWikiPage());
  assert.equal(references.revision, 77);
  assert.equal(references.main, normalizeHebrew(nedarimMainText));
  assert.equal(references.rashi, normalizeHebrew(nedarimRashiText));
  assert.equal(references.ran, normalizeHebrew(nedarimRanText));
  assert.equal(Object.hasOwn(references, "tosafot"), false);
  assert.equal(Object.hasOwn(references.sha256, "tosafot"), false);
  assert.ok(!JSON.stringify(references).includes(normalizeHebrew(nedarimTosafotText).slice(0, 20)));
  assert.equal(nedarimReferences(nedarimWikiPage({ extra: `==ר"ן==\n${nedarimRanText}` })).ran, null);
  assert.equal(nedarimReferences(nedarimWikiPage({ rashi: `${nedarimRashiText}{{תבנית לא מוכרת|א}}` })).rashi, null);
  assert.equal(nedarimReferences(nedarimWikiPage({ ran: "קצר" })).ran, null);
  assert.throws(() => nedarimReferences({ ...nedarimWikiPage(), title: "סוטה ב א" }), /Nedarim Wikisource page/);
  assert.throws(() => nedarimReferences({ title: "נדרים ב א", revisions: [{ slots: { main: { content: "" } } }] }), /revisioned/);
  const adjacent = nedarimAmudReferences({ "2a": nedarimWikiPage(), "2b": { ...nedarimWikiPage(), title: "נדרים ב ב" } }, 0);
  assert.deepEqual(adjacent.adjacent.map((source) => source.title), ["נדרים ב ב"]);
  assert.ok(adjacent.adjacent.every((source) => !Object.hasOwn(source, "tosafot")));
});

test("Nedarim references follow a contradicting gmara container only when its own heading is absent", async () => {
  const { nedarimReferences } = await import("./measure-corpus.mjs");
  const mislabelled = (withRan) => ({ title: "נדרים יא א", revisions: [{ revid: 78, slots: { main: { content: [
    `<קטע התחלה=ג/>${nedarimMainText}<קטע סוף=ג/>`,
    `<div class='gmara_ran'>\n==מיוחס לרש"י==\n${nedarimRanText}`,
    ...(withRan ? [`<div class='gmara_ran'>\n==ר"ן==\n${nedarimRanText}`] : []),
    `<div class='gmara_tosfot'>\n==תוספות==\n${nedarimTosafotText}`,
  ].join("\n") } } }] });
  const references = nedarimReferences(mislabelled(false));
  assert.equal(references.rashi, null);
  assert.equal(references.ran, normalizeHebrew(nedarimRanText));
  assert.deepEqual([nedarimReferences(mislabelled(true)).rashi, nedarimReferences(mislabelled(true)).ran], [null, normalizeHebrew(nedarimRanText)]);
});

test("Nedarim column layout fills textless column rows and overrides only short quotations", async () => {
  const { assignNedarimColumnLayout } = await import("./measure-corpus.mjs");
  const gutter = { left: 293, right: 302 };
  const scores = (rashi = 0, ran = 0) => ({ main: 0, rashi, ran, adjacent: { main: 0, rashi: 0, ran: 0 } });
  const segment = (baseline, left, right, kind, rashi, ran) => ({ baseline, left, right, kind, basis: kind ? "unique-amud-source-text" : undefined, scores: scores(rashi, ran) });
  const main = [{ baseline: 900 }, { baseline: 890 }, { baseline: 880 }, { baseline: 870 }];
  // b-side: inner Rashi is the left column.
  const column = () => [segment(900, 88, 198, "rashi", 60, 0), segment(890, 88, 198, "ran", 0, 19), segment(880, 88, 198, "rashi", 50, 0),
    segment(870, 88, 198, null, 0, 0), segment(900, 383, 507, "ran", 0, 60), segment(890, 383, 507, null, 0, 0), segment(880, 383, 507, "ran", 0, 40)];
  const options = { innerRashi: "left", gutter, pitch: 10.44, main, mainPitch: 11.88 };
  const segments = column();
  assignNedarimColumnLayout(segments, options);
  assert.deepEqual(segments.map((candidate) => [candidate.kind, candidate.basis]), [
    ["rashi", "unique-amud-source-text"], ["rashi", "nedarim-column-layout-over-short-quotation"], ["rashi", "unique-amud-source-text"],
    ["rashi", "nedarim-column-layout"], ["ran", "unique-amud-source-text"], ["ran", "nedarim-column-layout"], ["ran", "unique-amud-source-text"]]);
  const strong = column();
  strong[1].scores.ran = 40;
  assignNedarimColumnLayout(strong, options);
  assert.equal(strong[1].kind, "ran", "strong text evidence is never overridden");
  const contested = column();
  contested[5].scores.rashi = 30;
  assignNedarimColumnLayout(contested, options);
  assert.equal(contested[5].kind, null, "opposite text evidence leaves a row unresolved");
});

test("Nedarim rows split only across the commentary gutter", async () => {
  const { splitNedarimRow } = await import("./measure-corpus.mjs");
  const gutter = { left: 293, right: 302 };
  const row = { baseline: 900, items: [item("ב", 304, 900, 196), item("א", 88, 900, 203.9)] };
  assert.deepEqual(splitNedarimRow(row, gutter).map((segment) => [segment.left, segment.right]), [[88, 291.9], [304, 500]]);
  const justified = { baseline: 900, items: [item("א", 88, 900, 160), item("ב", 280, 900, 227)] };
  assert.deepEqual(splitNedarimRow(justified, gutter).map((segment) => [segment.left, segment.right]), [[88, 507]]);
});

test("Nedarim attribution uses unique source text and contiguous columns, rejecting conflicts", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const references = nedarimReferencesFixture();
  const segments = [
    nedarimSegment(nedarimRanText.slice(0, 30), 900, 88, 198),
    nedarimSegment("טקסט שאינו במקור", 889.6, 88, 198),
    nedarimSegment(nedarimRanText.slice(30, 60), 879.2, 88, 198),
    nedarimSegment(nedarimRashiText.slice(0, 30), 900, 397, 507),
    nedarimSegment("עוד טקסט שאינו במקור", 889.6, 397, 507),
  ];
  attributeNedarimSegments(segments, references, 10.44);
  assert.deepEqual(segments.map((segment) => [segment.kind, segment.basis]), [
    ["ran", "unique-amud-source-text"], ["ran", "contiguous-column-between-same-source-rows"], ["ran", "unique-amud-source-text"],
    ["rashi", "unique-amud-source-text"], [null, null]]);
  const quoted = [nedarimSegment(nedarimMainText.slice(0, 30), 900, 88, 198)];
  attributeNedarimSegments(quoted, references, 10.44);
  assert.equal(quoted[0].kind, null);
  assert.throws(() => attributeNedarimSegments([{ baseline: 900, left: 88, right: 507, items: [
    item(nedarimRashiText.slice(0, 30), 300, 900), item(nedarimRanText.slice(0, 30), 100, 900)] }], references, 10.44), /both attributed Rashi and Ran/);
  const weakAdjacent = [nedarimSegment("אחרים אומרים דבר", 900, 88, 198)];
  attributeNedarimSegments(weakAdjacent, { ...references, adjacent: [{ main: "", rashi: "", ran: normalizeHebrew("אחרים אומרים דבר") }] }, 10.44);
  assert.equal(weakAdjacent[0].kind, null);
  const displaced = "זה פירוש הרן שנדפס בעמוד הסמוך ואינו בעמוד הזה";
  const adjacentReferences = { ...references, adjacent: [{ main: "", rashi: "", ran: normalizeHebrew(displaced) }] };
  const accepted = [nedarimSegment(displaced, 900, 88, 198)];
  attributeNedarimSegments(accepted, adjacentReferences, 10.44);
  assert.deepEqual([accepted[0].kind, accepted[0].basis], ["ran", "unique-adjacent-amud-source-text"]);
  assert.throws(() => attributeNedarimSegments([nedarimSegment(nedarimRashiText.slice(0, 30), 910.4, 88, 198), nedarimSegment(displaced, 900, 88, 198)],
    adjacentReferences, 10.44), /adjacent-amud ran evidence contradicts its column/);
});

test("Nedarim partial source matches require long unambiguous current evidence", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const references = { ...nedarimReferencesFixture(), adjacent: [nedarimReferencesFixture(), nedarimReferencesFixture()] };
  const text = `${nedarimRanText.slice(0, 40)}טעותבגרסה`;
  const segment = nedarimSegment(text, 900, 88, 507);
  attributeNedarimSegments([segment], references, 10.44);
  assert.deepEqual([segment.kind, segment.basis], ["ran", "unique-amud-source-fragment"]);
  const rashi = nedarimSegment(`${nedarimRashiText.slice(0, 40)}טעותבגרסה`, 900, 88, 507);
  attributeNedarimSegments([rashi], references, 10.44);
  assert.deepEqual([rashi.kind, rashi.basis], ["rashi", "unique-amud-source-fragment"]);
  for (const changed of [
    { ...references, adjacent: references.adjacent.slice(0, 1) },
    { ...references, adjacent: [{ ...references.adjacent[0], rashi: null }, references.adjacent[1]] },
    { ...references, adjacent: [{ ...references.adjacent[0], rashi: normalizeHebrew(nedarimRanText.slice(0, 40)) }, references.adjacent[1]] },
    { ...references, main: normalizeHebrew(nedarimRanText.slice(0, 40)) },
    { ...references, rashi: normalizeHebrew(nedarimRanText.slice(0, 40)) },
    { ...references, ran: normalizeHebrew(nedarimRanText.slice(0, 23)) },
    { ...references, ran: normalizeHebrew("טקסט אחר שאינו מופיע בדף הזה") },
  ]) {
    const rejected = nedarimSegment(text, 900, 88, 507);
    attributeNedarimSegments([rejected], changed, 10.44);
    assert.equal(rejected.kind, null);
  }
  const conflicting = nedarimSegment(text, 900, 88, 507);
  conflicting.items.push(item(nedarimRashiText.slice(0, 10), 90, 900));
  attributeNedarimSegments([conflicting], references, 10.44);
  assert.equal(conflicting.kind, null);
});

test("Nedarim short edge rows require an unambiguous ordered source continuation", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const opening = "שנדרו הנאה זה";
  const middle = "מזה מפרש בגמ";
  const anchor = "אי בנדרו אי בהדירו מיירי";
  const source = normalizeHebrew(opening + middle + anchor);
  const reference = { main: normalizeHebrew(opening), rashi: source, ran: normalizeHebrew(opening),
    adjacent: [{ main: "אאא", rashi: "בבב", ran: "גגג" }, { main: "דדד", rashi: "ההה", ran: "ווו" }] };
  const rows = () => [nedarimSegment(opening, 900, 88, 198), nedarimSegment(middle, 889.56, 88, 151), nedarimSegment(anchor, 879.12, 88, 198)];
  const accepted = rows();
  attributeNedarimSegments(accepted, reference, 10.44);
  assert.deepEqual(accepted.map((segment) => segment.kind), ["rashi", "rashi", "rashi"]);
  const terminal = [nedarimSegment(anchor, 900, 88, 198), nedarimSegment(middle, 889.56, 88, 151)];
  attributeNedarimSegments(terminal, { ...reference, rashi: normalizeHebrew(anchor + middle) }, 10.44);
  assert.deepEqual(terminal.map((segment) => segment.kind), ["rashi", "rashi"]);
  const markerRows = rows();
  const marker = item("סימן", 88, 889.56, 6);
  markerRows[1].items.push(marker);
  attributeNedarimSegments(markerRows, reference, 10.44, "nedarim", { ignoredSourceItems: new Set([marker]) });
  assert.deepEqual(markerRows.map((segment) => segment.kind), ["rashi", "rashi", "rashi"]);
  for (const [label, change, sources] of [
    ["large gap", (segments) => { segments[0].baseline += 12; }, reference],
    ["ambiguous nearby columns", (segments) => { segments.push(nedarimSegment("אחר", 889.56, 110, 190)); }, reference],
    ["competing current source", () => {}, { ...reference, ran: source }],
    ["competing adjacent source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: source }, reference.adjacent[1]] }],
    ["missing adjacent source", () => {}, { ...reference, adjacent: reference.adjacent.slice(0, 1) }],
    ["repeated current source", () => {}, { ...reference, rashi: source + source }],
    ["wrong source order", () => {}, { ...reference, rashi: normalizeHebrew(middle + opening + anchor) }],
  ]) {
    const segments = rows();
    change(segments);
    attributeNedarimSegments(segments, sources, 10.44);
    assert.equal(segments[0].kind, null, label);
  }
  const sparse = [nedarimSegment(opening, 900, 88, 198), nedarimSegment(middle, 889.56, 88, 151)];
  attributeNedarimSegments(sparse, reference, 10.44);
  assert.ok(sparse.every((segment) => segment.kind === null));
  const sparseTerminal = [nedarimSegment(anchor, 900, 88, 198), nedarimSegment("קצר", 889.56, 88, 110)];
  attributeNedarimSegments(sparseTerminal, { ...reference, rashi: normalizeHebrew(anchor + "קצר") }, 10.44);
  assert.equal(sparseTerminal[1].kind, null);
});

test("Nedarim top quotes require their full text and a long unique anchored continuation", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const opening = "אמר רבא היתה לפניו ככר של הפקר ואמר ככר זו הקדש נטלה";
  const quote = "לאכלה מעל לפי כולה";
  const printed = "האי דנקיט לה בככר של הפקר ולא נקט לה";
  const sourceTail = "האי דנקיט לה בככר של הפקר ולא נקט ליה";
  const source = normalizeHebrew(opening + quote + sourceTail);
  const reference = { main: normalizeHebrew(opening), rashi: "אבגדהוזחטיכלמנסעפצקרשת", ran: source,
    adjacent: [{ main: "אאא", rashi: "בבב", ran: "גגג" }, { main: "דדד", rashi: "ההה", ran: "ווו" }] };
  const rows = () => [nedarimSegment(opening, 900, 88, 198), { baseline: 889.56, left: 88, right: 198,
    items: [item(quote, 140, 889.56, 58), item(printed, 88, 889.56, 52)] }];
  const accepted = rows();
  attributeNedarimSegments(accepted, reference, 10.44);
  assert.deepEqual(accepted.map((segment) => segment.kind), ["ran", "ran"]);
  assert.equal(accepted[0].basis, "unique-ordered-source-continuation");
  for (const [label, change, sources] of [
    ["unmatched opening", (segments) => { segments[0].items[0].str += "תוספת"; }, reference],
    ["large gap", (segments) => { segments[0].baseline += 12; }, reference],
    ["ambiguous column", (segments) => { segments.push(nedarimSegment("אחר", 889.56, 110, 190)); }, reference],
    ["competing current source", () => {}, { ...reference, rashi: source }],
    ["competing adjacent source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: source }, reference.adjacent[1]] }],
    ["missing adjacent source", () => {}, { ...reference, adjacent: reference.adjacent.slice(0, 1) }],
    ["repeated source", () => {}, { ...reference, ran: source + source }],
    ["short anchored prefix", () => {}, { ...reference, ran: normalizeHebrew(opening + quote + "שינוי אחר לגמרי") }],
  ]) {
    const segments = rows();
    change(segments);
    attributeNedarimSegments(segments, sources, 10.44);
    assert.equal(segments[0].kind, null, label);
  }
});

test("Nedarim terminal rows require a unique whole-row continuation with one extra source letter", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const anchor = "לחולין אבל אם אמר הרי";
  const terminal = "הנטיעות האלו קרבן עד שיקצצו";
  const source = normalizeHebrew(anchor + terminal.replace("עד שיקצצו", "עד ישיקצצו"));
  const reference = { main: "אבגדהוזחטיכלמנסעפצקרשת", rashi: source, ran: "קרשתצפעסנמלכיטחזוהדגבא",
    adjacent: [{ main: "אאא", rashi: "בבב", ran: "גגג" }, { main: "דדד", rashi: "ההה", ran: "ווו" }] };
  const rows = () => [nedarimSegment(anchor, 900, 88, 198), nedarimSegment(terminal, 889.56, 88, 198)];
  const accepted = rows();
  attributeNedarimSegments(accepted, reference, 10.44);
  assert.deepEqual(accepted.map((segment) => segment.kind), ["rashi", "rashi"]);
  assert.equal(accepted[1].basis, "unique-amud-source-one-insertion-continuation");
  for (const [label, change, sources] of [
    ["large gap", (segments) => { segments[1].baseline -= 12; }, reference],
    ["ambiguous column", (segments) => { segments.push(nedarimSegment("אחר", 900, 110, 190)); }, reference],
    ["corrupt row", (segments) => { segments[1].items[0].str += "תוספת"; }, reference],
    ["short anchor", (segments) => { segments[0].items[0].str = "אבל אם אמר"; }, reference],
    ["missing adjacent source", () => {}, { ...reference, adjacent: reference.adjacent.slice(0, 1) }],
    ["repeated source", () => {}, { ...reference, rashi: source + source }],
    ["competing exact source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: normalizeHebrew(anchor + terminal) }, reference.adjacent[1]] }],
    ["competing approximate source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: source }, reference.adjacent[1]] }],
    ["two extra letters", () => {}, { ...reference, rashi: source.replace("עדישיקצצו", "עדיישיקצצו") }],
  ]) {
    const segments = rows();
    change(segments);
    attributeNedarimSegments(segments, sources, 10.44);
    assert.equal(segments[1].kind, null, label);
  }
});

test("Nedarim conflicting fragments require a unique full-row source match with one extra source letter", async () => {
  const { attributeNedarimSegments } = await import("./measure-corpus.mjs");
  const heading = "אלא רבי יהודה היא";
  const explanation = "דאית ליה מכלל לאו הן היינו רישא כלומר";
  const anchor = "כבר תנינא בפירקין דלעיל לחולין שאוכל לך";
  const source = normalizeHebrew(heading.replace("יהודה", "יהודיה") + explanation + anchor);
  const reference = { main: "אבגדהוזחטיכלמנסעפצקרשת", rashi: source, ran: normalizeHebrew(heading + "ענין אחר בפירושו"),
    adjacent: [{ main: "אאא", rashi: "בבב", ran: "גגג" }, { main: "דדד", rashi: "ההה", ran: "ווו" }] };
  const rows = () => [{ baseline: 900, left: 88, right: 198,
    items: [item(heading, 145, 900, 53), item(explanation, 88, 900, 57)] }, nedarimSegment(anchor, 889.56, 88, 198)];
  const accepted = rows();
  attributeNedarimSegments(accepted, reference, 10.44);
  assert.deepEqual(accepted.map((segment) => segment.kind), ["rashi", "rashi"]);
  assert.equal(accepted[0].basis, "unique-amud-source-one-insertion-continuation");
  for (const [label, change, sources] of [
    ["large gap", (segments) => { segments[0].baseline += 12; }, reference],
    ["ambiguous column", (segments) => { segments.push(nedarimSegment("אחר", 889.56, 110, 190)); }, reference],
    ["corrupt row", (segments) => { segments[0].items[1].str += "תוספת"; }, reference],
    ["short anchor", (segments) => { segments[1].items[0].str = "כבר תנינא בפירקין"; }, reference],
    ["missing adjacent source", () => {}, { ...reference, adjacent: reference.adjacent.slice(0, 1) }],
    ["repeated source", () => {}, { ...reference, rashi: source + source }],
    ["competing exact source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: normalizeHebrew(heading + explanation + anchor) }, reference.adjacent[1]] }],
    ["competing approximate source", () => {}, { ...reference, adjacent: [{ ...reference.adjacent[0], ran: source }, reference.adjacent[1]] }],
    ["two extra letters", () => {}, { ...reference, rashi: source.replace("יהודיה", "יהודייה") }],
  ]) {
    const segments = rows();
    change(segments);
    try { attributeNedarimSegments(segments, sources, 10.44); } catch (error) {
      assert.match(error.message, /matches both attributed Rashi and Ran/, label);
      continue;
    }
    assert.notEqual(segments[0].kind, "rashi", label);
  }
});

test("Nedarim pinned conflicting headings resolve only through unique source continuation", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const fixtures = [
    { amud: "2a", index: 0, revision: 3006991, pdf: "4f1ce54d185d0fee77ff6d6f3c4dbad7fd9ea5a65ae598a4da4f4d37c2c66ece",
      rashi: "f00749ef7eda2160f9c3e60ddd7ca674a055b9f68f83804a5c99301da184b400", baseline: 1129.6, left: 303 },
    { amud: "14a", index: 24, revision: 2967925, pdf: "ed699008f0554cbadab030e9f0e66a5a9533ee85b8d4820fe477babbdc715758",
      rashi: "ff5ad0b7c58a0a0be742d3f79117ec9eb12c03aaa453db0f76ee68d9ccb781d1", baseline: 1129.6, left: 303 },
    { amud: "78a", index: 152, revision: 2968053, pdf: "02423e079840e9cdad4d27e6a08983af8b00e15a19efbb717e8a42b9edfc3dd9",
      rashi: "6cd3c666dac672705f58d403ed1c3ee797982b6b90e2742e513de73a7bd5326e", baseline: 1066.8, left: 397 },
  ];
  let wikiPages, checkpoint;
  try {
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
    checkpoint = JSON.parse(await readFile(new URL("../results/shas-work/nedarim.json", import.meta.url), "utf8"));
    for (const fixture of fixtures) fixture.bytes = (await getCachedPdf(definition, fixture.amud, { expectedHash: fixture.pdf, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  for (const fixture of fixtures) {
    const references = nedarimAmudReferences(wikiPages, fixture.index);
    assert.deepEqual([references.revision, references.sha256.rashi], [fixture.revision, fixture.rashi]);
    const page = await processNedarimPage(definition, fixture.index, references, fixture.bytes);
    assert.deepEqual(page.groups.main, checkpoint.pages[fixture.amud].page.groups.main);
    assert.ok(page.groups.rashi.some((row) => Math.abs(row.baseline - fixture.baseline) < 0.1 && Math.abs(row.left - fixture.left) < 1 && Math.abs(row.right - 507) < 1));
    assert.ok(page.commentaryAttribution.segments["unique-amud-source-one-insertion-continuation"] > 0);
    assert.ok(page.groups.other.length);
    assert.deepEqual(page.groups.tosafot, []);
    assert.equal(page.commentaryAttribution.tosafot, null);
    checkOverlap(page);
    if (fixture.amud === "2a") {
      const altered = structuredClone(wikiPages["2a"]);
      altered.revisions[0].slots.main.content = altered.revisions[0].slots.main.content.replace("([[במדבר ל]])", "");
      const { nedarimReferences } = await import("./measure-corpus.mjs");
      assert.equal(nedarimReferences(altered).rashi, null);
      await assert.rejects(processNedarimPage(definition, fixture.index, { ...references, adjacent: [] }, fixture.bytes), /matches both attributed Rashi and Ran/);
      await assert.rejects(processNedarimPage(definition, fixture.index, { ...references, adjacent: [{ ...references.adjacent[0], title: "wrong" }] }, fixture.bytes), /matches both attributed Rashi and Ran/);
    }
  }
});

test("Nedarim pinned 76b re-attributes a short shared quotation in the inner column to Rashi", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  let wikiPages, bytes;
  try {
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
    bytes = (await getCachedPdf(definition, "76b", { expectedHash: "bcd524355091e23abc7a0351e97c929051cfb1939992f92758c672facc1b4fca", cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  const references = nedarimAmudReferences(wikiPages, 149);
  assert.deepEqual([references.revision, references.sha256.rashi, references.sha256.ran], [2968049,
    "80a66c53565fc2a037d7d8540cffc63898e41ed6fc425e0c1af0a51ad4854976", "a5e367d2fd1fff9d6b492049aa4548ed13d0d70e601c88885f8b5c9b7926e5b5"]);
  // "מחד בשבא לחד בשבא - דהכי משמע" opens both a Rashi and a Ran comment; only Ran's wording is on Wikisource.
  const page = await processNedarimPage(definition, 149, references, bytes);
  const row = page.groups.rashi.find((candidate) => Math.abs(candidate.baseline - 889.0) < 0.5);
  assert.ok(row && row.right < 213, "inner b-side row stays Rashi");
  assert.equal(page.commentaryAttribution.segments["nedarim-column-layout-over-short-quotation"], 1);
  assert.equal(page.groups.other.some((candidate) => Math.abs(candidate.baseline - 889.0) < 0.5 && candidate.right < 213), false);
});

test("Nedarim cached Ran fragments retain main and exclude marginal material on both sides", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const fixtures = [
    { amud: "7b", index: 11, baseline: 1108.6, revision: 2967908, pdfSha256: "7854edd542ef8a69a24fc49e3a5d446642b96ad83d3b0a53ca3542593363eb06", ranSha256: "2355f67ec4927d279e8d76fd51262d2887602c0fd1661748d1eb52cda2fe5719" },
    { amud: "71a", index: 138, baseline: 658.8, revision: 2968038, pdfSha256: "d565b2cb0a2b65de0b5fe93ede48425fc257761d693030d64812929063f65e69", ranSha256: "86dc9f4236202771ac317585614ce3209ca666284dd206a3804577855c4b7e40" },
  ];
  let wikiPages, checkpoint;
  try {
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
    checkpoint = JSON.parse(await readFile(new URL("../results/shas-work/nedarim.json", import.meta.url), "utf8"));
    for (const fixture of fixtures) fixture.bytes = (await getCachedPdf(definition, fixture.amud, { expectedHash: fixture.pdfSha256, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  for (const fixture of fixtures) {
    const references = nedarimAmudReferences(wikiPages, fixture.index);
    assert.deepEqual([references.revision, references.sha256.ran], [fixture.revision, fixture.ranSha256]);
    const page = await processNedarimPage(definition, fixture.index, references, fixture.bytes);
    assert.deepEqual(page.groups.main, checkpoint.pages[fixture.amud].page.groups.main);
    assert.ok(page.groups.other.some((row) => Math.abs(row.baseline - fixture.baseline) < 0.1 && row.left < 90 && row.right > 505));
    assert.ok(page.commentaryAttribution.segments["unique-amud-source-fragment"] > 0);
    assert.ok(page.groups.rashi.length);
    assert.equal(page.groups.tosafot.length, 0);
    assert.equal(page.commentaryAttribution.tosafot, null);
    checkOverlap(page);
  }
});

test("Nedarim cached source continuations recover top and short terminal rows", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const fixtures = [
    { amud: "28a", index: 52, revision: 3023456, pdf: "977ad9ca9258cb68020b7bcf713519d6ad201272901c8ecc20e635d0d57992ea",
      source: ["rashi", "565820a06f8163256f926f76b3b7004d9b2b477c196eb903276b77e42d581d4e"], basis: "unique-amud-source-one-insertion-continuation", rows: [["rashi", 617.0, 397, 507]] },
    { amud: "34a", index: 64, revision: 2967961, pdf: "63590b99a2f722d6a869f7a20744f2f13516c517fe7a7a0fd7a181accd4bd779",
      source: ["ran", "6b393c75e55b168dca4f92d84107d932d3de591f0e992ca71d1af7399c95762b"], rows: [["other", 1129.6, 88, 292]] },
    { amud: "34b", index: 65, revision: 2967962, pdf: "701ad98b9772cf155d30c6246e2a436da727e7bfc13aeeabc10275277be5a75a",
      source: ["ran", "a641a8bd8cd1d34bc668230ff025a99459dcd69cf6a95a485877fe84e6bb27fc"], rows: [["other", 1129.6, 303, 507]] },
    { amud: "60a", index: 116, revision: 2968016, pdf: "5930b5824e2d2d742ad4d261b2cc25e221ec2ab5147078e4b407e1e9ed299682",
      source: ["rashi", "3bede7faccdbf15e92d8db2e56d949fed147e3df08fc09d9355f0ac5402e7c00"], rows: [["rashi", 1014.5, 431, 473], ["rashi", 983.1, 397, 507]] },
    { amud: "66b", index: 129, revision: 2968029, pdf: "7a9029cca4fd9df47b518398d9c7fab3ade9bece215e72c4e1730308654e13a9",
      source: ["rashi", "54e5a9ac098294c2c16d63af19d6a4b2bb708255f5f1296265ab59a8156ab504"], rows: [["rashi", 658.8, 117, 169], ["rashi", 628.2, 88, 198]] },
  ];
  let wikiPages, checkpoint;
  try {
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
    checkpoint = JSON.parse(await readFile(new URL("../results/shas-work/nedarim.json", import.meta.url), "utf8"));
    for (const fixture of fixtures) fixture.bytes = (await getCachedPdf(definition, fixture.amud, { expectedHash: fixture.pdf, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  for (const fixture of fixtures) {
    const references = nedarimAmudReferences(wikiPages, fixture.index);
    assert.deepEqual([references.revision, references.sha256[fixture.source[0]]], [fixture.revision, fixture.source[1]]);
    const page = await processNedarimPage(definition, fixture.index, references, fixture.bytes);
    assert.deepEqual(page.groups.main, checkpoint.pages[fixture.amud].page.groups.main);
    assert.ok(page.commentaryAttribution.segments[fixture.basis || "unique-ordered-source-continuation"] > 0);
    for (const [kind, baseline, left, right] of fixture.rows) {
      assert.ok(page.groups[kind].some((row) => Math.abs(row.baseline - baseline) < 0.1 && Math.abs(row.left - left) < 1 && Math.abs(row.right - right) < 1), fixture.amud);
    }
    assert.deepEqual(page.groups.tosafot, []);
    assert.equal(page.commentaryAttribution.tosafot, null);
    checkOverlap(page);
  }
});

test("Nedarim inline items attach only to one touching commentary line", async () => {
  const { attachNedarimInlineItems } = await import("./measure-corpus.mjs");
  const gutter = { left: 293, right: 302 };
  const left = { baseline: 900, left: 88, right: 285, items: [], kind: "ran" };
  const right = { baseline: 900, left: 317, right: 507, items: [], kind: "ran" };
  const main = [{ baseline: 800, left: 213, right: 383 }];
  const marker = item("(א)", 305, 900, 6);
  const mainMarker = item("(ב)", 386, 801, 6);
  const isolated = item("הדרן", 120, 600, 40);
  const bridge = item("מתני'", 288, 900, 23);
  const segments = [left, right];
  const result = attachNedarimInlineItems(segments, [marker, mainMarker, isolated, bridge], 10.44, { gutter, main });
  assert.deepEqual(right.items, [marker]);
  assert.deepEqual(result.isolated, [isolated]);
  assert.deepEqual(result.ambiguous, [bridge]);
  result.resolve("nedarim-test");
  assert.deepEqual(segments.map((segment) => [segment.left, segment.right]), [[88, 507]]);
  const mixed = [{ ...left, items: [] }, { ...right, items: [], kind: "rashi" }];
  assert.throws(() => attachNedarimInlineItems(mixed, [bridge], 10.44, { gutter }).resolve("nedarim-test"), /ambiguous Nedarim inline item/);
});

test("Nedarim classifier refuses Tosafot references, incomplete sources and other tractates", async () => {
  const { processNedarimPage } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const references = nedarimReferencesFixture();
  await assert.rejects(processNedarimPage(definition, 5, { ...references, tosafot: "" }, Buffer.alloc(0)), /does not accept Tosafot/);
  await assert.rejects(processNedarimPage(definition, 5, { ...references, adjacent: [{ ...references, tosafot: null }] }, Buffer.alloc(0)), /does not accept Tosafot/);
  await assert.rejects(processNedarimPage(definition, 5, { ...references, rashi: null, ran: null }, Buffer.alloc(0)), /main and attributed Rashi or Ran/);
  await assert.rejects(processNedarimPage(definition, 5, { ...references, main: null }, Buffer.alloc(0)), /main and attributed Rashi or Ran/);
  await assert.rejects(processNedarimPage(shasDefinition({ slug: "sotah" }), 5, references, Buffer.alloc(0)), /Nedarim profile/);
  for (const slug of ["sotah", "nazir", "tamid", "rosh-hashanah"]) assert.equal(Object.hasOwn(shasDefinition({ slug }), "nedarimLayout"), false);
  const { nedarimLayout, ...shared } = definition;
  assert.ok(nedarimLayout);
  assert.deepEqual(shared, { ...shasDefinition({ slug: "nazir" }), slug: "nedarim" });
});

test("Nedarim 4b pinned cache separates main, inner attributed Rashi and outer Ran without Tosafot", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const sha256 = "fa174c9a83c6b287a61efb7fa26a03cbbdf961c3da8b804a507c6a0ad20c88ec";
  const definition = shasDefinition({ slug: "nedarim" });
  let bytes, wikiPages;
  try {
    bytes = (await getCachedPdf(definition, "4b", { expectedHash: sha256, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim 4b fixture unavailable"); return; }
    throw error;
  }
  assert.deepEqual(["4a", "4b", "5a"].map((amud) => wikiPages[amud].revisions[0].revid), [2966341, 2966342, 2967903]);
  const page = await processNedarimPage(definition, 5, nedarimAmudReferences(wikiPages, 5), bytes);
  assert.equal(page.sha256, sha256);
  assert.equal(page.groups.main.length, 26);
  assert.ok(page.groups.main.every((row) => row.left > 212 && row.right < 383));
  assert.equal(page.groups.tosafot.length, 0);
  assert.ok(page.matches.every((match) => match.kind !== "tosafot" && match.scores.tosafot === null));
  assert.deepEqual(page.matches.map((match) => [match.kind, match.source]), [["rashi", "Attributed Rashi"], ["other", "Ran"]]);
  assert.equal(page.commentaryAttribution.tosafot, null);
  assert.equal(page.commentaryAttribution.revision, 2966342);
  const commentary = [...page.groups.rashi, ...page.groups.other];
  assert.ok(commentary.every((row) => row.left >= 84 && row.right <= 511 && row.baseline < 1140), "no margin or header labels");
  const mainTop = Math.max(...page.groups.main.map((row) => row.baseline));
  const mainBottom = Math.min(...page.groups.main.map((row) => row.baseline));
  const beside = (row) => row.baseline <= mainTop && row.baseline >= mainBottom;
  assert.ok(page.groups.rashi.filter(beside).length > 20);
  assert.ok(page.groups.rashi.filter(beside).every((row) => row.right < 213), "inner Rashi on the b-side left");
  assert.ok(page.groups.other.filter(beside).length > 20);
  assert.ok(page.groups.other.filter(beside).every((row) => row.left > 383), "outer Ran on the b-side right");
  const below = page.groups.other.filter((row) => row.baseline < mainBottom - 10);
  assert.ok(below.length >= 15 && below.some((row) => row.left < 90 && row.right > 505), "Ran continues below the main text");
  assert.ok(page.groups.rashi.filter((row) => row.baseline < mainBottom).every((row) => row.right < 293), "Rashi below main stays in its column");
  assert.equal(page.groups.rashi.filter((row) => row.baseline < 745).length, 0, "only Ran after Rashi ends");
  const frame = calculateFrame([page]);
  assert.ok(frame.top < 1140 && frame.top > 1130, `frame top ${frame.top}`);
  assert.ok(Math.abs(frame.left - 87.8) < 0.2 && Math.abs(frame.right - 507.4) < 0.2);
  checkOverlap(page);
  const headerLabels = [{ baseline: 1148.46, left: 128.16, right: 143.88, pitch: 10.44 }, { baseline: 1148.46, left: 447.18, right: 456.9, pitch: 10.44 }];
  const oldRan = page.groups.other.filter(beside).slice(0, 3).map(({ baseline, left, right, pitch }) => ({ baseline, left, right, pitch }));
  const previous = (rashi) => ({ page: { sha256, groups: { main: page.groups.main, rashi, tosafot: [] } } });
  const next = () => ({ page: structuredClone(page) });
  assert.doesNotThrow(() => preserveRetryPage(previous(oldRan), next()), "old Ran rows labelled Rashi are positively reattributed");
  assert.throws(() => preserveRetryPage(previous([...oldRan, ...headerLabels]), next()), /rashi could not be reproduced/);
  assert.throws(() => preserveRetryPage({ ...previous([]), confirmedAbsent: ["rashi"] }, next()), /conflicts with a previously recorded zero/);
});

test("Nedarim pinned a-side keeps Rashi inner and textless inner rows follow the column layout", async (context) => {
  const { processNedarimPage, nedarimAmudReferences } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const load = async (amud, sha256) => (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true,
    fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
  let accepted, rejected, wikiPages;
  try {
    accepted = await load("9a", "a47d22308cd9fe0030bcc9bc02fccb518044283f478f77315ad7d47ebef643d1");
    rejected = await load("11b", "b6b8fc8a3714bc5eab89e6bd7bfe2670931dab5296dce4079dc82be70aad9eaa");
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  assert.deepEqual(["8b", "9a", "9b", "11a", "11b", "12a"].map((amud) => wikiPages[amud].revisions[0].revid), [2967910, 2967911, 2967912, 2967919, 2967920, 2967921]);
  const page = await processNedarimPage(definition, 14, nedarimAmudReferences(wikiPages, 14), accepted);
  const top = Math.max(...page.groups.main.map((row) => row.baseline)), bottom = Math.min(...page.groups.main.map((row) => row.baseline));
  const beside = (row) => row.baseline <= top && row.baseline >= bottom;
  assert.ok(page.groups.rashi.filter(beside).length && page.groups.rashi.filter(beside).every((row) => row.left > 383), "a-side inner Rashi on the right");
  assert.ok(page.groups.other.filter(beside).length && page.groups.other.filter(beside).every((row) => row.right < 213), "a-side outer Ran on the left");
  assert.equal(page.groups.tosafot.length, 0);
  // 11b: Wikisource's attributed Rashi differs from the printed wording, so the inner column has no text evidence.
  const layoutPage = await processNedarimPage(definition, 19, nedarimAmudReferences(wikiPages, 19), rejected);
  const layoutTop = Math.max(...layoutPage.groups.main.map((row) => row.baseline));
  const layoutBottom = Math.min(...layoutPage.groups.main.map((row) => row.baseline));
  const besideLayout = (row) => row.baseline <= layoutTop && row.baseline >= layoutBottom;
  assert.ok(layoutPage.groups.rashi.filter(besideLayout).length > 20 && layoutPage.groups.rashi.filter(besideLayout).every((row) => row.right < 213));
  assert.ok(layoutPage.groups.other.filter(besideLayout).every((row) => row.left > 383));
  assert.ok(layoutPage.commentaryAttribution.segments["nedarim-column-layout"] >= 25);
});

test("Nedarim pinned main alignment accepts only unique, ordered, amud-specific main items", async () => {
  const { alignNedarimMainGlyphs, decodeMainGlyphText } = await import("./measure-corpus.mjs");
  const glyphs = new Map([..."\u05db\u05d9\u05e0\u05d5\u05d3\u05e8\u05dd\u05d7\u05de\u05e9\u05d1\u05e2\u05ea\u05d6\u05d4\u05d0\u05dc\u05da\u05e4\u05e7\u05d2\u05df"]
    .map((letter, index) => [letter, [..."\u00ce\u00c8\u0005\u00c2\u201e\u00af\u00cc\u00c1\u00d3\u02d8\u00b7\u00da\u02d9\u00ca\u2030\u2021\u00cf\u00cd\u00d9\u02dc\u201a\u00d4"][index]]));
  // The font prints נ as a space and lacks some letters (here ס), which decode to "|".
  const encode = (text) => [...text].reverse().map((letter) => letter === " " || letter === "נ" ? " " : glyphs.get(letter) ?? "X").join("");
  const reference = normalizeHebrew("אמר רבי זירא כל האומר נדר בלבו לא אמר כלום ושמואל אמר הרי זה נדר רבה בר בר חנה אמר רבי יוחנן הלכה כסתם משנה");
  const adjacent = [normalizeHebrew("מתני האומר לחבירו קונם שאני אוכל לך"), normalizeHebrew("גמרא אמר רב פפא אם כן מאי")];
  const items = [item(encode("אמר רבי זירא כל האומר"), 400, 900, 100), item(encode("נדר בלבו לא אמר כלום"), 250, 900, 100),
    item(encode("אמר רבי יוחנן הלכה כסתם"), 300, 880, 100), item(encode("אבג"), 200, 880, 20)];
  const known = items.slice(0, 3).reduce((sum, entry) => sum + [...decodeMainGlyphText(entry.str)].filter((letter) => /[\u05d0-\u05ea]/.test(letter)).length, 0);
  assert.deepEqual(alignNedarimMainGlyphs(items, reference, adjacent), { fragments: 3, letters: known });
  assert.match(decodeMainGlyphText(items[2].str), /\|/, "fixture exercises an unmapped glyph");
  assert.match(alignNedarimMainGlyphs(items, reference, [adjacent[0]]).rejected, /incomplete/);
  assert.match(alignNedarimMainGlyphs(items, reference, [adjacent[0], ""]).rejected, /incomplete/);
  assert.match(alignNedarimMainGlyphs(items, `${reference}${reference}`, adjacent).rejected, /2 matches/);
  assert.match(alignNedarimMainGlyphs(items, reference.replace("זירא", "זירה"), adjacent).rejected, /0 matches/);
  assert.match(alignNedarimMainGlyphs(items, reference, [adjacent[0], normalizeHebrew("ונדר בלבו לא אמר כלום")]).rejected, /adjacent/);
  const swapped = [{ ...items[0], transform: [...items[0].transform] }, { ...items[1], transform: [...items[1].transform] }, items[2]];
  [swapped[0].transform[4], swapped[1].transform[4]] = [swapped[1].transform[4], swapped[0].transform[4]];
  assert.match(alignNedarimMainGlyphs(swapped, reference, adjacent).rejected, /out of source order/);
});

test("Nedarim pinned 40b/45b/86b recover main and commentary, and alignment needs every exact pin", async (context) => {
  const { processNedarimPage, nedarimAmudReferences, reviewedNedarimMainAlignments } = await import("./measure-corpus.mjs");
  const definition = shasDefinition({ slug: "nedarim" });
  const pins = Object.fromEntries(["40b", "45b", "86b"].map((amud) => [amud, reviewedNedarimMainAlignments[`nedarim-${amud}`]]));
  const indexOf = (amud) => (Number.parseInt(amud, 10) - 2) * 2 + (amud.endsWith("b") ? 1 : 0);
  let bytes = {}, wikiPages, checkpoint;
  try {
    for (const [amud, pin] of Object.entries(pins)) bytes[amud] = (await getCachedPdf(definition, amud, { expectedHash: pin.pdfSha256, cacheOnly: true,
      fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes;
    wikiPages = JSON.parse(await readFile(new URL("../results/wikisource-cache/nedarim.json", import.meta.url), "utf8"));
    checkpoint = JSON.parse(await readFile(new URL("../results/shas-work/nedarim.json", import.meta.url), "utf8"));
  } catch (error) {
    if (error.message.includes("not available in the local cache") || error.code === "ENOENT") { context.skip("Pinned Nedarim fixtures unavailable"); return; }
    throw error;
  }
  const references = Object.fromEntries(Object.keys(pins).map((amud) => [amud, nedarimAmudReferences(wikiPages, indexOf(amud))]));
  for (const [amud, pin] of Object.entries(pins)) assert.deepEqual([references[amud].revision, references[amud].sha256.main], [pin.revision, pin.mainSha256], `${amud} source pin`);
  for (const [amud, mainRows, basis] of [["40b", 5, undefined], ["86b", 11, "reviewed-pinned-ambiguous-nun-alignment"]]) {
    const page = await processNedarimPage(definition, indexOf(amud), references[amud], bytes[amud]);
    assert.equal(page.mainMatch.basis, basis, `${amud}: 40b passes the standard gate; 86b needs the pinned alignment`);
    if (basis) assert.ok(page.mainMatch.standard.fragments < 2 || page.mainMatch.standard.letters < 30, `${amud} standard gate fails`);
    assert.equal(page.groups.main.length, mainRows);
    assert.ok(page.groups.rashi.length && page.groups.other.length);
    assert.equal(page.groups.tosafot.length, 0);
    checkOverlap(page);
  }
  assert.equal(references["45b"].sha256.rashi, "7e54f490e3ab0cc40af811e1037a3c1f7d42bb3462861696d16e8c939f8ee88f");
  const recovered = await processNedarimPage(definition, indexOf("45b"), references["45b"], bytes["45b"]);
  assert.deepEqual(recovered.groups.main, checkpoint.pages["45b"].page.groups.main);
  assert.deepEqual(Object.fromEntries(Object.entries(recovered.groups).map(([kind, rows]) => [kind, rows.length])), { main: 3, rashi: 7, tosafot: 0, other: 61 });
  assert.equal(recovered.commentaryAttribution.segments["unique-ordered-source-continuation"], 2);
  for (const [baseline, right] of [[1077.7, 198], [1067.3, 151]]) {
    assert.ok(recovered.groups.rashi.some((row) => Math.abs(row.baseline - baseline) < 0.1 && row.left < 89 && Math.abs(row.right - right) < 1));
  }
  assert.ok(recovered.groups.other.some((row) => Math.abs(row.baseline - 501.9) < 0.1 && row.left < 89 && row.right > 505));
  assert.equal(recovered.commentaryAttribution.tosafot, null);
  checkOverlap(recovered);
  const mainOnly = await processNedarimPage(definition, indexOf("45b"), references["45b"], bytes["45b"], { mainOnly: true });
  assert.equal(mainOnly.mainMatch.basis, "reviewed-pinned-ambiguous-nun-alignment");
  assert.ok(mainOnly.groups.main.length > 0);
  assert.deepEqual([mainOnly.groups.rashi, mainOnly.groups.tosafot, mainOnly.groups.other], [[], [], []]);
  const changed = Buffer.concat([bytes["86b"], Buffer.from("\n")]);
  await assert.rejects(processNedarimPage(definition, indexOf("86b"), references["86b"], changed), /insufficient main-text match/, "other PDF bytes");
  await assert.rejects(processNedarimPage(definition, indexOf("86b"), { ...references["86b"], revision: pins["86b"].revision + 1 }, bytes["86b"]), /insufficient main-text match/, "other revision");
  await assert.rejects(processNedarimPage(definition, indexOf("86b"), { ...references["86b"], main: `${references["86b"].main}א` }, bytes["86b"]), /insufficient main-text match/, "other main text");
  await assert.rejects(processNedarimPage(definition, indexOf("45b"), { ...references["45b"], adjacent: references["45b"].adjacent.slice(0, 1) }, bytes["45b"], { mainOnly: true }),
    /insufficient main-text match/, "missing adjacent main");
});

test("Avodah Zarah margin heading exclusion needs the exact glyphs outside the page commentary span", async () => {
  const { findMarginHeadings } = await import("./measure-corpus.mjs");
  const glyphs = "\u00cf\u2021\u000e\u000e\u00c1\u00c2\u000e\u00c8\u00b7\u00af";
  const heading = item(glyphs, 43.7, 900, 35.9), body = [item("a", 87.8, 900, 50), item("b", 400, 900, 107.7)];
  const all = [heading, ...body];
  const [found] = findMarginHeadings("avodah-zarah", all, all);
  assert.equal(found.item, heading);
  assert.deepEqual([found.provenance.itemIndex, found.provenance.label, found.provenance.commentarySpan], [0, "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d7\u05e0\u05e0\u05d0\u05dc", { left: 87.8, right: 507.7 }]);
  const inside = item(glyphs, 90, 900, 35.9);
  assert.deepEqual(findMarginHeadings("avodah-zarah", [inside, ...body], [inside, ...body]), []);
  assert.deepEqual(findMarginHeadings("avodah-zarah", [item(`${glyphs}x`, 43.7, 900, 35.9), ...body], [item(`${glyphs}x`, 43.7, 900, 35.9), ...body]), []);
  assert.deepEqual(findMarginHeadings("sanhedrin", all, all), []);
});

test("Bekhorot, Arakhin and Menachot margin headings require their exact glyphs outside the commentary span", async () => {
  const { findMarginHeadings } = await import("./measure-corpus.mjs");
  for (const [slug, glyphs] of [
    ["bechoros", "\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0014\u00c8\u00b7\u00af"],
    ["arachin", "\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0011\u00c8\u00b7\u00af"],
    ["menachos", "\u00cc\u00c2\u02d8\u00af\u201a \u00c2\u0002\u00c8\u00b7\u00af"],
  ]) {
    const body = [item("a", 96, 900, 50), item("b", 400, 900, 116)];
    const heading = item(glyphs, 534, 1147, 37);
    const all = [heading, ...body];
    assert.equal(findMarginHeadings(slug, all, all)[0].item, heading);
    assert.equal(findMarginHeadings(slug, all, all)[0].provenance.label, "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d2\u05e8\u05e9\u05d5\u05dd");
    const inside = item(glyphs, 470, 1147, 37);
    assert.deepEqual(findMarginHeadings(slug, [inside, ...body], [inside, ...body]), []);
    const changed = item(`${glyphs}x`, 534, 1147, 37);
    assert.deepEqual(findMarginHeadings(slug, [changed, ...body], [changed, ...body]), []);
    assert.deepEqual(findMarginHeadings("temurah", all, all), []);
  }
});

test("cached Bekhorot and Arakhin margin headings retain source and overlap safeguards", async (context) => {
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  for (const [slug, amud, nextAmud, sha256, revision, nextRevision, itemIndex, contentSha256, nextContentSha256] of [
    ["bechoros", "8b", "9a", "08c44f374c9d3947a91b528def41bb1e18b9d1fdc62f828011b06cb80a773612", 1061762, 2834229, 624,
      "f4ae3fa544bbe9242cd62ced0a1b09e6ba17523f0be86067a828e82dc9d92bde", "9100a314bc879ba55c851c3f21beb3557fef7ed59f01cd114babb9ebb035e74d"],
    ["arachin", "8a", "8b", "b5af3c8e485a4bfe212d449223afea06f2c3343be0297f65caf26b98658301af", 1066043, 1066044, 443,
      "30a8cbf2557436eeb50854861abcbcec79f44970ba14229c34a0c09772f0b819", "ab3826f3d3eddb76fed0d6b803c1fd945883a218cbe8538e7cfdc0479b775ca6"],
  ]) await context.test(`${slug} ${amud}`, async (check) => {
    const definition = shasDefinition(tractates.find((tractate) => tractate.slug === slug));
    let bytes, wiki, checkpoint;
    try {
      bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true, fetcher: offline })).bytes;
      wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
      checkpoint = JSON.parse(await readFile(`results/shas-work/${slug}.json`, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || /not available in the local cache|revisions unavailable in local cache/.test(error.message)) return check.skip("Matching local fixtures unavailable; no network fetch permitted");
      throw error;
    }
    assert.equal(wiki[amud].revision, revision);
    assert.equal(wiki[nextAmud].revision, nextRevision);
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki[amud].commentarySources[kind], next: wiki[nextAmud].commentarySources[kind] }]));
    for (const kind of ["rashi", "tosafot"]) {
      assert.equal(commentarySources[kind].current.contentSha256, contentSha256);
      assert.equal(commentarySources[kind].next.contentSha256, nextContentSha256);
    }
    const references = { rashi: commentarySources.rashi.current.text, tosafot: wiki[amud].text, commentarySources,
      ...(slug === "arachin" ? { main: wiki[amud].mainText, nextMain: wiki[nextAmud].mainText } : {}) };
    const page = await processPage(definition, amudIndex(amud) - 4, references, bytes);
    assert.deepEqual(page.excludedMarginHeadings.map((heading) => [heading.itemIndex, heading.label]), [[itemIndex, "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d2\u05e8\u05e9\u05d5\u05dd"]]);
    assert.ok(page.excludedMarginHeadings[0].left > page.excludedMarginHeadings[0].commentarySpan.right);
    await assert.rejects(processPage(definition, amudIndex(amud) - 4, { ...references, rashi: "" }, bytes), /requires non-empty Rashi and Tosafot/);
    await assert.rejects(processPage(definition, amudIndex(amud) - 4, { ...references, tosafot: "" }, bytes), /requires non-empty Rashi and Tosafot/);
    await assert.rejects(processPage(definition, amudIndex(amud) - 4, { ...references, rashi: `${references.rashi}${references.tosafot}` }, bytes), /lacks independent evidence|ambiguous commentary stream/);
    if (slug === "arachin") {
      assert.throws(() => checkOverlap(page), /overlap between main and rashi/);
      return;
    }
    assert.equal(createHash("sha256").update(references.rashi).digest("hex"), "923e0ed5e1e26013659297e7006118daaa2d8f297b1b1486367457a3c5c2ac0f");
    assert.deepEqual([page.groups.main.length, page.groups.rashi.length, page.groups.tosafot.length], [45, 70, 8]);
    checkOverlap(page);
    const previous = checkpoint.pages[amud];
    assert.equal(previous.page.sha256, sha256);
    assert.deepEqual(page.groups.main, previous.page.groups.main);
    verifyOverlapRetrySources(previous, page, wiki[amud], wiki[nextAmud]);
    const evidence = classifyWikisourceTosafot(definition, amud, page, wiki[amud]);
    assert.equal(evidence.decision, "present");
    const categories = classifyMissingCategories(page, references, { useWikisource: true, tosafotEvidence: evidence });
    assert.deepEqual(categories.unknownCategories, []);
    preserveRetryTosafot(previous, page, evidence, categories.unknownCategories, [], "fixture");
    preserveRetryPage(previous, { page, ...categories, confirmedAbsent: [] });
    const before = Object.values(checkpoint.pages).filter((entry) => entry.page).map((entry) => structuredClone(entry.page));
    const after = before.map((saved) => structuredClone(saved.name === page.name ? page : saved));
    const frame = calculateFrame(before, { horizontal: 2, vertical: 2 });
    assert.deepEqual(calculateFrame(after, { horizontal: 2, vertical: 2 }), frame);
    calculateAreas(before, frame);
    calculateAreas(after, frame);
    for (let index = 0; index < before.length; index++) {
      if (before[index].name === page.name) assert.deepEqual(after[index].areas.main, before[index].areas.main);
      else assert.deepEqual(after[index].areas, before[index].areas);
    }
  });
});

test("Avodah Zarah cached pages drop only the margin heading and keep saved main rows", async (context) => {
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  const definition = shasDefinition(tractates.find((tractate) => tractate.slug === "avodah-zarah"));
  const checkpoint = JSON.parse(await readFile("results/shas-work/avodah-zarah.json", "utf8"));
  const load = async (amud, nextAmud, sha256) => {
    const bytes = (await getCachedPdf(definition, amud, { expectedHash: sha256, cacheOnly: true, fetcher: offline })).bytes;
    const wiki = await loadWikisourcePages(definition, { selectedAmudim: [amud, nextAmud].filter(Boolean), cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
    const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki[amud].commentarySources[kind], next: wiki[nextAmud]?.commentarySources[kind] }]));
    const saved = checkpoint.pages[amud];
    const entry = saved.previousClassification || saved;
    assert.equal(entry.page.sha256, sha256);
    const references = { rashi: commentarySources.rashi.current?.text || "", tosafot: wiki[amud].text, commentarySources };
    return { wiki, entry, references, measure: (changed = references) => processPage(definition, amudIndex(amud) - 4, changed, bytes) };
  };
  const counts = (page) => ["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind].length);
  for (const [amud, nextAmud, sha256, itemIndex, expected] of [
    ["35b", "36a", "d9cfb90df85392c8e0e1394acfd27cb9d59e27c271517c0a334e8301dc731ed6", 644, [52, 69, 43, 0]],
    ["38b", "39a", "22187135c0b63b0e2a3018d99f0164df70bfca601159c4936b571f60a04ca1d9", 612, [57, 63, 34, 0]],
  ]) await context.test(amud, async () => {
    const fixture = await load(amud, nextAmud, sha256);
    const page = await fixture.measure();
    assert.deepEqual(counts(page), expected);
    assert.deepEqual(page.excludedMarginHeadings.map((heading) => [heading.itemIndex, heading.label]), [[itemIndex, "\u05e8\u05d1\u05d9\u05e0\u05d5 \u05d7\u05e0\u05e0\u05d0\u05dc"]]);
    assert.ok(page.excludedMarginHeadings[0].right < page.excludedMarginHeadings[0].commentarySpan.left);
    assert.deepEqual(page.matches.map((match) => match.kind), ["rashi", "tosafot"]);
    assert.ok(["rashi", "tosafot"].every((kind) => page.groups[kind].every((row) => row.left >= 86 && row.right <= 509)), "no margin rows");
    assert.deepEqual(page.groups.main, fixture.entry.page.groups.main);
    const previous = structuredClone(fixture.entry);
    verifyOverlapRetrySources(previous, page, fixture.wiki[amud], fixture.wiki[nextAmud]);
    checkOverlap(page);
    const tosafotEvidence = classifyWikisourceTosafot(definition, amud, page, fixture.wiki[amud]);
    assert.equal(tosafotEvidence.decision, "present");
    const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, fixture.references, { useWikisource: true, tosafotEvidence });
    assert.deepEqual(unknownCategories, []);
    preserveRetryTosafot(previous, page, tosafotEvidence, unknownCategories, [], "az-fixture");
    const next = { page, unknownCategories, inferredAbsent, confirmedAbsent: [], tosafotEvidence };
    preserveRetryPage(previous, next);
    assert.equal(next.previousClassification, previous);
    await assert.rejects(fixture.measure({ ...fixture.references, rashi: "" }), /requires non-empty Rashi and Tosafot/);
    await assert.rejects(fixture.measure({ ...fixture.references, tosafot: "" }), /requires non-empty Rashi and Tosafot/);
    await assert.rejects(fixture.measure({ ...fixture.references, rashi: `${fixture.references.rashi} ${fixture.references.tosafot}` }), /lacks independent evidence|ambiguous commentary stream/);
  });
  await context.test("24b with empty Wikisource Rashi stays unresolved", async () => {
    const fixture = await load("24b", "25a", "eac6fc9386fab7b35f16098c9f2ea1da3285fdad340f08f8d3364f9ac45e2050");
    assert.equal(fixture.references.rashi, "");
    await assert.rejects(fixture.measure(), /requires non-empty Rashi and Tosafot/);
    await assert.rejects(fixture.measure({ ...fixture.references, rashi: "\u05d0".repeat(40) }), /lacks independent evidence|ambiguous commentary stream/);
  });
  await context.test("12a without heading is unchanged", async () => {
    const fixture = await load("12a", null, "71ff3300b06355c6128edee55c0b338d987c867f5ac51962639e29ddf99f3fca");
    const page = await fixture.measure();
    assert.equal(page.excludedMarginHeadings, undefined);
    for (const kind of ["main", "rashi", "tosafot"]) assert.deepEqual(page.groups[kind], fixture.entry.page.groups[kind]);
  });
});

test("Sanhedrin 57a pinned short whole Tosafot section measures and fails closed", async () => {
  const offline = () => { throw new Error("Fixture network access forbidden"); };
  const sha256 = "a17288213ae2441346cb2a69ad7c410c24b0491c5b0b7f6e5d970f402541abe0";
  const definition = shasDefinition(tractates.find((tractate) => tractate.slug === "sanhedrin"));
  const saved = JSON.parse(await readFile("results/shas-work/sanhedrin.json", "utf8")).pages["57a"];
  const entry = saved.previousClassification || saved;
  assert.equal(entry.page.sha256, sha256);
  const bytes = (await getCachedPdf(definition, "57a", { expectedHash: sha256, cacheOnly: true, fetcher: offline })).bytes;
  const wiki = await loadWikisourcePages(definition, { selectedAmudim: ["57a", "57b"], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
  assert.deepEqual([wiki["57a"].revision, wiki["57b"].revision], [1181252, 1181254]);
  const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki["57a"].commentarySources[kind], next: wiki["57b"].commentarySources[kind] }]));
  const references = { rashi: commentarySources.rashi.current.text, tosafot: wiki["57a"].text, commentarySources };
  const measure = (changed = references, changedBytes = bytes) => processPage(definition, amudIndex("57a") - 4, changed, changedBytes);
  const page = await measure();
  assert.deepEqual(["main", "rashi", "tosafot", "other"].map((kind) => page.groups[kind].length), [38, 76, 2, 0]);
  assert.deepEqual(page.groups.main, entry.page.groups.main);
  const [section] = page.reviewedCommentarySections;
  assert.deepEqual([section.itemIndices, section.excludedCatchwordItem, section.letters, section.currentSource.revision, section.nextSource.revision],
    [[266, 267, 268, 269, 273, 274, 275, 276, 277], 278, 29, 1181252, 1181254]);
  assert.deepEqual(page.matches.map((match) => match.kind), ["rashi", "tosafot"]);
  const previous = structuredClone(entry);
  verifyOverlapRetrySources(previous, page, wiki["57a"], wiki["57b"]);
  checkOverlap(page);
  const tosafotEvidence = classifyWikisourceTosafot(definition, "57a", page, wiki["57a"]);
  assert.equal(tosafotEvidence.decision, "present");
  const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, references, { useWikisource: true, tosafotEvidence });
  assert.deepEqual(unknownCategories, []);
  preserveRetryTosafot(previous, page, tosafotEvidence, unknownCategories, [], "sanhedrin-fixture");
  const next = { page, unknownCategories, inferredAbsent, confirmedAbsent: [], tosafotEvidence };
  preserveRetryPage(previous, next);
  assert.equal(next.previousClassification, previous);
  const altered = (kind, field, change) => ({ ...references, commentarySources: { ...references.commentarySources, [kind]: { ...references.commentarySources[kind], [field]: change(references.commentarySources[kind][field]) } } });
  for (const [label, changed, changedBytes] of [
    ["PDF fingerprint", references, Buffer.concat([bytes, Buffer.from("\n")])],
    ["Tosafot text", { ...references, tosafot: `${references.tosafot}\u05d0` }],
    ["current Tosafot revision", altered("tosafot", "current", (source) => ({ ...source, revision: 1181251 }))],
    ["next Tosafot content", altered("tosafot", "next", (source) => ({ ...source, contentSha256: "0".repeat(64) }))],
    ["missing next Tosafot", altered("tosafot", "next", () => undefined)],
    ["Rashi contains section", { ...references, rashi: `${references.rashi} ${references.tosafot}` }],
    ["empty Rashi", { ...references, rashi: "" }],
  ]) await assert.rejects(measure(changed, changedBytes), /ambiguous commentary stream|short Tosafot section differs/, label);
});

test("Gittin 76b pinned Sefaria Tosafot reproduces historical boxes and fails closed", async () => {
  const tractate = tractates.find((entry) => entry.slug === "gittin");
  const definition = shasDefinition(tractate);
  const index = amudIndex("76b") - 4;
  const offline = () => { throw new Error("PDF and Wikisource fixture network access forbidden"); };
  const checkpoint = JSON.parse(await readFile("results/shas-work/gittin.json", "utf8"));
  const saved = checkpoint.pages["76b"];
  const previous = saved.page?.reviewedGittin76b ? saved.previousClassification : saved;
  const bytes = (await getCachedPdf(tractate, "76b", { expectedHash: "ecabe93ef0a62c88fc211c182e4d30c92086b96e6c19eb92321da0f1512c6c3c", cacheOnly: true, fetcher: offline })).bytes;
  const wiki = await loadWikisourcePages(tractate, { selectedAmudim: ["76b", "77a"], cacheDirectory: "results/wikisource-cache", cacheOnly: true, fetcher: offline });
  const texts = await loadTexts(tractate);
  const commentarySources = Object.fromEntries(["rashi", "tosafot"].map((kind) => [kind, { current: wiki["76b"].commentarySources[kind], next: wiki["77a"].commentarySources[kind] }]));
  const references = { rashi: texts.rashi[index + 2], tosafot: wiki["76b"].text, sefariaTosafot: texts.tosafot[index + 2], commentarySources };
  const measure = (changed = references, changedBytes = bytes) => processPage(definition, index, changed, changedBytes);
  assert.deepEqual([wiki["76b"].revision, wiki["76b"].status, references.tosafot, commentarySources.tosafot.current], [1179049, "unknown", "", undefined]);
  assert.equal(createHash("sha256").update(references.sefariaTosafot).digest("hex"), "9e1419549c78d8186b6805f7c86d9f271e4152524bf8ced3858269d93c4069e0");
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const pdf = await task.promise;
    const items = (await (await pdf.getPage(1)).getTextContent()).items.filter((item) => item.str?.trim() && item.width > 0 && item.height > 0);
    const printed = groupRows(items.slice(139, 192).filter((item) => [11.16, 11.4].some((size) => Math.abs(item.height - size) < 0.02)))
      .map((row) => normalizeHebrew(row.items.sort((first, second) => second.transform[4] - first.transform[4]).map((item) => decodePdfText(item.str)).join(" ")));
    for (const text of ["מייתי ראיה מדקאמר ולגט ישן אין", "להוכיח מכאן דאין הלכה כרבי יוסי", "יוחנן קאמר הכא לא הודו לו כל סיעתו"]) {
      const normalized = normalizeHebrew(text);
      assert.ok(printed.includes(normalized) && references.sefariaTosafot.includes(normalized));
    }
  } finally { await task.destroy(); }
  await assert.rejects(measure({ ...references, sefariaTosafot: undefined }), /ambiguous commentary stream/);
  const page = await measure();
  assert.deepEqual([page.groups.main.length, page.groups.rashi.length, page.groups.tosafot.length, page.groups.other.length], [44, 65, 21, 0]);
  for (const kind of ["main", "rashi", "tosafot"]) assert.deepEqual(page.groups[kind], previous.page.groups[kind]);
  assert.deepEqual(page.matches.map(({ kind, scores }) => ({ kind, scores })), [
    { kind: "rashi", scores: { rashi: 3938, tosafot: 16, other: 0 } },
    { kind: "tosafot", scores: { rashi: 0, tosafot: 827, other: 0 } },
  ]);
  assert.equal(page.reviewedGittin76b.geometrySha256, "51348d677b8476f77cf0854d84954c530659327f41d84c454ca5acac0af93e8a");
  assert.equal(page.reviewedGittin76b.wikisource.tosafot, "unavailable");
  verifyOverlapRetrySources(previous, page, wiki["76b"], wiki["77a"]);
  checkOverlap(page);
  const wikiEvidence = classifyWikisourceTosafot(tractate, "76b", page, wiki["76b"]);
  assert.equal(wikiEvidence.decision, "unknown");
  const tosafotEvidence = applyReviewedGittin76bEvidence(page, wikiEvidence);
  assert.deepEqual([tosafotEvidence.decision, tosafotEvidence.sourceStatus, tosafotEvidence.basis], ["present", "unknown", "pinned-sefaria-tosafot-and-pdf-with-missing-wikisource-section"]);
  const { inferredAbsent, unknownCategories } = classifyMissingCategories(page, references, { useWikisource: true, tosafotEvidence });
  assert.deepEqual(unknownCategories, []);
  preserveRetryTosafot(previous, page, tosafotEvidence, unknownCategories, [], "gittin-fixture");
  const next = { page, unknownCategories, inferredAbsent, confirmedAbsent: [], tosafotEvidence };
  preserveRetryPage(previous, next);
  assert.equal(next.previousClassification, previous);
  assert.throws(() => preserveRetryPage({ ...previous, confirmedAbsent: ["tosafot"] }, { page }), /conflicts with a previously recorded zero/);
  const pages = Object.values(checkpoint.pages).filter((entry) => entry.page).map((entry) => entry.page);
  const before = calculateFrame(pages, { horizontal: 2, vertical: 2 });
  const after = calculateFrame(pages.map((entry) => entry.name === "gittin-76b" ? page : entry), { horizontal: 2, vertical: 2 });
  assert.deepEqual(after, before);
  const altered = (kind, field, change) => ({ ...references, commentarySources: { ...commentarySources, [kind]: { ...commentarySources[kind], [field]: change(commentarySources[kind][field]) } } });
  for (const [label, changed, changedBytes] of [
    ["PDF fingerprint", references, Buffer.concat([bytes, Buffer.from("\n")])],
    ["Sefaria Tosafot", { ...references, sefariaTosafot: `${references.sefariaTosafot}א` }],
    ["Sefaria Rashi", { ...references, rashi: `${references.rashi}א` }],
    ["unexpected Wikisource Tosafot", { ...references, tosafot: "א" }],
    ["current Rashi revision", altered("rashi", "current", (source) => ({ ...source, revision: 1 }))],
    ["current Rashi text", altered("rashi", "current", (source) => ({ ...source, text: `${source.text}א` }))],
    ["current Tosafot source", altered("tosafot", "current", () => commentarySources.tosafot.next)],
    ["next Rashi content", altered("rashi", "next", (source) => ({ ...source, contentSha256: "0".repeat(64) }))],
    ["missing next Tosafot", altered("tosafot", "next", () => undefined)],
  ]) await assert.rejects(measure(changed, changedBytes), /sources or PDF differ/, label);
  assert.throws(() => applyReviewedGittin76bEvidence(page, { ...wikiEvidence, sourceStatus: "absent" }), /Wikisource evidence differs/);
});