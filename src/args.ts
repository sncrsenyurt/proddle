import { canonicalHref } from "./links.js";
import { countDefaults, joinLeash, readYard, type Yard } from "./yard.js";

export type WalkPlan = {
  porch: string;
  pageCap: number;
  depthCap: number;
  openWaitMs: number;
  prodWaitMs: number;
  leashWords: readonly string[];
  leashSelectors: readonly string[];
};

export class WalkComplaint extends Error {
  constructor(message: string) {
    super(`proddle: ${message}`);
    this.name = "WalkComplaint";
  }
}

export function readArgs(argv: readonly string[]): WalkPlan {
  const pulled = pullFlags(argv.map((arg) => arg.trim()).filter((arg) => arg !== ""));
  const args = pulled.positionals;
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
    const yard = second === undefined ? undefined : readYard(second);
    return planFrom(canonicalHref(parsed.href), yard, pulled.words, pulled.selectors);
  }

  if (second !== undefined) {
    throw new WalkComplaint("pass a url and an optional yard file.");
  }

  const yard = readYard(first);
  return planFrom(canonicalHref(yard.porch), yard, pulled.words, pulled.selectors);
}

function planFrom(
  porch: string,
  yard: Yard | undefined,
  words: readonly string[],
  selectors: readonly string[],
): WalkPlan {
  const leash = joinLeash(
    [...(yard?.leashWords ?? []), ...words],
    [...(yard?.leashSelectors ?? []), ...selectors],
  );
  return {
    porch,
    pageCap: yard?.pageCap ?? countDefaults.pageCap,
    depthCap: yard?.depthCap ?? countDefaults.depthCap,
    openWaitMs: yard?.openWaitMs ?? countDefaults.openWaitMs,
    prodWaitMs: yard?.prodWaitMs ?? countDefaults.prodWaitMs,
    leashWords: leash.leashWords,
    leashSelectors: leash.leashSelectors,
  };
}

function pullFlags(args: readonly string[]): {
  positionals: string[];
  words: string[];
  selectors: string[];
} {
  const positionals: string[] = [];
  const words: string[] = [];
  const selectors: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    const word = readFlag(arg, "--leash", args, index);
    if (word !== undefined) {
      words.push(requireFlag("--leash", "a word", word.value));
      index += word.skip;
      continue;
    }
    const selector = readFlag(arg, "--leash-selector", args, index);
    if (selector !== undefined) {
      selectors.push(requireFlag("--leash-selector", "a selector", selector.value));
      index += selector.skip;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new WalkComplaint(`unknown flag ${JSON.stringify(arg)}.`);
    }
    positionals.push(arg);
  }
  return { positionals, words, selectors };
}

function readFlag(
  arg: string,
  name: string,
  args: readonly string[],
  index: number,
): { value: string; skip: number } | undefined {
  if (arg === name) {
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) return { value: "", skip: 0 };
    return { value: next, skip: 1 };
  }
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) return { value: arg.slice(prefix.length), skip: 0 };
  return undefined;
}

function requireFlag(flag: string, noun: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new WalkComplaint(`${flag} needs ${noun}.`);
  return trimmed;
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
