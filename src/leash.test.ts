import { describe, expect, it } from "vitest";
import { leashHold, type LeashSurface } from "./leash.js";
import { builtInLeashWords } from "./yard.js";

function surface(over: Partial<LeashSurface> = {}): LeashSurface {
  return {
    text: "",
    ariaLabel: "",
    title: "",
    value: "",
    href: "",
    ...over,
  };
}

describe("leashHold", () => {
  it.each(builtInLeashWords)("holds the built-in word %j", (word) => {
    expect(leashHold(surface({ text: word.toUpperCase() }), builtInLeashWords)).toBe(
      `word ${JSON.stringify(word)}`,
    );
  });

  it.each([
    ["text", "Please log out now", "log out"],
    ["ariaLabel", "Sign-out", "sign out"],
    ["title", "remove item", "remove"],
    ["value", "Buy now", "buy"],
    ["href", "https://shop.example/check-out", "checkout"],
  ] as const)("matches %s against %j", (field, value, word) => {
    expect(leashHold(surface({ [field]: value }), builtInLeashWords)).toBe(`word ${JSON.stringify(word)}`);
  });

  it("matches a phrase with extra spaces", () => {
    expect(leashHold(surface({ text: "Cancel   subscription" }), builtInLeashWords)).toBe(
      'word "cancel subscription"',
    );
  });

  it("matches the stuck form of a phrase", () => {
    expect(leashHold(surface({ href: "https://shop.example/signout" }), builtInLeashWords)).toBe(
      'word "sign out"',
    );
    expect(leashHold(surface({ text: "cancel_subscription" }), builtInLeashWords)).toBe(
      'word "cancel subscription"',
    );
  });

  it("lets the earlier word win", () => {
    expect(leashHold(surface({ text: "delete this purchase" }), builtInLeashWords)).toBe('word "delete"');
  });

  it.each(["paper", "paypal", "payment", "repay", "buyer", "cancel subscriptions"])(
    "leaves %j alone",
    (text) => {
      expect(leashHold(surface({ text }), builtInLeashWords)).toBeUndefined();
    },
  );

  it("leaves a href that merely contains pay", () => {
    expect(leashHold(surface({ href: "https://example.com/paper" }), builtInLeashWords)).toBeUndefined();
  });

  it("holds a pay link", () => {
    expect(leashHold(surface({ href: "https://shop.example/pay?q=1" }), builtInLeashWords)).toBe(
      'word "pay"',
    );
  });

  it("uses a leash selector when no word hits", () => {
    expect(leashHold(surface({ text: "Stay" }), builtInLeashWords, [" .bye "])).toBe('selector ".bye"');
  });

  it("lets a word beat a selector", () => {
    expect(leashHold(surface({ text: "Delete" }), ["delete"], [".bye"])).toBe('word "delete"');
  });

  it("uses the first selector", () => {
    expect(leashHold(surface({ text: "Stay" }), [], [".bye", ".other"])).toBe('selector ".bye"');
  });

  it("ignores a blank word and a blank selector", () => {
    expect(leashHold(surface({ text: "Stay" }), ["  "], ["  "])).toBeUndefined();
  });

  it("holds an extra word from the yard", () => {
    expect(leashHold(surface({ text: "Archive this" }), ["archive"])).toBe('word "archive"');
  });

  it("reports a hyphenated extra word in its spaced form", () => {
    expect(leashHold(surface({ text: "sign out" }), ["Sign-Out"])).toBe('word "sign out"');
  });
});
