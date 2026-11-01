import type { BrowserContext, Page, Request } from "playwright";
import { leashHold, type LeashSurface } from "./leash.js";
import type { Scent } from "./sniff.js";

export type Verdict = "fine" | "limp" | "yelp" | "growl";

export type FailedHit = {
  url: string;
  status: number;
};

export type ProdWatch = {
  opened: boolean;
  navigated: boolean;
  navStatus: number | undefined;
  navFailed: boolean;
  badStatuses: number[];
  failed: FailedHit[];
  requestCount: number;
  consoleErrors: string[];
  pageErrors: string[];
  scratched: boolean;
  clickError: string | undefined;
  sawDialog: boolean;
  sawPopup: boolean;
  sawDownload: boolean;
  landed: string | undefined;
  stayed: boolean;
};

export type ProdRow = {
  page: string;
  kind: Scent["kind"];
  label: string;
  selector: string;
  held: string | undefined;
  verdict: Verdict | undefined;
  detail: string;
  at: string;
  ms: number;
  landed: string | undefined;
  stayed: boolean;
  scratched: boolean;
  dialog: boolean;
  popup: boolean;
  download: boolean;
  failed: FailedHit[];
  consoleErrors: string[];
  pageErrors: string[];
  clickError: string | undefined;
  shot: string | undefined;
};

export type VerdictCounts = {
  fine: number;
  limp: number;
  yelp: number;
  growl: number;
  held: number;
};

type Armed = {
  armed: boolean;
  inflight: number;
  navPending: number;
};

const detailLimit = 140;

export function verdictOf(watch: ProdWatch): Verdict {
  if (!watch.opened || watch.navFailed) return "growl";
  if (watch.navStatus !== undefined && watch.navStatus >= 400) return "growl";
  if (watch.badStatuses.length > 0) return "growl";
  if (watch.clickError !== undefined || watch.consoleErrors.length > 0 || watch.pageErrors.length > 0) {
    return "yelp";
  }
  if (
    watch.navigated ||
    watch.scratched ||
    watch.requestCount > 0 ||
    watch.sawDialog ||
    watch.sawPopup ||
    watch.sawDownload
  ) {
    return "fine";
  }
  return "limp";
}

export function detailOf(watch: ProdWatch, verdict: Verdict): string {
  if (verdict === "growl") {
    if (watch.navStatus !== undefined && watch.navStatus >= 400) return String(watch.navStatus);
    const bad = watch.badStatuses[0];
    if (bad !== undefined) return String(bad);
    if (!watch.opened) return "could not open";
    return "navigation failed";
  }
  if (verdict === "yelp") {
    const message = watch.pageErrors[0] ?? watch.consoleErrors[0] ?? watch.clickError ?? "error";
    return clip(message, detailLimit);
  }
  return "";
}

export function prodExitCode(rows: readonly ProdRow[]): number {
  for (const row of rows) {
    if (row.verdict === "limp" || row.verdict === "yelp" || row.verdict === "growl") return 1;
  }
  return 0;
}

export function formatProdLine(row: ProdRow): string {
  const head = `${row.kind} ${JSON.stringify(row.label)} ${row.selector}`;
  if (row.held !== undefined) return `${head} held: ${row.held}`;
  if (row.verdict === undefined) return head;
  if (row.detail === "") return `${head} ${row.verdict}`;
  return `${head} ${row.verdict}: ${row.detail}`;
}

export function countVerdicts(rows: readonly Pick<ProdRow, "held" | "verdict">[]): VerdictCounts {
  const counts: VerdictCounts = { fine: 0, limp: 0, yelp: 0, growl: 0, held: 0 };
  for (const row of rows) {
    if (row.held !== undefined || row.verdict === undefined) {
      counts.held += 1;
      continue;
    }
    counts[row.verdict] += 1;
  }
  return counts;
}

export function formatCounts(counts: VerdictCounts): string {
  return `${counts.fine} fine, ${counts.limp} limp, ${counts.yelp} yelp, ${counts.growl} growl, ${counts.held} held`;
}

export function formatTally(rows: readonly ProdRow[]): string {
  return formatCounts(countVerdicts(rows));
}

export async function prodPage(
  context: BrowserContext,
  href: string,
  scents: readonly Scent[],
  openWaitMs: number,
  prodWaitMs: number,
  leashWords: readonly string[],
  leashSelectors: readonly string[],
): Promise<ProdRow[]> {
  const rows: ProdRow[] = [];
  for (const scent of scents) {
    if (scent.held !== undefined) {
      rows.push(fillRow(href, scent, scent.held, freshWatch(), new Date().toISOString(), 0));
      continue;
    }
    const at = new Date();
    const started = Date.now();
    const attempt = await watchProd(
      context,
      href,
      scent.selector,
      openWaitMs,
      prodWaitMs,
      leashWords,
      leashSelectors,
    );
    rows.push(fillRow(href, scent, attempt.held, attempt.watch, at.toISOString(), Date.now() - started));
  }
  return rows;
}

function fillRow(
  href: string,
  scent: Scent,
  held: string | undefined,
  watch: ProdWatch,
  at: string,
  ms: number,
): ProdRow {
  const verdict = held === undefined ? verdictOf(watch) : undefined;
  return {
    page: href,
    kind: scent.kind,
    label: scent.label,
    selector: scent.selector,
    held,
    verdict,
    detail: verdict === undefined ? "" : detailOf(watch, verdict),
    at,
    ms,
    landed: watch.landed,
    stayed: watch.stayed,
    scratched: watch.scratched,
    dialog: watch.sawDialog,
    popup: watch.sawPopup,
    download: watch.sawDownload,
    failed: watch.failed.map((hit) => ({ url: hit.url, status: hit.status })),
    consoleErrors: [...watch.consoleErrors],
    pageErrors: [...watch.pageErrors],
    clickError: watch.clickError,
    shot: undefined,
  };
}

async function watchProd(
  context: BrowserContext,
  href: string,
  selector: string,
  openWaitMs: number,
  prodWaitMs: number,
  leashWords: readonly string[],
  leashSelectors: readonly string[],
): Promise<{ held: string | undefined; watch: ProdWatch }> {
  const watch = freshWatch();
  const page = await context.newPage();
  const state = arm(page, watch);
  let beforeUrl = href;
  try {
    try {
      await page.goto(href, { waitUntil: "domcontentloaded", timeout: openWaitMs });
    } catch {
      watch.navFailed = true;
      return { held: undefined, watch };
    }
    watch.opened = true;
    beforeUrl = page.url();

    const budget = clickBudget(prodWaitMs);
    page.setDefaultTimeout(budget);
    const located = await locate(page, selector, watch);
    if (located === "miss") return { held: undefined, watch };

    let held: string | undefined;
    try {
      held = await liveHold(page, selector, leashWords, leashSelectors);
    } catch (err) {
      watch.clickError = messageOf(err);
      return { held: undefined, watch };
    }
    if (held !== undefined) return { held, watch };

    beforeUrl = page.url();
    const beforeHtml = await readMarkup(page);
    state.armed = true;
    try {
      await page.locator(selector).click({ timeout: budget, noWaitAfter: true });
    } catch (err) {
      watch.clickError = messageOf(err);
      return { held: undefined, watch };
    }
    await settle(state, watch, prodWaitMs);
    if (page.url() !== beforeUrl) watch.navigated = true;
    if (page.url().startsWith("chrome-error:")) watch.navFailed = true;
    const afterHtml = await readMarkup(page);
    if (afterHtml !== beforeHtml) watch.scratched = true;
    return { held: undefined, watch };
  } finally {
    if (watch.opened) {
      try {
        const now = page.url();
        watch.landed = now;
        watch.stayed = now === beforeUrl;
      } catch {
        watch.landed = undefined;
        watch.stayed = false;
      }
    }
    await page.close();
  }
}

function arm(page: Page, watch: ProdWatch): Armed {
  const state: Armed = { armed: false, inflight: 0, navPending: 0 };
  const seen = new Set<Request>();

  const finish = (req: Request, failed: boolean): void => {
    if (!seen.delete(req)) return;
    state.inflight = Math.max(0, state.inflight - 1);
    if (!isMainNav(req, page)) return;
    state.navPending = Math.max(0, state.navPending - 1);
    if (failed) watch.navFailed = true;
  };

  page.on("console", (msg) => {
    if (!state.armed || msg.type() !== "error") return;
    watch.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (!state.armed) return;
    watch.pageErrors.push(err.message);
  });
  page.on("request", (req) => {
    if (!state.armed || isFavicon(req.url())) return;
    seen.add(req);
    state.inflight += 1;
    watch.requestCount += 1;
    if (isMainNav(req, page)) state.navPending += 1;
  });
  page.on("response", (res) => {
    const req = res.request();
    if (!seen.has(req)) return;
    const status = res.status();
    if (status >= 400) {
      watch.badStatuses.push(status);
      watch.failed.push({ url: res.url(), status });
    }
    if (!isMainNav(req, page)) return;
    watch.navStatus = status;
    watch.navigated = true;
  });
  page.on("requestfinished", (req) => {
    finish(req, false);
  });
  page.on("requestfailed", (req) => {
    finish(req, true);
  });
  page.on("framenavigated", (frame) => {
    if (!state.armed || frame !== page.mainFrame()) return;
    watch.navigated = true;
  });
  page.on("dialog", (dialog) => {
    if (state.armed) watch.sawDialog = true;
    dialog.dismiss().catch(() => undefined);
  });
  page.on("popup", (popup) => {
    if (state.armed) watch.sawPopup = true;
    popup.close().catch(() => undefined);
  });
  page.on("download", (download) => {
    if (state.armed) watch.sawDownload = true;
    download.cancel().catch(() => undefined);
  });
  return state;
}

async function locate(page: Page, selector: string, watch: ProdWatch): Promise<"ok" | "miss"> {
  let matches = 0;
  try {
    matches = await page.locator(selector).count();
  } catch (err) {
    watch.clickError = messageOf(err);
    return "miss";
  }
  if (matches === 1) return "ok";
  watch.clickError = matches === 0 ? "nothing matched" : "matched more than one";
  return "miss";
}

async function liveHold(
  page: Page,
  selector: string,
  words: readonly string[],
  selectors: readonly string[],
): Promise<string | undefined> {
  const found = await page.locator(selector).evaluate(
    (el, extra: { selectors: string[] }) => {
      const node = el as unknown as {
        textContent: string | null;
        tagName: string;
        value?: string;
        href?: string;
        getAttribute(name: string): string | null;
        matches(sel: string): boolean;
      };
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      const ariaLabel = node.getAttribute("aria-label") || "";
      const title = node.getAttribute("title") || "";
      const tag = node.tagName;
      const value =
        (tag === "INPUT" || tag === "BUTTON") && typeof node.value === "string"
          ? node.value
          : node.getAttribute("value") || "";
      let href = "";
      if (tag === "A") {
        const raw = node.getAttribute("href") || "";
        const abs = typeof node.href === "string" ? node.href : "";
        href = raw && abs && raw !== abs ? `${raw} ${abs}` : abs || raw;
      }
      const hits: string[] = [];
      for (const sel of extra.selectors) {
        try {
          if (node.matches(sel)) hits.push(sel);
        } catch {
          continue;
        }
      }
      return { text, ariaLabel, title, value, href, hits };
    },
    { selectors: [...selectors] },
  );
  const surface: LeashSurface = {
    text: found.text,
    ariaLabel: found.ariaLabel,
    title: found.title,
    value: found.value,
    href: found.href,
  };
  return leashHold(surface, words, found.hits);
}

async function readMarkup(page: Page): Promise<string> {
  try {
    const html: unknown = await page.evaluate(
      "document.documentElement ? document.documentElement.outerHTML : ''",
    );
    return typeof html === "string" ? html : "";
  } catch {
    return "";
  }
}

async function settle(state: Armed, watch: ProdWatch, prodWaitMs: number): Promise<void> {
  const deadline = Date.now() + prodWaitMs;
  await sleep(Math.min(200, remaining(deadline)));
  while (Date.now() < deadline && (state.inflight > 0 || state.navPending > 0)) {
    await sleep(Math.min(40, remaining(deadline)));
  }
  if (state.navPending > 0) watch.navFailed = true;
  await sleep(Math.min(80, remaining(deadline)));
}

function freshWatch(): ProdWatch {
  return {
    opened: false,
    navigated: false,
    navStatus: undefined,
    navFailed: false,
    badStatuses: [],
    requestCount: 0,
    consoleErrors: [],
    pageErrors: [],
    scratched: false,
    clickError: undefined,
    sawDialog: false,
    sawPopup: false,
    sawDownload: false,
    landed: undefined,
    stayed: false,
    failed: [],
  };
}

function clickBudget(prodWaitMs: number): number {
  return Math.min(Math.max(prodWaitMs, 750), 3000);
}

function isMainNav(req: Request, page: Page): boolean {
  return req.isNavigationRequest() && req.frame() === page.mainFrame();
}

// chrome asks for /favicon.ico on its own
function isFavicon(url: string): boolean {
  try {
    return new URL(url).pathname === "/favicon.ico";
  } catch {
    return false;
  }
}

function remaining(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clip(value: string, limit: number): string {
  const line = value.split("\n")[0] ?? "";
  const text = line.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3)}...`;
}
