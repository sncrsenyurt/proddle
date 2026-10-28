import { canonicalHref, resolveLink } from "./links.js";

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
