export function canonicalHref(href: string): string {
  return normalize(new URL(href));
}

type ReadLink =
  | { kind: "page"; href: string }
  | { kind: "other origin"; href: string }
  | { kind: "not http"; href: string };

function readLink(fromHref: string, raw: string): ReadLink | undefined {
  const text = raw.trim();
  if (text === "") return undefined;

  let url: URL;
  try {
    url = new URL(text, fromHref);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "not http", href: text };
  }
  const from = new URL(fromHref);
  if (url.origin !== from.origin) {
    return { kind: "other origin", href: url.href };
  }
  return { kind: "page", href: normalize(url) };
}

export function resolveLink(fromHref: string, raw: string): string | undefined {
  const read = readLink(fromHref, raw);
  if (read === undefined || read.kind !== "page") return undefined;
  return read.href;
}

export function linkSkip(
  fromHref: string,
  raw: string,
): { href: string; why: "other origin" | "not http" } | undefined {
  const read = readLink(fromHref, raw);
  if (read === undefined || read.kind === "page") return undefined;
  return { href: read.href, why: read.kind };
}

function normalize(url: URL): string {
  url.hash = "";
  // href keeps a lone "?", even though search is empty
  if (url.search === "") {
    url.search = "";
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const trimmed = url.pathname.replace(/\/+$/, "");
    url.pathname = trimmed === "" ? "/" : trimmed;
  }
  return url.href;
}
