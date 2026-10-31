#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { amble } from "./amble.js";
import { readArgs, WalkComplaint } from "./args.js";
import { openChromium } from "./chromium.js";
import { formatProdLine, formatTally, prodExitCode, type ProdRow } from "./prod.js";
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

  const browser = await openChromium(plan.openWaitMs);
  const sniffed = new Map<string, Scent[]>();
  const warned = new Set<string>();
  const prodded: ProdRow[] = [];

  const remember = (href: string, look: Look): Scent[] => {
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
    const pages = await amble({
      porch: plan.porch,
      pageCap: plan.pageCap,
      depthCap: plan.depthCap,
      readLinks: async (href) => {
        const look = await browser.look(href, plan.leashSelectors);
        remember(href, look);
        return look.hrefs;
      },
    });
    for (const page of pages) {
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
      );
      for (const row of rows) prodded.push(row);
      writePage(page.href, rows, stdout);
    }
  } finally {
    await browser.close();
  }

  stdout.write(`\n${formatTally(prodded)}\n`);
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
