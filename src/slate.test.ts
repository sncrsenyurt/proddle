import { describe, expect, it } from "vitest";
import type { ProdRow } from "./prod.js";
import { buildRecord } from "./record.js";
import { renderSlate } from "./slate.js";

function row(over: Partial<ProdRow> = {}): ProdRow {
  return {
    page: "https://example.com/",
    kind: "button",
    label: "Save <it's>",
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

function html(): string {
  const consoleText = `boom ${"x".repeat(180)}\nsecond line`;
  const record = buildRecord({
    porch: "https://example.com/",
    started: new Date("2026-11-01T03:49:12.000Z"),
    ended: new Date("2026-11-01T03:50:00.000Z"),
    limits: { pageCap: 2, depthCap: 1, openWaitMs: 4000, prodWaitMs: 1500 },
    leashWords: ["delete", "archive"],
    leashSelectors: [".bye"],
    pages: [
      { href: "https://example.com/", depth: 0 },
      { href: "https://example.com/docs", depth: 1 },
      { href: "https://example.com/quiet", depth: 1 },
    ],
    skipped: [
      { href: "https://other.test/no", from: "https://example.com/", why: "other origin" },
      { href: "javascript:alert(1)", from: "https://example.com/", why: "not http" },
      { href: "https://example.com/deep", from: "https://example.com/docs", why: "depth cap" },
    ],
    prods: [
      row(),
      row({
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
        landed: undefined,
        stayed: false,
        scratched: false,
        ms: 0,
      }),
      row({
        page: "https://example.com/docs",
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
  return renderSlate(record);
}

describe("renderSlate", () => {
  it("groups every prod by page and by verdict", () => {
    const text = html();
    const verdictAt = text.indexOf('id="by-verdict"');
    expect(verdictAt).toBeGreaterThan(0);
    const pagePart = text.slice(0, verdictAt);
    const verdictPart = text.slice(verdictAt);

    expect(pagePart).toContain("https://example.com/docs");
    expect(pagePart).toContain("nothing to prod");
    expect(pagePart).toContain("Save &lt;it&#39;s&gt;");
    expect(pagePart).toContain("Delete");
    expect(pagePart).toContain("#boom");
    expect(verdictPart).toContain("<h2>fine</h2>");
    expect(verdictPart).toContain("<h2>limp</h2><p>none</p>");
    expect(verdictPart).toContain("<h2>yelp</h2>");
    expect(verdictPart).toContain("<h2>growl</h2>");
    expect(verdictPart).toContain("<h2>held</h2>");
    expect(verdictPart).toContain("Save &lt;it&#39;s&gt;");
    expect(verdictPart).toContain("Delete");
    expect(verdictPart).toContain("word &quot;delete&quot;");
    expect(verdictPart).toContain("not clicked");

    for (const selector of ["#save", "#miss", "#del", "#boom"]) {
      expect(text.split(selector).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("shows the walk, the tally, and what each prod did", () => {
    const text = html();
    expect(text).toContain("1 fine, 0 limp, 1 yelp, 1 growl, 1 held");
    expect(text).toContain("page cap 2, depth cap 1, open 4000 ms, prod 1500 ms");
    expect(text).toContain("2026-11-01T03:49:12.000Z");
    expect(text).toContain("leash delete, archive");
    expect(text).toContain(".bye");
    expect(text).toContain("depth 0");
    expect(text).toContain("other origin");
    expect(text).toContain("not http");
    expect(text).toContain("depth cap");
    expect(text).toContain("javascript:alert(1)");
    expect(text).toContain(">bolt<");
    expect(text).toContain("https://example.com/missing");
    expect(text).toContain("404");
    expect(text).toContain("second line");
    expect(text).toContain("x".repeat(180));
    expect(text).toContain("boom\nstack");
    expect(text).toContain("nothing matched");
    expect(text).toContain('src="shots/2-4.png"');
    expect(text).toContain("<dt>dialog</dt><dd>yes</dd>");
    expect(text).toContain("<dt>popup</dt><dd>yes</dd>");
    expect(text).toContain("<dt>download</dt><dd>yes</dd>");
    expect(text).toContain("<dt>scratch</dt><dd>yes</dd>");
  });

  it("escapes page text and keeps the file to itself", () => {
    const text = html();
    expect(text).toContain("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
    expect(text).toContain("&amp;");
    expect(text).toContain("&quot;quotes&quot;");
    expect(text).toContain("q=&lt;tag&gt;");
    expect(text).not.toContain("<img src=x");
    expect(text).not.toContain("</script><img");
    expect(text).not.toMatch(/href="javascript:/);
    expect(text).not.toMatch(/<link\b/);
    expect(text).not.toMatch(/<script\b[^>]*\bsrc=/);
    expect(text).not.toMatch(/url\(/);
    expect(text.match(/<\/script>/g)).toHaveLength(1);

    const script = text.split("<script>")[1]?.split("</script>")[0] ?? "";
    expect(script).not.toContain("example.com");
    expect(script).not.toContain("<");
    expect(script).toContain("data-show");

    const urls = [...text.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((match) => match[1] ?? "");
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("https://") || url.startsWith("http://") || url.startsWith("shots/")).toBe(true);
    }
  });

  it("says when the walk skipped nothing", () => {
    const text = renderSlate(
      buildRecord({
        porch: "https://example.com/",
        started: new Date("2026-11-01T03:49:12.000Z"),
        ended: new Date("2026-11-01T03:49:12.000Z"),
        limits: { pageCap: 20, depthCap: 2, openWaitMs: 15000, prodWaitMs: 8000 },
        leashWords: [],
        leashSelectors: [],
        pages: [],
        skipped: [],
        prods: [],
      }),
    );
    expect(text).toContain("<h2>pages</h2>");
    expect(text).toContain("<p>none</p>");
    expect(text).toContain("<h2>skipped</h2>");
    expect(text).toContain("0 fine, 0 limp, 0 yelp, 0 growl, 0 held");
  });
});
