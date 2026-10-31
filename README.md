# proddle

I am writing a command line tool that walks a website and prods the clickable things on it. Same origin only, with a cap on pages and a cap on depth. On each page it should find buttons, links, `role="button"`, and elements that look like they carry a click handler. Each one gets a prod in a fresh page. I want a record of what followed: navigation, network requests, DOM changes, console errors, uncaught page errors, and HTTP 4xx or 5xx.

Each prod is filed as fine, a growl, a yelp, or a limp. A growl is a broken link: the navigation failed, or a response came back 4xx or 5xx. A yelp is a console error or an uncaught page error. A limp is a click I could not see do anything. A navigation that lands, a DOM change, a request, or a dialog counts as fine. The slate will be one HTML file I can open by itself. It is not written yet.

A leash keeps it off delete, remove, logout, log out, sign out, buy, pay, checkout, purchase, unsubscribe, deactivate, and cancel subscription. I can add more words or selectors.

The yard file loads and is checked. The command walks same-origin pages from a url or a yard file. On each page it lists the clickable things, holds back the ones on the leash, and prods the rest. Each prod is one fresh page. I print a tally and exit 1 when a prod is a limp, a yelp, or a growl.

## Words

- yard — the config file
- porch — the start URL
- amble — the same-origin walk, bounded by page and depth caps
- prod — one click, in a fresh page
- limp — a prod that changes nothing
- yelp — a console error or an uncaught page error during a prod
- growl — an HTTP 4xx or 5xx during a prod, or a navigation that failed
- bolt — a navigation caused by a prod
- scratch — a DOM change after a prod
- leash — skip words and selectors that must not be prodded
- sniff — the look over one page for things that can be clicked
- scent — one of those: a kind, a short label, a selector, and a leash hold when it must not be prodded
- slate — the self-contained HTML report

## Yard file

A yard is JSON. `porch` is required: the start URL, `http` or `https`. I store it as a URL href.

The other fields can be left out:

- `pageCap` — page limit for the amble. Default 20.
- `depthCap` — depth limit for the amble. Default 2.
- `leashWords` — more words to skip. Default none. The built-in leash above always applies, and these are added. I store words in lowercase and drop repeats. How a word matches is under Sniff.
- `leashSelectors` — CSS selectors to skip. Default none. There is no built-in selector list.
- `openWaitMs` — how long a page may take to open, in milliseconds. Default 15000.
- `prodWaitMs` — how long to wait after a prod for the page to settle, in milliseconds. Default 8000.

Caps and waits have to be positive whole numbers. Skip fields have to be lists of strings. A key I do not know is refused, so a typo does not quietly become a default. `readYard` in `src/yard.ts` reads the file and returns that filled-in yard. It does not open a connection.

`yards/porch.yard.json` is a sample pointed at `http://127.0.0.1:8741`. Nothing is listening there. It repeats the built-in leash words. That is redundant, and it still loads.

## Amble

`amble` in `src/amble.ts` starts at the porch and follows links. It stays on the same origin: same protocol, host, and port. `mailto:`, `tel:`, and `javascript:` are ignored, and so is any other scheme.

I drop the hash. A trailing slash is the same page, except the root, which keeps its slash. `https://example.com//` is the root too. A bare `?` is the same as no query. A query that has a value stays, parameter order included, so `?b=1&a=2` and `?a=2&b=1` are two pages.

The porch is depth 0. I open a page when its depth is within `depthCap`, and I only follow links from a page when the next page would still be within the cap. A `depthCap` of 1 is the porch and the pages it links to. The default is 2. `pageCap` is how many pages I open. The default is 20. The walk is breadth-first, in the order the links were found. A page is opened once.

`readLinks` fetches a page and returns the hrefs on it. The tests pass an in-memory site and do not launch a browser. `src/chromium.ts` is the Playwright version: one headless Chromium, a fresh page per url, after `domcontentloaded`. It reads `a[href]` and sniffs that same load. `openWaitMs` is the navigation timeout. A page that only adds its links from script after that can look empty, and the sniff can miss those too.

## Sniff

On each page the walk opens, I look for clickable things. Pages at the depth cap, and the page that fills the page cap, are not fetched while looking for links. I open those once, just to sniff.

I keep an `a` with an href, a `button`, an `input` of type button, submit, or reset, `role="button"`, `role="link"`, `role="menuitem"`, and anything with an onclick attribute or an onclick property. `addEventListener` is not visible from the page. A cursor of `pointer` counts when that element sets it and its parent does not, so a card styled that way is included and the text inside it is not.

Hidden and disabled elements are left out. That includes `hidden`, `inert`, `display: none`, `visibility: hidden`, `pointer-events: none`, a zero-size box, `disabled`, and `aria-disabled="true"`.

Each scent gets one selector, the first of these that is unique on the page: an id, a `data-testid`, an `aria-label`, a role plus accessible name, the text, then a structural path such as `body > main > button:nth-of-type(2)`. The same element is listed once. Two elements that would share a selector fall back to the path.

A leash word matches on its own, ignoring case, against the text, the aria-label, the title, the value, or the href. A hyphen or underscore counts as a space, so `sign-out` matches `sign out`. I also look with those marks removed, so `check-out` matches `checkout`, and `signout` matches `sign out`. `pay` matches `Pay now` and `/pay`. It does not match `paper` or `payment`. A leash selector is css, checked with `element.matches`. The built-in words always apply. A held scent stays in the list with the reason.

## Command

`proddle https://example.com` walks that url with the default caps, the default waits, and the built-in leash.

`proddle yards/porch.yard.json` reads the yard and walks its porch.

`proddle https://example.com yards/site.yard.json` walks that url with the yard's caps, waits, and leash.

`--leash archive` adds a word. `--leash-selector .danger` adds a css selector. Both can be repeated, and `--leash=archive` works too. They join the yard's leash. The built-in words stay.

It prints each page, then one line per scent, then a tally:

    https://example.com/
      anchor "Docs" #docs fine
      button "Save" #save limp
      anchor "Missing" #miss growl: 404
      button "Boom" #boom yelp: boom
      button "Delete" #del held: word "delete"

    1 fine, 1 limp, 1 yelp, 1 growl, 1 held

A held scent is listed and not clicked. `prodWaitMs` is how long I wait after a click. The click itself gives up sooner, so one element cannot stall the run. I exit 1 when the tally has a limp, a yelp, or a growl, and 0 otherwise. No slate is written. A bad yard, an unknown flag, or a url that is not http or https, is refused before Chromium starts. A leash selector that is not css is reported and ignored.

## Layout

- `src/latch.ts` is the command.
- `src/args.ts` decides the porch, the caps, the waits, and the leash from the arguments.
- `src/yard.ts` reads a yard file and checks it.
- `src/links.ts` turns a raw href into a page on this origin, or nothing.
- `src/amble.ts` is the walk.
- `src/leash.ts` decides whether a leash word or selector holds a scent.
- `src/selector.ts` builds a selector from the hints gathered on the page.
- `src/sniff.ts` collects the scents.
- `src/prod.ts` clicks one scent and files what happened.
- `src/chromium.ts` opens pages with Playwright, sniffs them, and prods them.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run build` writes `dist/latch.js`, which is what the `proddle` bin field points at.
- `npm test` runs Vitest.

## Still to come

The slate, a small demo site, and CI.
