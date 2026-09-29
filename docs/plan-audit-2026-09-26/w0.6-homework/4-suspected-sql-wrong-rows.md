# W0.6 homework 4 — suspected SQL wrong-rows defects (A–I)

Read-only homework, drafted by a subagent at `compiler/rebuild` @ `89dc45871` and persisted verbatim by the parent session
(2026-09-29). **No lite end-to-end run** (only existing tests were allowed, and none cover these shapes). "Ran" means the
exact SQL lite (or the engine) emits was executed on the DuckDB 1.4.4 CLI (the pinned `duckdb_jdbc` 1.4.4.0) and on H2
2.1.214 (the pinned jar, from the IntelliJ JBR, URL `MODE=LEGACY`). Abbreviations: `PURE` =
`…/+http_archive+legend_pure_src` (5.99.0); `ENG` = `…/+http_archive+legend_engine_src` (4.145.0); `REL` =
`ENG/legend-engine-xts-relationalStore/legend-engine-xt-relationalStore-generation/legend-engine-xt-relationalStore-pure/legend-engine-xt-relationalStore-core-pure/src/main/resources/core_relational/relational`;
`RELF` = `ENG/legend-engine-core/legend-engine-core-pure/legend-engine-pure-code-functions-relation/legend-engine-pure-functions-relation-pure/src/main/resources/core_functions_relation`.
Lite paths under `core/src/main/java/com/legend/` unless stated.

**Key fact for reading the corpus rosters:** lite's corpus judges SQL-text asserts on rows, never text
(`docs/SQLTEXT_ROW_VERDICT_CHARTER.md` §0), and the corpus fixtures contain no rows where both sides are NULL, so a green
corpus says nothing about A.

## Ranked verdicts

| rank | suspect | verdict | fix now (D14)? |
|---|---|---|---|
| 1 | A: null-safe `==` decided by operand shape | **REAL wrong answer** (silent row loss) | yes, local fix |
| 2 | A2: `verbatim` on ModelJoin/XStore conditions | **REAL, predicted** (engine goldens witness it) | yes, after a lite run confirms |
| 3 | F: `splitPart` DuckDB vs H2 | **REAL cross-backend divergence**; which side is right needs a ruling | ruling first |
| 4 | H: `sum`/`plus` over an empty *list* | **REAL wrong answer** (NULL where Pure gives 0) | yes, local fix |
| 5 | G: float-literal magnitude cliff | **REAL divergence**: DuckDB changes answer by magnitude; H2 differs from engine-H2 | ruling (charter Rule 1) |
| 6 | D: `first`→`ANY_VALUE`, unordered `STRING_AGG` | nondeterminism only (same as engine); side finding: `ANY_VALUE` does not exist on H2 2.1.214 → loud error | no, pin |
| 7 | C: null-strictness blacklist | label-only; no row change (by code reading) | no (W5.2) |
| 8 | E: filter pushed below a window | **correct per PCT and engine**; the Pure interpreter disagrees and is excluded in the manifest | no; record a spec conflict |
| 9 | B: `NOT IN` with NULL in the list | correct | no |
| 10 | I: scalar subquery returning >1 row | correct (both backends raise; ran) | no |
| – | H (group/window form), G (NaN/±Inf) | group/window correct per PCT; NaN/±Inf a loud failure, not wrong rows | no |

## A. Null-safe equality chosen by operand shape — REAL

**Pure:** `[] == []` is true (`PURE/legend-pure-core/legend-pure-m3-core/src/main/resources/platform/pure/grammar/functions/boolean/equality/equal.pure:230-233`,
PCT `testEqualEmpty`). **Engine:** multiplicity-driven, never operand shape: `REL/pureToSQLQuery/pureToSQLQuery.pure:8447-8462`
(`nullSafeEqualsOperation`: case 4 an optional `VarPlaceHolder` on either side → `nullSafeEqual`; case 5 both operands
lower bound 0 → `nullSafeEqual`). The dbExtension `isEqualsFromFilter` arm (`REL/sqlQueryToString/dbExtension.pure:1111-1115`)
is an extra arm for store-authored filters, not the rule. Engine goldens with null-safe equality on non-column operands:
`REL/tests/mapping/modelJoin/testModelJoinSimple.pure:252` (`lower(...LASTNAME) is not distinct from lower(...CODE)`),
`ENG/…/relationalStore-postgres-pure/…/executionPlanTestPostgres.pure:67` (`case when … end is not distinct from
${optionalActive}`).

**Lite:** `lowering/NullSemantics.java:116-123` additionally requires `ops.get(0/1) instanceof SqlExpr.Column`, so any
`[0..1]` computed operand (a mapped DynaFunction property, `if`/CASE, an optional `PlanParam`) gets bare `=` and rows
where both sides are NULL are dropped. Called from `lowering/Scalars.java:164`; `NullSemantics.verbatim` (`:101-105`) is
applied at `Lowerer.java:1576`, `:2359`, `:3027`, `:3035`.

**Reproduction** (DuckDB; extend the model in `core/src/test/java/com/legend/lowering/NullSemanticsTest.java`):
```
Class m::A { name: String[1]; street: String[0..1]; ustreet: String[0..1]; n: Integer[0..1]; }
###Relational
Database s::DB ( Table A (NAME VARCHAR(50), STREET VARCHAR(50), N INTEGER) )
###Mapping
Mapping m::M ( *m::A: Relational { ~mainTable [s::DB] A
    name: A.NAME, street: A.STREET, ustreet: toUpper([s::DB] A.STREET), n: A.N } )
```
Data (the existing rows) `('a','Loop',5),('b','Main',NULL),('c',NULL,30)`. Query `|m::A.all()->filter(a|$a.ustreet ==
$a.ustreet)->project([a|$a.name], ['name'])`: Pure and the engine `[a,b,c]`; lite predicted `[a,b]` (UPPER is a `Call` →
the `=` arm). Not run. A second form with no mapping change: `filter(a|if($a.n > 0, |$a.street, |$a.street) ==
$a.street)` → Pure `[a,b,c]`, lite predicted `[a,b]`. Optional-parameter sub-case (engine case 4): `{s:String[0..1]|
m::A.all()->filter(a|$a.street == $s)}` with `s` absent should return `c` (not run; see `plan/InProtocol.java:95-99`).

**Fix:** port cases 4/5 as written: null-safe iff both typed lower bounds are 0, or one side is an optional plan
parameter; delete the `SqlExpr.Column` test; keep the enum arm (`enumInvolved`), `legacyNullUnsafeEquals`, verbatim.
Local and correct today. **Blast radius:** no unit test pins `=` for a non-column `[0..1]` pair (grep);
`ElementParserTest:1749`, `MappingNormalizerTest:3132`, `ResolveSimpleClassTest:185` involve literals or store joins;
`NullSemanticsTest` stays green; engine-style text moves toward the engine goldens; the corpus differential should flip
rows only on fixtures with NULL pairs.

## A2. The `verbatim` stamp on ModelJoin/XStore conditions — REAL, predicted

Engine: a ModelJoin condition is a Pure lambda and gets Pure `==`:
`REL/tests/mapping/modelJoin/testModelJoinAdvanced.pure:928` (`testComplexRelationFunction`, condition `$employees.city
== $firm.city`, both `+city:String[0..1]`, `modelJoinAdvancedSetup.pure:430-454`) renders `"persontable_0"."CITY" is
not distinct from "firmtable_0"."CITY"`. Lite: every resolver-synthesized join is built with `userCondition=false`
(`resolver/Pipelines.java:505-511`, `:672-678`), which at `Lowerer.java:1975-1985` forces verbatim `=`; CORRELATION
filters likewise (`Lowerer.java:1500-1502`). No distinction between a store `Join` (plain `=` correct) and a Pure-lambda
association condition (needs null-safe). **Reproduction:** the engine's `testComplexRelationFunction` model (already in
lite's corpus, passing on rows) plus a firm with an empty CITY; Charlie (no address row → CITY NULL through
`personWithAddressJoined`) must join it on `Person.all()->project([x|$x.firstName, x|$x.firm.legalName],…)`; lite
predicted null for that firm name (not run). **Fix:** provenance on the join condition: store-join plain; ModelJoin/XStore/user
lambdas get equality kinds (the meta-audit's "two equality kinds", scoped to one flag on `TypedJoin` and `TypedFilter`).
Confirm the lite behaviour first.

## F. `splitPart` — REAL divergence; the spec is contested

Pure: `splitPart(str,token,part) = $str->toOne()->split($token)->at($part)`, 0-based
(`ENG/legend-engine-core/legend-engine-core-pure/legend-engine-pure-code-functions-unclassified/legend-engine-pure-functions-unclassified-pure/src/main/resources/core_functions_unclassified/string/split/splitPart.pure:17-23`).
The spec pulls two ways on `split`: the doc says the separator is "matched literally" (`PURE/…/essential/string/split/split.pure:17-21`);
the interpreter uses `StringTokenizer` (`PURE/legend-pure-runtime/legend-pure-runtime-java-engine-interpreted/…/string/split/Split.java:54-60`:
the token is a character set, adjacent separators collapse); the multi-character PCT is commented out as "incorrect
behaviour … TODO" (`splitPart.pure:46-54`); no active PCT distinguishes them (`testSplitPartTypicalToken` `', '` →
`Phone` either way). Engine H2: `legend_h2_extension_split_part` is commons `StringUtils.split`, a character set
(`ENG/…/LegendH2Extensions.java:201-216`); engine DuckDB: bare `split_part` (`duckdbExtension.pure:276`), whole string,
no collapse. Lite DuckDB: `list_filter(string_split(s,t), x->x<>'')[p]` (`sql/dialect/DuckDb.java:576-587`), whole string
with collapse; lite H2: `REGEXP_SUBSTR(s,'[^…]+',1,p)` (`sql/dialect/H2.java:719-735`), character set.
**Reproduction (both SQL forms ran):** `|#>{local::DB.t}#->extend(~p0: x|$x.s->toOne()->splitPart(',;', 0))` on row
`'p;q,r'`: H2 → `p` (the interpreter also `p`); DuckDB → `p;q,r`. Same query in
`H2SplitPartTest.aMultiCharacterSeparatorIsASetOfCharacters` (`core/src/test/java/com/legend/sql/dialect/H2SplitPartTest.java`,
H2 only); run it on DuckDB to reproduce. **Fix:** needs a ruling (interpreter/engine-H2 character set, or the doc's
literal); either spelling is local to its dialect (character set on DuckDB: `regexp_extract_all(s,'[^…]+')[p]`, not
verified; literal: rewrite the H2 side and `H2SplitPartTest`). **Blast radius:** `H2SplitPartTest`; `ExtendCheckerTest:1084`
and `TypeInferenceIntegrationTest:1453-1490` use single-character separators (unaffected).

## H. `sum`/`plus` over an empty collection — REAL for the list form

Pure: `sum = plus` (`ENG/…/core_functions_standard/math/aggregator/sum.pure:17-30`), `plus([])` is `0`
(`PURE/…/grammar/functions/math/operation/plus.pure:20-23`; interpreted `Plus.java` case 0); `average([])` fails
(`average.pure:17-30`). Lite list form: `Scalars.java:1277-1281` (`sum`) and `:289-290` (`plus`) emit `list_sum(list)`;
DuckDB `list_sum([])` and `list_sum(list_filter([1,2,3], x->x>5))` both return NULL (ran), so the Integer[1] result
comes back null/empty. **Reproduction** (DuckDB, style of `TypeInferenceIntegrationTest:700-722`): `|#TDS\nv\n5\n#->extend(~s:
x|[1,2,3]->filter(y|$y > $x.v)->sum())` → Pure `s = 0`, lite predicted `s = null` (not run); the literal-only
`|[1,2,3]->filter(x|$x > 5)->sum()` may fold before SQL, so use the correlated form. Group/window form: correct per PCT
(`testExtendAddOnNull` expects `null` for an all-NULL group, `RELF/relation/tests/composition.pure:1194-1226`; the
interpreter's actual `0` is an excluded failure, `RELF/pct-manifests/core-interpreted/RelationFunctions_manifest.json:4-6`);
lite's `SUM` → NULL matches. The correlated reducer subquery (`lowering/RelationPredicates.java:264-295`, e.g.
`average($this.employees.age)`) returns NULL, matching the engine: record as engine parity. **Fix:** in the two list
rules only, `COALESCE(list_sum(x), 0)` with 0 typed to the Pure return kind (Integer/Float/Decimal); correct today; do not
touch group/window SUM. **Blast radius:** `CarrierDifferentialTest:532-535` (SQL-level `LIST_SUM` fixtures) unaffected; no
test pins a NULL empty sum.

## G. Float literal typing — REAL divergence (magnitude cliff; H2 vs engine-H2)

Pure: interpreted Float is BigDecimal (`PURE/…/PrimitiveUtilities.java:80-83`), so `3*0.1 == 0.3` is true there; PCT uses
tolerances (`…/math/operation/times.pure:93-96`), so exact IEEE is not pinned. Lite: `AnsiSqlRenderer.plainFloat`
(`sql/dialect/AnsiSqlRenderer.java:1370-1378`) writes values ≥1e15 or <1e-6 in exponent form, which DuckDB types DOUBLE
(the rest DECIMAL). **Reproduction (the SQL ran):** table `t(i)` with `i=3`, `filter(x|$x.i * 0.00000013 == 0.00000039)`:
DuckDB renders `i*1.3E-7 = 3.9E-7` → **false** (row dropped); H2 TRUE (DECFLOAT); the interpreter true; `$x.i * 0.13 ==
0.39` TRUE on both. Engine-H2 renders Float literals `CAST(%s AS FLOAT)`
(`REL/sqlQueryToString/dbSpecific/h2/h2Extension2_1_214.pure:152`; lite's own `EngineStyleH2.java:1138-1144` spells it
in text): `i*cast(0.1 as float) = cast(0.3 as float)` is FALSE on H2, while lite's executed `i*0.1 = 0.3` is TRUE (ran).
NaN/±Inf: `BigDecimal.valueOf(NaN)` throws; ±Inf renders bare `Infinity` (a SQL error); both loud, and Pure has no
NaN/Inf literal (not run in lite). **Fix:** needs a ruling on NUMERIC_CHARTER Rule 1: if it holds (DECIMAL), always spell
plainly with no cliff and choose DECIMAL precision per value; otherwise a DOUBLE cast everywhere; either is local to
`plainFloat`. **Blast radius:** DuckDB goldens with extreme literals; the ladder `r11_floatLeniency` SQL resources.

## D. `first()` → `ANY_VALUE`, unordered `STRING_AGG` — nondeterminism only

Lite: `lowering/Aggregates.java:43-48`; `Lowerer.java:1323-1332` (the unordered-order ruling of 2026-09-20). Engine:
DuckDB `first(%s)` (`duckdbExtension.pure:222`), default `first_value` (`extensionDefaults.pure:223`) — both unordered.
NULLs: Pure empties vanish from collections, so a group's `first()` is its first *non-empty* value; `ANY_VALUE` skips
NULL, DuckDB `first` does not (ran: `(null),(1),(2)` → `any_value=1`, `first=NULL`): lite's choice is the Pure-faithful
one. **Side finding:** H2 2.1.214 has no `ANY_VALUE` (ran: error 90022); lite's H2 `reducer` (`sql/dialect/H2.java:531-575`)
has no arm for it, so `groupBy(…, y|$y->first())` fails on H2 (loud; not run in lite). **Fix:** keep; classify
nondeterministic in D6; add an H2 spelling or a refusal; an ordered aggregate for `sort→groupBy→first/joinStrings` is an
optional improvement.

## C. Null-strictness blacklist — label-only

`SqlTyping.nullStrict` (`sql/SqlTyping.java:708-729`) does count CONCAT (and GREATEST) as strict; ran:
`concat(NULL,'y')='y'` on DuckDB and H2, `greatest(1,NULL)=1` on both. `wherePadNeutralized` (`:602-625`, from
`sql/SqlSelect.java:44-51`) changes **only output nullability labels**; the emitted SQL keeps its `LEFT JOIN … WHERE …`;
no lowering or dialect branch reads those labels (grep `.nullable()`/`mayBeNull` outside `SqlTyping`: transport and
census only, `exec/SqlTypeCensus.java:250-265`). Repro: `Person.all()->filter(p|$p.firm.legalName + 'y' == 'y')` returns
correct rows (Pure `[]+'y'='y'`); the only visible effect is a census "required label saw NULL" breach (not run). **Fix:**
a whitelist in W5.2, not D14.

## E. Filter pushed below a window — correct per PCT

Lite: `lowering/Fold.java:265-276` (comment `:280-295`). PCT `testExtendFilterOutNull`
(`RELF/relation/tests/composition.pure:1115-1155`) expects the window to see the *filtered* rows (`p=0 → 20`, `p=100 →
60`). Every relational adapter passes (the H2, DuckDB, Postgres and other `RelationFunctions_manifest.json` have no
exclusion); the in-memory interpreter and compiled Pure are *excluded*, with relational-algebra values `110/50`
(`RELF/pct-manifests/core-interpreted/RelationFunctions_manifest.json:9-10`, `core-compiled` idem). So PCT and the engine
agree with lite; only the interpreter differs. Counterexample: exactly that test (interpreter `0,1,10,50` vs PCT and lite
`0,1,10,20`). **Action:** do not "fix" (it would fail PCT); register it as a declared spec conflict and exclude it from
TLP/NoREC. **Blast radius if changed:** `lowering/FoldTest.java`, `integration/RelationMappingWindowSeamTest.java`, the
corpus PCT row.

## B. `NOT IN` with a NULL in the list — correct

`in` always lowers to `COALESCE(x IN (…), false)` (`Scalars.java:2400-2486`); relation/collection right-hand sides go to
`Membership`; `negate`'s IN arm (`NullSemantics.java:190-192`) is not reached for user `in`. `NOT COALESCE(5 IN (1,NULL),
false)` is TRUE = Pure (empties are never members; engine `processNotIn`, `dbExtension.pure:1159-1165`). Ran: `5 in
(1,NULL)` → NULL; `list_contains([1,NULL],5)` → false. `EngineStyleH2.java:1282-1305` strips the COALESCE, but that
renderer is text-only, "never for execution" (class doc).

## I. Scalar subquery with more than one row — correct

DuckDB 1.4.4 and H2 2.1.214 both raise (ran); lite does not disable `scalar_subquery_error_on_multiple_rows`
(`DuckDb.java:32-34`); a `[0..1]`-stamped distinct deliberately relies on that raise (`Lowerer.java:3155-3178`, D6),
matching Pure's `toOne` failure.

## Unverified / open

- No lite query was executed end-to-end; each "predicted" needs the parent's new test.
- A2 assumes ModelJoin conditions reach `Pipelines` synthesis with `userCondition=false` (code reading); confirm with the
  added fixture.
- How the engine emits null-safe for `testFunctionInCondition`'s `toOne()`-wrapped operands was not traced; the golden
  itself is the evidence.
