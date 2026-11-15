import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getCachedPdf } from "./pdf-cache.mjs";

test("downloads a PDF once and reuses the fingerprint-verified disk cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdf-cache-test-"));
  try {
    const bytes = Buffer.from("%PDF-original");
    const hash = createHash("sha256").update(bytes).digest("hex");
    let requests = 0;
    const options = { cacheDirectory: directory, corpusDirectory: join(directory, "none"), expectedHash: hash, fetcher: async () => { requests++; return new Response(bytes); } };
    const tractate = { slug: "eruvin", sourceSlug: "eruvin" };
    assert.equal((await getCachedPdf(tractate, "13a", options)).source, "download");
    assert.equal((await getCachedPdf(tractate, "13a", options)).source, "cache");
    assert.equal(requests, 1);
    assert.deepEqual(await readFile(join(directory, `eruvin-13a-${hash}.pdf`)), bytes);
    await writeFile(join(directory, `eruvin-13a-${hash}.pdf`), "%PDF-modified");
    options.fetcher = async () => new Response(Buffer.from("%PDF-different"));
    await assert.rejects(getCachedPdf(tractate, "13a", options), /PDF differs/);
    options.fetcher = async () => new Response(bytes);
    assert.equal((await getCachedPdf(tractate, "13a", options)).source, "download");
    assert.equal((await getCachedPdf(tractate, "13a", options)).source, "cache");
    options.cacheOnly = true;
    options.fetcher = async () => { throw new Error("unexpected download"); };
    assert.equal((await getCachedPdf(tractate, "13a", options)).source, "cache");
    await assert.rejects(getCachedPdf(tractate, "14a", options), /not available in the local cache/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cache-only lookup without a fingerprint accepts unique verified content and fails closed on conflicts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pdf-cache-test-"));
  try {
    const bytes = Buffer.from("%PDF-original");
    const other = Buffer.from("%PDF-other");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const otherHash = createHash("sha256").update(other).digest("hex");
    const file = join(directory, `eruvin-13a-${hash}.pdf`);
    const otherFile = join(directory, `eruvin-13a-${otherHash}.pdf`);
    const plainFile = join(directory, "eruvin-13a.pdf");
    const options = { cacheDirectory: directory, corpusDirectory: join(directory, "none"), cacheOnly: true, fetcher: async () => { throw new Error("unexpected download"); } };
    const tractate = { slug: "eruvin", sourceSlug: "eruvin" };
    await writeFile(file, bytes);
    await writeFile(join(directory, `eruvin-14a-${otherHash}.pdf`), other);
    assert.deepEqual(await getCachedPdf(tractate, "13a", options), { bytes, source: "cache" });
    await writeFile(plainFile, bytes);
    assert.deepEqual((await getCachedPdf(tractate, "13a", options)).bytes, bytes);
    await writeFile(otherFile, other);
    await assert.rejects(getCachedPdf(tractate, "13a", options), /Conflicting/);
    await rm(otherFile);
    await writeFile(plainFile, other);
    await assert.rejects(getCachedPdf(tractate, "13a", options), /Conflicting/);
    await rm(plainFile);
    await writeFile(file, other);
    await assert.rejects(getCachedPdf(tractate, "13a", options), /fingerprint mismatch/);
    await assert.rejects(getCachedPdf(tractate, "15a", options), /not available/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});