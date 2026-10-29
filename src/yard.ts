import { readFileSync } from "node:fs";

export const builtInLeashWords = [
  "delete",
  "remove",
  "logout",
  "log out",
  "sign out",
  "buy",
  "pay",
  "checkout",
  "purchase",
  "unsubscribe",
  "deactivate",
  "cancel subscription",
] as const;

export const countDefaults = {
  pageCap: 20,
  depthCap: 2,
  openWaitMs: 15000,
  prodWaitMs: 8000,
} as const;

type CountKey = keyof typeof countDefaults;

const knownKeys = new Set<string>([
  "porch",
  "pageCap",
  "depthCap",
  "leashWords",
  "leashSelectors",
  "openWaitMs",
  "prodWaitMs",
]);

export type Yard = {
  porch: string;
  pageCap: number;
  depthCap: number;
  leashWords: readonly string[];
  leashSelectors: readonly string[];
  openWaitMs: number;
  prodWaitMs: number;
};

export class YardComplaint extends Error {
  readonly complaints: readonly string[];

  constructor(filePath: string, complaints: readonly string[]) {
    super(formatComplaint(filePath, complaints));
    this.name = "YardComplaint";
    this.complaints = complaints;
  }
}

export function readYard(filePath: string): Yard {
  const text = readYardText(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new YardComplaint(filePath, ["the file is not json"]);
  }

  const complaints: string[] = [];
  const record = takeRecord(parsed, complaints);
  if (record === undefined) {
    throw new YardComplaint(filePath, complaints);
  }

  noteUnknownKeys(record, complaints);
  const porch = takePorch(record, complaints);
  const pageCap = takePositiveWhole(record, "pageCap", countDefaults.pageCap, complaints);
  const depthCap = takePositiveWhole(record, "depthCap", countDefaults.depthCap, complaints);
  const openWaitMs = takePositiveWhole(
    record,
    "openWaitMs",
    countDefaults.openWaitMs,
    complaints,
  );
  const prodWaitMs = takePositiveWhole(
    record,
    "prodWaitMs",
    countDefaults.prodWaitMs,
    complaints,
  );
  const leashWords = takeStringList(record, "leashWords", complaints);
  const leashSelectors = takeStringList(record, "leashSelectors", complaints);

  if (complaints.length > 0 || porch === undefined) {
    throw new YardComplaint(filePath, complaints);
  }

  return {
    porch,
    pageCap,
    depthCap,
    leashWords: mergeLeashWords(leashWords),
    leashSelectors: dedupe(leashSelectors),
    openWaitMs,
    prodWaitMs,
  };
}

function formatComplaint(filePath: string, complaints: readonly string[]): string {
  if (complaints.length === 1) {
    return `proddle: ${filePath}: ${complaints.join("")}`;
  }
  const lines = complaints.map((line) => `- ${line}`).join("\n");
  return `proddle: ${filePath}: the yard has problems.\n${lines}`;
}

function readYardText(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  } catch (err) {
    const code = systemCode(err);
    if (code === "ENOENT") {
      throw new YardComplaint(filePath, ["no yard file at that path"]);
    }
    if (code === "EISDIR") {
      throw new YardComplaint(filePath, ["that path is a directory"]);
    }
    const suffix = code === undefined ? "" : ` (${code})`;
    throw new YardComplaint(filePath, [`could not read the yard file${suffix}`]);
  }
}

function systemCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = err.code;
  return typeof code === "string" ? code : undefined;
}

function takeRecord(value: unknown, complaints: string[]): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    complaints.push(`a yard has to be a json object, got ${describeValue(value)}`);
    return undefined;
  }
  return value as Record<string, unknown>;
}

function noteUnknownKeys(record: Record<string, unknown>, complaints: string[]): void {
  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key)) {
      complaints.push(`unknown key ${JSON.stringify(key)}`);
    }
  }
}

function takePorch(record: Record<string, unknown>, complaints: string[]): string | undefined {
  if (!Object.hasOwn(record, "porch")) {
    complaints.push("porch is missing");
    return undefined;
  }
  const value = record.porch;
  if (typeof value !== "string") {
    complaints.push(`porch has to be a string, got ${describeValue(value)}`);
    return undefined;
  }
  const text = value.trim();
  if (text === "") {
    complaints.push("porch is blank");
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    complaints.push(`porch is not a url (${JSON.stringify(text)})`);
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const scheme = url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol;
    complaints.push(`porch has to be http or https, got ${scheme}`);
    return undefined;
  }
  return url.href;
}

function takePositiveWhole(
  record: Record<string, unknown>,
  key: CountKey,
  fallback: number,
  complaints: string[],
): number {
  if (!Object.hasOwn(record, key)) {
    return fallback;
  }
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    complaints.push(`${key} has to be a number, got ${describeValue(value)}`);
    return fallback;
  }
  if (!Number.isInteger(value)) {
    complaints.push(`${key} has to be a whole number, got ${value}`);
    return fallback;
  }
  if (value <= 0) {
    complaints.push(`${key} has to be positive, got ${value}`);
    return fallback;
  }
  return value;
}

function takeStringList(
  record: Record<string, unknown>,
  key: "leashWords" | "leashSelectors",
  complaints: string[],
): string[] {
  if (!Object.hasOwn(record, key)) {
    return [];
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    complaints.push(`${key} has to be a list of strings, got ${describeValue(value)}`);
    return [];
  }
  const items: readonly unknown[] = value;
  const kept: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (typeof item !== "string") {
      complaints.push(`${key}[${index}] has to be a string, got ${describeValue(item)}`);
      continue;
    }
    const trimmed = item.trim();
    if (trimmed === "") {
      complaints.push(`${key}[${index}] is blank`);
      continue;
    }
    kept.push(key === "leashWords" ? trimmed.toLowerCase() : trimmed);
  }
  return kept;
}

function mergeLeashWords(userWords: readonly string[]): string[] {
  const seen = new Set<string>(builtInLeashWords);
  const merged: string[] = [...builtInLeashWords];
  for (const word of userWords) {
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    merged.push(word);
  }
  return merged;
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    kept.push(value);
  }
  return kept;
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "undefined":
      return "nothing";
    default:
      return "an object";
  }
}
