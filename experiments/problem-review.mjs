import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { frameForPage, loadTexts, processPage, rebuildShekalimFrame } from "./measure-corpus.mjs";
import { getCachedPdf } from "./pdf-cache.mjs";
import { amudIndex, tractates } from "./shas-catalog.mjs";
import { buildShasExport, readShasData } from "./shas-export.mjs";
import { shasDefinition } from "./shas-profiles.mjs";
import { loadWikisourcePages } from "./sotah-wikisource.mjs";

const kinds = ["main", "rashi", "tosafot"];
const directory = dirname(fileURLToPath(import.meta.url));
const results = resolve(directory, "../results");

export function buildProblemIndex(data, entries, { includeMeasured = false } = {}) {
  return data.tractates.flatMap((book) => book.pages.filter((page) => includeMeasured || page.status !== "measured" || page.lastClassificationError).map((page) => ({
    tractate: book.id,
    title: book.title,
    amud: page.amud,
    status: page.status,
    problem: Boolean(page.status !== "measured" || page.lastClassificationError),
    unknownCategories: page.unknownCategories || kinds.filter((kind) => page.fractions?.[kind] == null),
    excludedCategories: page.excludedCategories || [],
    fractions: Object.fromEntries(kinds.map((kind) => [kind, page.fractions?.[kind] ?? null])),
    otherCommentary: page.otherCommentary || null,
    method: page.method || null,
    sourceOnlyZero: (page.tosafotEvidence?.basis?.startsWith("wikisource-") && page.fractions?.tosafot === 0)
      || (page.rashiEvidence?.basis?.startsWith("wikisource-") && page.fractions?.rashi === 0),
    userAttestedZero: ["rashi", "tosafot"].some((kind) => page[`${kind}Evidence`]?.sourceType === "user-attestation" && page.fractions?.[kind] === 0),
    error: entries[book.id]?.[page.amud]?.commentaryRetry?.error || entries[book.id]?.[page.amud]?.overlapRetry?.error || page.lastClassificationError || (page.status !== "measured" ? page.reason : null) || null,
  })));
}

export function intersections(groups) {
  const found = [];
  const allKinds = [...kinds, "other"];
  for (let first = 0; first < allKinds.length; first++) for (let second = first + 1; second < allKinds.length; second++) {
    for (const left of groups[allKinds[first]] || []) for (const right of groups[allKinds[second]] || []) {
      const box = [Math.max(left.left, right.left), Math.max(left.baseline - left.pitch / 2, right.baseline - right.pitch / 2),
        Math.min(left.right, right.right), Math.min(left.baseline + left.pitch / 2, right.baseline + right.pitch / 2)];
      if (box[2] - box[0] > 0.1 && box[3] - box[1] > 0.1) found.push({ box, kinds: [allKinds[first], allKinds[second]] });
    }
  }
  return found;
}

export async function startProblemReview({ port = 0, resultsDirectory = results, writeReport = true, cacheOnly = false, shekalimFramePreview = false } = {}) {
  const template = await readFile(join(directory, "problem-review.html"), "utf8");
  const textsByBook = new Map();
  const scans = new Map();
  let data, entries, pages, html, revision;
  async function refreshIndex() {
    const raw = await readFile(join(resultsDirectory, "shas-metrics.json"), "utf8");
    const nextRevision = createHash("sha256").update(raw).digest("hex");
    if (nextRevision === revision) return;
    const nextData = JSON.parse(raw);
    const nextEntries = await readShasData({ resultsDirectory });
    if (shekalimFramePreview && nextEntries.shekalim) {
      const tractate = tractates.find((book) => book.slug === "shekalim");
      for (const [amud, entry] of Object.entries(nextEntries.shekalim)) {
        if (!entry.page) continue;
        const { bytes } = await getCachedPdf(tractate, amud, { expectedHash: entry.page.sha256, cacheOnly: true,
          cacheDirectory: join(resultsDirectory, "pdf-cache"), corpusDirectory: join(resultsDirectory, "pdfs") });
        entry.page = await rebuildShekalimFrame(entry.page, bytes);
      }
      const preview = buildShasExport([tractate], { shekalim: nextEntries.shekalim }).tractates[0];
      nextData.tractates = nextData.tractates.map((book) => book.id === "shekalim" ? preview : book);
    }
    const nextPages = buildProblemIndex(nextData, nextEntries, { includeMeasured: true });
    const nextHtml = template.replace("__REPORT_DATA__", JSON.stringify(nextPages).replaceAll("<", "\\u003c"));
    if (writeReport && !shekalimFramePreview) await writeFile(join(resultsDirectory, "problem-review.html"), nextHtml);
    data = nextData; entries = nextEntries; pages = nextPages; html = nextHtml; revision = nextRevision;
    scans.clear();
  }
  await refreshIndex();

  async function renderPage(item) {
    const key = `${item.tractate}-${item.amud}`;
    if (scans.has(key)) return scans.get(key);
    const tractate = tractates.find((book) => book.slug === item.tractate);
    const entry = entries[item.tractate]?.[item.amud];
    const book = data.tractates.find((candidate) => candidate.id === item.tractate);
    const expectedHash = entry?.page?.sha256 || entry?.tosafotEvidence?.pdfSha256 || entry?.rashiEvidence?.pdfSha256;
    const { bytes, source } = await getCachedPdf(tractate, item.amud, { expectedHash, cacheOnly: cacheOnly || shekalimFramePreview || item.tractate === "nedarim",
      cacheDirectory: join(resultsDirectory, "pdf-cache"), corpusDirectory: join(resultsDirectory, "pdfs") });
    const hash = createHash("sha256").update(bytes).digest("hex");
    const verified = Boolean(expectedHash && hash === expectedHash);
    let groups = verified ? entry?.page?.groups : null;
    let provisional = false;
    let note = `${source === "cache" ? "PDF loaded from disk cache." : "PDF downloaded and cached."} ${expectedHash ? verified ? "PDF matches the saved fingerprint." : "PDF differs from the saved fingerprint; highlights are disabled." : "No saved PDF fingerprint; highlights are unavailable."}`;
    if (shekalimFramePreview && item.tractate === "shekalim") note += " Shekalim frame and fractions are an in-memory geometry preview; saved measurements are unchanged.";
    if (groups && entry?.commentaryRetry?.state === "error" && entry.commentaryRetry.legacyAudit) {
      groups = { ...groups, rashi: [], tosafot: [] };
      note += " Earlier commentary highlights are hidden because the audit could not confirm them.";
    }
    if (verified && item.tractate !== "nedarim" && item.error?.startsWith("overlap between ") && !cacheOnly && !shekalimFramePreview) {
      try {
        if (!textsByBook.has(tractate.slug)) textsByBook.set(tractate.slug, loadTexts(tractate, { works: tractate.slug === "horayos" ? ["Rashi", "Tosafot"] : ["bava-basra", "pesachim"].includes(tractate.slug) ? ["Rashi", "Rashbam"] : ["Rashi"] }).catch((error) => { textsByBook.delete(tractate.slug); throw error; }));
        const texts = await textsByBook.get(tractate.slug);
        const index = amudIndex(item.amud) - 4;
        let tosafot = texts.tosafot?.[index + 2] || "";
        if (tractate.slug !== "horayos") {
          const cachedOnly = async () => { throw new Error("matching Wikisource text is not cached"); };
          const wiki = (await loadWikisourcePages(tractate, { selectedAmudim: [item.amud], cacheDirectory: join(resultsDirectory, "wikisource-cache"), fetcher: cachedOnly }))[item.amud];
          if (!wiki.revision || wiki.revision !== entry.tosafotEvidence?.revision) throw new Error("Wikisource revision does not match the checkpoint");
          tosafot = wiki.text;
        }
        const candidate = await processPage(shasDefinition(tractate), index, { rashi: texts.rashi[index + 2] || "", tosafot, other: texts.rashbam?.[index + 2] }, bytes);
        groups = candidate.groups;
        provisional = true;
        note += " Dashed colored boxes are reconstructed candidates, not saved measurements; orange outlines show intersections.";
      } catch (error) {
        note += ` Candidate boxes unavailable: ${error.message}. Saved boxes are shown where available.`;
      }
    }
    const task = getDocument({ data: new Uint8Array(bytes) });
    try {
      const document = await task.promise;
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const rectangle = (coordinates) => {
        const [firstX, firstY] = viewport.convertToViewportPoint(coordinates[0], coordinates[1]);
        const [secondX, secondY] = viewport.convertToViewportPoint(coordinates[2], coordinates[3]);
        return { x: Math.min(firstX, secondX), y: Math.min(firstY, secondY), width: Math.abs(secondX - firstX), height: Math.abs(secondY - firstY) };
      };
      const bounds = (row) => [row.left, row.baseline - row.pitch / 2, row.right, row.baseline + row.pitch / 2];
      const body = verified && book.frame && (entry?.page || !book.frame.coordinateSpace) ? frameForPage(book.frame, entry?.page) : null;
      const output = {
        width: viewport.width, height: viewport.height,
        image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`,
        body: body ? rectangle([body.left, body.bottom, body.right, body.top]) : null,
        regions: Object.fromEntries([...kinds, "other"].map((kind) => [kind, { rows: (groups?.[kind] || []).map((row) => rectangle(bounds(row))), provisional }])),
        overlaps: provisional ? intersections(groups).map(({ box, kinds: pair }) => ({ ...rectangle(box), kinds: pair })) : [],
        note,
      };
      if (scans.size >= 8) scans.delete(scans.keys().next().value);
      scans.set(key, output);
      return output;
    } finally {
      await task.destroy();
    }
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    try { await refreshIndex(); }
    catch (error) { response.writeHead(503, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message })); return; }
    if (url.pathname === "/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(html); return; }
    if (url.pathname === "/api/index") {
      if (url.searchParams.get("revision") === revision) response.writeHead(204, { "Cache-Control": "no-store" }).end();
      else response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ revision, pages }));
      return;
    }
    if (url.pathname !== "/api/page") { response.writeHead(404).end(); return; }
    const item = pages.find((page) => page.tractate === url.searchParams.get("tractate") && page.amud === url.searchParams.get("amud"));
    if (!item) { response.writeHead(404).end(); return; }
    try {
      const result = await renderPage(item);
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(result));
    } catch (error) {
      if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolveListen, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolveListen));
  return { server, url: `http://127.0.0.1:${server.address().port}/`, pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const preview = process.env.SHEKALIM_FRAME_PREVIEW === "1";
  const { url, pages } = await startProblemReview({ port: Number(process.env.PORT || 0),
    ...(preview ? { writeReport: false, cacheOnly: true, shekalimFramePreview: true } : {}) });
  console.log(`Review ${pages.filter((page) => page.problem).length} problem pages at ${url}`);
}