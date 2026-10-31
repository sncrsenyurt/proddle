import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { run } from "./latch.js";

function capture(): { write(chunk: string): void; text(): string } {
  let text = "";
  return {
    write(chunk: string) {
      text += chunk;
    },
    text() {
      return text;
    },
  };
}

describe("run", () => {
  it("refuses to start with no arguments", async () => {
    const stderr = capture();
    expect(await run([], capture(), stderr)).toBe(1);
    expect(stderr.text()).toContain("pass a url, or a path to a yard file.");
  });

  it("refuses a url that is not http", async () => {
    const stdout = capture();
    const stderr = capture();
    expect(await run(["ftp://example.com/a"], stdout, stderr)).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("http or https");
  });
});

const quiet = `<!doctype html>
<body>
  <button id="save">Save</button>
  <script>
    document.getElementById("save").onclick = () => { document.body.dataset.saved = "1"; };
  </script>
</body>`;

const mix = `<!doctype html>
<body>
  <a id="docs" href="/docs">Docs</a>
  <a id="miss" href="/missing">Missing</a>
  <button id="save">Save</button>
  <button id="dead">Dead</button>
  <button id="boom">Boom</button>
  <button id="del">Delete</button>
  <script>
    document.getElementById("save").onclick = () => { document.body.dataset.saved = "1"; };
    document.getElementById("boom").addEventListener("click", () => { throw new Error("boom"); });
    document.getElementById("del").onclick = () => { fetch("/hit/del"); };
  </script>
</body>`;

describe("run against a local site", () => {
  let origin = "";
  let hits: string[] = [];
  let server: Server | undefined;
  const dirs: string[] = [];

  beforeAll(async () => {
    const served = await serve();
    origin = served.origin;
    hits = served.hits;
    server = served.server;
  });

  afterAll(async () => {
    await closeServer(server);
  });

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function writeYard(value: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "proddle-latch-"));
    dirs.push(dir);
    const filePath = join(dir, "site.yard.json");
    writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
    return filePath;
  }

  it("prods a url with no yard and exits 0 when nothing is broken", async () => {
    const stdout = capture();
    const stderr = capture();
    const code = await run([`${origin}/quiet`], stdout, stderr);
    expect(code).toBe(0);
    expect(stderr.text()).toBe("");
    expect(stdout.text()).toBe(
      `${origin}/quiet\n  button "Save" #save fine\n\n1 fine, 0 limp, 0 yelp, 0 growl, 0 held\n`,
    );
  }, 30_000);

  it("exits 1 when a prod is broken and does not click delete", async () => {
    const before = hits.length;
    const stdout = capture();
    const code = await run([`${origin}/`], stdout, capture());
    expect(code).toBe(1);
    expect(stdout.text()).toBe(
      [
        `${origin}/`,
        '  anchor "Docs" #docs fine',
        '  anchor "Missing" #miss growl: 404',
        '  button "Save" #save fine',
        '  button "Dead" #dead limp',
        '  button "Boom" #boom yelp: boom',
        '  button "Delete" #del held: word "delete"',
        `${origin}/docs`,
        `${origin}/missing`,
        "",
        "2 fine, 1 limp, 1 yelp, 1 growl, 1 held",
        "",
      ].join("\n"),
    );
    expect(hits.slice(before).some((hit) => hit.startsWith("/hit/del"))).toBe(false);
  }, 40_000);

  it("takes an extra leash word from a yard and still exits 0", async () => {
    const filePath = writeYard({
      porch: "http://127.0.0.1:9/ignored",
      pageCap: 1,
      depthCap: 1,
      openWaitMs: 4000,
      prodWaitMs: 1500,
      leashWords: ["save"],
    });
    const stdout = capture();
    const code = await run([`${origin}/quiet`, filePath], stdout, capture());
    expect(code).toBe(0);
    expect(stdout.text()).toContain('button "Save" #save held: word "save"');
    expect(stdout.text()).toContain("0 fine, 0 limp, 0 yelp, 0 growl, 1 held");
  }, 30_000);
});

function serve(): Promise<{ origin: string; hits: string[]; server: Server }> {
  const hits: string[] = [];
  const pages: Record<string, { status: number; html: string }> = {
    "/": { status: 200, html: mix },
    "/quiet": { status: 200, html: quiet },
    "/docs": { status: 200, html: "<!doctype html><p>docs</p>" },
    "/missing": { status: 404, html: "<!doctype html><p>missing</p>" },
  };
  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push(url);
    if (url.startsWith("/hit/")) {
      res.writeHead(204);
      res.end();
      return;
    }
    const page = pages[url];
    if (page === undefined) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("no");
      return;
    }
    res.writeHead(page.status, { "content-type": "text/html; charset=utf-8" });
    res.end(page.html);
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
