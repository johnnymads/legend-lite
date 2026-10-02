# Store types into SQL: homework (2026-10-02)

**The question.** A column a database holds in a type Pure has no name for (Postgres `inet`, `money`,
`xml`, `interval`; DuckDB `UUID`, `INTERVAL`) should still be usable in a cube. The proposed rule: such
a column is declared `OTHER`, is a Pure **String**, and is **read as text** (`CAST(col AS VARCHAR)`).
`json`/`jsonb` are semi-structured, so a Pure **Variant**, and Postgres reads them as `jsonb`.

**The finding that prompted this homework.** The lowered SQL does not know a physical column's
*declared* store type. A scan's columns are typed from their Pure types. This homework asks how the
types flow today, how upstream does it, every route a physical column takes, and what the change
would cost.

Read-only research, three parts:
- every route a physical column takes into SQL;
- the class-mapping route;
- upstream legend-engine/legend-pure.

The Postgres casts were probed live on Postgres 17. A code-read claim is marked as such.

---

## 1. How a store column's type flows today

```
###Relational  col OTHER / VARCHAR(16) / INTEGER / SEMISTRUCTURED   (RelationalDataType)
   │  StoreCompiler.tableSchema → columnType/scalarType   (StoreCompiler.java:30-80)
   ▼  ── the declared type is DROPPED here: INTEGER/BIGINT → Integer, VARCHAR(n) → String,
   │     SEMISTRUCTURED → Variant, OTHER/DISTINCT/ARRAY/OBJECT → THROWS
Pure RelationType (the table reference's type)        TableReferenceChecker.java:35-128
   │  only quoted-ness survives: TypedTableReference.quotedColumns (:114-121)
   ▼
Lowerer.outputsOf → PureSql.type → OutputCol(name, SqlType, nullable, Origin)   Lowerer.java:3490-3517
   │  on SqlSource.Table at the ONE scan site                                    Lowerer.java:564-571
   ▼
Fold.sourceColumn → SqlExpr.Column.of(alias, OutputCol): the reference COPIES the scan's type
   ▼
dialect.render: Table → "name AS alias", Column → "alias.name"
```

**Facts that shape the design:**
1. **A table with even one `OTHER` column does not compile today.** `columnType` throws "has no
   scalar Pure type" at the first reference to the table, even when the query never reads that
   column. So any mapping or `#>{}#` over such a table fails. Views type `OTHER` as `Any`
   (`ViewSignatures.java:140-142`). (Code-read; two independent reads agree.)
2. **Every physical store scan has one entry point.**
   - There is one `new TypedTableReference`, at `TableReferenceChecker.java:122`, and one scan site,
     `Lowerer.java:564-571`.
   - The class-mapping normalizer writes the same `tableReference(db,'T')` that `#>{db.T}#` produces
     (`MappingNormalizer.java:1683-1688`). So do join hops (`JoinChainEmission.java:410, 439, 478,
     570`) and view bodies (`ViewRelation.java:64, 111`).
   - Every column read in a mapping (property mappings, join conditions, filters, group-by keys,
     dynaFunction arguments, enumeration CASEs, milestoning columns, graph-fetch keys) resolves
     against that scan's output columns.
3. **The SQL layer already has a declared-type vocabulary:** `SqlDdl.ColumnType` (`SqlDdl.java:21-35`),
   "a declaration, not a computed value's SqlType". It covers every `RelationalDataType`, including
   `OTHER`, `JSON`, `DISTINCT` and `ARRAY`, and dialects already spell it for DDL. The mapping is in
   `exec/Ddl.columnType` (`Ddl.java:55-79`), which the compiler may not import.

## 2. How upstream does it

- **Column references carry the column, so its declared type.** `TableAliasColumn.column` is a
  pointer to the full `Column` (`relational.pure:214-220, 376-384`). legend-lite dropping the type is
  the outlier.
- **Upstream uses the declared type for:**
  - typing: `Other` → String, `SemiStructured`/`Json` → Variant, `DbSpecific` → its core type
    (`functions.pure:98-121`);
  - result-column types in the plan (`relationalMappingExecution.pure:220-257`);
  - null-safe equality;
  - DDL and test-data inserts;
  - how the Java executor reads values: variant columns are normalized as JSON, and JDBC `OTHER` is
    read with `getString`.
- **Upstream never casts a column on read because of its declared type.** Columns render bare
  (`dbExtension.pure:501-503`). The one exception is an opt-in Snowflake-activator post-processor for
  timestamps. `Other` becomes text only in the Java result reader, so upstream's SQL hits the same
  Postgres failures we measured (`json` has no equality, there is no `strpos(inet)`).
- **`DbSpecificDataType` is effectively vestigial:** no production database extension creates it.
- **So a cast-on-read rule is a deliberate divergence from upstream.** It is defensible: we read
  through DuckDB's decoder, not a JDBC driver, and the database must do string work on the value. It
  needs a `SEMANTICS_REGISTER` row.

## 3. Measured on Postgres 17

| | Result |
|---|---|
| `CAST(… AS VARCHAR)` of `inet`, `money`, `xml`, `point`, `interval`, `time`, `bytea`, enum | `10.0.0.1/32`, `$1.50`, `<a>1</a>`, `(1,2)`, `1 day`, `10:00:00`, `\x41`, `sad` |
| `strpos`, `GROUP BY`, `DISTINCT` on those texts | ✅, `xml` included |
| `GROUP BY` a bare `json` column | ❌ "could not identify an equality operator for type json" |
| `GROUP BY CAST(json AS JSONB)` / `CAST(jsonb AS JSONB)` | ✅ |

## 4. The design (recommended)

**4.1 Typing (frontend).**
- `StoreCompiler.scalarType`: `OTHER` → String, as upstream. `DISTINCT` → String, as upstream, if
  you agree (decision 2).
- `RelationalKinds.pureKindOf(OTHER)` → "String", so the normalizer stops emitting a redundant
  `castAsDeclared`.
- `ViewSignatures`: String instead of `Any`.
- `ARRAY` and `OBJECT` stay loud until the jsonb leg (P4).

**4.2 The fact: the declared type travels with the scan.**
- Move the `RelationalDataType → SqlDdl.ColumnType` mapping from `exec/Ddl` into the compiler
  (`StoreCompiler`); `Ddl` delegates to it. That keeps one owner and respects the import rules
  (`ArchitectureTest.java:498-510, 562-597`).
- `TableReferenceChecker` records each column's declared `ColumnType` on `TypedTableReference`,
  beside `quotedColumns`, read from the same `findTableDefinition` call (the precedent).
- The Lowerer stamps it on `SqlSource.Table` as a component, like `call`, not on `OutputCol`:
  - a stored type describes the raw value at the scan, and is no longer true after the read;
  - `OutputCol` is copied into about 148 places, which risks reading twice;
  - `Table` has 4 rebuild sites, each of which says what it carries (`AliasPrefix.java:41`,
    `SqlPostProcessors.java:243`, `CarrierStrategies.java:364`, `VerdictSql.java:1141`).
- The planned-frame CTE (rung 12) does not carry it: its body reads the `Table`.

**4.3 The read: the dialect decides (option A).** This is a dialect pass, `StoredReads`, registered
last in `passes()`, the `SourceSpelling` precedent.
- It maps each alias in the statement to its `Table`.
- Where the dialect's read rule for a column's stored type is not identity, it rewrites every
  reference to that column into a typed read, and expands `*`, `alias.*` and empty-projection selects
  over such a table into explicit lists.
- **The rules,** a protected dialect method on stored types:
  - base: `OTHER` → VARCHAR;
  - Postgres also: `JSON` → `JSONB`;
  - everything else: identity.
- **Why not option B** (read once at the scan, as a projection):
  - The SQL-generation layer is dialect-blind (`ArchitectureTest.java:686-702`). It would have to emit
    the read for every possibly non-identity column on every dialect, turning `SELECT *` into explicit
    lists on DuckDB and H2.
  - That changes pinned SQL text for any table with a JSON column.
  - Option A is byte-identical **by construction** wherever the rule is identity, which today is every
    table, since no `OTHER` table compiles.
- **The read node:** the shared `SqlType` has no `JSONB`, and the Postgres dialect refuses casts to
  JSON today (`Postgres.java:160-168`). So the pass emits a dedicated typed MIR record,
  `SqlExpr.StoredRead(column, ColumnType)`, which each dialect renders: `CAST(… AS VARCHAR)`, or
  `CAST(… AS JSONB)` on Postgres. That follows invariant 3a: a new typed record and a render arm, no
  SQL strings in MIR.

**4.4 Semantics: the read applies at every reference.** Filters, join keys, `GROUP BY`, `ORDER BY` and
`PARTITION BY` all see the same text, so the query is internally consistent.

What that means:
- **Text equality and ordering for `OTHER` columns.** Postgres `uuid` and `numeric` values compare
  differently as text, which is fine: the column is a Pure String.
- **No index use on those columns.**
- **A join between an `OTHER` column and a `VARCHAR` one starts working,** where today it fails.

What must stay loud (decision 4):
- **Milestoning date columns declared `OTHER`.** Text comparison of dates is silently wrong, and
  `TemporalFrame` builds comparisons straight from the row type.
- **Possibly primary keys declared `OTHER`.** graphFetch stitching and dedup would follow text
  equality on both sides, which is consistent, so they can be allowed.

## 5. How it would be proven

1. **The full chain, `bazel test //...`, green, with every roster and register unchanged.**
2. **A render census.** A small harness renders every corpus, PCT and stress query on DuckDb, H2,
   EngineStyleH2 and Postgres at the base and head commits, and diffs them. Every diff must involve an
   `OTHER` table, or a semi-structured table on Postgres. No such harness exists yet; it is part of the
   work.
3. **A unit test** that the `StoredReads` pass returns the identical tree (`==`) when no table holds a
   non-identity read.
4. **New tests:**
   - a table with an unused `OTHER` column compiles (today: a refusal), probed first;
   - a class mapping, a join, a view and the relation accessor over an `OTHER` column show the cast in
     DuckDB, H2 and Postgres SQL;
   - milestoning over `OTHER` is refused by name.
5. **Live:**
   - a Postgres table with `inet`, `money`, `xml`, `uuid`, `interval`, `json` and `jsonb` columns opens
     in DataCube; filter, group and `contains` work on all of them; `json` groups;
   - the same on DuckDB for `UUID` and `INTERVAL`.

## 6. Found on the way (separate fixes)

- **A missing `declaredQuoted`.** The rung-12 frame CTE has no `declaredQuoted` (`Lowerer.java:565-568`):
  a quoted column read through a planned class frame loses its quoting. Fix separately, with a test.

## 7. Order of work and size

1. **The typing (4.1):** `OTHER` → String. A table with an `OTHER` column compiles. Small.
2. **The fact (4.2):** the mapping moves to the compiler, the stamp goes on `TypedTableReference`, and
   `SqlSource.Table` and its 4 rebuild sites carry it. Small to medium.
3. **The read (4.3):** `StoredRead`, the `StoredReads` pass, and the dialect rules. Medium.
4. **The proof (§5):** the render census harness, the tests, the live run. Medium.
5. **Then the per-database catalog reading** (plan step 2): `OTHER` for whatever cannot be mapped, by
   name, and `json`/`jsonb` as semi-structured. This is what makes DataCube use all of the above.

## 8. Decisions

1. **Cast at every reference** (§4.4: internally consistent, no index use), or only in the output
   list (keeps indexes, but string functions in filters break)? Recommended: every reference.
2. **`DISTINCT` → String**, as upstream, alongside `OTHER`? Recommended: yes.
3. **The read node:** a dedicated `StoredRead` MIR record (recommended), or widen `Cast` with a
   Postgres `JSONB` target?
4. **What stays loud:** milestoning columns declared `OTHER` are refused by name (recommended); primary
   keys and join keys are allowed (consistent text semantics).
5. **The upstream divergence:** record cast-on-read in `SEMANTICS_REGISTER` as deliberate.
   Recommended: yes.
