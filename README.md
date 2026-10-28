# proddle

I am writing a command line tool that walks a website and prods the clickable things on it. Same origin only, with a cap on pages and a cap on depth. On each page it should find buttons, links, `role="button"`, and elements that look like they carry a click handler. Each one gets a prod in a fresh page. I want a record of what followed: navigation, network requests, DOM changes, console errors, uncaught page errors, and HTTP 4xx or 5xx.

Each prod will be filed as fine, a broken link, a yelp, or a limp. The output will be one HTML file I can open by itself. A leash keeps it off delete, remove, logout, sign out, buy, pay, checkout, and unsubscribe, and I can add more words or selectors.

The yard file loads and is checked. The command walks same-origin pages from a url or a yard file, and prints the urls it opened. Finding clickables, prodding them, and writing the slate are not written yet.

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

## Amble

`amble` in `src/amble.ts` starts at the porch and follows links. It stays on the same origin: same protocol, host, and port. `mailto:`, `tel:`, and `javascript:` are ignored, and so is any other scheme.

I drop the hash. A trailing slash is the same page, except the root, which keeps its slash. `https://example.com//` is the root too. A bare `?` is the same as no query. A query that has a value stays, parameter order included, so `?b=1&a=2` and `?a=2&b=1` are two pages.

The porch is depth 0. I open a page when its depth is within `depthCap`, and I only follow links from a page when the next page would still be within the cap. A `depthCap` of 1 is the porch and the pages it links to. The default is 2. `pageCap` is how many pages I open. The default is 20. The walk is breadth-first, in the order the links were found. A page is opened once.

`readLinks` fetches a page and returns the hrefs on it. The tests pass an in-memory site and do not launch a browser. `src/chromium.ts` is the Playwright version: one headless Chromium, a fresh page per url, `a[href]` after `domcontentloaded`. `openWaitMs` is the navigation timeout. A page that only adds its links from script after that can look empty.

## Command

`proddle https://example.com` walks that url with the default caps and the default open wait.

`proddle yards/porch.yard.json` reads the yard and walks its porch.

`proddle https://example.com yards/site.yard.json` walks that url with the yard's `pageCap`, `depthCap`, and `openWaitMs`.

It prints each opened page, one url per line. It does not prod anything and it does not write a slate. A bad yard, or a url that is not http or https, is refused before Chromium starts.

## Layout

- `src/latch.ts` is the command.
- `src/args.ts` decides the porch and the caps from the arguments.
- `src/yard.ts` reads a yard file and checks it.
- `src/links.ts` turns a raw href into a page on this origin, or nothing.
- `src/amble.ts` is the walk.
- `src/chromium.ts` reads links with Playwright.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` writes `dist/latch.js`, which is what the `proddle` bin field points at.
- `npm test` runs Vitest.

## Still to come

Finding clickables, using the leash while prodding, classifying each prod, a non-zero exit when something is wrong, the slate, a small demo site, and CI.
