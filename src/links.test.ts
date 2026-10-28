import { describe, expect, it } from "vitest";
import { canonicalHref, resolveLink } from "./links.js";

describe("canonicalHref", () => {
  it("drops the hash and a trailing slash", () => {
    expect(canonicalHref("https://Example.COM/docs/#top")).toBe("https://example.com/docs");
    expect(canonicalHref("https://example.com/docs///")).toBe("https://example.com/docs");
  });

  it("keeps the slash on the root", () => {
    expect(canonicalHref("https://example.com")).toBe("https://example.com/");
    expect(canonicalHref("https://example.com/")).toBe("https://example.com/");
    expect(canonicalHref("https://example.com//")).toBe("https://example.com/");
  });

  it("treats a bare question mark as no query", () => {
    expect(canonicalHref("https://example.com/docs?")).toBe("https://example.com/docs");
    expect(canonicalHref("https://example.com/docs/?")).toBe("https://example.com/docs");
  });

  it("keeps a real query and folds the default port", () => {
    expect(canonicalHref("https://example.com:443/a/?q=1#x")).toBe("https://example.com/a?q=1");
    expect(canonicalHref("https://example.com/a?b=1&c=2")).toBe("https://example.com/a?b=1&c=2");
  });

  it("keeps an ipv6 host intact", () => {
    expect(canonicalHref("http://[::1]:8741/start/")).toBe("http://[::1]:8741/start");
  });
});

describe("resolveLink", () => {
  const from = "https://example.com/docs/intro";

  it("resolves relative links on the same origin", () => {
    expect(resolveLink(from, "guide")).toBe("https://example.com/docs/guide");
    expect(resolveLink(from, "/pricing/")).toBe("https://example.com/pricing");
    expect(resolveLink(from, "../about")).toBe("https://example.com/about");
    expect(resolveLink("https://example.com/", "pricing")).toBe("https://example.com/pricing");
  });

  it("drops the hash and collapses a trailing slash", () => {
    expect(resolveLink(from, "/docs/intro/#staff")).toBe("https://example.com/docs/intro");
    expect(resolveLink("https://example.com/docs/", "/docs")).toBe("https://example.com/docs");
    expect(resolveLink(from, "HTTPS://EXAMPLE.COM/Docs/")).toBe("https://example.com/Docs");
  });

  it("keeps a protocol-relative link on the same host", () => {
    expect(resolveLink(from, "//example.com/pricing/")).toBe("https://example.com/pricing");
  });

  it("keeps the query", () => {
    expect(resolveLink(from, "/search?q=dog#hit")).toBe("https://example.com/search?q=dog");
    expect(resolveLink(from, "/search?q=dog")).not.toBe(resolveLink(from, "/search?q=cat"));
  });

  it.each([
    "mailto:a@b.c",
    "MAILTO:a@b.c",
    "tel:+15551212",
    "javascript:void(0)",
    "JavaScript:alert(1)",
    "  javascript:void(0)  ",
    "data:text/plain,hi",
    "ftp://example.com/a",
  ])("ignores %s", (raw) => {
    expect(resolveLink(from, raw)).toBeUndefined();
  });

  it("ignores another origin", () => {
    expect(resolveLink(from, "https://other.test/a")).toBeUndefined();
    expect(resolveLink(from, "http://example.com/docs/intro")).toBeUndefined();
    expect(resolveLink(from, "https://example.com:8443/docs")).toBeUndefined();
    expect(resolveLink(from, "https://www.example.com/docs")).toBeUndefined();
    expect(resolveLink(from, "//cdn.example.com/app")).toBeUndefined();
  });

  it("ignores a blank or unusable href", () => {
    expect(resolveLink(from, "   ")).toBeUndefined();
    expect(resolveLink(from, "http://[")).toBeUndefined();
  });

  it("resolves a link from an ipv6 porch", () => {
    expect(resolveLink("http://[::1]:8741/start", "/next")).toBe("http://[::1]:8741/next");
  });
});
