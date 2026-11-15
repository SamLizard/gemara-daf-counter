import { readFile } from "node:fs/promises";

const [referencePath = "data/shas-metrics.json", candidatePath = "results/shas-metrics.json"] = process.argv.slice(2);
const reference = JSON.parse(await readFile(referencePath, "utf8"));
const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
const kinds = ["main", "rashi", "tosafot", "other"];
const byId = new Map(candidate.tractates.map((book) => [book.id, book]));
const rows = [];
const sums = { reference: {}, candidate: {} };
for (const book of reference.tractates) {
  const other = byId.get(book.id);
  const row = { tractate: book.id, measured: `${other?.coverage.measured ?? 0}/${book.coverage.expected}`, unknownPages: other?.coverage.pagesWithUnknownCategories ?? "-" };
  for (const kind of kinds) {
    const before = book.totals?.dafim?.[kind];
    const after = other?.totals?.dafim?.[kind];
    if (before == null && after == null) continue;
    sums.reference[kind] = (sums.reference[kind] || 0) + (before || 0);
    sums.candidate[kind] = (sums.candidate[kind] || 0) + (after || 0);
    row[kind] = before ? `${(((after ?? 0) - before) / before * 100).toFixed(2)}%` : `${after ?? "-"}`;
  }
  rows.push(row);
}
console.log("Difference of each total (in dafim) relative to the reference:");
console.table(rows);
console.log("Whole Shas (dafim):");
console.table(Object.fromEntries(Object.keys(sums.reference).map((kind) => [kind, {
  reference: Number(sums.reference[kind].toFixed(2)), candidate: Number(sums.candidate[kind].toFixed(2)),
  difference: `${((sums.candidate[kind] - sums.reference[kind]) / sums.reference[kind] * 100).toFixed(2)}%` }])));
console.log("Coverage:", JSON.stringify({ reference: reference.coverage, candidate: candidate.coverage }));
