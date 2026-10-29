#!/usr/bin/env node
import { amble } from "./amble.js";
import { readArgs, WalkComplaint } from "./args.js";
import { openChromium } from "./chromium.js";
import { scentsFrom, type Look, type Scent } from "./sniff.js";
import { YardComplaint } from "./yard.js";

async function main(): Promise<void> {
  let plan;
  try {
    plan = readArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof WalkComplaint || err instanceof YardComplaint) {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const browser = await openChromium(plan.openWaitMs);
  const sniffed = new Map<string, Scent[]>();
  const warned = new Set<string>();

  const remember = (href: string, look: Look): Scent[] => {
    for (const selector of look.badSelectors) {
      if (warned.has(selector)) continue;
      warned.add(selector);
      process.stderr.write(`proddle: leash selector ${JSON.stringify(selector)} is not css.\n`);
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
      writePage(page.href, scents);
    }
  } finally {
    await browser.close();
  }
}

function writePage(href: string, scents: readonly Scent[]): void {
  process.stdout.write(`${href}\n`);
  for (const scent of scents) {
    const held = scent.held === undefined ? "" : ` held: ${scent.held}`;
    process.stdout.write(`  ${scent.kind} ${JSON.stringify(scent.label)} ${scent.selector}${held}\n`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`proddle: ${message}\n`);
  process.exitCode = 1;
});
