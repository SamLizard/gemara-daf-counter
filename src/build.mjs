// One-command reproduction: measures every side of the Shas and writes results/shas-metrics.json.
// Interrupted runs resume where they stopped when started again with the same --run-id.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const runIdArg = process.argv.slice(2).find((argument) => argument.startsWith("--run-id="));
const runId = runIdArg?.slice("--run-id=".length) || "build";
const script = fileURLToPath(new URL("./measure-shas.mjs", import.meta.url));
const steps = [
  ["Measure all tractates", ["--wikisource", `--run-id=${runId}`]],
  ["Recheck Tosafot absences on Wikisource", ["--recheck-absences"]],
  ["Recheck Rashi absences on Wikisource", ["--recheck-rashi-absences"]],
  ["Record the Shekalim Yerushalmi absence", ["--confirm-yerushalmi-absence", "shekalim"]],
];
for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n${label} failed (exit ${result.status}). Run the build again to resume.`);
    process.exit(result.status || 1);
  }
}
console.log("\nDone: results/shas-metrics.json. Compare with the published data: npm run compare");
