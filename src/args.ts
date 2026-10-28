import { canonicalHref } from "./links.js";
import { countDefaults, readYard } from "./yard.js";

export type WalkPlan = {
  porch: string;
  pageCap: number;
  depthCap: number;
  openWaitMs: number;
};

export class WalkComplaint extends Error {
  constructor(message: string) {
    super(`proddle: ${message}`);
    this.name = "WalkComplaint";
  }
}

export function readArgs(argv: readonly string[]): WalkPlan {
  const args = argv.map((arg) => arg.trim()).filter((arg) => arg !== "");
  const first = args[0];
  if (first === undefined) {
    throw new WalkComplaint("pass a url, or a path to a yard file.");
  }
  if (args.length > 2) {
    throw new WalkComplaint("pass a url and an optional yard file.");
  }

  const parsed = parseUrl(first);
  if (parsed !== undefined && parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WalkComplaint("the start url has to be http or https.");
  }

  const second = args[1];
  if (parsed !== undefined) {
    const porch = canonicalHref(parsed.href);
    if (second === undefined) {
      return {
        porch,
        pageCap: countDefaults.pageCap,
        depthCap: countDefaults.depthCap,
        openWaitMs: countDefaults.openWaitMs,
      };
    }
    const yard = readYard(second);
    return {
      porch,
      pageCap: yard.pageCap,
      depthCap: yard.depthCap,
      openWaitMs: yard.openWaitMs,
    };
  }

  if (second !== undefined) {
    throw new WalkComplaint("pass a url and an optional yard file.");
  }

  const yard = readYard(first);
  return {
    porch: canonicalHref(yard.porch),
    pageCap: yard.pageCap,
    depthCap: yard.depthCap,
    openWaitMs: yard.openWaitMs,
  };
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
