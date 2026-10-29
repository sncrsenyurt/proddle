import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { scentsFrom, sniffSource, takeLook, type Scent, type SniffFact } from "./sniff.js";

function fact(over: Partial<SniffFact> = {}): SniffFact {
  return {
    kind: "button",
    label: "Save",
    text: "Save",
    ariaLabel: "",
    title: "",
    value: "",
    href: "",
    id: "",
    idUnique: false,
    testId: "",
    testIdUnique: false,
    ariaUnique: false,
    role: "button",
    name: "Save",
    roleNameUnique: false,
    textUnique: false,
    path: "body > button",
    selectorHits: [],
    ...over,
  };
}

describe("takeLook", () => {
  it("drops a payload it does not understand", () => {
    expect(takeLook(null)).toEqual({ hrefs: [], facts: [], badSelectors: [] });
    expect(takeLook({ hrefs: ["https://example.com/", 4], facts: [{ kind: "nope" }, null], badSelectors: "x" })).toEqual({
      hrefs: ["https://example.com/"],
      facts: [],
      badSelectors: [],
    });
  });

  it("keeps a complete fact", () => {
    const raw = fact({ selectorHits: [".bye", 2 as unknown as string] });
    expect(takeLook({ hrefs: [], facts: [raw], badSelectors: ["["] }).facts).toEqual([
      { ...raw, selectorHits: [".bye"] },
    ]);
  });
});

describe("scentsFrom", () => {
  it("holds a built-in word even when no extra words are passed", () => {
    const scents = scentsFrom([fact({ id: "del", idUnique: true, label: "Delete", text: "Delete" })]);
    expect(scents).toEqual([
      { kind: "button", label: "Delete", selector: "#del", held: 'word "delete"' },
    ]);
  });

  it("holds an extra word and a selector", () => {
    const scents = scentsFrom(
      [
        fact({ label: "Archive", text: "Archive", testId: "archive", testIdUnique: true, roleNameUnique: false }),
        fact({
          label: "Stay",
          text: "Stay",
          id: "stay",
          idUnique: true,
          path: "body > button:nth-of-type(2)",
          selectorHits: [".stay"],
        }),
      ],
      ["archive"],
    );
    expect(scents.map((scent) => scent.held)).toEqual(['word "archive"', 'selector ".stay"']);
  });

  it("falls back when two scents want the same selector", () => {
    const scents = scentsFrom([
      fact({ text: "OK", name: "OK", textUnique: true, path: "body > div > button:nth-of-type(1)" }),
      fact({ text: "OK", name: "OK", textUnique: true, path: "body > div > button:nth-of-type(2)" }),
    ]);
    expect(scents.map((scent) => scent.selector)).toEqual([
      'internal:text="OK"s',
      "body > div > button:nth-of-type(2)",
    ]);
  });

  it("drops a scent that still collides", () => {
    const scents = scentsFrom([
      fact({ path: "body > button" }),
      fact({ path: "body > button" }),
    ]);
    expect(scents).toHaveLength(1);
  });

  it("shortens a long label and fills a blank one", () => {
    const long = "a".repeat(90);
    const scents = scentsFrom([
      fact({ label: long, text: "Save", path: "body > button:nth-of-type(1)" }),
      fact({ kind: "pointer", label: "  ", text: "", name: "", path: "body > div" }),
    ]);
    expect(scents[0]?.label).toBe(`${"a".repeat(77)}...`);
    expect(scents[1]?.label).toBe("pointer");
  });
});

const fixture = `<!doctype html>
<html>
<head>
  <style>
    .card { cursor: pointer; }
    .pass { pointer-events: none; }
  </style>
</head>
<body>
  <a id="docs" href="/docs">Docs</a>
  <a href="/about">About</a>
  <a id="plans" href="https://shop.example/checkout">Plans</a>
  <a id="paper" href="https://example.com/paper">paper</a>
  <a id="js" href="javascript:void(0)">Run</a>
  <a href="/hidden-link" hidden>Hidden link</a>
  <button id="save" data-testid="save">Save</button>
  <button id="save:btn">Odd id</button>
  <button id="del">Delete</button>
  <button id="go" onclick="void 0">Go</button>
  <button data-testid="archive">Archive</button>
  <button aria-label="Close">×</button>
  <button id="bye" class="bye" title="remove item">x</button>
  <button id="pay" aria-label="Pay now">$</button>
  <button id="outer">Outer <span id="inner" onclick="void 0">in</span></button>
  <button id="hidden" hidden>Hidden</button>
  <button id="none" style="display:none">None</button>
  <button id="off" disabled>Off</button>
  <button id="ariaoff" aria-disabled="true">Aria off</button>
  <button id="pass" class="pass">Pass</button>
  <div inert><button id="inert">Inert</button></div>
  <input id="send" type="submit" value="Continue">
  <input id="reset" type="reset" value="Reset form">
  <input id="ping" type="button" value="Ping">
  <div id="menu" role="menuitem">Open menu</div>
  <div role="button">Refresh</div>
  <div id="tap" onclick="void 0">Tap</div>
  <div id="box">Box</div>
  <div id="card" class="card">Open card <span>now</span></div>
  <div id="twins">
    <button>OK</button>
    <button>OK</button>
  </div>
  <button id="dup">One</button>
  <button id="dup">Two</button>
  <button id="stay" class="stay">Stay</button>
  <script>document.getElementById("box").onclick = function () {};</script>
</body>
</html>`;

describe("sniff on a page", () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    try {
      browser = await chromium.launch();
    } catch {
      browser = undefined;
    }
  });

  afterAll(async () => {
    await browser?.close();
  });

  async function openFixture(html: string): Promise<Page> {
    if (browser === undefined) throw new Error("browser missing");
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return page;
  }

  it("lists clickable things and holds the leash", async () => {
    if (browser === undefined) return;
    const page = await openFixture(fixture);
    try {
      const look = takeLook(await page.evaluate(sniffSource([".stay", "["])));
      const scents = scentsFrom(look.facts);
      const byId = new Map<string, Scent>();
      const bare: Scent[] = [];
      for (const scent of scents) {
        expect(await page.locator(scent.selector).count(), scent.selector).toBe(1);
        const id = await page.locator(scent.selector).getAttribute("id");
        if (id) byId.set(id, scent);
        else bare.push(scent);
      }

      expect(byId.get("docs")).toEqual({ kind: "anchor", label: "Docs", selector: "#docs", held: undefined });
      expect(byId.get("plans")).toEqual({
        kind: "anchor",
        label: "Plans",
        selector: "#plans",
        held: 'word "checkout"',
      });
      expect(byId.get("paper")).toEqual({ kind: "anchor", label: "paper", selector: "#paper", held: undefined });
      expect(byId.get("js")).toEqual({ kind: "anchor", label: "Run", selector: "#js", held: undefined });
      expect(byId.get("save")).toEqual({ kind: "button", label: "Save", selector: "#save", held: undefined });
      expect(byId.get("save:btn")).toEqual({
        kind: "button",
        label: "Odd id",
        selector: "#save\\:btn",
        held: undefined,
      });
      expect(byId.get("del")).toEqual({ kind: "button", label: "Delete", selector: "#del", held: 'word "delete"' });
      expect(byId.get("go")).toEqual({ kind: "button", label: "Go", selector: "#go", held: undefined });
      expect(byId.get("bye")).toEqual({ kind: "button", label: "x", selector: "#bye", held: 'word "remove"' });
      expect(byId.get("pay")).toEqual({ kind: "button", label: "Pay now", selector: "#pay", held: 'word "pay"' });
      expect(byId.get("outer")).toEqual({ kind: "button", label: "Outer in", selector: "#outer", held: undefined });
      expect(byId.get("inner")).toEqual({ kind: "onclick", label: "in", selector: "#inner", held: undefined });
      expect(byId.get("send")).toEqual({ kind: "input", label: "Continue", selector: "#send", held: undefined });
      expect(byId.get("reset")).toEqual({ kind: "input", label: "Reset form", selector: "#reset", held: undefined });
      expect(byId.get("ping")).toEqual({ kind: "input", label: "Ping", selector: "#ping", held: undefined });
      expect(byId.get("menu")).toEqual({ kind: "role", label: "Open menu", selector: "#menu", held: undefined });
      expect(byId.get("tap")).toEqual({ kind: "onclick", label: "Tap", selector: "#tap", held: undefined });
      expect(byId.get("box")).toEqual({ kind: "onclick", label: "Box", selector: "#box", held: undefined });
      expect(byId.get("card")).toEqual({
        kind: "pointer",
        label: "Open card now",
        selector: "#card",
        held: undefined,
      });
      expect(byId.get("stay")).toEqual({
        kind: "button",
        label: "Stay",
        selector: "#stay",
        held: 'selector ".stay"',
      });

      const archive = scents.find((scent) => scent.label === "Archive");
      expect(archive).toEqual({ kind: "button", label: "Archive", selector: '[data-testid="archive"]', held: undefined });
      const close = scents.find((scent) => scent.label === "Close");
      expect(close).toEqual({ kind: "button", label: "Close", selector: '[aria-label="Close"]', held: undefined });
      const about = scents.find((scent) => scent.label === "About");
      expect(about?.selector).toBe('internal:role=link[name="About"s]');
      const refresh = scents.find((scent) => scent.label === "Refresh");
      expect(refresh?.selector).toBe('internal:role=button[name="Refresh"s]');

      const oks = scents.filter((scent) => scent.label === "OK");
      expect(oks).toHaveLength(2);
      expect(new Set(oks.map((scent) => scent.selector)).size).toBe(2);
      for (const scent of oks) {
        expect(scent.selector).toContain("nth-of-type");
        expect(await page.locator(scent.selector).textContent()).toBe("OK");
      }

      const dupes = ["One", "Two"].map((label) => scents.find((scent) => scent.label === label));
      expect(dupes[0]?.selector).not.toBe("#dup");
      expect(dupes[1]?.selector).not.toBe("#dup");

      for (const id of ["hidden", "none", "off", "ariaoff", "pass", "inert"]) {
        expect(byId.has(id), id).toBe(false);
      }
      expect(scents.some((scent) => scent.label === "Hidden link")).toBe(false);
      expect(scents.some((scent) => scent.label === "now")).toBe(false);
      expect(look.badSelectors).toEqual(["["]);
      expect(look.hrefs.some((href) => href.includes("checkout"))).toBe(true);
      expect(look.hrefs.some((href) => href.includes("hidden-link"))).toBe(true);
      expect(bare.length).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });
});
