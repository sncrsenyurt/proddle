import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  detailOf,
  formatProdLine,
  formatTally,
  prodExitCode,
  prodPage,
  verdictOf,
  type ProdRow,
  type ProdWatch,
} from "./prod.js";
import type { Scent } from "./sniff.js";
import { builtInLeashWords } from "./yard.js";

function watch(over: Partial<ProdWatch> = {}): ProdWatch {
  return {
    opened: true,
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
    ...over,
  };
}

function row(over: Partial<ProdRow> = {}): ProdRow {
  return {
    kind: "button",
    label: "Save",
    selector: "#save",
    held: undefined,
    verdict: "fine",
    detail: "",
    ...over,
  };
}

describe("verdictOf", () => {
  it("calls a scratch fine", () => {
    expect(verdictOf(watch({ scratched: true }))).toBe("fine");
  });

  it("calls a landing navigation fine", () => {
    expect(verdictOf(watch({ navigated: true, navStatus: 200, requestCount: 1 }))).toBe("fine");
  });

  it("calls a hash change fine", () => {
    expect(verdictOf(watch({ navigated: true }))).toBe("fine");
  });

  it("calls a request fine", () => {
    expect(verdictOf(watch({ requestCount: 1, navStatus: 204 }))).toBe("fine");
  });

  it("calls a dialog fine", () => {
    expect(verdictOf(watch({ sawDialog: true }))).toBe("fine");
  });

  it("calls nothing a limp", () => {
    expect(verdictOf(watch())).toBe("limp");
  });

  it("calls a console error a yelp", () => {
    expect(verdictOf(watch({ consoleErrors: ["nope"] }))).toBe("yelp");
  });

  it("calls a page error a yelp", () => {
    expect(verdictOf(watch({ pageErrors: ["boom"] }))).toBe("yelp");
  });

  it("calls a click that missed a yelp", () => {
    expect(verdictOf(watch({ clickError: "nothing matched" }))).toBe("yelp");
  });

  it("calls a 404 navigation a growl", () => {
    expect(verdictOf(watch({ navigated: true, navStatus: 404, requestCount: 1 }))).toBe("growl");
  });

  it("calls a 500 response a growl", () => {
    expect(verdictOf(watch({ badStatuses: [500], requestCount: 1 }))).toBe("growl");
  });

  it("calls a failed navigation a growl", () => {
    expect(verdictOf(watch({ navFailed: true, navigated: true }))).toBe("growl");
  });

  it("calls a page that never opened a growl", () => {
    expect(verdictOf(watch({ opened: false, navFailed: true }))).toBe("growl");
  });

  it("lets a growl beat a yelp", () => {
    expect(
      verdictOf(watch({ navigated: true, navStatus: 404, consoleErrors: ["Failed to load resource"] })),
    ).toBe("growl");
  });

  it("lets a yelp beat a scratch", () => {
    expect(verdictOf(watch({ scratched: true, pageErrors: ["boom"] }))).toBe("yelp");
  });
});

describe("detailOf", () => {
  it("names the status on a growl", () => {
    expect(detailOf(watch({ navStatus: 404 }), "growl")).toBe("404");
    expect(detailOf(watch({ badStatuses: [500] }), "growl")).toBe("500");
  });

  it("names an open failure and a dropped navigation", () => {
    expect(detailOf(watch({ opened: false, navFailed: true }), "growl")).toBe("could not open");
    expect(detailOf(watch({ navFailed: true }), "growl")).toBe("navigation failed");
  });

  it("uses the page error, then the console, then the click", () => {
    expect(detailOf(watch({ pageErrors: ["boom"], consoleErrors: ["nope"] }), "yelp")).toBe("boom");
    expect(detailOf(watch({ consoleErrors: ["nope"] }), "yelp")).toBe("nope");
    expect(detailOf(watch({ clickError: "nothing matched" }), "yelp")).toBe("nothing matched");
  });

  it("stays quiet for a fine prod and a limp", () => {
    expect(detailOf(watch({ scratched: true }), "fine")).toBe("");
    expect(detailOf(watch(), "limp")).toBe("");
  });
});

describe("formatProdLine", () => {
  it("prints a verdict, a detail, and a hold", () => {
    expect(formatProdLine(row())).toBe('button "Save" #save fine');
    expect(formatProdLine(row({ kind: "anchor", label: "Missing", selector: "#miss", verdict: "growl", detail: "404" }))).toBe(
      'anchor "Missing" #miss growl: 404',
    );
    expect(formatProdLine(row({ label: "Delete", selector: "#del", held: 'word "delete"', verdict: undefined }))).toBe(
      'button "Delete" #del held: word "delete"',
    );
  });
});

describe("formatTally", () => {
  it("counts verdicts and holds", () => {
    expect(
      formatTally([
        row(),
        row({ verdict: "limp" }),
        row({ verdict: "yelp", detail: "boom" }),
        row({ verdict: "growl", detail: "404" }),
        row({ held: 'word "delete"', verdict: undefined }),
      ]),
    ).toBe("1 fine, 1 limp, 1 yelp, 1 growl, 1 held");
  });
});

describe("prodExitCode", () => {
  it("stays 0 when every prod is fine or held", () => {
    expect(prodExitCode([row(), row({ held: 'word "delete"', verdict: undefined })])).toBe(0);
  });

  it("stays 0 with nothing to prod", () => {
    expect(prodExitCode([])).toBe(0);
  });

  it.each(["limp", "yelp", "growl"] as const)("exits 1 on a %s", (verdict) => {
    expect(prodExitCode([row(), row({ verdict })])).toBe(1);
  });
});

const home = `<!doctype html>
<html>
<body>
  <a id="docs" href="/docs">Docs</a>
  <a id="miss" href="/missing">Missing</a>
  <a id="hash" href="#part">Part</a>
  <a id="drop" href="/drop">Drop</a>
  <button id="dead">Dead</button>
  <button id="scratch">Scratch</button>
  <button id="yelp">Yelp</button>
  <button id="log">Log</button>
  <button id="api">Api</button>
  <button id="ping">Ping</button>
  <button id="ask">Ask</button>
  <button id="del">Delete</button>
  <button id="stay" class="bye">Stay</button>
  <button id="archive">Archive</button>
  <script>
    document.getElementById("scratch").onclick = () => { document.body.dataset.n = "1"; };
    document.getElementById("yelp").addEventListener("click", () => { throw new Error("boom"); });
    document.getElementById("log").onclick = () => { console.error("nope"); };
    document.getElementById("api").onclick = () => { fetch("/api"); };
    document.getElementById("ping").onclick = () => { fetch("/ping"); };
    document.getElementById("ask").onclick = () => { alert("hi"); };
    document.getElementById("del").onclick = () => { fetch("/hit/del"); };
    document.getElementById("stay").onclick = () => { fetch("/hit/stay"); };
    document.getElementById("archive").onclick = () => { fetch("/hit/archive"); };
  </script>
</body>
</html>`;

describe("prod on a page", () => {
  let browser: Browser;
  let context: BrowserContext;
  let origin = "";
  let hits: string[] = [];
  let server: Server;

  beforeAll(async () => {
    const served = await serve(home);
    origin = served.origin;
    hits = served.hits;
    server = served.server;
    browser = await chromium.launch();
    context = await browser.newContext();
  }, 30_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await closeServer(server);
  });

  function scent(selector: string, over: Partial<Scent> = {}): Scent {
    return { kind: "button", label: selector, selector, held: undefined, ...over };
  }

  async function one(
    selector: string,
    over: Partial<Scent> = {},
    words: readonly string[] = builtInLeashWords,
    selectors: readonly string[] = [],
    href = `${origin}/`,
  ): Promise<ProdRow> {
    const rows = await prodPage(context, href, [scent(selector, over)], 4000, 1500, words, selectors);
    const found = rows[0];
    if (found === undefined) throw new Error("no row");
    return found;
  }

  it.each([
    ["#dead", "limp", ""],
    ["#scratch", "fine", ""],
    ["#yelp", "yelp", "boom"],
    ["#log", "yelp", "nope"],
    ["#docs", "fine", ""],
    ["#miss", "growl", "404"],
    ["#hash", "fine", ""],
    ["#api", "growl", "500"],
    ["#ping", "fine", ""],
    ["#drop", "growl", "navigation failed"],
    ["#ask", "fine", ""],
  ] as const)("%s comes back %s", async (selector, verdict, detail) => {
    const found = await one(selector);
    expect(found.verdict).toBe(verdict);
    expect(found.detail).toBe(detail);
    expect(found.held).toBeUndefined();
  }, 20_000);

  it("yelps when the selector matches nothing", async () => {
    const found = await one("#nope");
    expect(found.verdict).toBe("yelp");
    expect(found.detail).toBe("nothing matched");
  }, 20_000);

  it("growls when the page never opens", async () => {
    const closed = await closedOrigin();
    const found = await one("#dead", {}, builtInLeashWords, [], closed);
    expect(found.verdict).toBe("growl");
    expect(found.detail).toBe("could not open");
  }, 20_000);

  it("prods around a held scent and does not click it", async () => {
    const before = hits.length;
    const rows = await prodPage(
      context,
      `${origin}/`,
      [
        scent("#scratch", { label: "Scratch" }),
        scent("#del", { label: "Delete", held: 'word "delete"' }),
        scent("#dead", { label: "Dead" }),
      ],
      4000,
      1500,
      builtInLeashWords,
      [],
    );
    expect(rows.map((item) => item.verdict ?? item.held)).toEqual(["fine", 'word "delete"', "limp"]);
    expect(hits.slice(before).some((hit) => hit.startsWith("/hit/del"))).toBe(false);
  }, 20_000);

  it("does not click a delete button the sniff left unmarked", async () => {
    const before = hits.length;
    const found = await one("#del", { label: "Delete" });
    expect(found.held).toBe('word "delete"');
    expect(found.verdict).toBeUndefined();
    expect(hits.slice(before).some((hit) => hit.startsWith("/hit/del"))).toBe(false);
  }, 20_000);

  it("does not click an extra leash word", async () => {
    const before = hits.length;
    const found = await one("#archive", { label: "Archive" }, [...builtInLeashWords, "archive"]);
    expect(found.held).toBe('word "archive"');
    expect(hits.slice(before).some((hit) => hit.startsWith("/hit/archive"))).toBe(false);
  }, 20_000);

  it("does not click a selector on the leash", async () => {
    const before = hits.length;
    const found = await one("#stay", { label: "Stay" }, builtInLeashWords, [".bye"]);
    expect(found.held).toBe('selector ".bye"');
    expect(hits.slice(before).some((hit) => hit.startsWith("/hit/stay"))).toBe(false);
  }, 20_000);
});

function serve(html: string): Promise<{ origin: string; hits: string[]; server: Server }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    hits.push(url.split("?")[0] ?? url);
    if (url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (url === "/docs") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><p>docs</p>");
      return;
    }
    if (url === "/missing") {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end("<!doctype html><p>missing</p>");
      return;
    }
    if (url === "/api") {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("no");
      return;
    }
    if (url === "/ping" || url.startsWith("/hit/")) {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url === "/drop") {
      req.socket.destroy();
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("no");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("no port");
      resolve({ origin: `http://127.0.0.1:${address.port}`, hits, server });
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function closedOrigin(): Promise<string> {
  const server = createServer((_req, res) => {
    res.end("no");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return origin;
}
