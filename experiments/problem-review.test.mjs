import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { buildProblemIndex, intersections } from "./problem-review.mjs";

test("Shekalim cache-only review preview translates its frame and never writes reports or checkpoints", async (context) => {
  const { mkdir, mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { getCachedPdf } = await import("./pdf-cache.mjs");
  const { classifierVersion } = await import("./measure-corpus.mjs");
  const { startProblemReview } = await import("./problem-review.mjs");
  const fixtures = [["2a", "82ef64ca9f7fd05bf9af160f1c91094cfc103b591ff179008ac6184d2c412973"],
    ["2b", "38128e6d46a86fa8081faffa7c6f154b4d46bd1643949cd243c5c198d10d843b"]];
  const cached = [];
  for (const [amud, sha256] of fixtures) {
    try {
      cached.push({ amud, sha256, bytes: (await getCachedPdf({ slug: "shekalim" }, amud, { expectedHash: sha256, cacheOnly: true,
        fetcher: () => { throw new Error("Fixture network access forbidden"); } })).bytes });
    } catch (error) {
      if (error.message.includes("not available in the local cache")) { context.skip(`Pinned PDF fixture unavailable: ${amud}`); return; }
      throw error;
    }
  }
  const directory = await mkdtemp(join(tmpdir(), "shekalim-review-"));
  let server;
  try {
    await mkdir(join(directory, "pdf-cache"));
    await mkdir(join(directory, "shas-work"));
    const pages = {};
    for (const { amud, sha256, bytes } of cached) {
      await writeFile(join(directory, "pdf-cache", `shekalim-${amud}-${sha256}.pdf`), bytes);
      const offset = amud.endsWith("a") ? 85.08 : 0;
      pages[amud] = { classifierVersion, page: { name: `shekalim-${amud}`, sha256, view: [0, 198.425, 643.575, 1191],
        groups: { main: [{ left: 236.64 + offset, right: 401 + offset, baseline: 918, pitch: 9.72 }], rashi: [], tosafot: [] } },
        unknownCategories: ["rashi", "tosafot"], ...(amud === "2b" ? { confirmedAbsent: ["tosafot"] } : {}) };
    }
    const checkpoint = JSON.stringify({ slug: "shekalim", pages });
    const metrics = JSON.stringify({ tractates: [{ id: "shekalim", title: "Shekalim", pages: [] }] });
    await writeFile(join(directory, "shas-work", "shekalim.json"), checkpoint);
    await writeFile(join(directory, "shas-metrics.json"), metrics);
    const review = await startProblemReview({ resultsDirectory: directory, cacheOnly: true, shekalimFramePreview: true });
    server = review.server;
    const payloads = [];
    for (const { amud } of cached) {
      const response = await fetch(`${review.url}api/page?tractate=shekalim&amud=${amud}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.match(payload.note, /in-memory geometry preview/);
      assert.match(payload.note, /matches the saved fingerprint/);
      assert.ok(payload.image.startsWith("data:image/png;base64,"));
      assert.equal(payload.regions.main.rows.length, 1);
      payloads.push(payload);
    }
    assert.ok(Math.abs(payloads[0].body.x - payloads[1].body.x - 85.08 * 1.5) < 1e-8);
    assert.ok(Math.abs(payloads[0].body.width - payloads[1].body.width) < 1e-8);
    assert.equal(payloads[0].body.height, payloads[1].body.height);
    assert.equal(review.pages.find((page) => page.amud === "2a").fractions.tosafot, null);
    assert.equal(review.pages.find((page) => page.amud === "2b").fractions.tosafot, 0);
    assert.equal(await readFile(join(directory, "shas-work", "shekalim.json"), "utf8"), checkpoint);
    assert.equal(await readFile(join(directory, "shas-metrics.json"), "utf8"), metrics);
    await assert.rejects(readFile(join(directory, "problem-review.html")), { code: "ENOENT" });
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});

test("indexes every partial and unresolved page with its latest retry error", () => {
  const books = [{ id: "eruvin", title: "Eruvin", pages: [
    { amud: "2a", status: "measured", fractions: { main: 0.4, rashi: 0.2, tosafot: 0.1 } },
    { amud: "2b", status: "partial", unknownCategories: ["rashi"], lastClassificationError: "overlap between main and rashi", fractions: { main: 0.4, rashi: null, tosafot: 0 } },
    { amud: "3a", status: "unresolved", reason: "PDF unavailable", fractions: null },
    { amud: "3b", status: "pending", fractions: null },
  ] }];
  const entries = { eruvin: { "2b": { overlapRetry: { state: "error", error: "overlap between rashi and tosafot" } } } };
  const result = buildProblemIndex({ tractates: books }, entries);
  assert.deepEqual(result.map((page) => page.amud), ["2b", "3a", "3b"]);
  assert.equal(result[0].error, "overlap between rashi and tosafot");
  assert.deepEqual(result[0].fractions, { main: 0.4, rashi: null, tosafot: 0 });
  assert.deepEqual(result[1].fractions, { main: null, rashi: null, tosafot: null });
  const all = buildProblemIndex({ tractates: books }, entries, { includeMeasured: true });
  assert.deepEqual(all.map((page) => page.amud), ["2a", "2b", "3a", "3b"]);
  assert.equal(all[0].problem, false);
  assert.equal(all[1].problem, true);
});

test("fully classified recovered pages do not remain problems solely due to the recovery reason", () => {
  const books = [{ id: "shekalim", title: "Shekalim", pages: [
    { amud: "2a", status: "measured", reason: "Old recovery reason", fractions: { main: 0.4, rashi: 0, tosafot: 0 } },
    { amud: "2b", status: "partial", reason: "Old recovery reason", fractions: { main: 0.4, rashi: null, tosafot: 0 } },
    { amud: "3a", status: "measured", reason: "Old recovery reason", lastClassificationError: "Current classification error", fractions: { main: 0.4, rashi: 0, tosafot: 0 } },
  ] }];
  const result = buildProblemIndex({ tractates: books }, {});
  assert.deepEqual(result.map((page) => page.amud), ["2b", "3a"]);
  const all = buildProblemIndex({ tractates: books }, {}, { includeMeasured: true });
  assert.equal(all[0].problem, false);
  assert.equal(all[0].error, null);
  assert.equal(all[1].error, "Old recovery reason");
  assert.equal(all[2].error, "Current classification error");
  assert.equal(books[0].pages[0].reason, "Old recovery reason");
});

test("review indexes excluded zeroes separately from absences and preserves unresolved unknowns", () => {
  const books = [{ id: "nedarim", title: "Nedarim", pages: [
    { amud: "2a", status: "measured", excludedCategories: ["tosafot"], unknownCategories: [], fractions: { main: 0.4, rashi: 0.2, tosafot: 0 } },
    { amud: "2b", status: "unresolved", excludedCategories: ["tosafot"], unknownCategories: ["main", "rashi"], fractions: { main: null, rashi: null, tosafot: 0 } },
  ] }];
  const pages = buildProblemIndex({ tractates: books }, {}, { includeMeasured: true });
  assert.equal(pages[0].problem, false);
  assert.equal(pages[1].problem, true);
  assert.deepEqual(pages.map((page) => page.excludedCategories), [["tosafot"], ["tosafot"]]);
  assert.deepEqual(pages[1].unknownCategories, ["main", "rashi"]);
  assert.equal(pages[1].fractions.tosafot, 0);
  assert.ok(pages.every((page) => !page.sourceOnlyZero && !page.userAttestedZero));
});

test("identifies overlaps between any two text categories", () => {
  const row = (left, right, baseline) => ({ left, right, baseline, pitch: 10 });
  const result = intersections({ main: [row(0, 20, 10)], rashi: [row(10, 30, 10)], tosafot: [row(25, 40, 10)] });
  assert.deepEqual(result.map((entry) => entry.kinds), [["main", "rashi"], ["rashi", "tosafot"]]);
});

test("flags source-only Rashi and Tosafot zeroes in the review index", () => {
  const books = [{ id: "example", title: "Example", pages: [
    { amud: "2a", status: "measured", fractions: { rashi: 0 }, rashiEvidence: { basis: "wikisource-empty-regular-rashi-section" } },
    { amud: "2b", status: "measured", fractions: { tosafot: 0 }, tosafotEvidence: { basis: "wikisource-no-populated-tosafot-sections" } },
    { amud: "3a", status: "measured", fractions: { rashi: 0.1 }, rashiEvidence: { basis: "wikisource-empty-regular-rashi-section" } },
  ] }];
  const pages = buildProblemIndex({ tractates: books }, {}, { includeMeasured: true });
  assert.deepEqual(pages.map((page) => Boolean(page.sourceOnlyZero)), [true, true, false]);
});

test("distinguishes user-attested absence from Wikisource-only zeroes, including mixed evidence", () => {
  const books = [{ id: "shekalim", title: "Shekalim", pages: [
    { amud: "2a", status: "measured", fractions: { rashi: 0, tosafot: 0 }, rashiEvidence: { basis: "wikisource-no-regular-rashi-section" } },
    { amud: "2b", status: "measured", fractions: { rashi: 0, tosafot: 0 }, rashiEvidence: { sourceType: "user-attestation" }, tosafotEvidence: { sourceType: "user-attestation" } },
    { amud: "3a", status: "partial", fractions: { rashi: null, tosafot: 0.1 }, rashiEvidence: { sourceType: "user-attestation" }, tosafotEvidence: { sourceType: "user-attestation" } },
    { amud: "3b", status: "measured", fractions: { rashi: 0, tosafot: 0 }, rashiEvidence: { sourceType: "user-attestation" }, tosafotEvidence: { basis: "wikisource-no-populated-tosafot-sections" } },
  ] }];
  const pages = buildProblemIndex({ tractates: books }, {}, { includeMeasured: true });
  assert.deepEqual(pages.map((page) => Boolean(page.sourceOnlyZero)), [true, false, false, true]);
  assert.deepEqual(pages.map((page) => page.userAttestedZero), [false, true, false, true]);
});

test("problem review filters, navigates, and distinguishes unknown from zero", async () => {
  const template = await readFile(new URL("./problem-review.html", import.meta.url), "utf8");
  const pages = [
    { tractate: "eruvin", title: "Eruvin", amud: "2a", status: "measured", problem: false, unknownCategories: [], fractions: { main: 0.4, rashi: 0.2, tosafot: 0.1 }, error: null },
    { tractate: "eruvin", title: "Eruvin", amud: "2b", status: "partial", method: "main-only", unknownCategories: ["rashi"], fractions: { main: 0.4, rashi: null, tosafot: 0 }, error: "overlap between main and rashi", sourceOnlyZero: true, otherCommentary: { sources: ["Rashbam"] } },
    { tractate: "eruvin", title: "Eruvin", amud: "3a", status: "unresolved", unknownCategories: ["main", "rashi", "tosafot"], fractions: { main: null, rashi: null, tosafot: null }, error: "PDF unavailable" },
    { tractate: "nazir", title: "Nazir", amud: "4b", status: "partial", unknownCategories: ["tosafot"], fractions: { main: 0.3, rashi: 0.2, tosafot: null }, error: null },
    { tractate: "shekalim", title: "Shekalim", amud: "2b", status: "measured", problem: false, unknownCategories: [], fractions: { main: 0.3, rashi: 0, tosafot: 0 }, error: null, userAttestedZero: true },
  ];
  const box = { x: 10, y: 10, width: 20, height: 10 };
  const payload = { width: 100, height: 160, image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/JkwAAAAASUVORK5CYII=", body: box,
    regions: Object.fromEntries(["main", "rashi", "tosafot", "other"].map((kind) => [kind, { rows: [box], provisional: true }])),
    overlaps: [{ ...box, kinds: ["main", "rashi"] }], note: "Reconstructed candidates" };
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      let livePages = pages;
      const indexRequests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => { window.setInterval = (callback) => { window.triggerReviewRefresh = callback; return 0; }; });
      await page.route("http://problem.test/**", (route) => route.request().url().includes("/api/page?")
        ? route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) })
        : route.request().url().includes("/api/index")
        ? (indexRequests.push(route.request().url()), route.request().url().includes(`revision=test-revision${livePages === pages ? "" : `-${livePages.length}`}`)
          ? route.fulfill({ status: 204 })
          : route.fulfill({ contentType: "application/json", body: JSON.stringify({ revision: `test-revision${livePages === pages ? "" : `-${livePages.length}`}`, pages: livePages }) }))
        : route.fulfill({ contentType: "text/html", body: template.replace("__REPORT_DATA__", JSON.stringify(pages)) }));
      await page.goto("http://problem.test/");
      await page.locator("#scan-status").getByText("Reconstructed candidates").waitFor();
      assert.equal(await page.locator("#page-count").textContent(), "1 of 3 matching pages");
      assert.equal(await page.locator("#tosafot-value").textContent(), "0.0%");
      assert.match(await page.locator("#source-note").textContent(), /Rashi or Tosafot/);
      assert.equal(await page.locator("#total").textContent(), "Unknown");
      assert.equal(await page.locator("#other-label").textContent(), "Rashbam");
      assert.equal(await page.locator("#other-choice").isVisible(), true);
      assert.equal(await page.locator('#overlay rect[stroke="#d76a00"]').count(), 1);
      await page.locator("#rashi").uncheck();
      assert.equal(await page.locator("#total").textContent(), "40.0%");
      assert.equal(await page.locator('#overlay rect[stroke="#d76a00"]').count(), 0);
      await page.locator("#next").click();
      assert.equal(await page.locator("#page-title").textContent(), "Eruvin 3a");
      await page.locator("#filter").selectOption("overlap");
      assert.equal(await page.locator("#page-count").textContent(), "1 of 1 matching pages");
      assert.equal(await page.locator("#page-title").textContent(), "Eruvin 2b");
      await page.locator("#filter").selectOption("tosafot");
      await page.locator("#tractate").selectOption("nazir");
      assert.equal(await page.locator("#page-title").textContent(), "Nazir 4b");
      assert.equal(await page.locator("#tosafot-value").textContent(), "Unknown");
      await page.locator("#filter").selectOption("all");
      await page.locator("#tractate").selectOption("all");
      await page.locator("#filter").selectOption("all-pages");
      assert.equal(await page.locator("#page-count").textContent(), "4 of 5 matching pages");
      await page.locator("#filter").selectOption("user-zero");
      assert.equal(await page.locator("#page-title").textContent(), "Shekalim 2b");
      assert.equal(await page.locator("#user-note").isVisible(), true);
      assert.match(await page.locator("#user-note").textContent(), /not a Wikisource finding or independent visual verification/);
      assert.equal(await page.locator("#source-note").isVisible(), false);
      await page.locator("#filter").selectOption("source-zero");
      assert.equal(await page.locator("#page-title").textContent(), "Eruvin 2b");
      assert.equal(await page.locator("#source-note").isVisible(), true);
      assert.equal(await page.locator("#user-note").isVisible(), false);
      await page.locator("#filter").selectOption("user-zero");
      livePages = pages.slice(0, 4);
      await page.evaluate(() => window.triggerReviewRefresh());
      assert.equal(await page.locator("#page-count").textContent(), "No matching pages");
      assert.equal(await page.locator("#user-note").isVisible(), false);
      await page.locator("#filter").selectOption("all-pages");
      await page.locator("#page-select").selectOption("eruvin:2a");
      assert.equal(await page.locator("#page-title").textContent(), "Eruvin 2a");
      await page.locator("#filter").selectOption("all");
      livePages = pages.slice(1, 3);
      await page.evaluate(() => window.triggerReviewRefresh());
      assert.match(await page.locator("#page-count").textContent(), /of 2 matching pages/);
      await page.evaluate(() => window.triggerReviewRefresh());
      assert.match(indexRequests.at(-1), /revision=test-revision/);
      assert.match(await page.locator("#page-count").textContent(), /of 2 matching pages/);
      livePages = [{ tractate: "nedarim", title: "Nedarim", amud: "4b", status: "measured", problem: false,
        excludedCategories: ["tosafot"], unknownCategories: [], fractions: { main: 0.4, rashi: 0.2, tosafot: 0 },
        otherCommentary: { sources: ["Ran"], fraction: 0.15 }, error: null }];
      await page.evaluate(() => window.triggerReviewRefresh());
      await page.locator("#filter").selectOption("all-pages");
      await page.locator("#scan-status").getByText("Reconstructed candidates").waitFor();
      assert.equal(await page.locator("#tosafot-value").textContent(), "0.0%");
      assert.equal(await page.locator("#exclusion-note").isVisible(), true);
      assert.match(await page.locator("#exclusion-note").textContent(), /excluded by user choice; 0% does not mean absent or measured/);
      await page.locator("#rashi").check();
      assert.equal(await page.locator("#total").textContent(), "75.0%");
      assert.equal(await page.locator("#other-label").textContent(), "Ran");
      assert.equal(await page.locator("#other-value").textContent(), "15.0%");
      await page.locator("#tosafot").uncheck();
      await page.locator("#rashi").check();
      assert.equal(await page.locator("#total").textContent(), "75.0%");
      await page.locator("#other").uncheck();
      assert.equal(await page.locator("#total").textContent(), "60.0%");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});