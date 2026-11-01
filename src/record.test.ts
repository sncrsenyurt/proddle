import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProdRow } from "./prod.js";
import { buildRecord, makeRunDir, serializeRecord, writeRun, type RunRecord } from "./record.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function row(over: Partial<ProdRow> = {}): ProdRow {
  return {
    page: "https://example.com/",
    kind: "button",
    label: "Save",
    selector: "#save",
    held: undefined,
    verdict: "fine",
    detail: "",
    at: "2026-11-01T03:49:13.000Z",
    ms: 420,
    landed: "https://example.com/",
    stayed: true,
    scratched: true,
    dialog: false,
    popup: false,
    download: false,
    failed: [],
    consoleErrors: [],
    pageErrors: [],
    clickError: undefined,
    shot: undefined,
    ...over,
  };
}

function sample(): RunRecord {
  const consoleText = `boom ${"x".repeat(180)}\nsecond line`;
  return buildRecord({
    porch: "https://example.com/",
    started: new Date("2026-11-01T03:49:12.000Z"),
    ended: new Date("2026-11-01T03:50:00.000Z"),
    limits: { pageCap: 2, depthCap: 1, openWaitMs: 4000, prodWaitMs: 1500 },
    leashWords: ["delete", "archive"],
    leashSelectors: [".bye"],
    pages: [
      { href: "https://example.com/", depth: 0 },
      { href: "https://example.com/docs", depth: 1 },
    ],
    skipped: [
      { href: "https://other.test/no", from: "https://example.com/", why: "other origin" },
      { href: "mailto:hi@example.com", from: "https://example.com/", why: "not http" },
      { href: "https://example.com/deep", from: "https://example.com/docs", why: "depth cap" },
    ],
    prods: [
      row(),
      row({
        page: "https://example.com/",
        kind: "anchor",
        label: `Missing </script><img src=x onerror=alert(1)> & "quotes"`,
        selector: "#miss",
        verdict: "growl",
        detail: "404",
        landed: "https://example.com/missing",
        stayed: false,
        scratched: false,
        ms: 800,
        failed: [{ url: "https://example.com/missing?q=<tag>", status: 404 }],
        consoleErrors: [consoleText],
      }),
      row({
        page: "https://example.com/docs",
        kind: "button",
        label: "Delete",
        selector: "#del",
        held: 'word "delete"',
        verdict: undefined,
        detail: "",
        landed: undefined,
        stayed: false,
        scratched: false,
        ms: 0,
      }),
      row({
        page: "https://example.com/docs",
        kind: "button",
        label: "Boom",
        selector: "#boom",
        verdict: "yelp",
        detail: "boom",
        pageErrors: ["boom\nstack"],
        clickError: "nothing matched",
        dialog: true,
        popup: true,
        download: true,
        shot: "shots/2-4.png",
      }),
    ],
  });
}

describe("buildRecord", () => {
  it("keeps the run, the walk, and every prod", () => {
    const record = sample();
    expect(record.porch).toBe("https://example.com/");
    expect(record.started).toBe("2026-11-01T03:49:12.000Z");
    expect(record.ended).toBe("2026-11-01T03:50:00.000Z");
    expect(record.limits).toEqual({ pageCap: 2, depthCap: 1, openWaitMs: 4000, prodWaitMs: 1500 });
    expect(record.leashWords).toEqual(["delete", "archive"]);
    expect(record.leashSelectors).toEqual([".bye"]);
    expect(record.pages).toEqual([
      { href: "https://example.com/", depth: 0 },
      { href: "https://example.com/docs", depth: 1 },
    ]);
    expect(record.skipped.map((page) => page.why)).toEqual(["other origin", "not http", "depth cap"]);
    expect(record.totals).toEqual({ fine: 1, limp: 0, yelp: 1, growl: 1, held: 1 });

    const growl = record.prods[1];
    expect(growl?.verdict).toBe("growl");
    expect(growl?.failed).toEqual([{ url: "https://example.com/missing?q=<tag>", status: 404 }]);
    expect(growl?.consoleErrors[0]?.length).toBeGreaterThan(140);
    expect(growl?.stayed).toBe(false);
    expect(growl?.landed).toBe("https://example.com/missing");

    const held = record.prods[2];
    expect(held?.held).toBe('word "delete"');
    expect(held?.verdict).toBeNull();
    expect(held?.landed).toBeNull();

    const yelp = record.prods[3];
    expect(yelp?.pageErrors).toEqual(["boom\nstack"]);
    expect(yelp?.clickError).toBe("nothing matched");
    expect(yelp?.dialog).toBe(true);
    expect(yelp?.popup).toBe(true);
    expect(yelp?.download).toBe(true);
    expect(yelp?.shot).toBe("shots/2-4.png");
    expect(yelp?.scratched).toBe(true);
  });

  it("copies lists out of the inputs", () => {
    const words = ["delete"];
    const prod = row();
    const record = buildRecord({
      porch: "https://example.com/",
      started: new Date("2026-11-01T03:49:12.000Z"),
      ended: new Date("2026-11-01T03:50:00.000Z"),
      limits: { pageCap: 1, depthCap: 1, openWaitMs: 1000, prodWaitMs: 1000 },
      leashWords: words,
      leashSelectors: [],
      pages: [],
      skipped: [],
      prods: [prod],
    });
    words.push("archive");
    prod.consoleErrors.push("nope");
    prod.failed.push({ url: "https://example.com/missing", status: 404 });
    expect(record.leashWords).toEqual(["delete"]);
    expect(record.prods[0]?.consoleErrors).toEqual([]);
    expect(record.prods[0]?.failed).toEqual([]);
    expect(record.totals).toEqual({ fine: 1, limp: 0, yelp: 0, growl: 0, held: 0 });
  });
});

describe("writeRun", () => {
  it("writes the json and the slate into a fresh folder", () => {
    const out = mkdtempSync(join(tmpdir(), "proddle-record-"));
    dirs.push(out);
    const started = new Date("2026-11-01T03:49:12.345Z");
    const dir = makeRunDir(out, "https://example.com:8443/docs", started);
    expect(dir).toBe(join(out, "20261101-034912345-example.com-8443"));
    const again = makeRunDir(out, "https://example.com:8443/docs", started);
    expect(again).toBe(join(out, "20261101-034912345-example.com-8443-2"));

    const record = buildRecord({
      porch: "https://example.com:8443/docs",
      started,
      ended: started,
      limits: { pageCap: 1, depthCap: 1, openWaitMs: 1000, prodWaitMs: 1000 },
      leashWords: [],
      leashSelectors: [],
      pages: [],
      skipped: [],
      prods: [],
    });
    const paths = writeRun(dir, record, "<p>slate</p>\n");
    expect(readFileSync(paths.recordPath, "utf8")).toBe(serializeRecord(record));
    expect(readFileSync(paths.slatePath, "utf8")).toBe("<p>slate</p>\n");
    expect(paths.recordPath.endsWith("record.json")).toBe(true);
    expect(paths.slatePath.endsWith("slate.html")).toBe(true);
  });
});

describe("serializeRecord", () => {
  it("round-trips and keeps the long text", () => {
    const record = sample();
    const text = serializeRecord(record);
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "porch": "https://example.com/"');
    expect(JSON.parse(text)).toEqual(record);
    expect(text).toContain("second line");
    expect(text).toContain("</script>");
  });
});
