import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readArgs, WalkComplaint } from "./args.js";
import { builtInLeashWords, YardComplaint } from "./yard.js";

const porchYardPath = fileURLToPath(new URL("../yards/porch.yard.json", import.meta.url));

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "proddle-args-"));
  dirs.push(dir);
  return dir;
}

function writeYardJson(value: unknown): string {
  const filePath = join(scratchDir(), "site.yard.json");
  writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
  return filePath;
}

describe("readArgs", () => {
  it("uses the default caps for a bare url", () => {
    expect(readArgs(["  https://Example.COM/docs/#top  "])).toEqual({
      porch: "https://example.com/docs",
      pageCap: 20,
      depthCap: 2,
      openWaitMs: 15000,
      leashWords: [...builtInLeashWords],
      leashSelectors: [],
    });
  });

  it("walks the porch from a yard file", () => {
    const filePath = writeYardJson({
      porch: "https://example.com/start/#top",
      pageCap: 4,
      depthCap: 1,
      openWaitMs: 3000,
    });

    expect(readArgs([filePath])).toEqual({
      porch: "https://example.com/start",
      pageCap: 4,
      depthCap: 1,
      openWaitMs: 3000,
      leashWords: [...builtInLeashWords],
      leashSelectors: [],
    });
  });

  it("reads the sample porch yard", () => {
    expect(readArgs([porchYardPath])).toEqual({
      porch: "http://127.0.0.1:8741/",
      pageCap: 20,
      depthCap: 2,
      openWaitMs: 15000,
      leashWords: [...builtInLeashWords],
      leashSelectors: [],
    });
  });

  it("lets the url win and takes the caps from the yard", () => {
    const filePath = writeYardJson({
      porch: "https://other.test/ignored/",
      pageCap: 7,
      depthCap: 3,
    });

    expect(readArgs(["http://example.com/a/", filePath])).toEqual({
      porch: "http://example.com/a",
      pageCap: 7,
      depthCap: 3,
      openWaitMs: 15000,
      leashWords: [...builtInLeashWords],
      leashSelectors: [],
    });
  });

  it("refuses to run with no arguments", () => {
    expect(() => readArgs([])).toThrow(WalkComplaint);
    expect(() => readArgs(["  "])).toThrow("proddle: pass a url, or a path to a yard file.");
  });

  it("refuses extra arguments", () => {
    expect(() => readArgs(["https://example.com/", "a.json", "b.json"])).toThrow(
      "proddle: pass a url and an optional yard file.",
    );
    expect(() => readArgs(["yards/porch.yard.json", "https://example.com/"])).toThrow(
      "proddle: pass a url and an optional yard file.",
    );
  });

  it("refuses a url that is not http", () => {
    expect(() => readArgs(["ftp://example.com/a"])).toThrow(WalkComplaint);
    expect(() => readArgs(["mailto:a@b.c"])).toThrow("proddle: the start url has to be http or https.");
    expect(() => readArgs(["ftp://example.com/a", porchYardPath])).toThrow(
      "proddle: the start url has to be http or https.",
    );
  });

  it("adds leash words and selectors from the flags", () => {
    const filePath = writeYardJson({
      porch: "https://example.com/ignored",
      leashWords: ["archive"],
      leashSelectors: [".old"],
    });

    expect(
      readArgs([
        "--leash",
        "Archive",
        "--leash",
        "cancel plan",
        "https://example.com/start",
        "--leash-selector",
        ".bye",
        filePath,
        "--leash-selector=.old",
        "--leash=log out",
      ]),
    ).toEqual({
      porch: "https://example.com/start",
      pageCap: 20,
      depthCap: 2,
      openWaitMs: 15000,
      leashWords: [...builtInLeashWords, "archive", "cancel plan"],
      leashSelectors: [".old", ".bye"],
    });
  });

  it("keeps a selector's case", () => {
    expect(readArgs(["https://example.com/", "--leash-selector", " #Pay "]).leashSelectors).toEqual(["#Pay"]);
  });

  it("refuses an unknown flag", () => {
    expect(() => readArgs(["--page-cap", "3", "https://example.com/"])).toThrow(
      'proddle: unknown flag "--page-cap".',
    );
  });

  it("refuses a flag with no value", () => {
    expect(() => readArgs(["https://example.com/", "--leash"])).toThrow("proddle: --leash needs a word.");
    expect(() => readArgs(["--leash="])).toThrow("proddle: --leash needs a word.");
    expect(() => readArgs(["https://example.com/", "--leash-selector", "   "])).toThrow(
      "proddle: --leash-selector needs a selector.",
    );
    expect(() => readArgs(["--leash", "--leash-selector", ".bye", "https://example.com/"])).toThrow(
      "proddle: --leash needs a word.",
    );
  });

  it("still wants a url when the only arguments are flags", () => {
    expect(() => readArgs(["--leash", "archive"])).toThrow("proddle: pass a url, or a path to a yard file.");
  });

  it("treats arguments after -- as paths", () => {
    expect(readArgs(["--", "https://example.com/docs/"]).porch).toBe("https://example.com/docs");
  });

  it("still refuses a bad yard", () => {
    const filePath = join(scratchDir(), "missing.yard.json");
    expect(() => readArgs([filePath])).toThrow(YardComplaint);
    expect(() => readArgs([filePath])).toThrow("no yard file at that path");
  });
});
