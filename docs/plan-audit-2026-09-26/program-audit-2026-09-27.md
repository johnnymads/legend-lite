# Program audit, 2026-09-27: steps 0–2 as landed, the step 3 design as ruled

Read-only. Tree: `.claude/worktrees/build-audit` at `85a52239e` (origin/main, after the two DataCube
commits of this morning; nothing under `core/` changed since `0bb7ce662`). Every claim below was
checked against the code at that HEAD, against the pinned trees
(`$(bazel info output_base)/external/+http_archive+legend_pure_src` 5.99.0 and
`…legend_engine_src` 4.145.0, `MODULE.bazel:7-8`), and against the receipts on the desk
(`~/legend/platform-architecture/receipts/`), never against another document. Paths are relative to
`core/src/main/java/com/legend/` unless absolute. Severity: BLOCKER = the next push cannot start as
specified; WRONG = a stated fact or number is false; GAP = something the plan needs and does not say;
NIT = stale wording or citation.

**Read first — the blockers.** Two things stop step 3a as ruled; one stops 3c as ordered. Nothing
stops the probe push.

1. (#1) The ruled two-case `Callee` has no case for the member-access spelling `receiver.name(args)`.
   The reference resolves that spelling in the TYPER, after the receiver's type is known, and never
   searches the repository for it; today 126 corpus calls per lane reach our typer with ZERO function
   candidates because they are qualified properties, row getters, or syntax forms (`new`) that own no
   declaration. Under "a `Spelled` callee at the typer is a compiler bug" every one of them throws.
   The ruling needs a third case or a separate node; the user decides which.
2. (#2) Under "`Bound` is never empty, zero → wall", 3a must move the merge point's whole bare-name
   rule into the resolver — 43 distinct bare names, the PARSER's own `letFunction`/`getAll`/
   `tableReference` mints among them, reach the typer unresolved today — and it moves "unknown
   function" from a per-body typing failure to a per-element resolver wall. Revision 2 says neither.
   3a's "CANDIDATES identical" proof cannot hold unless both are in its homework, with a probe count.
3. (#3) 3c's "named, dated exception" for TDS in the matcher is a tolerance in the kernel kept to hold
   roster rows, which is exactly what rule 0.3 and step 3's stop rule forbid. The plan is wrong about
   the ORDER (3e's inventory belongs before 3c), not about the work.

What holds: every kernel-reading citation I re-read (twelve, §D), the step 1 differential numbers,
the step 2 probe multisets, the tier receipts' six names, the chain logs, the deletions step 2 claims.

---

## A. Blockers

### 1. BLOCKER — The sealed two-case `Callee` cannot carry a qualified-property call, a row getter, or `new`

**Claim** (`EXECUTION_PLAN` step 3 header, RULED 2026-09-27; `step3-design` revision 2 §1): the call node
carries `Spelled(name)` before the resolver and `Bound(spelled, declarations)` after it, never empty;
"a `Spelled` callee reaching the typer is a COMPILER BUG"; the typer's own desugars "can only construct
`Bound` from an overload group".

**Evidence.**
- Receipt `receipts/plan-audit-2026-09-26/step3/tiers/shadow-corpus_duckdb.tsv`: of 1,414 `CANDIDATES`
  rows, **126 have zero candidates** (`awk -F'\t' '$1=="CANDIDATES" && $3=="0"'`); H2 the same 126;
  the manifest census 18 of 563; `core_tests` 11 of 595. The names are qualified properties and
  properties of corpus classes (`synonymByType`, `employeeByLastName`, `traderAllVersionsInRange`,
  `productIdBridge`, `trader`, `vehicle`, `usdRate`, `header`, `leaves`, `name`, `value` …), the
  TDSRow/ResultSet row getters (`getString`, `getInteger`, `getDate`, `getEnum` …), and syntax forms
  (`new`, `col`, `agg`, `func`), plus ~12 absolute FQNs of functions absent from the World
  (`meta::alloy::metadataServer::alloyToJSON`, `meta::legend::compileLegendGrammar` …).
- Why they reach the typer bare: `compiler/spec/Typer.java:589-600` decides between "function of this
  arity" and "parameterized qualified property routed to `<owner>$prop$<name>`" by calling
  `functionCandidates(af)` FIRST and taking the property route when it is empty — the probe row is that
  call. The parser builds the dot spelling as an ordinary `AppliedFunction` with `propertyCall = true`
  (`parser/SpecParser.java:1389`; `protocol/spec/AppliedFunction.java` javadoc: "the compiler treats
  both spellings identically").
- `new` owns no declaration: `platform/CoreFn.java:63,391-392` ("empty for `NEW`"), minted by the
  parser (`SpecParser.java:1578` "Function name stays `new`") and the normalizer
  (`normalizer/MappingNormalizer.java:2706`); `Pure.INTERNAL_DESUGAR` names (`CoreFn.java:414`) likewise.
  The plan's own step 5 records both as "the two exceptions" — but under revision 2 §1 there is "no
  way to mint by name alone", so they cannot be constructed.
- The reference's shape (KR A2, verified at FEP:283-388 in the pinned tree): a `FunctionExpression`
  carries EITHER `functionName` (arrow / prefix spelling → repository search, FEM:42-56) OR
  `propertyName` / `qualifiedPropertyName` (dot spelling → `class_findPropertyUsingGeneralization`,
  `findQualifiedPropertiesUsingGeneralization` on the RECEIVER'S TYPE, FEP:290-380, :954-1094). The
  member cases are resolved type-directed, in the processor, and never touch the name index. There is
  no overlap: the syntax decides which of the three the node carries.

**What should change.** A ruling, not a workaround. Two honest shapes:
(a) a third case in the same slot — `Member(name)` — constructed by the parser for `propertyCall`
    nodes (and by the normalizer's property-shaped mints), never by the resolver, read only by the
    typer's property arm, which resolves it against the receiver's class (the reference's
    `_qualifiedPropertyName`); `Spelled`/`Bound` stay exactly as ruled for the arrow/prefix spelling;
    `new`/`INTERNAL_DESUGAR` become `Bound` to a declaration the catalog GAINS (the reference declares
    `new_Class_1__String_1__KeyExpression_MANY__T_1_`, `RES/grammar/functions/lang/creation/new.pure:29`)
    or stay a listed syntax node;
(b) a separate node kind for the dot-with-arguments spelling (`AppliedProperty` already exists for
    `$x.name`), which the ruling's "one slot, not a second tree" argued against.
I recommend (a): it is the reference's own data model and keeps the exhaustive switch. Until ruled, 3a
cannot begin: its first switch (`Typer.candidatesOf` → `case Spelled → throw`) fires on 126 corpus
calls per lane.

A second consequence, GAP-grade, for the same ruling: the arrow spelling `$x->qp(args)` is accepted by
`Typer:589` for ANY `AppliedFunction`, dot or arrow; the reference accepts a qualified property only
under the dot spelling (FEP:349, `_qualifiedPropertyName`). That is a tolerance the reference lacks;
the probe push counts `propertyCall == false` nodes that take the property route (expected: few or
none) so the ruling can say whether `Member` is minted from `propertyCall` alone.

### 2. GAP (blocks 3a's proof) — "`Bound` never empty; zero → wall" moves the bare-name rule and the failure point without saying so

**Claim** (revision 2 §1 "Who constructs what": "The resolver: `Bound(spelled, ids)` — the candidate set
under the rule of §2; zero → wall"; §1.4 of v1, still standing: "3a does not change which
declarations a call may mean … the resolver computes the same set it does today").

**Evidence.**
- Today the resolver leaves a bare name UNRESOLVED when its own tiers find nothing
  (`compiler/NameResolver.java:1699-1716`: `captured` is false, the node keeps its spelling, no
  candidates) and the TYPER's merge point applies the rule: `compiler/element/FunctionCompiler.java:35-57`
  walks `BareNames.tiered(fqn)` (engine surface, core group, form-owned) and writes the `merge` probe
  row. The receipts show **43 distinct bare names** served there in Pure source
  (`awk '$1=="BARE-TIER" && $5=="merge"'` over the three Pure-source shadow files): `filter 18,
  concatenate 18, groupBy 16, map 15, slice 12, project 12, distinct 12, eval 11, toString 9, match 9,
  letFunction 9, if 9, fold 9, extend 9, plus 8, and 8, select 6, rename 6, over 6, isDistinct 6, equal 6,
  descending 6, cast 6, ascending 6, times 4, tableToTDS 4, serialize 4, rank 4, pair 4, not 4, minus 4,
  joinStrings 4, isNotEmpty 4, isEmpty 4, graphFetchChecked 4, format 4, at 4, tableReference 3, join 3,
  toOneMany 2, toOne 2, execute 2, count 2` (row counts, one per tier FQN). Most are the typer's 69
  mints (revision 2 binds those by group). But `letFunction`, `getAll`, `tableReference`, `range`,
  `at`, `not`, `minus`, `plus`, `equal` are the PARSER's (`SpecParser.java:129, 607-656, 1021-1042,
  1261-1310, 2668`; 13 spellings), and `ascending`/`descending`/`eval`/`match`/`serialize`/`rank`/
  `graphFetchChecked`/`tableToTDS` are user-spelled. They reach the typer bare because the resolver's
  universe is `PLATFORM_FQNS` = `Pure.userResolvableFunctionFqns()` ∪ the prelude's functions
  (`NameResolver.java:339-346`), which excludes the form-owned and engine-surface FQNs `BareNames` adds.
- Under the ruling the resolver must therefore produce `Bound` for every one of these — i.e. apply
  `BareNames.tiered` itself to any bare name its tiers leave — and the merge point's bare branch
  (`FunctionCompiler:35-57`) must go in the same push, or a `Spelled` callee reaches the typer on
  every such call. Revision 2 §5's 3a row lists neither; §2 (3b) says the prelude merge is deleted
  "once the index holds the natives", which is 3b, one push later.
- Failure granularity: the resolver's wall sink walls an ELEMENT (`NameResolver.java:160-175`:
  "EXCLUDES those elements from the output"); the typer's "unknown function" (`Typer.java:1836-1843`)
  is caught per BODY (`Compiler.java:1122-1132`), and a class's constraints and derived properties are
  typed lazily (invariant 6). A class whose constraint names an absent function compiles at phase F
  today and fails only when that constraint is typed; under "zero → wall at the resolver" the class
  is excluded at phase D and every test over it loses. The 126 zero-candidate rows include ~12
  absolute FQNs of absent functions; which ELEMENT KINDS host them is not known.

**What should change.** 3a's homework states both: (i) the resolver applies the full bare rule
(`BareNames.tiered`, the same tiers, the same order) to a bare name its own tiers leave, and the
merge-point bare branch is deleted in the same commit, with the `merge` probe row moving to the
resolver so the 3a multiset proof still has both sides; (ii) a probe row at `Typer:1836` counting
zero-candidate calls by enclosing ELEMENT KIND (function / class constraint / derived property /
mapping / other), taken in the probe push; if any are outside function bodies, 3a's record names them
and the wall is recorded per element with that reason.

### 3. WRONG (stops 3c as ordered) — the "named, dated exception" for TDS in 3c's matcher is the tolerance the stop rule forbids

**Claim** (revision 2 §3, last paragraph): "Until 3e, 3c's matcher treats `TabularDataSet` exactly as
`paramTypeScore` does today for the parameter half … as a named, dated exception in the matcher with
the eight rows as its cost, removed by 3e. Otherwise 3c's OVERLOAD gate would be blocked on 3e's
inventory."

**Evidence.** `EXECUTION_PLAN` §0.3: "A step that needs a special case to keep the rosters is wrong and
stops." Step 3's stop rule: "A roster row that can only be kept by a name test, a tier, or a
tolerance in the kernel." The exception exists precisely to keep the rows every legacy `tds::*` call
over a relation-typed actual would lose (`compiler/spec/InferenceKernel.java:1362-1364, :1384-1386`
today let a `TabularDataSet` formal accept a relation actual; the erasure that makes the actual
relation-typed is `compiler/spec/TdsErasure.java:29-41`). The design's own reading of why it is
needed — "our TYPES differ from the reference's" — is the case the stop rule addresses with "fix the
type, never the rule". The stop rule does not say "unless the fix is inventoried later".

**What should change.** Order, not content: 3e's homework (the 45-reader inventory, the schema
carrier decision, the parameter-half PICK probe — revision 2 §3 items 1–3) is read-only and belongs
BEFORE 3c is written; 3c's matcher then reads the erased type honestly (whichever of §3's two
carriers the inventory picks) and carries no exception. If the user rules the exception acceptable,
that ruling goes in the plan with the date and the rows, and rule 0.3 is amended to say when a dated
exception is allowed; I do not recommend it. 3a, the probes and 3b are unaffected.

---

## B. Numbers in the records the receipts do not support

### 4. WRONG — The 2026-09-27 GATES entry's heap-peak table has no receipt

**Claim** (GATES.md "The local chain scheduled by measured memory", table): per-lane "peak heap (MB,
before GC)" and "live after GC" — `pct_duckdb` 8,191 / 7,892, `corpus_h2` 4,285 / 3,913, `diagnostics`
2,488 / 1,293 … — "receipts `step3/heap-peaks.log`, `solo-lanes-*.log`"; the `resources:memory:<MB>`
tags "declare their MEASURED peak plus headroom".

**Evidence.** `receipts/plan-audit-2026-09-26/step3/heap-peaks.log` is 45 lines: each lane's `PASSED in
Ns` line followed by "peak-used-before-GC per JVM (MB), by pid line prefix:" and then two
`ugrep: warning: …/testlogs/<lane>/test.log: No such file or directory` lines (20 such lines); no
number follows any header. `heap-peaks-table.txt` reads `0 0 0 0` for nine lanes and `missing` for
diagnostics. The lane TIMES in the entry (59.5s, 76.9s, 81.9s, 196.5s …) are in the log and hold; the
memory figures, and the tags derived from them (`core/BUILD.bazel`, `spec/BUILD.bazel`, `pct/BUILD.bazel`,
`parser-equivalence/BUILD.bazel` at `c89a5191f`), have no receipt on the desk. The chain runs green
with the tags, so nothing is broken; the record's "measured" is not supported.

**What should change.** Re-run each heavy lane alone with a GC log (`-Xlog:gc*` or JFR) and regenerate
the table, or amend the entry to say the peaks were read from a terminal and not kept. The tags stay
either way; the word "measured" needs its receipt.

### 5. WRONG — No corpus timing since step 0 meets the timing rule; several are called "on the curve"

**Claim.** Rule 0.3 (`EXECUTION_PLAN`): "on a quiet machine (`uptime` load under 2, no other Bazel)";
GATES 2026-09-27: "load under 3 at the start, or it is labelled contended". Step 2's record: "After the
fix, alone at load 6.4: passes 35s and 41s, wall 86.3s — on the curve." The step 3 homework record:
"load 3.8 at start … not the quiet reading the rule asks for; a quiet re-time is owed at step 3's
first timed gate".

**Evidence** (`receipts/untangle-4b/corpus-curve-duckdb.txt`, last five lines; `step3/solo-lanes-*.log`
headers): step 1 clean run load 3.18; step 2 load 6.4; homework load 3.8; `solo-lanes-at-615ab5b40.log`
opens at load **11.48** and `solo-lanes-at-671fbb88c.log` at 4.09 (both cited as "alone"); the
2026-09-27 table at 3.7. The pre-step-0 curve lines were taken at loads under 3 (the file's earlier
block). Every post-step-0 reading is labelled honestly for load, but three are then read as "on the
curve" or "alone", and the plan's own threshold is written two ways (under 2 in §0.3, under 3 in the
2026-09-27 rule).

**What should change.** One threshold (I use the 2026-09-27 rule: under 3, alone,
`--nocache_test_results`); the owed quiet re-time taken at the probe push (load was 1.66 at 13:22
today); GATES entries that say "on the curve" at load 6.4 amended to "contended".

### 6. WRONG (number) — `Pure.java` "2,381 → 2,870 lines"

`git show 671fbb88c:core/src/main/java/com/legend/builtin/Pure.java | wc -l` = 2,768; HEAD 2,768. The
488 groups (`grep -c 'FunctionId.ofAll('` = 488) hold. The line count in the step 2 record is wrong by
102 lines; under the guard either way.

### 7. WRONG (claim) — revision 2 §6 says the tier classifier was corrected; the code was not

Disposition #12: "§2: classifier corrected; six names". `tools/untangle/bare_tiers.py:47-51` still
reads `if any(t == {"ENGINE"}) → ENGINE-ONLY; elif not any("CORE" in t) → FORM`, so an FQN spelled by
ENGINE and FORM (`flatten`) is still bucketed FORM and still not counted as "served by a tier the
reference does not have". The homework TEXT was corrected (`homework-2026-09-26.md` §5, 615ab5b40);
the tool that produces the number was not. Fix before 3b's gate reads it.

### 8. WRONG (number) — the plan's pin table understates the function share of NAME_COMPARE four-fold

`EXECUTION_PLAN` §2: "NAME_COMPARE (function share, 20 of 207)". Measured at HEAD with the guard's own
pattern (`IdentityGuardrailTest.java:54-57`) restricted to callee/function receivers:
`callee().qualifiedName().<cmp>(` **63** sites, `<x>.function().<cmp>(` **15**, plus 18 on other
`qualifiedName()` receivers — 78 of 208 are function-identity compares by text. Sixty-three of them
are in the back half (`lowering/` 8: `Scalars:3433`, `Render:123,126`, `Lowerer:1197`,
`RelationPredicates:155` (`endsWith("::exists")`), `MatchFold:53`, `Comparators:108`; `resolver/` 37:
`GraphEmission` ×14, `InnerDemand` ×6, `Substitution` ×6, `AssociationJoins` ×5, `SyntheticHeads` ×2,
`Pipelines` ×2, `StoreResolver` ×2, `SubQueryLift`, `Anchors`, `CorrelatedSubselects` ×2), comparing
a typed callee's FQN to a string constant (63 `static final String …FQN = "meta::…"` constants exist in
main). Also `resolver/GraphEmission.java:2469 uc.callee().qualifiedName().contains("$prop$")` — the KIND
of a synthesized head (a lifted property's body function) recognised by a marker in its NAME. The
step 2 record's "left for step 3, by count" lists the 18 `findFunction("meta::…")` and ~70
`isToOneCall` sites (both verified: 18 in 8 files; 73) and not these. They are the callee-identity
work of step 3 (a `Bound`/`TypedFunction.id()` group test) and the `$prop$` marker needs an owner.

### 9. NIT — smaller number and citation drift in revision 2

- "`protocol` may depend on `protocol` and `base` only": `core/BUILD.bazel` `protocol` deps are
  `//base`, `//json`, `:values`; `ArchitectureTest.java:403-411` (7b) allows values and the JSON codec.
  The conclusion (a JDK-only record satisfies the rule) holds.
- "Callers: 37 `of` + 12 `ofAll` in main/test": 32 main + 13 test `FunctionId.of(` = 45; 12 `ofAll`
  outside `Pure.java`; 488 inside. Mechanical either way.
- `EXECUTION_PLAN` step 3 gate: "FUNCTION_CATEGORY_CHECK 13 → 11" — the pin is 14 (`IdentityGuardrailTest:148`,
  dated); revision 2 §5 says 14 → 12 correctly; the plan text was not updated (audit #28).
- `EXECUTION_PLAN` §3 bootstrap: "**Gates:** `bazel test //... //parser-equivalence:diagnostics`" —
  contradicts rule 0.7 as corrected 2026-09-27 and `IN_FLIGHT` rule 6.
- The plan's step 3 gate names "kernel ≤ 164" as a census pin; `ManifestWorldCensusTest.java:346-349`
  pins walls ≤ 32 and failures ≤ 1,447 only. The kernel number is a report line, not a pin.
- The handoff says "the three probe counts (v1 §2.5, revision 2 §5)"; v1 §2.5 has two, v1 §6 adds the
  silent-survival count (three), revision 2 §5's probe row lists five more. Six are cheap; the probe
  push takes all of them (§E).

---

## C. Gaps in the step 3 design as ruled

### 10. GAP — 3a is five times the size revision 2 states, and two files it must touch are at the line guard

Revision 2 §9/§1: "~80 sites, mechanical". Counted at HEAD: `af.function()` readers **107** and other
`.function()` readers on call nodes ~45 (compiler/spec 77, lineage 28, normalizer 12, compiler 12,
validation 9, parser 8, model 3, testdatagen 2, builtin 1) — under the ruled shape every one becomes
`callee().spelled()` or a switch; typing-time literal mints **69** (matches revision 2 exactly: Typer 30,
LambdaBodies 7, JoinChecker 6, ValidateDesugar 5, JsonChecker 4, CallShapes 4, IsDistinct 2,
GroupLambdaAggs 2, GroupBy 2, one each in Project/Fold/Extend/Distinct/StaticFold/StatementInline/
ServiceTestRunner); `candidateFqns` readers 21 in 10 files + 4 in `NameResolutionContractTest`;
`AppliedFunction` constructions outside `parser/` and `protocol/` 289 (audit #1's count, re-verified),
plus `spec/src/test/java/com/legend/rcorpus/MinimalCorpus.java`. `Typer.java` is 3,489 lines against
the 3,500 guard (`CodeShapeGuardrailTest.java:38`, `Files.lines().count()`), `Lowerer.java` 3,499.

**What should change.** State the counts. Keep the `String`-taking constructors as `Spelled`
factories (the parser's and normalizer's 126 constructions are legitimately text, they need not
change); mint through a helper class OUTSIDE `Typer` (`compiler/spec/Mint.java`: `Mint.call(group…,
args, pos)`) so the 30 Typer mints are line-neutral; the candidate-collection switch replaces
`candidatesOf` (`Typer:2536-2557`, 22 lines) rather than adding to it. If Typer still crosses 3,500,
rule 0.6 applies: the split along `applyCore`/checkers (step 4's seam) is pulled into 3a with the seam
named — not a `FILE_ALLOWLIST` row.

### 11. GAP — `IN_FLIGHT` "Owns" does not cover 3a's files

The untangle owns `compiler, platform, builtin, lowering, resolver, normalizer, element` and the named
tests. 3a touches `protocol/spec/AppliedFunction.java` (+ `Callee.java`), `protocol/FunctionId.java`,
`model/FunctionIds.java`, `parser/SpecParser.java`, `parser/OperatorParts.java`, `lineage/PkInference.java`,
`lineage/ScanRelations.java`, `validation/ValidateDesugar.java`, `test/ServiceTestRunner.java`,
`spec/…/rcorpus/MinimalCorpus.java`, and the `spec` generators that import `model.FunctionId` (six
files). Rule 7: a one-line entry before they land. Added with this audit's status line.

### 12. GAP — `PackageableElementPtr.referent` as a nullable field

Revision 2 §1: "`PackageableElementPtr` gains `@Nullable FunctionId referent`". The same section's
reasoning rejects "a nullable field" for the callee. A pointer names elements of every kind, so
nullable is defensible there — say so, or give it the same sealed treatment. `equals`/`hashCode`
exclude `pos` today (`protocol/spec/PackageableElementPtr.java`); the record must say whether they
exclude `referent`.

### 13. GAP — the `DUPLICATES` probe row lists ten duplicated ids; the record explains four

`step3/tiers/shadow-spec_tests.tsv` row `DUPLICATES … 10`: `toDomainValue`, `enumerationMappingByName`,
`classMappingById`, `propertyMappingsByPropertyName` (×2: `PropertyMappingsImplementation`,
`InstanceSetImplementation`), `schema`, `table`, `view`, `column`, `childByJoinName`. The step 2 record
and `SpecBodyCensusTest.java:290-301` wall FOUR (pin 1 → 5). Where the other six go
(`ModelIntegrity.checkDuplicateSignatures`, `compiler/element/ModelIntegrity.java:157-173`, walls a
duplicate only among `fresh` definitions not in `priorKeys`; `probe/Shadow.java:112` emits the row) is
not written down. Reconcile before 3d ("one declaration per id") reads the count.

---

## D. What was checked and holds

- **Reference citations** (pinned legend-pure 5.99.0): FEP:200-215 (accept test), :223-227 (retry),
  :258-261 (silent survival); TI:114-117 (lambda typing throws); MM:284-291 (MAX upper, `[*]` arg
  rejected); TM:394-399 (Nil before FunctionType); GTM:171-177 (T target → NON_CONCRETE);
  IVP:209-213 (`[n]`); Imports.java:52-65; IS:216-233; Multiplicity.java:78-83; FEM:159-170;
  FM:83-100; m3.pure:175-211 (29 import paths; `grep -c meta:: ` over :181-211 = 29);
  `contravariant: true` at m3.pure:223/:228 (the `properties` property's generic type, :221),
  :1339, :3078, :3535; :2772 `false`. Audit #24's reading stands; revision 2 §4 adopted it.
- **Engine list**: `CompileContext.META_IMPORTS` in the pinned engine has 32 entries; ours
  (`NameResolver.java:213`) is generated from it — the 29 + 3, as `tools/reference/README.md` says.
- **Step 1 numbers**: `receipts/reference-differential/join-positional-pre-step2.txt`: AGREE 42,589 /
  OVERLOAD 450 / PACKAGE 11 / SOURCE_DRIFT 52,266 / ABSENT 42,174 / PROPERTY_AS_CALL 31 / EXTRA 12,971;
  `toOne` 2,504, `elementToPath` 1,518 — all as recorded.
- **Step 2 probe**: `step2/shadow-{pre,post}-a2.tsv` 2,163 rows each; CANDIDATES 1,414 / PICK 629 /
  FORM 69 / OVERLOADS 51; sorted diff = two rows differing only in a position set's print order
  (`Intrinsic[SCALAR, AGGREGATE, WINDOW]` vs `[WINDOW, SCALAR, AGGREGATE]`) — as recorded.
- **Step 2 deletions**: `Function.signatureKey()` gone (9 remaining mentions are javadoc and a
  `signatureKeys` set of `FunctionId`s in `PureModelContext:105-125`); no `new FunctionId("…")` in
  main (4 in tests, `DeclarationTableTest`, `ImplementationTableTest`); `FunctionId.all(…)` at 31
  sites, every one in a static registration or a static final (the timing-regression pattern is
  gone); `nativeFunctionsAt("…")` literal 0.
- **Tier receipts**: `bare-tiers-pure-source.tsv` `resolver-added` rows = the six names the corrected
  homework lists (`currentUserId`, `flatten`, `get`, `toString`, `wtd`, `ytd`).
- **Profile receipts**: 256/1,484 and 252/1,307 `NameResolver` samples; the corrected 2–5%-of-wall
  wording matches.
- **Chains**: `step2/chain-final.log` 96/96 + 3/3; `step3/chain-1-guardrail-caught.log` 96/97
  (`//core:guardrails` red as recorded); `chain-2-under-other-account-load.log` 93/97 with the four
  TIMEOUTs named; `cold-chain-before/after-scheduling.log` 636.6s/563s critical path 99/99 →
  430.8s/285s 101/101 — as recorded.
- **Pins**: every pin that moved in the window carries a dated reason in the file
  (`IdentityGuardrailTest:136-152`, `JavaEvalLedgerTest` StatementExecutor 2415 → 2413,
  `SpecBodyCensusTest` 1 → 5, `ArchitectureTest` 6j `com.legend.json`). `MinimalCorpusTest.PER_TEST_CEILING_MS`
  60,000 unchanged. No allowlist row added for a back-edge.
- **Tolerance scan** of the eight untangle commits' added main-code lines: the `orElse(null)` and
  `id == null ? Optional.empty()` lines are the `NativeFn.*.of(FunctionId)` lookups' "absent"
  answers read by the caller, not fallbacks to a name; no new `catch`, no tolerant mode.
- **Design citations** re-checked at HEAD: `AppliedFunction.withParameters` copies every field
  (`:104-107`); `equals` includes `candidateFqns` (`:150`); `NameResolver:1744-1748` single-match
  rewrite; `:1714-1729` prelude merge and its probe; `CallShapes:80 isMany()`; `Typer:2744-2761`
  literal sum; `StatementExecutor:2569, :2745` `isMany()`; `InferenceKernel:1133 allSameShape`,
  `:1200` tie error, `:1364/:1381/:1386` TDS scoring; `PureModelContext:365-380 findFunctionById`;
  `TdsErasure:29-41`.

---

## E. What the probe push takes (probe-only, no design dependency)

All with `LL_SHADOW=1` over both corpus lanes and the manifest census, receipts to
`receipts/plan-audit-2026-09-26/step3/probes-pre-3a/`, counts in the GATES record:
1. own-package hits (v1 §2.5): resolutions served by the own-package tier alone;
2. core first-match hits for TYPE names (v1 §2.5): a type name in two core packages, first wins;
3. silent-survival upper bound (v1 §6.2): `checkWithDeferred` retries that succeed on a non-first
   candidate;
4. `lifted.size() > 1` at the three qualified-property arms (revision 2 §4, `Typer:569, :589-641,
   :3020-3044`);
5. collection literals whose bound-sum ≠ element count (revision 2 §4);
6. `Pure.all()` minus `userResolvableFunctionFqns()`, by package (revision 2 §2);
7. (this audit, #2) zero-candidate calls at `Typer:1836` by enclosing element kind;
8. (this audit, #1) `propertyCall == false` nodes that take the qualified-property route at `Typer:589`;
9. (this audit, #2) the merge point's bare names split by producer — parser mint / typer mint /
   user-spelled — so 3a's resolver takeover has its before-count;
plus the owed quiet corpus timing (#5).
