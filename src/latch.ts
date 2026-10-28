#!/usr/bin/env node
import { amble } from "./amble.js";
import { readArgs, WalkComplaint } from "./args.js";
import { openChromium } from "./chromium.js";
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
  try {
    const pages = await amble({
      porch: plan.porch,
      pageCap: plan.pageCap,
      depthCap: plan.depthCap,
      readLinks: browser.readLinks,
    });
    for (const page of pages) {
      process.stdout.write(`${page.href}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`proddle: ${message}\n`);
  process.exitCode = 1;
});
