# proddle

I am writing a command line tool that walks a website and prods the clickable things on it. Same origin only, with a cap on pages and a cap on depth. On each page it should find buttons, links, `role="button"`, and elements that look like they carry a click handler. Each one gets a prod in a fresh page. I want a record of what followed: navigation, network requests, DOM changes, console errors, uncaught page errors, and HTTP 4xx or 5xx.

Each prod will be filed as fine, a broken link, a yelp, or a limp. The output will be one HTML file I can open by itself. A leash keeps it off delete, remove, logout, sign out, buy, pay, checkout, and unsubscribe, and I can add more words or selectors.

The yard file loads and is checked. The walk, the prods, and the slate are not written yet. The command still prints one line and exits.

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

## Yard file

A yard is JSON. `porch` is required: the start URL, `http` or `https`. I store it as a URL href.

The other fields can be left out:

- `pageCap` — page limit for the amble. Default 20.
- `depthCap` — depth limit for the amble. Default 2.
- `leashWords` — more words to skip. Default none. The built-in leash above always applies, and these are added. I store words in lowercase and drop repeats.
- `leashSelectors` — CSS selectors to skip. Default none. There is no built-in selector list.
- `openWaitMs` — how long a page may take to open, in milliseconds. Default 15000.
- `prodWaitMs` — how long to wait after a prod for the page to settle, in milliseconds. Default 8000.

Caps and waits have to be positive whole numbers. Skip fields have to be lists of strings. A key I do not know is refused, so a typo does not quietly become a default. `readYard` in `src/yard.ts` reads the file and returns that filled-in yard. It does not open a connection.

`yards/porch.yard.json` is a sample pointed at `http://127.0.0.1:8741`. Nothing is listening there. It repeats the built-in leash words. That is redundant, and it still loads.

## Layout

- `src/latch.ts` is the command. It prints one line and exits. It does not open a browser, and it does not read the yard yet.
- `src/yard.ts` reads a yard file and checks it.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` writes `dist/latch.js`, which is what the `proddle` bin field points at.
- `npm test` runs Vitest.

## Still to come

The amble, finding clickables, using the leash while prodding, classifying each prod, a non-zero exit when something is wrong, the slate, a small demo site, and CI.
