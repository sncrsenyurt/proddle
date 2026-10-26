# proddle

I am writing a command line tool that walks a website and prods the clickable things on it. Same origin only, with a cap on pages and a cap on depth. On each page it should find buttons, links, `role="button"`, and elements that look like they carry a click handler. Each one gets a prod in a fresh page. I want a record of what followed: navigation, network requests, DOM changes, console errors, uncaught page errors, and HTTP 4xx or 5xx.

Each prod will be filed as fine, a broken link, a yelp, or a limp. The output will be one HTML file I can open by itself. A leash keeps it off delete, remove, logout, sign out, buy, pay, checkout, and unsubscribe, and I can add more words or selectors.

None of that is built. What is in the tree today is the project shell: TypeScript, Playwright, Vitest, and a placeholder command.

## Words

- yard — the config file
- porch — the start URL
- amble — the same-origin walk, bounded by page and depth caps
- prod — one click, in a fresh page
- limp — a prod that changes nothing
- yelp — a console error or an uncaught page error during a prod
- growl — an HTTP 4xx or 5xx seen during a prod
- bolt — a navigation caused by a prod
- scratch — a DOM change after a prod
- leash — skip words and selectors that must not be prodded
- slate — the self-contained HTML report

## Layout

- `src/latch.ts` is the command. It prints one line and exits. It does not open a browser.
- `yards/porch.yard.json` is a sample yard pointed at `http://127.0.0.1:8741`. Nothing is listening there.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` writes `dist/latch.js`, which is what the `proddle` bin field points at.
- `npm test` runs Vitest. There are no tests yet, and the config allows that.

The sample yard names its own fields: `porch`, `pageCap`, `depthCap`, `leashWords`, `leashSelectors`, `openWaitMs`, `prodWaitMs`. Nothing reads them yet.

## Still to come

A yard loader with checks, the amble, finding clickables, the leash, prodding and classifying, a non-zero exit when something is wrong, the slate, a small demo site, and CI.
