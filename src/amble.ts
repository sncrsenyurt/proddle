import { canonicalHref, linkSkip, resolveLink } from "./links.js";

export type AmblePage = {
  href: string;
  depth: number;
};

export type ReadLinks = (href: string) => Promise<readonly string[]>;

export async function amble(input: {
  porch: string;
  pageCap: number;
  depthCap: number;
  readLinks: ReadLinks;
}): Promise<AmblePage[]> {
  const start = canonicalHref(input.porch);
  const seen = new Set<string>([start]);
  const queued: AmblePage[] = [{ href: start, depth: 0 }];
  const found: AmblePage[] = [];

  let next = queued.shift();
  while (next !== undefined && found.length < input.pageCap) {
    found.push(next);
    if (found.length < input.pageCap && next.depth < input.depthCap) {
      const rawLinks = await input.readLinks(next.href);
      for (const raw of rawLinks) {
        const href = resolveLink(next.href, raw);
        if (href === undefined || seen.has(href)) {
          continue;
        }
        seen.add(href);
        queued.push({ href, depth: next.depth + 1 });
      }
    }
    next = queued.shift();
  }

  return found;
}

export type SkipWhy = "page cap" | "depth cap" | "other origin" | "not http";

export type SkippedPage = {
  href: string;
  from: string;
  why: SkipWhy;
};

export function skippedPages(
  pages: readonly AmblePage[],
  hrefsByPage: ReadonlyMap<string, readonly string[]>,
  depthCap: number,
): SkippedPage[] {
  const opened = new Set(pages.map((page) => page.href));
  const skipped: SkippedPage[] = [];
  const seen = new Set<string>();
  const capped = new Map<string, { from: string; shallow: boolean }>();

  const push = (item: SkippedPage): void => {
    const key = `${item.why}\n${item.from}\n${item.href}`;
    if (seen.has(key)) return;
    seen.add(key);
    skipped.push(item);
  };

  for (const page of pages) {
    const raws = hrefsByPage.get(page.href) ?? [];
    const shallow = page.depth < depthCap;
    for (const raw of raws) {
      const href = resolveLink(page.href, raw);
      if (href !== undefined) {
        if (opened.has(href)) continue;
        const have = capped.get(href);
        if (have === undefined) capped.set(href, { from: page.href, shallow });
        else if (!have.shallow && shallow) {
          have.from = page.href;
          have.shallow = true;
        }
        continue;
      }
      const rejected = linkSkip(page.href, raw);
      if (rejected === undefined) continue;
      push({ href: rejected.href, from: page.href, why: rejected.why });
    }
  }

  for (const [href, item] of capped) {
    push({ href, from: item.from, why: item.shallow ? "page cap" : "depth cap" });
  }
  return skipped;
}
