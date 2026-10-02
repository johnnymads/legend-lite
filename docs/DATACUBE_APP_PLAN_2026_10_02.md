# DataCube app on Postgres: the plan (2026-10-02)

Follows `POSTGRES_DIALECT_HOMEWORK_2026_10_01.md`, whose legs P0 and P1 are done (commits 08d1dc916 to
9fff44529 on `feature/postgres`). Scope is **the developer path only**:

```
bazel run //datacube:app -- postgresql://bob@10.0.0.5:5432/shop
```

That command builds everything. If libpq needs a password, it asks in the terminal. It opens the
browser on `shop`'s tables, and the developer clicks one. Nothing changes in Postgres, there is no
warehouse account, and there is no second server.

Out of scope: multi-user sign-in as one's Postgres account (`serve`, TLS, listening beyond
127.0.0.1), releases and Homebrew, Python.

## Rules for every leg (code-quality bar, ruled by the user)

1. **No engine names outside the two places that own them.** Those are `sql/dialect/` (the dialect
   chosen from the Pure database type) and the warehouse's table of attachable databases (one row per
   kind, as data). TypeScript never branches on `postgres` or `duckdb`. It passes the Pure database
   type through to the model.
2. **No hooks, backdoors or test-only seams.** A capability is a real flag or API, parsed, documented
   and tested like the others.
3. **No fallbacks or guesses** (AGENTS.md invariant 4). A missing password, an unreadable column or a
   refused key is said, by name.
4. **Every leg is gated before the next starts:**
   - `//core:core_tests`, `//core:guardrails`, `//core:census`;
   - `//warehouse:tests`, `//warehouse:tests_native`, `//warehouse:postgres_live`;
   - `//datacube:tests`, `//datacube:typecheck_test`, `//wasm:differential_test`;
   - the corpus gates when shared dialect code moves.
5. **One commit per leg,** its message saying what and why.

## Legs

### A1. The warehouse runs as the app: Postgres URLs, the site, single-user (`warehouse/`)
**Postgres URLs.** A positional `postgresql://user@host:port/db[?param=value]` is a Postgres catalog.
- The catalog is named after the database; a name the catalog grammar refuses is refused by name.
- `options=-c statement_timeout=60000` is added unless the URL sets it.
- `--postgres NAME=DSN` stays, for a name that differs from the database.

**The password is libpq's own.** libpq reads `~/.pgpass` and `PGPASSWORD`. When the attach fails
with libpq's "no password supplied", the warehouse asks once on the terminal (`Console.readPassword`)
and retries. Without a terminal it stops with that message.

**`--site DIR`** serves DIR for every GET outside `/sql/`, with path traversal refused.
`/config.json` is answered as `{"warehouse": "<the request's own origin>"}`. The origin is
`http://` + Host, so `localhost` and `127.0.0.1` both work and no CORS setting is needed.

**`--single-user`** is the URL's Postgres user as the only principal, and an owner. There are no
`--user` or `--owner` lists.
- A random **launch key** is made at start. `POST /sql/v1/login {"key": "<launch key>"}` is
  accepted once and issues an ordinary token; a second use is refused.
- Combined with `--user`, the server refuses to start.

**`--open`** prints the address and opens the default browser at
`http://127.0.0.1:<port>/#key=<launch key>`. The key is in the fragment, which a browser never sends.
`--table schema.name` adds `&table=schema.name` to that fragment.

**Tests:** URL parsing; the catalog name; the default timeout; `--site` traversal; `/config.json` per
Host; the key accepted once then refused; `--single-user` with `--user` refused; live (key, then
list, then query).

### A2. `//datacube:app` (Bazel)
The `warehouse_run` rule gains an optional `site` and fixed extra args. `//datacube:app` is
`server_native` with `site = //datacube:dist` and `--single-user --open`. It is native only.

**Gate:** the command runs from a clean checkout. A Playwright test drives the native binary through
key, then list, then open, then group.

### A3. The page starts from what it was asked to open (`datacube/demo/`)
Boot works out its starting source before generating anything: a `#key`, `?remote=`, a share link,
or nothing. Sample trades are generated **only** for nothing.

With `#key`, the page:
1. logs in with the key;
2. removes the fragment from the address;
3. lists the objects;
4. opens `table` if one was given, else shows the Database section's table list, already signed in.

`page-config.ts` reads `config.json` as today. Nothing in it is secret.

**Gate:** the existing page suites (no regression for the sample, `?remote=` or share links), plus
A2's Playwright test.

### A4. Catalog kinds as data; one listing; no engine names in TypeScript
- **Warehouse:** a catalog is `Native` (DuckDB's own tables, per-object grants, the Authorizer,
  sessions) or `Attached` (passthrough). `Attached` carries a row of a closed table of attachable
  databases: Postgres today, with its extension file, attach `TYPE`, query function, cancel statement
  and Pure database type.
- **API:** `isPostgres` and the `engine` field on `/sql/v1/catalogs` go.
- **One listing:** `GET /sql/v1/objects` returns everything the caller may read in every catalog,
  each object with `catalog` and `databaseType` (the Pure name: `DuckDB`, `Postgres`). The
  per-catalog listing stays.
- **DataCube:** one listing call. `inferModel` writes `type: <databaseType>`. `CatalogEngine` and
  every `=== 'postgres'` go. Snap's rule is leg C's.

### B. `timestamptz` and the column types (agent, after A1's commit; plan reviewed 2026-10-02)
**The session contract is pinned where reads run.**
- Every warehouse DuckDB connection runs the dialect's `sessionSetup()` (`SET TimeZone='UTC'`).
  It is unpinned today: measured `America/New_York`.
- The Postgres attach adds `TimeZone=UTC`. Today the zone is UTC only by the server's configuration.

**The catalog splits conversions in two:**
- *needed only for a copy* (an upload or Snap is rewritten);
- *needed to read at all* (`HUGEINT`, `UBIGINT`, `UUID`, `TIME`, `INTERVAL` stay excluded, by name).

`timestamptz` becomes readable in place, as TIMESTAMP under the UTC session.

**`bytea` is excluded by name** instead of refusing the whole table. Each Postgres type's outcome is
measured live, not read from code.

**Gate:**
- a timestamptz column's value, filter and year/month group equal `psql`'s
  `AT TIME ZONE 'UTC'`, on a Postgres and on a DuckDB catalog;
- Arrow arrives zoned and displays in UTC;
- Snap stays UTC.

### C. Live feature audit and Snap on Postgres (agent; plan pending its report)
The page's feature suites are run Live against a Postgres copy of their data. Each failure is
classified as a dialect bug, a DataCube local-engine assumption, a passthrough limit, or a data
difference, and the clear ones are fixed in their layer.

**Snap** plans the same model against the tab's database type instead of reusing the live plan's
SQL, so a Postgres table snaps like any other.

## Order
A1 → A2 → A3 → A4, sequentially (one author, shared files). B starts after A1's commit; it touches
`duck/Database.java` and `Catalogs.java`. C's plan is reviewed before it writes code.
