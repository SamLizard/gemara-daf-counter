import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const tractates = { horayos: 14, "rosh-hashanah": 35 };
const [tractate, first = "2a", last] = process.argv.slice(2);
if (!Object.hasOwn(tractates, tractate)) throw new Error("Choose horayos or rosh-hashanah");
function pageIndex(value) {
  const match = /^(\d+)([ab])$/.exec(value);
  if (!match) throw new Error(`Invalid amud: ${value}`);
  const daf = Number(match[1]);
  const index = (daf - 2) * 2 + (match[2] === "b" ? 1 : 0);
  if (index < 0 || index > (tractates[tractate] - 2) * 2) throw new Error(`Amud outside ${tractate}: ${value}`);
  return index;
}
const start = pageIndex(first);
const end = last ? pageIndex(last) : (tractates[tractate] - 2) * 2;
if (end < start) throw new Error("The last amud must not precede the first");
const directory = join("results", "pdfs");
await mkdir(directory, { recursive: true });
for (let index = start; index <= end; index++) {
  const daf = Math.floor(index / 2) + 2;
  const amud = index % 2 ? "b" : "a";
  const name = `${tractate}-${daf}${amud}`;
  const file = join(directory, `${name}.pdf`);
  try {
    const existing = await readFile(file);
    if (existing.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${file} is not a PDF`);
    console.log(`${name}: already present`);
    continue;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const url = new URL("https://www.shas.org/daf-pdf/api/");
  url.search = new URLSearchParams({ masechta: tractate, daf: String(daf), amud });
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${name}: response is not a PDF`);
  await writeFile(file, bytes, { flag: "wx" });
  console.log(`${name}: ${bytes.length} bytes`);
}