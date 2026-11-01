#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { amble, skippedPages, type AmblePage } from "./amble.js";
import { readArgs, WalkComplaint } from "./args.js";
import { openChromium } from "./chromium.js";
import { formatProdLine, formatTally, prodExitCode, type ProdRow } from "./prod.js";
import { buildRecord, makeRunDir, writeRun } from "./record.js";
import { renderSlate } from "./slate.js";
import { scentsFrom, type Look, type Scent } from "./sniff.js";
import { YardComplaint } from "./yard.js";

type Sink = { write(chunk: string): void };

export async function run(
  argv: readonly string[],
  stdout: Sink = process.stdout,
  stderr: Sink = process.stderr,
): Promise<number> {
  let plan;
  try {
    plan = readArgs(argv);
  } catch (err) {
    if (err instanceof WalkComplaint || err instanceof YardComplaint) {
      stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const started = new Date();
  const browser = await openChromium(plan.openWaitMs);
  const runDir = makeRunDir(plan.outDir, plan.porch, started);
  const shotDir = plan.shots ? join(runDir, "shots") : undefined;
  if (shotDir !== undefined) mkdirSync(shotDir);

  const sniffed = new Map<string, Scent[]>();
  const hrefs = new Map<string, string[]>();
  const warned = new Set<string>();
  const prodded: ProdRow[] = [];
  let pages: AmblePage[] = [];
  let failure: unknown;

  const remember = (href: string, look: Look): Scent[] => {
    hrefs.set(href, [...look.hrefs]);
    for (const selector of look.badSelectors) {
      if (warned.has(selector)) continue;
      warned.add(selector);
      stderr.write(`proddle: leash selector ${JSON.stringify(selector)} is not css.\n`);
    }
    const scents = scentsFrom(look.facts, plan.leashWords);
    sniffed.set(href, scents);
    return scents;
  };

  try {
    pages = await amble({
      porch: plan.porch,
      pageCap: plan.pageCap,
      depthCap: plan.depthCap,
      readLinks: async (href) => {
        const look = await browser.look(href, plan.leashSelectors);
        remember(href, look);
        return look.hrefs;
      },
    });
    for (const [index, page] of pages.entries()) {
      const known = sniffed.get(page.href);
      const scents =
        known !== undefined
          ? known
          : remember(page.href, await browser.look(page.href, plan.leashSelectors));
      const rows = await browser.prod(
        page.href,
        scents,
        plan.prodWaitMs,
        plan.leashWords,
        plan.leashSelectors,
        { shotDir, pageIndex: index },
      );
      for (const row of rows) prodded.push(row);
      writePage(page.href, rows, stdout);
    }
  } catch (err) {
    failure = err;
  } finally {
    await browser.close();
  }

  const record = buildRecord({
    porch: plan.porch,
    started,
    ended: new Date(),
    limits: {
      pageCap: plan.pageCap,
      depthCap: plan.depthCap,
      openWaitMs: plan.openWaitMs,
      prodWaitMs: plan.prodWaitMs,
    },
    leashWords: plan.leashWords,
    leashSelectors: plan.leashSelectors,
    pages,
    skipped: skippedPages(pages, hrefs, plan.depthCap),
    prods: prodded,
  });
  const paths = writeRun(runDir, record, renderSlate(record));
  stdout.write(`\n${formatTally(prodded)}\n`);
  stdout.write(`record ${paths.recordPath}\n`);
  stdout.write(`slate ${paths.slatePath}\n`);
  if (failure !== undefined) throw failure;
  return prodExitCode(prodded);
}

function writePage(href: string, rows: readonly ProdRow[], stdout: Sink): void {
  stdout.write(`${href}\n`);
  for (const row of rows) stdout.write(`  ${formatProdLine(row)}\n`);
}

async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`proddle: ${message}\n`);
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
