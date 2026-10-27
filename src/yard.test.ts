import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readYard, YardComplaint } from "./yard.js";

const safetyWords = [
  "delete",
  "remove",
  "logout",
  "sign out",
  "buy",
  "pay",
  "checkout",
  "unsubscribe",
] as const;

const porchYardPath = fileURLToPath(new URL("../yards/porch.yard.json", import.meta.url));

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "proddle-yard-"));
  dirs.push(dir);
  return dir;
}

function writeYard(contents: string): string {
  const filePath = join(scratchDir(), "site.yard.json");
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function writeYardJson(value: unknown): string {
  return writeYard(`${JSON.stringify(value)}\n`);
}

describe("readYard", () => {
  it("reads a yard and normalizes it", () => {
    const yard = readYard(
      writeYardJson({
        porch: "  HTTP://Example.COM/docs  ",
        pageCap: 5,
        depthCap: 3,
        leashWords: ["archive", "cancel", "archive", "DELETE", "  Cancel "],
        leashSelectors: [" #Pay ", "#Pay", "a.buy"],
        openWaitMs: 4000,
        prodWaitMs: 1500,
      }),
    );

    expect(yard).toEqual({
      porch: "http://example.com/docs",
      pageCap: 5,
      depthCap: 3,
      leashWords: [...safetyWords, "archive", "cancel"],
      leashSelectors: ["#Pay", "a.buy"],
      openWaitMs: 4000,
      prodWaitMs: 1500,
    });
  });

  it("fills defaults when the yard only names a porch", () => {
    const omitted = readYard(writeYardJson({ porch: "https://example.com/start" }));
    const emptyLists = readYard(
      writeYardJson({
        porch: "https://example.com/start",
        leashWords: [],
        leashSelectors: [],
      }),
    );
    const expected = {
      porch: "https://example.com/start",
      pageCap: 20,
      depthCap: 2,
      leashWords: [...safetyWords],
      leashSelectors: [],
      openWaitMs: 15000,
      prodWaitMs: 8000,
    };

    expect(omitted).toEqual(expected);
    expect(emptyLists).toEqual(expected);
  });

  it("keeps the built-in leash and appends the yard's own words", () => {
    const yard = readYard(
      writeYardJson({
        porch: "https://example.com/start",
        leashWords: ["Sign Out", "cancel", "buy"],
      }),
    );

    expect(yard.leashWords).toEqual([...safetyWords, "cancel"]);
  });

  it("reads the sample porch yard", () => {
    expect(readYard(porchYardPath)).toEqual({
      porch: "http://127.0.0.1:8741/",
      pageCap: 20,
      depthCap: 2,
      leashWords: [...safetyWords],
      leashSelectors: [],
      openWaitMs: 15000,
      prodWaitMs: 8000,
    });
  });

  it("accepts a porch written with a leading byte order mark", () => {
    const filePath = writeYard(`\uFEFF${JSON.stringify({ porch: "http://[::1]:8741/start" })}\n`);
    expect(readYard(filePath).porch).toBe("http://[::1]:8741/start");
  });

  it("accepts the smallest positive caps and waits", () => {
    const yard = readYard(
      writeYardJson({
        porch: "https://example.com/start",
        pageCap: 1,
        depthCap: 1,
        openWaitMs: 1,
        prodWaitMs: 1,
      }),
    );
    expect(yard.pageCap).toBe(1);
    expect(yard.depthCap).toBe(1);
    expect(yard.openWaitMs).toBe(1);
    expect(yard.prodWaitMs).toBe(1);
  });
});

describe("yards that should be refused", () => {
  function refused(filePath: string): YardComplaint {
    let caught: unknown;
    try {
      readYard(filePath);
    } catch (err) {
      caught = err;
    }
    if (caught === undefined) {
      throw new Error(`expected ${filePath} to be refused`);
    }
    expect(caught).toBeInstanceOf(YardComplaint);
    if (!(caught instanceof YardComplaint)) {
      throw caught;
    }
    if (caught.complaints.length === 1) {
      expect(caught.message).toBe(`proddle: ${filePath}: ${caught.complaints.join("")}`);
    }
    return caught;
  }

  it.each(["example.com", "http://", "/only-a-path", "not a url", "://nope"])(
    "refuses a porch that is not a url (%j)",
    (porch) => {
      const err = refused(writeYardJson({ porch }));
      expect(err.complaints).toEqual([`porch is not a url (${JSON.stringify(porch)})`]);
    },
  );

  it("refuses a blank porch", () => {
    const err = refused(writeYardJson({ porch: "   " }));
    expect(err.complaints).toEqual(["porch is blank"]);
  });

  it.each([
    "ftp://example.com/a",
    "file:///tmp/x",
    "javascript:alert(1)",
    "mailto:a@b.c",
    "ws://example.com",
  ])("refuses a non-http porch %s", (porch) => {
    const scheme = new URL(porch).protocol.replace(/:$/, "");
    const err = refused(writeYardJson({ porch }));
    expect(err.complaints).toEqual([`porch has to be http or https, got ${scheme}`]);
  });

  it.each([
    [12, "porch has to be a string, got 12"],
    [null, "porch has to be a string, got null"],
    [["https://example.com/"], "porch has to be a string, got a list"],
    [{ href: "https://example.com/" }, "porch has to be a string, got an object"],
    [false, "porch has to be a string, got false"],
  ] as const)("refuses a porch of the wrong type", (porch, complaint) => {
    const err = refused(writeYardJson({ porch }));
    expect(err.complaints).toEqual([complaint]);
  });

  it("refuses a yard with no porch", () => {
    const err = refused(writeYardJson({ pageCap: 4 }));
    expect(err.complaints).toEqual(["porch is missing"]);
  });

  it.each([
    ["pageCap", 0, "pageCap has to be positive, got 0"],
    ["pageCap", -2, "pageCap has to be positive, got -2"],
    ["depthCap", 0, "depthCap has to be positive, got 0"],
    ["depthCap", -1, "depthCap has to be positive, got -1"],
    ["openWaitMs", 0, "openWaitMs has to be positive, got 0"],
    ["prodWaitMs", -8, "prodWaitMs has to be positive, got -8"],
  ] as const)("refuses a non-positive %s (%s)", (key, value, complaint) => {
    const err = refused(writeYardJson({ porch: "https://example.com/", [key]: value }));
    expect(err.complaints).toEqual([complaint]);
  });

  it.each([
    ["pageCap", "20", 'pageCap has to be a number, got "20"'],
    ["depthCap", true, "depthCap has to be a number, got true"],
    ["openWaitMs", null, "openWaitMs has to be a number, got null"],
    ["prodWaitMs", [], "prodWaitMs has to be a number, got a list"],
    ["pageCap", { n: 1 }, "pageCap has to be a number, got an object"],
  ] as const)("refuses a %s of the wrong type", (key, value, complaint) => {
    const err = refused(writeYardJson({ porch: "https://example.com/", [key]: value }));
    expect(err.complaints).toEqual([complaint]);
  });

  it.each([
    ["pageCap", 1.5],
    ["depthCap", 2.2],
    ["openWaitMs", 0.5],
    ["prodWaitMs", 8.1],
  ] as const)("refuses a fractional %s", (key, value) => {
    const err = refused(writeYardJson({ porch: "https://example.com/", [key]: value }));
    expect(err.complaints).toEqual([`${key} has to be a whole number, got ${value}`]);
  });

  it.each(["leashWords", "leashSelectors"] as const)(
    "refuses %s when it is not a list",
    (key) => {
      const err = refused(writeYardJson({ porch: "https://example.com/", [key]: "delete" }));
      expect(err.complaints).toEqual([`${key} has to be a list of strings, got "delete"`]);
    },
  );

  it.each(["leashWords", "leashSelectors"] as const)(
    "refuses a non-string entry in %s",
    (key) => {
      const err = refused(writeYardJson({ porch: "https://example.com/", [key]: ["keep", 4] }));
      expect(err.complaints).toEqual([`${key}[1] has to be a string, got 4`]);
    },
  );

  it.each(["leashWords", "leashSelectors"] as const)("refuses a blank entry in %s", (key) => {
    const err = refused(writeYardJson({ porch: "https://example.com/", [key]: ["  "] }));
    expect(err.complaints).toEqual([`${key}[0] is blank`]);
  });

  it("refuses an unknown key", () => {
    const err = refused(
      writeYardJson({ porch: "https://example.com/", startUrl: "https://example.com/" }),
    );
    expect(err.complaints).toEqual(['unknown key "startUrl"']);
  });

  it("lists every problem in the yard", () => {
    const filePath = writeYardJson({
      wander: true,
      pagecap: 3,
      pageCap: 0,
      depthCap: "deep",
      openWaitMs: 1.5,
      prodWaitMs: -1,
      leashWords: ["ok", 2, "  "],
      leashSelectors: "a",
    });
    const err = refused(filePath);
    expect(err.complaints).toEqual([
      'unknown key "wander"',
      'unknown key "pagecap"',
      "porch is missing",
      "pageCap has to be positive, got 0",
      'depthCap has to be a number, got "deep"',
      "openWaitMs has to be a whole number, got 1.5",
      "prodWaitMs has to be positive, got -1",
      "leashWords[1] has to be a string, got 2",
      "leashWords[2] is blank",
      'leashSelectors has to be a list of strings, got "a"',
    ]);
    expect(err.message).toBe(
      `proddle: ${filePath}: the yard has problems.\n${err.complaints
        .map((line) => `- ${line}`)
        .join("\n")}`,
    );
  });

  it.each([
    ["[]", "a list"],
    ["null", "null"],
    ['"porch"', '"porch"'],
    ["4", "4"],
    ["true", "true"],
  ])("refuses a yard that is not an object (%j)", (body, got) => {
    const err = refused(writeYard(body));
    expect(err.complaints).toEqual([`a yard has to be a json object, got ${got}`]);
  });

  it.each(["{", "", "   ", "porch"])("refuses a file that is not json (%j)", (body) => {
    const err = refused(writeYard(body));
    expect(err.complaints).toEqual(["the file is not json"]);
  });

  it("refuses a missing yard file", () => {
    const filePath = join(scratchDir(), "missing.yard.json");
    const err = refused(filePath);
    expect(err.complaints).toEqual(["no yard file at that path"]);
  });

  it("refuses a directory", () => {
    const err = refused(scratchDir());
    expect(err.complaints).toEqual(["that path is a directory"]);
  });
});
