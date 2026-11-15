import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createCanvas } from "@napi-rs/canvas";
import { chromium } from "playwright-core";

const template = await readFile(new URL("./inspect-pdf.html", import.meta.url), "utf8");
const image = `data:image/png;base64,${createCanvas(100, 160).toBuffer("image/png").toString("base64")}`;
const fixture = [
  { name: "first.pdf", fingerprint: "a".repeat(64), width: 100, height: 160, image, groups: { "12.00": [{ x: 10, y: 10, width: 30, height: 12 }] } },
  { name: "second.pdf", fingerprint: "b".repeat(64), width: 100, height: 160, image, groups: {} },
];

test("annotations round-trip and reject mismatched or invalid data", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, acceptDownloads: true });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(template.replace("__REPORT_DATA__", JSON.stringify(fixture)));
      await page.locator("#overlay").scrollIntoViewIfNeeded();
      const bounds = await page.locator("#overlay").boundingBox();
      await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.15);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.25);
      assert.equal(await page.locator("#regions rect").count(), 1);
      await page.mouse.up();
      await page.selectOption("#page-select", "1");
      assert.equal(await page.locator("#groups").textContent(), "No extractable text found.");
      assert.equal(await page.locator("#regions rect").count(), 0);
      await page.selectOption("#page-select", "0");
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#export").click();
      const stream = await (await downloadPromise).createReadStream();
      let text = "";
      for await (const chunk of stream) text += chunk;
      const data = JSON.parse(text);
      assert.equal(data.pages[0].sha256, fixture[0].fingerprint);
      assert.equal(data.pages[0].regions[0].type, "main");
      assert.ok(Math.abs(data.pages[0].regions[0].width - 0.2) < 0.01);
      await page.locator("#undo").click();
      assert.equal(await page.locator("#regions rect").count(), 0);
      await page.locator("#import").setInputFiles({ name: "annotations.json", mimeType: "application/json", buffer: Buffer.from(text) });
      await page.waitForFunction(() => document.querySelector("#import-status").textContent === "Annotations imported.");
      assert.equal(await page.locator("#regions rect").count(), 1);
      data.pages[0].sha256 = "wrong";
      await page.locator("#import").setInputFiles({ name: "wrong-pdf.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(() => document.querySelector("#import-status").textContent.startsWith("Import failed"));
      assert.equal(await page.locator("#regions rect").count(), 1);
      data.pages[0].sha256 = fixture[0].fingerprint;
      data.pages[0].regions[0].width = 2;
      await page.locator("#import").setInputFiles({ name: "invalid-region.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
      await page.waitForFunction(() => document.querySelector("#import-status").textContent.includes("invalid region"));
      assert.equal(await page.locator("#regions rect").count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});