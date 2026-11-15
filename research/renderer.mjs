import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const amud = process.argv[2] ?? "2a";
if (!/^\d+[ab]$/.test(amud)) throw new Error("Expected a Berakhot amud such as 2a");

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const reference = `Berakhot.${amud}`;
const [text, links] = await Promise.all([
  getJson(`https://www.sefaria.org/api/v3/texts/${reference}?version=hebrew%7CWikisource%20Talmud%20Bavli&return_format=text_only`),
  getJson(`https://www.sefaria.org/api/links/${reference}?with_text=1`),
]);
const version = text.versions?.find((item) => item.versionTitle === "Wikisource Talmud Bavli");
if (!version?.text?.length) throw new Error("Requested main-text version is missing");

function commentary(title) {
  const byReference = new Map();
  for (const link of links) {
    if (link.index_title === `${title} on Berakhot` && link.he && !byReference.has(link.ref)) {
      byReference.set(link.ref, link);
    }
  }
  return [...byReference.values()].sort((first, second) => first.commentaryNum - second.commentaryNum);
}

const rashi = commentary("Rashi");
const tosafot = commentary("Tosafot");
if (!rashi.length || !tosafot.length) throw new Error("Missing commentary links; cannot compare three texts");

const fontDirectory = "node_modules/daf-renderer/examples/fonts";
const [vilna, rashiFont] = await Promise.all([
  readFile(`${fontDirectory}/Mekorot-Vilna.ttf`),
  readFile(`${fontDirectory}/Mekorot-Rashi.ttf`),
]);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 1600 } });
  await page.setContent(`<style>
    @font-face { font-family: Vilna; src: url(data:font/ttf;base64,${vilna.toString("base64")}); }
    @font-face { font-family: Rashi; src: url(data:font/ttf;base64,${rashiFont.toString("base64")}); }
    body { margin: 0; } #root { position: relative; }
  </style><div id="root"></div>`);
  await page.addScriptTag({ path: "node_modules/daf-renderer/dist/daf-renderer.umd.js" });
  const result = await page.evaluate(async ({ main, inner, outer, side }) => {
    await Promise.all([document.fonts.load('15px Vilna'), document.fonts.load('10.5px Rashi')]);
    const plainHtml = (items) => {
      const element = document.createElement("div");
      element.innerHTML = items.join(" ");
      const escaped = document.createElement("div");
      escaped.textContent = element.textContent;
      return escaped.innerHTML;
    };
    const renderer = window.dafRenderer("#root");
    renderer.render(plainHtml(main), plainHtml(inner), plainHtml(outer), side);
    const root = renderer.containers.el.getBoundingClientRect();
    const areas = {};
    for (const name of ["main", "inner", "outer"]) {
      const container = renderer.containers[name].text;
      const range = document.createRange();
      range.selectNodeContents(container.firstChild);
      const lineHeight = parseFloat(getComputedStyle(container).lineHeight);
      const rectangles = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
      const area = rectangles.reduce((sum, rect) => sum + rect.width * lineHeight, 0);
      areas[name] = { lines: rectangles.length, lineBoxArea: area, fractionOfSyntheticBody: area / (root.width * root.height) };
    }
    return { width: root.width, height: root.height, areas, spacers: renderer.spacerHeights };
  }, { main: version.text.flat(Infinity), inner: rashi.map((entry) => entry.he), outer: tosafot.map((entry) => entry.he), side: amud.at(-1) });
  console.log(JSON.stringify({
    reference,
    warning: "Synthetic layout, not measured print; Sefaria links may not match the physical amud.",
    sources: {
      main: { title: version.versionTitle, license: version.license },
      rashi: { entries: rashi.length, versions: [...new Set(rashi.map((entry) => `${entry.heVersionTitle} (${entry.heLicense})`))] },
      tosafot: { entries: tosafot.length, versions: [...new Set(tosafot.map((entry) => `${entry.heVersionTitle} (${entry.heLicense})`))] },
    },
    ...result,
  }, null, 2));
} finally {
  await browser.close();
}