import { describe, expect, it } from "vitest";
import { amble, type ReadLinks } from "./amble.js";

function fakeSite(pages: Record<string, readonly string[]>): {
  readLinks: ReadLinks;
  reads: string[];
} {
  const reads: string[] = [];
  const readLinks: ReadLinks = async (href) => {
    reads.push(href);
    const links = pages[href];
    if (links === undefined) {
      throw new Error(`fake site has no ${href}`);
    }
    return links;
  };
  return { readLinks, reads };
}

describe("amble", () => {
  it("walks same-origin pages and skips the rest", async () => {
    const { readLinks, reads } = fakeSite({
      "https://example.com/": [
        "/about/",
        "https://example.com/docs#guide",
        "mailto:hi@example.com",
        "tel:+15550001",
        "javascript:void(0)",
        "https://other.test/nope",
        "//cdn.example.com/app",
        "pricing",
        "#top",
        "/about",
        "http://example.com/plain",
        "/blog/post",
      ],
      "https://example.com/about": ["/about/team", "https://example.com/", "/about#staff"],
      "https://example.com/docs": ["/docs/guide", "/docs/"],
      "https://example.com/pricing": ["/pricing/plans"],
      "https://example.com/blog/post": ["/blog/post/deep"],
      "https://example.com/about/team": ["/about/team/bio"],
      "https://example.com/docs/guide": [],
      "https://example.com/pricing/plans": [],
      "https://example.com/blog/post/deep": [],
      "https://example.com/about/team/bio": [],
    });

    const pages = await amble({
      porch: "https://example.com/",
      pageCap: 20,
      depthCap: 2,
      readLinks,
    });

    expect(pages).toEqual([
      { href: "https://example.com/", depth: 0 },
      { href: "https://example.com/about", depth: 1 },
      { href: "https://example.com/docs", depth: 1 },
      { href: "https://example.com/pricing", depth: 1 },
      { href: "https://example.com/blog/post", depth: 1 },
      { href: "https://example.com/about/team", depth: 2 },
      { href: "https://example.com/docs/guide", depth: 2 },
      { href: "https://example.com/pricing/plans", depth: 2 },
      { href: "https://example.com/blog/post/deep", depth: 2 },
    ]);
    expect(reads).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/docs",
      "https://example.com/pricing",
      "https://example.com/blog/post",
    ]);
  });

  it("stops once pageCap pages are open", async () => {
    const { readLinks, reads } = fakeSite({
      "https://example.com/": ["/a", "/b", "/c"],
      "https://example.com/a": ["/a/1"],
      "https://example.com/b": ["/b/1"],
      "https://example.com/c": [],
      "https://example.com/a/1": [],
    });

    const pages = await amble({
      porch: "https://example.com/",
      pageCap: 2,
      depthCap: 4,
      readLinks,
    });

    expect(pages).toEqual([
      { href: "https://example.com/", depth: 0 },
      { href: "https://example.com/a", depth: 1 },
    ]);
    expect(reads).toEqual(["https://example.com/"]);
  });

  it.each([
    [1, ["https://example.com/", "https://example.com/a"]],
    [2, ["https://example.com/", "https://example.com/a", "https://example.com/a/b"]],
    [3, ["https://example.com/", "https://example.com/a", "https://example.com/a/b", "https://example.com/a/b/c"]],
  ] as const)("depthCap %i stops the chain", async (depthCap, hrefs) => {
    const { readLinks } = fakeSite({
      "https://example.com/": ["/a"],
      "https://example.com/a": ["/a/b"],
      "https://example.com/a/b": ["/a/b/c"],
      "https://example.com/a/b/c": [],
    });

    const pages = await amble({
      porch: "https://example.com/",
      pageCap: 10,
      depthCap,
      readLinks,
    });

    expect(pages.map((page) => page.href)).toEqual([...hrefs]);
    expect(pages.map((page) => page.depth)).toEqual(hrefs.map((_, index) => index));
  });

  it("opens the porch without its hash or trailing slash", async () => {
    const { readLinks, reads } = fakeSite({
      "https://example.com/docs": ["/docs/guide"],
      "https://example.com/docs/guide": [],
    });

    const pages = await amble({
      porch: "https://Example.com/docs/#readme",
      pageCap: 5,
      depthCap: 1,
      readLinks,
    });

    expect(pages.map((page) => page.href)).toEqual([
      "https://example.com/docs",
      "https://example.com/docs/guide",
    ]);
    expect(reads).toEqual(["https://example.com/docs"]);
  });

  it("lets a read failure through", async () => {
    const readLinks: ReadLinks = async () => {
      throw new Error("boom");
    };

    await expect(
      amble({
        porch: "https://example.com/",
        pageCap: 5,
        depthCap: 2,
        readLinks,
      }),
    ).rejects.toThrow("boom");
  });
});
