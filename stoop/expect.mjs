import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] || "proddle-out";
const code = process.argv[3];

if (code !== "1") {
  process.stderr.write(`proddle should exit 1 on the stoop, got ${code ?? "nothing"}\n`);
  process.exit(1);
}

const records = readdirSync(outDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(outDir, entry.name, "record.json"))
  .filter((path) => existsSync(path));

if (records.length !== 1) {
  process.stderr.write(`wanted one record under ${outDir}, found ${records.length}\n`);
  process.exit(1);
}

const recordPath = records[0];
const slatePath = join(recordPath, "..", "slate.html");
if (!existsSync(slatePath)) {
  process.stderr.write(`no slate next to ${recordPath}\n`);
  process.exit(1);
}

const record = JSON.parse(readFileSync(recordPath, "utf8"));
const problems = [];

const broken = new Map([
  ["Missing shelf", "growl"],
  ["Do nothing", "limp"],
  ["Knock the shelf", "yelp"],
  ["Mutter", "yelp"],
  ["Ask the pantry", "growl"],
]);

const held = new Map([
  ["Delete the note", 'word "delete"'],
  ["Log out", 'word "log out"'],
  ["Buy the mug", 'word "buy"'],
]);

const seen = new Map();
for (const row of record.prods) {
  seen.set(row.label, (seen.get(row.label) ?? 0) + 1);
  const reason = held.get(row.label);
  if (reason !== undefined) {
    if (row.held !== reason) {
      problems.push(`${row.label}: held ${JSON.stringify(row.held)}, wanted ${JSON.stringify(reason)}`);
    }
    if (row.verdict !== null) problems.push(`${row.label}: verdict ${row.verdict}, wanted none`);
    continue;
  }
  const verdict = broken.get(row.label) ?? "fine";
  if (row.held !== null) problems.push(`${row.label}: held (${row.held})`);
  if (row.verdict !== verdict) {
    problems.push(`${row.label}: ${row.verdict ?? "none"} (${row.detail}), wanted ${verdict}`);
  }
}

for (const label of [...broken.keys(), ...held.keys()]) {
  if (seen.get(label) !== 1) problems.push(`${label}: expected one prod, found ${seen.get(label) ?? 0}`);
}

const knock = record.prods.find((row) => row.label === "Knock the shelf");
if (knock && !knock.pageErrors.some((line) => line.includes("the shelf fell"))) {
  problems.push(`Knock the shelf: page error missing (${knock.pageErrors.join(" | ")})`);
}

const mutter = record.prods.find((row) => row.label === "Mutter");
if (mutter && !mutter.consoleErrors.some((line) => line.includes("the hinge squeaks"))) {
  problems.push(`Mutter: console error missing (${mutter.consoleErrors.join(" | ")})`);
}

const pantry = record.prods.find((row) => row.label === "Ask the pantry");
if (pantry && !pantry.failed.some((hit) => hit.status === 500)) {
  problems.push(`Ask the pantry: no 500 (${JSON.stringify(pantry.failed)})`);
}

const missing = record.prods.find((row) => row.label === "Missing shelf");
if (missing && missing.detail !== "404") {
  problems.push(`Missing shelf: detail ${JSON.stringify(missing.detail)}, wanted 404`);
}

const pages = new Set(record.pages.map((page) => page.href));
for (const href of [
  "http://127.0.0.1:8741/",
  "http://127.0.0.1:8741/notes.html",
  "http://127.0.0.1:8741/about.html",
  "http://127.0.0.1:8741/gone",
]) {
  if (!pages.has(href)) problems.push(`page missing ${href}`);
}

const totals = record.totals ?? {};
if ((totals.limp ?? 0) < 1 || (totals.yelp ?? 0) < 2 || (totals.growl ?? 0) < 2 || (totals.held ?? 0) < 3) {
  problems.push(`totals ${JSON.stringify(totals)}`);
}

if (typeof record.porch !== "string" || !record.porch.startsWith("http://127.0.0.1:8741")) {
  problems.push(`porch ${record.porch}`);
}

if (problems.length > 0) {
  for (const line of problems) process.stderr.write(`${line}\n`);
  process.exit(1);
}

process.stdout.write(`${recordPath}\n`);
process.stdout.write(
  `${totals.fine} fine, ${totals.limp} limp, ${totals.yelp} yelp, ${totals.growl} growl, ${totals.held} held\n`,
);
