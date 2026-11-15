import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function fetchWithRetry(fetcher, url, retryDelays) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(60000) });
    } catch (error) {
      if (!(error instanceof TypeError || error.name === "TimeoutError")) throw error;
      if (attempt >= retryDelays.length) throw new Error(`PDF network error: ${error.cause?.message || error.message}`);
    }
    if (response && (response.ok || (response.status !== 429 && response.status < 500) || attempt >= retryDelays.length)) return response;
    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }
}

export async function getCachedPdf(tractate, amud, { expectedHash, cacheDirectory = "results/pdf-cache", corpusDirectory = "results/pdfs", fetcher = fetch, cacheOnly = false, retryDelays = [5000, 30000, 120000] } = {}) {
  if (!/^[a-z0-9-]+$/.test(tractate.slug) || !/^\d+[ab]$/.test(amud)) throw new Error("Invalid PDF page");
  if (expectedHash && !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid PDF fingerprint");
  const name = `${tractate.slug}-${amud}`;
  const cacheFile = join(cacheDirectory, `${name}${expectedHash ? `-${expectedHash}` : ""}.pdf`);
  if (cacheOnly && !expectedHash) {
    let files = [];
    try {
      files = await readdir(cacheDirectory, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const pattern = new RegExp(`^${name}-([a-f0-9]{64})\\.pdf$`);
    const candidates = files.filter((file) => file.isFile() && pattern.test(file.name)).map((file) => ({ file: join(cacheDirectory, file.name), hash: pattern.exec(file.name)[1] }));
    candidates.push({ file: cacheFile }, { file: join(corpusDirectory, `${name}.pdf`) });
    const valid = new Map();
    for (const candidate of candidates) {
      try {
        const bytes = await readFile(candidate.file);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (candidate.hash && hash !== candidate.hash) throw new Error("Local PDF cache fingerprint mismatch");
        if (bytes.subarray(0, 5).toString() === "%PDF-") valid.set(hash, bytes);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (valid.size > 1) throw new Error("Conflicting local PDF cache fingerprints");
    if (valid.size === 1) return { bytes: valid.values().next().value, source: "cache" };
    throw new Error("PDF is not available in the local cache with the expected fingerprint");
  }
  for (const file of [cacheFile, join(cacheDirectory, `${name}.pdf`), join(corpusDirectory, `${name}.pdf`)]) {
    try {
      const bytes = await readFile(file);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (bytes.subarray(0, 5).toString() === "%PDF-" && (!expectedHash || hash === expectedHash)) return { bytes, source: "cache" };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (cacheOnly) throw new Error("PDF is not available in the local cache with the expected fingerprint");
  const match = /^(\d+)([ab])$/.exec(amud);
  const url = new URL("https://www.shas.org/daf-pdf/api/");
  url.search = new URLSearchParams({ masechta: tractate.sourceSlug, daf: match[1], amud: match[2] });
  const response = await fetchWithRetry(fetcher, url, retryDelays);
  if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Response is not a PDF");
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash && hash !== expectedHash) throw new Error("PDF differs from the previously measured file");
  await mkdir(cacheDirectory, { recursive: true });
  const temporary = `${cacheFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, cacheFile);
  return { bytes, source: "download" };
}