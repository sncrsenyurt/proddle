import { describe, expect, it } from "vitest";
import { buildSelector, type SelectorHint } from "./selector.js";

function hint(over: Partial<SelectorHint> = {}): SelectorHint {
  return {
    id: "",
    idUnique: false,
    testId: "",
    testIdUnique: false,
    ariaLabel: "",
    ariaUnique: false,
    role: "",
    name: "",
    roleNameUnique: false,
    text: "",
    textUnique: false,
    path: "body > button",
    ...over,
  };
}

describe("buildSelector", () => {
  it.each([
    ["save", "#save"],
    ["a b", "#a\\ b"],
    ["0", "#\\30 "],
    ["0a", "#\\30 a"],
    ["save:btn", "#save\\:btn"],
    ["a.b", "#a\\.b"],
    ["--ok", "#--ok"],
    ["()[]{}", "#\\(\\)\\[\\]\\{\\}"],
    ["-", "#\\-"],
    ["-1", "#-\\31 "],
    ["a\\b", "#a\\\\b"],
    ["foo#bar", "#foo\\#bar"],
  ] as const)("uses an id %j", (id, selector) => {
    expect(buildSelector(hint({ id, idUnique: true, testId: "other", testIdUnique: true }))).toBe(selector);
  });

  it("skips an id that is not unique", () => {
    expect(buildSelector(hint({ id: "save", idUnique: false, testId: "save", testIdUnique: true }))).toBe(
      '[data-testid="save"]',
    );
  });

  it("uses a test id before an aria-label", () => {
    expect(
      buildSelector(
        hint({
          testId: "save",
          testIdUnique: true,
          ariaLabel: "Save",
          ariaUnique: true,
        }),
      ),
    ).toBe('[data-testid="save"]');
  });

  it("quotes a test id", () => {
    expect(buildSelector(hint({ testId: 'say "hi"', testIdUnique: true }))).toBe('[data-testid="say \\"hi\\""]');
  });

  it("uses an aria-label before the role", () => {
    expect(
      buildSelector(
        hint({
          ariaLabel: "Close",
          ariaUnique: true,
          role: "button",
          name: "Close",
          roleNameUnique: true,
        }),
      ),
    ).toBe('[aria-label="Close"]');
  });

  it("uses the role and name when the aria-label is shared", () => {
    expect(
      buildSelector(
        hint({
          ariaLabel: "Close",
          ariaUnique: false,
          role: "button",
          name: "Close",
          roleNameUnique: true,
        }),
      ),
    ).toBe('internal:role=button[name="Close"s]');
  });

  it("quotes a role name", () => {
    expect(buildSelector(hint({ role: "button", name: 'say "hi"', roleNameUnique: true }))).toBe(
      'internal:role=button[name="say \\"hi\\""s]',
    );
  });

  it("collapses the role name", () => {
    expect(buildSelector(hint({ role: "link", name: "  Docs\npage  ", roleNameUnique: true }))).toBe(
      'internal:role=link[name="Docs page"s]',
    );
  });

  it.each([
    [{ role: "Button", name: "Save", roleNameUnique: true }],
    [{ role: "button", name: "", roleNameUnique: true }],
    [{ role: "button", name: "Save", roleNameUnique: false }],
    [{ role: "button", name: "a >> b", roleNameUnique: true }],
    [{ role: "", name: "Save", roleNameUnique: true }],
  ])("skips a role it cannot trust", (over) => {
    expect(buildSelector(hint({ ...over, text: "Save", textUnique: true }))).toBe('internal:text="Save"s');
  });

  it("uses the text before the path", () => {
    expect(buildSelector(hint({ text: "Open card", textUnique: true, path: "body > div" }))).toBe(
      'internal:text="Open card"s',
    );
  });

  it("collapses the text", () => {
    expect(buildSelector(hint({ text: " Open\tcard ", textUnique: true }))).toBe('internal:text="Open card"s');
  });

  it("skips a long text", () => {
    const text = "a".repeat(81);
    expect(buildSelector(hint({ text, textUnique: true, path: "body > p" }))).toBe("body > p");
  });

  it("skips text that would break the selector", () => {
    expect(buildSelector(hint({ text: "next >>", textUnique: true, path: "body > button" }))).toBe(
      "body > button",
    );
  });

  it("falls back to the path", () => {
    expect(buildSelector(hint())).toBe("body > button");
  });

  it("uses body when nothing else is there", () => {
    expect(buildSelector(hint({ path: "" }))).toBe("body");
  });
});
