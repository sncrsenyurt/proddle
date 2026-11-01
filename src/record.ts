import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AmblePage, SkippedPage } from "./amble.js";
import { countVerdicts, type FailedHit, type ProdRow, type Verdict, type VerdictCounts } from "./prod.js";

export type ProdRecord = {
  page: string;
  kind: string;
  label: string;
  selector: string;
  at: string;
  ms: number;
  held: string | null;
  verdict: Verdict | null;
  detail: string;
  landed: string | null;
  stayed: boolean;
  scratched: boolean;
  dialog: boolean;
  popup: boolean;
  download: boolean;
  failed: FailedHit[];
  consoleErrors: string[];
  pageErrors: string[];
  clickError: string | null;
  shot: string | null;
};

export type RunLimits = {
  pageCap: number;
  depthCap: number;
  openWaitMs: number;
  prodWaitMs: number;
};

export type RunRecord = {
  porch: string;
  started: string;
  ended: string;
  limits: RunLimits;
  leashWords: string[];
  leashSelectors: string[];
  pages: { href: string; depth: number }[];
  skipped: { href: string; from: string; why: string }[];
  prods: ProdRecord[];
  totals: VerdictCounts;
};

export function buildRecord(input: {
  porch: string;
  started: Date;
  ended: Date;
  limits: RunLimits;
  leashWords: readonly string[];
  leashSelectors: readonly string[];
  pages: readonly AmblePage[];
  skipped: readonly SkippedPage[];
  prods: readonly ProdRow[];
}): RunRecord {
  return {
    porch: input.porch,
    started: input.started.toISOString(),
    ended: input.ended.toISOString(),
    limits: {
      pageCap: input.limits.pageCap,
      depthCap: input.limits.depthCap,
      openWaitMs: input.limits.openWaitMs,
      prodWaitMs: input.limits.prodWaitMs,
    },
    leashWords: [...input.leashWords],
    leashSelectors: [...input.leashSelectors],
    pages: input.pages.map((page) => ({ href: page.href, depth: page.depth })),
    skipped: input.skipped.map((page) => ({ href: page.href, from: page.from, why: page.why })),
    prods: input.prods.map(prodRecord),
    totals: countVerdicts(input.prods),
  };
}

export function serializeRecord(record: RunRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function makeRunDir(outDir: string, porch: string, started: Date): string {
  const host = new URL(porch).host.replace(/[^\w.-]+/g, "-");
  const stem = `${stampOf(started)}-${host}`;
  let dir = join(outDir, stem);
  let extra = 2;
  while (existsSync(dir)) {
    dir = join(outDir, `${stem}-${extra}`);
    extra += 1;
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeRun(
  dir: string,
  record: RunRecord,
  html: string,
): { recordPath: string; slatePath: string } {
  const recordPath = join(dir, "record.json");
  const slatePath = join(dir, "slate.html");
  writeFileSync(recordPath, serializeRecord(record));
  writeFileSync(slatePath, html);
  return { recordPath, slatePath };
}

function stampOf(started: Date): string {
  const iso = started.toISOString();
  const day = iso.slice(0, 10).replace(/-/g, "");
  const clock = iso.slice(11, 23).replace(/[:.]/g, "");
  return `${day}-${clock}`;
}

function prodRecord(row: ProdRow): ProdRecord {
  return {
    page: row.page,
    kind: row.kind,
    label: row.label,
    selector: row.selector,
    at: row.at,
    ms: row.ms,
    held: row.held ?? null,
    verdict: row.verdict ?? null,
    detail: row.detail,
    landed: row.landed ?? null,
    stayed: row.stayed,
    scratched: row.scratched,
    dialog: row.dialog,
    popup: row.popup,
    download: row.download,
    failed: row.failed.map((hit) => ({ url: hit.url, status: hit.status })),
    consoleErrors: [...row.consoleErrors],
    pageErrors: [...row.pageErrors],
    clickError: row.clickError ?? null,
    shot: row.shot ?? null,
  };
}
