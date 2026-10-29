export type LeashSurface = {
  text: string;
  ariaLabel: string;
  title: string;
  value: string;
  href: string;
};

// "check-out" hits checkout, and "sign-out" hits sign out
export function leashHold(
  surface: LeashSurface,
  words: readonly string[],
  matchedSelectors: readonly string[] = [],
): string | undefined {
  const fields = [
    surface.text,
    surface.ariaLabel,
    surface.title,
    surface.value,
    surface.href,
  ].flatMap((value) => leashForms(value));

  for (const word of words) {
    const parsed = wordTries(word);
    if (parsed === undefined) continue;
    for (const field of fields) {
      for (const form of parsed.tries) {
        if (hasWord(field, form)) return `word ${JSON.stringify(parsed.label)}`;
      }
    }
  }

  const selector = matchedSelectors.find((item) => item.trim() !== "");
  if (selector !== undefined) return `selector ${JSON.stringify(selector.trim())}`;
  return undefined;
}

function wordTries(value: string): { label: string; tries: string[] } | undefined {
  const forms = leashForms(value);
  const label = forms[0];
  if (label === undefined) return undefined;
  const stuck = label.replace(/ /g, "");
  if (stuck === label || forms.includes(stuck)) return { label, tries: forms };
  return { label, tries: [...forms, stuck] };
}

function leashForms(value: string): string[] {
  const base = value
    .replace(/[\u200b\u00ad]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (base === "") return [];
  const spaced = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const stuck = base.replace(/[_-]+/g, "");
  if (spaced === "") return stuck === "" ? [] : [stuck];
  if (stuck === spaced) return [spaced];
  return [spaced, stuck];
}

function hasWord(field: string, word: string): boolean {
  if (word === "") return false;
  let from = 0;
  while (from <= field.length - word.length) {
    const at = field.indexOf(word, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : field.charAt(at - 1);
    const after = field.charAt(at + word.length);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
  return false;
}

function isWordChar(char: string): boolean {
  return char !== "" && /[\p{L}\p{N}]/u.test(char);
}
