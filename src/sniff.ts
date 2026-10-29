import { leashHold } from "./leash.js";
import { buildSelector, type SelectorHint } from "./selector.js";
import { builtInLeashWords } from "./yard.js";

export const scentKinds = ["anchor", "button", "input", "role", "onclick", "pointer"] as const;

export type ScentKind = (typeof scentKinds)[number];

export type SniffFact = SelectorHint & {
  kind: ScentKind;
  label: string;
  title: string;
  value: string;
  href: string;
  selectorHits: string[];
};

export type Look = {
  hrefs: string[];
  facts: SniffFact[];
  badSelectors: string[];
};

export type Scent = {
  kind: ScentKind;
  label: string;
  selector: string;
  held: string | undefined;
};

const kindSet = new Set<string>(scentKinds);
const labelLimit = 80;

export function sniffSource(leashSelectors: readonly string[]): string {
  return `(() => {
    const leashSelectors = ${JSON.stringify(leashSelectors)};
    if (!document.body) return { hrefs: [], facts: [], badSelectors: [] };

    const hrefs = [];
    for (const el of document.querySelectorAll("a[href]")) {
      if (typeof el.href === "string") hrefs.push(el.href);
    }

    const usable = [];
    const badSelectors = [];
    const incoming = Array.isArray(leashSelectors) ? leashSelectors : [];
    for (const sel of incoming) {
      if (typeof sel !== "string") continue;
      const trimmed = sel.trim();
      if (trimmed === "") continue;
      try {
        document.querySelector(trimmed);
        usable.push(trimmed);
      } catch (err) {
        badSelectors.push(trimmed);
      }
    }

    const elements = [...document.body.querySelectorAll("*")];
    const roleCounts = new Map();
    const textCounts = new Map();
    for (const el of elements) {
      if (!roleHidden(el)) {
        const role = selectorRole(el);
        const name = collapse(accessibleName(el));
        if (role && name && name.length <= 120 && !name.includes(">>")) {
          const key = role + "\\n" + name;
          roleCounts.set(key, (roleCounts.get(key) || 0) + 1);
        }
      }
      const text = collapse(textOf(el));
      if (text && text.length <= 80 && deepest(el, text)) {
        textCounts.set(text, (textCounts.get(text) || 0) + 1);
      }
    }

    const facts = [];
    const seen = new Set();
    for (const el of elements) {
      if (seen.has(el) || skipTag(el)) continue;
      let kind = kindOf(el);
      if (!kind && ownsPointer(el)) kind = "pointer";
      if (!kind || !isShown(el) || isDisabled(el)) continue;
      seen.add(el);
      facts.push(factOf(el, kind, roleCounts, textCounts, usable));
    }

    return { hrefs, facts, badSelectors };

    function skipTag(el) {
      const tag = el.tagName.toLowerCase();
      return tag === "script" || tag === "style" || tag === "noscript" || tag === "template";
    }

    function kindOf(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === "a" && el.hasAttribute("href")) return "anchor";
      if (tag === "button") return "button";
      if (tag === "input") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "button" || type === "submit" || type === "reset") return "input";
      }
      const role = explicitRole(el);
      if (role === "button" || role === "link" || role === "menuitem") return "role";
      if (el.hasAttribute("onclick") || typeof el.onclick === "function") return "onclick";
      return "";
    }

    function explicitRole(el) {
      const raw = el.getAttribute("role");
      if (!raw) return "";
      const first = raw.trim().toLowerCase().split(/\\s+/)[0];
      return first || "";
    }

    function selectorRole(el) {
      const explicit = explicitRole(el);
      if (explicit === "button" || explicit === "link" || explicit === "menuitem") return explicit;
      if (explicit) return "";
      const tag = el.tagName.toLowerCase();
      if (tag === "button") return "button";
      if (tag === "a" && el.hasAttribute("href")) return "link";
      if (tag === "input") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "button" || type === "submit" || type === "reset" || type === "image") return "button";
      }
      return "";
    }

    function ownsPointer(el) {
      if (getComputedStyle(el).cursor !== "pointer") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      // parent already has it, so this cursor was inherited
      return getComputedStyle(parent).cursor !== "pointer";
    }

    function isShown(el) {
      if (el.closest("[hidden], [inert]")) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (style.pointerEvents === "none") return false;
      const box = el.getBoundingClientRect();
      return box.width !== 0 || box.height !== 0;
    }

    function isDisabled(el) {
      if (el.hasAttribute("disabled")) return true;
      if (typeof el.disabled === "boolean" && el.disabled) return true;
      return (el.getAttribute("aria-disabled") || "").trim().toLowerCase() === "true";
    }

    function roleHidden(el) {
      if (el.closest("[hidden]")) return true;
      const style = getComputedStyle(el);
      return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    }

    function collapse(value) {
      return String(value || "").replace(/[\\u200b\\u00ad]/g, "").replace(/\\s+/g, " ").trim();
    }

    function textOf(el) {
      const bits = textBits(el);
      const collapsed = collapse(bits);
      if (collapsed) return collapsed;
      return collapse(el.textContent || "");
    }

    function textBits(el) {
      let out = "";
      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          out += node.textContent || "";
          continue;
        }
        if (node.nodeType !== 1) continue;
        const tag = node.tagName.toLowerCase();
        if (tag === "script" || tag === "style") continue;
        if ((node.getAttribute("aria-hidden") || "") === "true") continue;
        if (node.hasAttribute("hidden")) continue;
        if (tag === "img") {
          out += " " + (node.getAttribute("alt") || "") + " ";
          continue;
        }
        out += " " + textBits(node) + " ";
      }
      return out;
    }

    function accessibleName(el) {
      const labelled = labelledBy(el);
      if (labelled) return labelled;
      const aria = collapse(el.getAttribute("aria-label") || "");
      if (aria) return aria;
      const fromLabel = fromLabels(el);
      if (fromLabel) return fromLabel;
      const tag = el.tagName.toLowerCase();
      if (tag === "input") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "button" || type === "submit" || type === "reset" || type === "image") {
          const value = collapse(el.value || "");
          if (value) return value;
        }
      }
      const text = collapse(textOf(el));
      if (text) return text;
      return collapse(el.getAttribute("title") || "");
    }

    function labelledBy(el) {
      const ids = el.getAttribute("aria-labelledby");
      if (!ids) return "";
      const parts = [];
      for (const id of ids.trim().split(/\\s+/)) {
        if (!id) continue;
        const ref = document.getElementById(id);
        if (ref) parts.push(ref.textContent || "");
      }
      return collapse(parts.join(" "));
    }

    function fromLabels(el) {
      const labels = el.labels;
      if (!labels || labels.length === 0) return "";
      const parts = [];
      for (const label of labels) parts.push(label.textContent || "");
      return collapse(parts.join(" "));
    }

    function deepest(el, text) {
      for (const child of el.querySelectorAll("*")) {
        if (collapse(textOf(child)) === text) return false;
      }
      return true;
    }

    function factOf(el, kind, roles, texts, selectors) {
      const id = el.getAttribute("id") || "";
      const testId = el.getAttribute("data-testid") || "";
      const ariaLabel = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const value = valueOf(el);
      const text = slice(collapse(textOf(el)), 2000);
      const role = selectorRole(el);
      const name = collapse(accessibleName(el));
      const href = hrefOf(el);
      const selectorHits = [];
      for (const sel of selectors) {
        try {
          if (el.matches(sel)) selectorHits.push(sel);
        } catch (err) {
          continue;
        }
      }
      return {
        kind,
        label: slice(name || human(el, kind, ariaLabel, text, value, title), 500),
        text,
        ariaLabel,
        title,
        value,
        href,
        id,
        idUnique: id !== "" && cssCount("#" + CSS.escape(id)) === 1,
        testId,
        testIdUnique: testId !== "" && cssCount(attrSelector("data-testid", testId)) === 1,
        ariaUnique: ariaLabel !== "" && cssCount(attrSelector("aria-label", ariaLabel)) === 1,
        role,
        name,
        roleNameUnique: role !== "" && name !== "" && roles.get(role + "\\n" + name) === 1,
        textUnique: text !== "" && text.length <= 80 && texts.get(text) === 1,
        path: pathOf(el),
        selectorHits,
      };
    }

    function human(el, kind, ariaLabel, text, value, title) {
      const aria = collapse(ariaLabel);
      if (aria) return aria;
      if (kind === "input" && collapse(value)) return collapse(value);
      if (text) return text;
      if (collapse(title)) return collapse(title);
      if (kind === "anchor") {
        const raw = (el.getAttribute("href") || "").trim();
        if (raw) return raw;
      }
      if (kind === "input") return (el.getAttribute("type") || "button").toLowerCase();
      return kind;
    }

    function valueOf(el) {
      if ((el.tagName === "INPUT" || el.tagName === "BUTTON") && typeof el.value === "string") return el.value;
      return el.getAttribute("value") || "";
    }

    function hrefOf(el) {
      if (el.tagName.toLowerCase() !== "a") return "";
      const raw = el.getAttribute("href") || "";
      const abs = typeof el.href === "string" ? el.href : "";
      if (raw && abs && raw !== abs) return raw + " " + abs;
      return abs || raw;
    }

    function attrSelector(name, value) {
      const escaped = String(value).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"');
      return "[" + name + '=\\"' + escaped + '\\"]';
    }

    function cssCount(selector) {
      try {
        return document.querySelectorAll(selector).length;
      } catch (err) {
        return 0;
      }
    }

    function pathOf(el) {
      const parts = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        const parent = current.parentElement;
        if (!parent) break;
        const tag = current.tagName.toLowerCase();
        let index = 0;
        let total = 0;
        for (const child of parent.children) {
          if (child.tagName !== current.tagName) continue;
          total += 1;
          if (child === current) index = total;
        }
        parts.push(total > 1 ? tag + ":nth-of-type(" + index + ")" : tag);
        current = parent;
      }
      parts.push("body");
      parts.reverse();
      return parts.join(" > ");
    }

    function slice(value, limit) {
      const text = String(value || "");
      return text.length <= limit ? text : text.slice(0, limit);
    }
  })()`;
}

export function takeLook(value: unknown): Look {
  if (typeof value !== "object" || value === null) {
    return { hrefs: [], facts: [], badSelectors: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    hrefs: takeStrings(record.hrefs),
    facts: takeFacts(record.facts),
    badSelectors: takeStrings(record.badSelectors),
  };
}

export function scentsFrom(facts: readonly SniffFact[], words: readonly string[] = []): Scent[] {
  const leashWords = [...builtInLeashWords, ...words];
  const scents: Scent[] = [];
  const used = new Set<string>();
  for (const fact of facts) {
    let selector = buildSelector(fact);
    if (used.has(selector) && fact.path !== "" && !used.has(fact.path)) selector = fact.path;
    if (used.has(selector)) continue;
    used.add(selector);
    scents.push({
      kind: fact.kind,
      label: shortLabel(fact.label, fact.kind),
      selector,
      held: leashHold(fact, leashWords, fact.selectorHits),
    });
  }
  return scents;
}

function shortLabel(value: string, fallback: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const text = collapsed === "" ? fallback : collapsed;
  if (text.length <= labelLimit) return text;
  return `${text.slice(0, labelLimit - 3)}...`;
}

function takeFacts(value: unknown): SniffFact[] {
  if (!Array.isArray(value)) return [];
  const facts: SniffFact[] = [];
  for (const item of value) {
    const fact = takeFact(item);
    if (fact !== undefined) facts.push(fact);
  }
  return facts;
}

function takeFact(value: unknown): SniffFact | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const kind = typeof record.kind === "string" && kindSet.has(record.kind) ? (record.kind as ScentKind) : undefined;
  if (kind === undefined) return undefined;
  const label = takeString(record.label);
  const text = takeString(record.text);
  const ariaLabel = takeString(record.ariaLabel);
  const title = takeString(record.title);
  const fieldValue = takeString(record.value);
  const href = takeString(record.href);
  const id = takeString(record.id);
  const testId = takeString(record.testId);
  const role = takeString(record.role);
  const name = takeString(record.name);
  const path = takeString(record.path);
  const idUnique = takeBool(record.idUnique);
  const testIdUnique = takeBool(record.testIdUnique);
  const ariaUnique = takeBool(record.ariaUnique);
  const roleNameUnique = takeBool(record.roleNameUnique);
  const textUnique = takeBool(record.textUnique);
  if (
    label === undefined ||
    text === undefined ||
    ariaLabel === undefined ||
    title === undefined ||
    fieldValue === undefined ||
    href === undefined ||
    id === undefined ||
    testId === undefined ||
    role === undefined ||
    name === undefined ||
    path === undefined ||
    idUnique === undefined ||
    testIdUnique === undefined ||
    ariaUnique === undefined ||
    roleNameUnique === undefined ||
    textUnique === undefined
  ) {
    return undefined;
  }
  return {
    kind,
    label,
    text,
    ariaLabel,
    title,
    value: fieldValue,
    href,
    id,
    idUnique,
    testId,
    testIdUnique,
    ariaUnique,
    role,
    name,
    roleNameUnique,
    textUnique,
    path,
    selectorHits: takeStrings(record.selectorHits),
  };
}

function takeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  for (const item of value) {
    if (typeof item === "string") kept.push(item);
  }
  return kept;
}

function takeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function takeBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
