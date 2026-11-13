import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculateAreas, calculateFrame, decodePdfText, groupRows, includeStreamFragments, matchMainGlyphs, matchScore, normalizeHebrew, redistributeLeadingFragments, splitRuns } from "./measure-corpus.mjs";
import { applySotahPdfReview, classifySotahTosafot, loadWikisourcePages, parseTosafotSection, sotahWikiTitle, wikisourceTitle } from "./sotah-wikisource.mjs";

const item = (text, x, y, width = 20) => ({ str: text, transform: [0, 0, 0, 0, x, y], width });

test("distinguishes regular Wikisource Tosafot from other commentaries and empty chapter markers", () => {
  assert.deepEqual(parseTosafotSection('==רש"י==\nרש"י\n==ראשונים נוספים==\n===תוספות שאנץ==='), { status: "unknown", text: "" });
  assert.deepEqual(parseTosafotSection('==רש"י==\nרש"י\n==ראשונים נוספים==\n===תוספות שאנץ===', { missingSectionStatus: "absent" }), { status: "absent", text: "" });
  assert.deepEqual(parseTosafotSection('==תוספות==\n<קטע התחלה=ת/> מרים המתינה למשה שעה אחת <קטע סוף=ת/>\n==רש"י=='), { status: "present", text: "מריםהמתינהלמשהשעהאחת" });
  assert.deepEqual(parseTosafotSection("==תוס'==\nמרים המתינה למשה שעה אחת\n==תוס' ר\"י הזקן==\nאחר"), { status: "present", text: "מריםהמתינהלמשהשעהאחת" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n<center>פרק תשיעי - עגלה ערופה</center>\n ( אין תוספות לפרק זה )"), { status: "absent", text: "" });
  assert.deepEqual(parseTosafotSection("==תוספות==\n<קטע התחלה=ת/>"), { status: "unknown", text: "" });
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
  assert.equal(wikisourceTitle({ slug: "kinim" }, "22b"), null);
  assert.throws(() => wikisourceTitle({ slug: "sotah" }, "1a"));
});

test("fetches Wikisource pages afresh and treats missing and redirect pages as unknown", async () => {
  let calls = 0;
  const fetcher = async (_url, options) => {
    calls++;
    assert.equal(options.headers["Cache-Control"], "no-cache");
    return { ok: true, json: async () => ({ query: { pages: [
      { title: "שקלים ב א", revisions: [{ revid: 1, slots: { main: { content: "#הפניה [[ירושלמי]]" } } }] },
      { title: "שקלים ב ב", missing: true },
    ] } }) };
  };
  const tractate = { slug: "shekalim", first: "2a", last: "2b" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const pages = await loadWikisourcePages(tractate, { fetcher });
    assert.equal(pages["2a"].status, "unknown");
    assert.equal(pages["2b"].status, "unknown");
  }
  assert.equal(calls, 2);
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