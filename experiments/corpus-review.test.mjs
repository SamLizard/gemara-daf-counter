import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { chromium } from "playwright-core";

const template = await readFile(new URL("./corpus-review.html", import.meta.url), "utf8");
const box = { x: 10, y: 10, width: 30, height: 10 };
const regions = (main, rashi, tosafot) => Object.fromEntries(Object.entries({ main, rashi, tosafot }).map(([kind, fraction]) => [kind, { fraction, rows: fraction ? [box] : [] }]));
const fixture = {
  pages: [
    { name: "horayos-10a", width: 100, height: 160, body: box, regions: regions(0.42, 0.25, 0) },
    { name: "rosh-hashanah-31a", width: 100, height: 160, body: box, regions: regions(0.42, 0.39, 0.015) },
  ],
  totals: { horayos: { main: 8.84, rashi: 6.98, tosafot: 0.69 }, "rosh-hashanah": { main: 20.7, rashi: 14.66, tosafot: 17.34 } },
};

test("review switches pages and combines selections on desktop and mobile", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setContent(template.replace("__REPORT_DATA__", JSON.stringify(fixture)));
      assert.equal(await page.locator("#page-total").textContent(), "42.0%");
      assert.equal(await page.locator("#daf-total").textContent(), "4.42 dafim");
      await page.locator("#rashi").check();
      assert.equal(await page.locator("#page-total").textContent(), "67.0%");
      assert.equal(await page.locator("#overlay rect").count(), 3);
      await page.locator("#tractate").selectOption("rosh-hashanah");
      await page.locator("#tosafot").check();
      assert.equal(await page.locator("#page-select").inputValue(), "rosh-hashanah-31a");
      assert.equal(await page.locator("#page-total").textContent(), "82.5%");
      assert.equal(await page.locator("#daf-total").textContent(), "26.35 dafim");
      assert.equal(await page.locator("#overlay rect").count(), 4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});