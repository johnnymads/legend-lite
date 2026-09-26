# DataCube TypeScript: production-readiness audit, pass 1 (2026-09-26)

Scope: `datacube/src` (27,150 lines, the product), `datacube/demo` (1,718 lines of pages and
harness), the page bundle and what it downloads. Read-only: nothing was fixed during the audit;
fixes are decided from this document. Every finding carries its evidence; "solid" items were
checked, not assumed.

## Findings

### HIGH

**H1. Timestamps show the wrong wall-clock time outside UTC, and filters on them miss.**
A TIMESTAMP reaches the grid as epoch milliseconds (Arrow; `duckdb.ts` `converterFor`, the same
path for local, live and snapped), becomes a JavaScript `Date` (an instant), is displayed in the
browser's zone (no `timeZone` anywhere in `format.ts`), and is written back into a filter or drill
as LOCAL wall-clock time (`serialize.ts` `temporalLiteral`). Measured, for a stored
`2024-01-02 03:04:05`:

| browser zone | grid shows | filter on that cell asks for |
|---|---|---|
| UTC | Jan 2, 3:04:05 AM | `%2024-01-02T03:04:05` (right) |
| America/New_York | Jan 1, 10:04:05 PM | `%2024-01-01T22:04:05` (no such row) |
| Asia/Tokyo | Jan 2, 12:04:05 PM | `%2024-01-02T12:04:05` (no such row) |

`temporalLiteral` also drops milliseconds, so a timestamp with fractional seconds cannot match
itself even in UTC. DATE columns are right (built and written at local midnight, consistently).
Needs a decision: a TIMESTAMP without zone is a wall-clock value (display and write it in UTC
components); a TIMESTAMP WITH TIME ZONE is an instant (display local, write with its offset).

**H2. The production build is a development build.**
- `bundle.js` is built `--bundle --format=esm --target=es2022` only: not minified (1.03 MB), no
  source maps, no content hash in the name, so it cannot be cached long.
- The page downloads `duckdb-eh.wasm` 35.9 MB (or `duckdb-mvp.wasm` 41.3 MB) and the planner
  `classes.wasm` 4.5 MB; our server (`demo/serve.mjs`) sends them uncompressed. WASM compresses
  well; a production host must serve pre-compressed (Brotli) files with long-lived caching.
- There is no production serving story at all yet: the only server is the development one.

### MEDIUM

**M1. A failed drill-through is silent.** `app.ts:545` calls `void this.#drillThrough(row)`;
`#drillThrough` (`app.ts:2006`) has no error handling. Any failure (a live warehouse refusal, a
dropped network, an expired token) is an unhandled promise rejection: no message to the user, an
"Uncaught (in promise)" in the console. It is the only one of the 47 fire-and-forget calls in `src`
without handling: every other target catches, or goes through `CubeController.refresh` / Ad Hoc
`#run`, which catch and report.

**M2. A warehouse session ends mid-analysis with no way back but reloading.** Tokens live 1 hour;
`warehouse.ts` turns a 401 into "the warehouse session has expired — sign in again", but nothing
offers a sign-in: the Live plane just fails from then on. Needs re-authentication in place (and,
with single sign-on, silent renewal before expiry).

**M3. No Content Security Policy, and two things a strict one would block.** The pages carry no
CSP. Ready: no inline scripts, no inline event handlers, no `style=` attributes. Blocking: two
inline `<style>` blocks per page (move to CSS files or hash them). A shipped policy also needs
`wasm-unsafe-eval` (DuckDB, the planner), `worker-src 'self'`, and `connect-src` naming the
configured warehouse origins.

### LOW

**L1. The e-mail export trusts the report title in a MIME header.** `toEml` writes
`name="${attachment.name}"` where the name is `exportFileName(title, …)` (`export.ts:149`), and the
title is user- or source-supplied (a file name, `schema.table`): a `"` or a line break corrupts the
header. Also its HTML part is `<html><body><p></p><body></html>` (the second `<body>` should close).

**L2. Typing debt worth a review pass:** 4 `as unknown as` casts and 24 non-null assertions in
`src` (no `any`, no `@ts-ignore`, no TODOs anywhere).

## Checked and solid

- **Markup injection:** one `innerHTML` in the product (`app.ts:2064`, the chart), and every
  data-derived string in `chart.ts` goes through `esc` (which escapes quotes, for attributes);
  colours come from a fixed palette. No `eval`, no `new Function`, no `document.write`.
- **Links in cells:** `linkFor` (`grid/columns.ts`) accepts only `http:`/`https:`; opened with
  `target=_blank rel="noreferrer noopener"`.
- **Exports:** CSV and clipboard TSV guard formula injection (a leading `=`, `@`, tab, CR, or a
  `+`/`-` that is not a plain number gets an apostrophe); HTML and SpreadsheetML escape every
  value, header and title.
- **Secrets:** the warehouse token is held in memory only (the password is sent once, never
  kept); remote-file credentials are never read from the URL (`boot.ts`, deliberately); S3 secrets
  are quoted into DuckDB's `CREATE SECRET`, not stored.
- **External hosts:** after this change, the page contacts only its own origin (measured) and the
  servers its configuration names.
- **Lifecycle:** window/document listeners are removed on dispose; the planner worker is
  terminated; the only cross-context messaging is the page and its own planner worker.
- **Hygiene:** no `any`, no suppressions, no TODOs, no empty `catch` blocks; the one `console`
  call is behind the debug-mode setting.
- **Numbers:** integers and decimals beyond 2^53 stay exact as text; counts format in the viewer's
  locale.
- **Accessibility, at the attribute level:** grid roles, `aria-rowindex`/`colindex`/`rowcount`,
  labels, expanded and pressed states.

## Not yet covered (the next passes)

1. **Browser support of the planner module:** it is WebAssembly GC with exception references (the
   Node tests need `--experimental-wasm-exnref`); which Safari and Firefox versions run it is
   unmeasured. Possibly a hard floor for who can use the page.
2. **Keyboard-only and screen-reader use** of the grid, the menus and the editors (attributes are
   present; behaviour is untested).
3. **Scale:** profile the main thread at the row caps; memory across repeated snap/release.
4. **A full logic read** of the largest files (`app.ts` 3,231, `filter-editor.ts` 1,453,
   `grid.ts` 1,432, `serialize.ts` 1,406 lines).
5. **Internationalisation:** every user-facing string is English, inline.

## Proposed order

H1 (a correctness bug users hit today) → M1 (small) → M2 → H2 and M3 together (the production
build and hosting leg) → L1, L2 → the next passes, starting with browser support.
