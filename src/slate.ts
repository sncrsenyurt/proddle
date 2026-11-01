import { formatCounts } from "./prod.js";
import type { ProdRecord, RunRecord } from "./record.js";

const verdictOrder = ["fine", "limp", "yelp", "growl", "held"] as const;

export function renderSlate(record: RunRecord): string {
  const host = new URL(record.porch).host;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>slate · ${esc(host)}</title>
<style>
${css}
</style>
</head>
<body>
<header>
<p class="kicker">slate</p>
<h1>${linkOrText(record.porch)}</h1>
<p class="when">${esc(record.started)} to ${esc(record.ended)}</p>
<p class="limits">page cap ${record.limits.pageCap}, depth cap ${record.limits.depthCap}, open ${record.limits.openWaitMs} ms, prod ${record.limits.prodWaitMs} ms</p>
<p class="tally">${esc(formatCounts(record.totals))}</p>
${leashLine(record)}
</header>
<section class="walk">
<h2>pages</h2>
${pageList(record)}
<h2>skipped</h2>
${skipList(record)}
</section>
<nav>
<button type="button" data-show="page" aria-pressed="true">by page</button>
<button type="button" data-show="verdict" aria-pressed="false">by verdict</button>
</nav>
<section data-group="page" id="by-page">
${byPage(record)}
</section>
<section data-group="verdict" id="by-verdict" hidden>
${byVerdict(record)}
</section>
<script>
${script}
</script>
</body>
</html>
`;
}

function leashLine(record: RunRecord): string {
  const words = esc(record.leashWords.join(", "));
  const selectors =
    record.leashSelectors.length === 0 ? "" : ` <span>${esc(record.leashSelectors.join(", "))}</span>`;
  return `<p class="leash">leash ${words}${selectors}</p>`;
}

function pageList(record: RunRecord): string {
  if (record.pages.length === 0) return "<p>none</p>";
  const items = record.pages
    .map((page) => `<li>${linkOrText(page.href)} <span class="depth">depth ${page.depth}</span></li>`)
    .join("");
  return `<ol>${items}</ol>`;
}

function skipList(record: RunRecord): string {
  if (record.skipped.length === 0) return "<p>none</p>";
  const items = record.skipped
    .map(
      (page) =>
        `<li>${linkOrText(page.href)} <span class="why">${esc(page.why)}</span> from ${linkOrText(page.from)}</li>`,
    )
    .join("");
  return `<ul class="skipped">${items}</ul>`;
}

function byPage(record: RunRecord): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const page of record.pages) {
    seen.add(page.href);
    chunks.push(pageBlock(page.href, prodsOn(record, page.href), page.depth));
  }
  for (const prod of record.prods) {
    if (seen.has(prod.page)) continue;
    seen.add(prod.page);
    chunks.push(pageBlock(prod.page, prodsOn(record, prod.page), undefined));
  }
  if (chunks.length === 0) return "<p>none</p>";
  return chunks.join("");
}

function byVerdict(record: RunRecord): string {
  return verdictOrder
    .map((name) => {
      const prods = record.prods.filter((prod) => (prod.verdict ?? "held") === name);
      const body = prods.length === 0 ? "<p>none</p>" : prods.map(prodBlock).join("");
      return `<article class="verdict-group"><h2>${name}</h2>${body}</article>`;
    })
    .join("");
}

function pageBlock(href: string, prods: readonly ProdRecord[], depth: number | undefined): string {
  const depthBit = depth === undefined ? "" : ` <span class="depth">depth ${depth}</span>`;
  const body = prods.length === 0 ? "<p>nothing to prod</p>" : prods.map(prodBlock).join("");
  return `<article class="page"><h2>${linkOrText(href)}${depthBit}</h2>${body}</article>`;
}

function prodsOn(record: RunRecord, href: string): ProdRecord[] {
  return record.prods.filter((prod) => prod.page === href);
}

function prodBlock(prod: ProdRecord): string {
  const verdict = prod.verdict ?? "held";
  return `<article class="prod ${verdict}">
<h3><span class="kind">${esc(prod.kind)}</span> ${esc(prod.label)} <code>${esc(prod.selector)}</code> <span class="tag ${verdict}">${verdict}</span></h3>
<dl>
${fact("page", linkOrText(prod.page))}
${fact("at", esc(prod.at))}
${fact("ms", String(prod.ms))}
${fact("leash", prod.held === null ? "no" : esc(prod.held))}
${landFact(prod)}
${fact("scratch", yesNo(prod.scratched))}
${fact("dialog", yesNo(prod.dialog))}
${fact("popup", yesNo(prod.popup))}
${fact("download", yesNo(prod.download))}
${fact("failed", failedList(prod))}
${fact("console", textList(prod.consoleErrors))}
${fact("page error", textList(prod.pageErrors))}
${fact("click", prod.clickError === null ? "no" : esc(prod.clickError))}
${fact("detail", prod.detail === "" ? "no" : esc(prod.detail))}
${shotFact(prod)}
</dl>
</article>`;
}

function landFact(prod: ProdRecord): string {
  if (prod.landed === null) return fact("stayed", prod.held === null ? "unknown" : "not clicked");
  if (prod.stayed) return fact("stayed", linkOrText(prod.landed));
  return fact("bolt", linkOrText(prod.landed));
}

function shotFact(prod: ProdRecord): string {
  if (prod.shot === null) return fact("shot", "no");
  return fact("shot", `<img src="${esc(prod.shot)}" alt="${esc(prod.label)}">`);
}

function failedList(prod: ProdRecord): string {
  if (prod.failed.length === 0) return "none";
  const items = prod.failed.map((hit) => `<li>${hit.status} ${linkOrText(hit.url)}</li>`).join("");
  return `<ul>${items}</ul>`;
}

function textList(lines: readonly string[]): string {
  if (lines.length === 0) return "none";
  if (lines.length === 1) {
    const line = lines[0];
    return line === undefined ? "none" : esc(line);
  }
  return `<ul>${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
}

function fact(name: string, value: string): string {
  return `<dt>${name}</dt><dd>${value}</dd>`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function linkOrText(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    const safe = esc(value);
    return `<a href="${safe}">${safe}</a>`;
  }
  return esc(value);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const css = `:root {
  color-scheme: light dark;
  --ink: #221f1a;
  --muted: #6b645b;
  --paper: #f3f0e8;
  --line: #d8d1c5;
  --fine: #24633d;
  --limp: #6b645b;
  --yelp: #8a4b12;
  --growl: #8f2d2d;
  --held: #3c4d68;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #f4f0e7;
    --muted: #b7b0a4;
    --paper: #171614;
    --line: #3c3832;
    --fine: #8fcea6;
    --limp: #b7b0a4;
    --yelp: #e2b07a;
    --growl: #f0a0a0;
    --held: #b7c6de;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 46rem;
  padding: 2rem 1.2rem 4rem;
  color: var(--ink);
  background: var(--paper);
  font: 15px/1.5 ui-sans-serif, system-ui, sans-serif;
}
h1, h2, h3 { font-weight: 600; line-height: 1.3; }
h1 { font-size: 1.25rem; word-break: break-all; margin: 0.2rem 0 0.6rem; }
h2 { font-size: 1.05rem; margin: 1.4rem 0 0.4rem; }
h3 { font-size: 1rem; margin: 0; }
a { color: inherit; }
.kicker { margin: 0; letter-spacing: 0.08em; color: var(--muted); }
.when, .limits, .tally, .leash { margin: 0.15rem 0; }
nav { display: flex; gap: 0.4rem; margin-top: 1.4rem; }
nav button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--line);
  padding: 0.15rem 0.55rem;
}
nav button[aria-pressed="true"] { border-color: var(--ink); }
article.page, article.verdict-group { border-top: 1px solid var(--line); padding-top: 0.2rem; }
article.prod { padding: 0.75rem 0 0.2rem; }
code { font-family: ui-monospace, monospace; font-size: 0.92em; }
.tag { font-size: 0.75rem; border: 1px solid var(--line); padding: 0 0.3rem; margin-left: 0.3rem; }
.tag.fine { color: var(--fine); }
.tag.limp { color: var(--limp); }
.tag.yelp { color: var(--yelp); }
.tag.growl { color: var(--growl); }
.tag.held { color: var(--held); }
dl {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  gap: 0.1rem 0.7rem;
  margin: 0.35rem 0 0;
}
dt { color: var(--muted); }
dd { margin: 0; word-break: break-word; }
.depth, .why { color: var(--muted); }
ul, ol { margin: 0.2rem 0 0.6rem; padding-left: 1.2rem; }
img { display: block; max-width: 100%; height: auto; margin-top: 0.3rem; border: 1px solid var(--line); }
`;

const script = `const picks = document.querySelectorAll("nav button");
for (const pick of picks) {
  pick.addEventListener("click", () => {
    const name = pick.getAttribute("data-show");
    const groups = document.querySelectorAll("[data-group]");
    for (const group of groups) group.hidden = group.getAttribute("data-group") !== name;
    for (const other of picks) other.setAttribute("aria-pressed", other === pick ? "true" : "false");
  });
}
`;
