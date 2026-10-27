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
});
