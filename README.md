# Household Retirement Forecast

A private, single-page Canadian retirement planning model — multi-tab inputs
(household, kids/RESP, assets & insurance, debt, major expenses, savings,
retirement assumptions), a what-if dashboard (sliders + 4 charts), a
year-by-year table, and Excel/Print/JSON export. No backend — everything runs
client-side and all data stays in your browser / downloaded files.

## Access

The site is PIN-gated and excluded from search indexing (`robots.txt` +
`noindex` meta tag). This is a **casual privacy measure, not real security** —
it's a static site with no server, so the PIN check happens in client-side
JavaScript. Don't store SINs, account numbers, or passwords in it.

To change the PIN, open a browser console on the page and run:

```js
crypto.subtle.digest("SHA-256", new TextEncoder().encode("YOUR-NEW-4-DIGITS"))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")))
```

then paste the resulting hash into `PIN_HASH` in `js/main.js` and redeploy.

## Local development

```
python3 -m http.server 8934
```

then open `http://localhost:8934`.

## Methodology

See the "Methodology & Assumptions" card on the Retirement Plan input tab —
tax brackets, CPP/OAS, RRIF minimums, and the corporate-account (CCPC) model
are documented there. This is a planning approximation, not tax or financial
advice.
