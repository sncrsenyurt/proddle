export function canonicalHref(href: string): string {
  return normalize(new URL(href));
}

export function resolveLink(fromHref: string, raw: string): string | undefined {
  const text = raw.trim();
  if (text === "") {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(text, fromHref);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }

  const from = new URL(fromHref);
  if (url.origin !== from.origin) {
    return undefined;
  }
  return normalize(url);
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
