import { chromium, type BrowserContext } from "playwright";
import { sniffSource, takeLook, type Look } from "./sniff.js";

export async function openChromium(openWaitMs: number): Promise<{
  look: (href: string, leashSelectors: readonly string[]) => Promise<Look>;
  close: () => Promise<void>;
}> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    return {
      look: (href, leashSelectors) => lookAt(context, href, openWaitMs, leashSelectors),
      close: () => browser.close(),
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function lookAt(
  context: BrowserContext,
  href: string,
  openWaitMs: number,
  leashSelectors: readonly string[],
): Promise<Look> {
  const page = await context.newPage();
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: openWaitMs });
    const raw: unknown = await page.evaluate(sniffSource(leashSelectors));
    return takeLook(raw);
  } finally {
    await page.close();
  }
}
