export type SelectorHint = {
  id: string;
  idUnique: boolean;
  testId: string;
  testIdUnique: boolean;
  ariaLabel: string;
  ariaUnique: boolean;
  role: string;
  name: string;
  roleNameUnique: boolean;
  text: string;
  textUnique: boolean;
  path: string;
};

const roleNameLimit = 120;
const textLimit = 80;

export function buildSelector(hint: SelectorHint): string {
  if (hint.id !== "" && hint.idUnique) return `#${cssEscape(hint.id)}`;

  const testId = hint.testId !== "" && hint.testIdUnique ? quotedAttr("data-testid", hint.testId) : undefined;
  if (testId !== undefined) return testId;

  const aria = hint.ariaLabel !== "" && hint.ariaUnique ? quotedAttr("aria-label", hint.ariaLabel) : undefined;
  if (aria !== undefined) return aria;

  const role = roleSelector(hint);
  if (role !== undefined) return role;

  const text = textSelector(hint);
  if (text !== undefined) return text;

  if (hint.path !== "") return hint.path;
  return "body";
}

function roleSelector(hint: SelectorHint): string | undefined {
  if (!hint.roleNameUnique || !/^[a-z]+$/.test(hint.role)) return undefined;
  const name = collapse(hint.name);
  if (!usable(name, roleNameLimit)) return undefined;
  return `internal:role=${hint.role}[name=${quotePlaywright(name)}s]`;
}

function textSelector(hint: SelectorHint): string | undefined {
  if (!hint.textUnique) return undefined;
  const text = collapse(hint.text);
  if (!usable(text, textLimit)) return undefined;
  return `internal:text=${JSON.stringify(text)}s`;
}

function usable(value: string, limit: number): boolean {
  return value !== "" && value.length <= limit && !value.includes(">>");
}

function collapse(value: string): string {
  return value.replace(/[\u200b\u00ad]/g, "").replace(/\s+/g, " ").trim();
}

function quotePlaywright(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quotedAttr(name: string, value: string): string | undefined {
  if (value.includes(">>") || /[\n\r\f]/.test(value)) return undefined;
  return `[${name}=${quotePlaywright(value)}]`;
}

function cssEscape(value: string): string {
  let out = "";
  const length = value.length;
  for (let index = 0; index < length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) {
      out += "\uFFFD";
      continue;
    }
    if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (index === 0 && code >= 0x30 && code <= 0x39) ||
      (index === 1 && code >= 0x30 && code <= 0x39 && value.charCodeAt(0) === 0x2d)
    ) {
      out += `\\${code.toString(16)} `;
      continue;
    }
    if (index === 0 && length === 1 && code === 0x2d) {
      out += `\\${value.charAt(index)}`;
      continue;
    }
    if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      out += value.charAt(index);
      continue;
    }
    out += `\\${value.charAt(index)}`;
  }
  return out;
}
