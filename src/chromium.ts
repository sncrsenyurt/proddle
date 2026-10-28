import { chromium, type BrowserContext } from "playwright";

export async function openChromium(openWaitMs: number): Promise<{
  readLinks: (href: string) => Promise<string[]>;
  close: () => Promise<void>;
}> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    return {
      readLinks: (href) => readAnchors(context, href, openWaitMs),
      close: () => browser.close(),
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function readAnchors(
  context: BrowserContext,
  href: string,
  openWaitMs: number,
): Promise<string[]> {
  const page = await context.newPage();
  try {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: openWaitMs });
    const found: unknown = await page.evaluate(
      "Array.from(document.querySelectorAll('a[href]'), (el) => el.href)",
    );
    if (!Array.isArray(found)) {
      return [];
    }
    const hrefs: string[] = [];
    for (const item of found) {
      if (typeof item === "string") {
        hrefs.push(item);
      }
    }
    return hrefs;
  } finally {
    await page.close();
  }
}
