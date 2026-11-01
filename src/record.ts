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
