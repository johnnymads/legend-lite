# Meta-audit lens 4 — the plan's module and dependency claims, checked against the whole class graph (ee7617ec8)

Read-only on the repository; persisted by the parent session. The reviewer's tools and outputs (`graph.py`, `analyze.py`,
`targets.py`, `sim.py`, `q.py`, …; `out/class-edges.tsv` 7,717 rows, `graph.json` with every site's lines,
`package-edges.txt` 241 rows, `sccs.json`, `violations.txt`, `target-edges.tsv`, `corrected-map-sim.txt`,
`model-classes.txt`) are kept at `~/legend/platform-architecture/receipts/meta-audit-2026-09-29/java-dependency-graph/`.

## Verdict

**Rule 0.12's direction is right and the carve order holds (no class-level cycle forces a different order), but the §1b
table is guessed.** Its four "today's violations" are real; its "may depend on" columns are intent, not direct-dependency
lists: they omit targets every stage names directly (`types`: Type, Multiplicity, ExprType, ~6,000 sites outside their
package; `ids`, `error`, `values`, `catalog`), name targets that don't exist (`ids`, `types`, "syntax types", "errors"), and
have no row for the World stage (ModelBuilder and friends), `model`, or 11 other packages. Rule 0.12 compares direct deps
exactly and Java strict deps require a direct dep for every class named in source, so e.g. `typer: resolved, elements,
typed, catalog` can never pass (the typer names `Type` 2,169 times). The fix is measured and modest: after ~70 sites of
moves plus W1.9's 112, a corrected map is acyclic (simulated). Of 20 class-level strongly connected components, exactly one
crosses a proposed boundary (`SetId` ↔ `MappingDefinition`/`ClassMapping`). The compiler quartet is a package cycle made of
acyclic class edges; it can be split in the plan's order (W2.3a, then W3) provided `world` is also carved at W2.3a, which
the plan does not say.

## Method and validation

Parser `graph.py`: all 715 main `.java` files (excluding package-info); comments, strings, char literals and text blocks
stripped with line numbers kept; single-type imports (java.* too), static imports, every fully-qualified
`com.legend[.x]*.Y` reference in code incl. the root package; simple names resolved nested-in-file, then explicit import,
then same package (core has no wildcard imports). Output: 7,717 file-level edges and 52,945 cross-package reference sites.
**95 of 241 package edges exist only through FQN references** (import-only analysis misses 39%, incl. 3 of the quartet's
cycle edges). Checked against Bazel by collapsing to today's 29 targets and comparing with `core-layers.txt` (re-ran
`bazel query` live on `//core:resolver` and `//core:cache`): the source finds zero edges Bazel lacks; Bazel declares 4 deps
no source uses (`cache→base`, `lowering→protocol`, `resolver→platform`, `exec→platform`; comments only), which the exact
baseline freezes. No string literals name `com.legend.*` classes (no reflective edges).

## 1. Dependency facts

### Package edges (selected; full list in the receipts)

| from → to | sites / class edges | note |
|---|---|---|
| builtin → model | 2024 / 18 | `Pure`→`NativeFunctionDefinition` 844 |
| builtin → parser | 11 / 6 | `Prelude.java:55`, `SystemMetamodel.java:1517`, `Pure.java:148,318,738` |
| parser → model | 89 / 23 | mostly `ElementParser` |
| parser.section → model | 38 / 36 | the 19 section grammars' `toModel` |
| model → protocol / protocol.spec | 289 / 32 | model records carry protocol bodies |
| compiler → model | 742 / 94 | NameResolver 412 |
| compiler.element → compiler | 45 / 12 | ModelBuilder 25, StoreLookups 10, SynthFqn 7, NameResolver 2, BareNames 1 |
| compiler.element → spec / spec.typed | 1 / 3 | `TypeClassifier.java:47`; `Temporal.java:87,98,99` |
| compiler.spec → compiler | 20 / 10 | all `ResolvedNames` |
| compiler.spec → spec.typed | 2285 / 483 | |
| spec.typed → compiler.element | 9 / 3 | TypedNativeCall, TypedUserCall, TypedViewRelation → TypedFunction |
| spec.typed → compiler | 3 / 1 | `ContextReading.java:549,695,705` → ResolvedNames |
| compiler → compiler.spec | 16 / 2 | StatementInline, LiteralMapUnroll → SourceSubst |
| compiler.element.type → builtin / sql | 48 / 14 | PlatformTypes→NativeFn 34; `Type.kindOfSqlType` (`Type.java:679`) |
| normalizer → compiler / element / spec | 170 / 3 / 0 | the normalizer never touches the typer |
| lowering → spec / compiler / element | 0 / 0 / 48 | ClassLayouts, EqualityKeys, TypedFunction |
| lineage → element / compiler | 60 / 1 | no typer |
| resolver → typed / types / element / spec | 5923 / 2507 / 316 / 29 | spec edges are SpecCompiler, in 8 files |
| resolver → lowering / plan | 10 / 5 | see 2(d) |

### Cycles

Package cycles: 3: `protocol ↔ protocol.spec` (325/69 sites); `parser ↔ parser.section` (34/419); the quartet `compiler`,
`element`, `spec`, `spec.typed`, every back edge thin (element→compiler 45, spec→compiler 20, compiler→spec 16,
typed→element 9, compiler→element 5, typed→compiler 3, element→typed 3, element→spec 1). Class-level cycles: 20; the
largest intra-package (typed 87 — the sealed `TypedSpec` family — spec 51, lowering 47, resolver 36, model 29, normalizer
21); two span packages (the protocol pair, 37 classes; the parser pair, 25); under the proposed targets one crosses a
boundary: `SetId → ClassMapping/MappingDefinition → SetId` (`SetId` is a static helper returning `String`).

### Violations of §1b per target (`out/violations.txt`)

Mapping per the plan: syntax = lexer, parser, section, protocol, protocol.spec; binder = NameResolver, BareNames,
ResolvedNames; inliner = StatementInline, LiteralMapUnroll; world = the rest of `compiler/`; `base`, `json` allowed
everywhere. **Bold** = true layering inversions; the rest are rows the map omits.

| target | edges the map does not allow (sites) |
|---|---|
| syntax | model 86, spi 33, **FromProtocol/MappingFromProtocol 25**, values 20, SetId 1 |
| catalog | model 1038, error 2 (plus the parser edge inside "syntax", 11) |
| binder | model 415, error 4 |
| elements | model 285, syntax 56, error 44, **world 42**, catalog 36, ids 10, **binder 3, typed 3, typer 1** |
| typed | syntax 60 (ContextReading), catalog 32, error 13, **elements 9 (TypedFunction)**, values 4, model 4, **binder 3, sql 2 (TypedFrameRef→SqlQuery)** |
| typer | types 2159, syntax 1738, error 36, ids 22, **binder 20**, model 15, values 11, sql 10 |
| mappings | model 1519, syntax 952, error 266, **world 164**, catalog 150, types 12, **binder 6**, ids 5, elements 3 |
| inliner | syntax 85, **typer 16 (SourceSubst)**, model 12, types 5, elements 4, catalog 3, binder 2, ids 2 |
| store | types 2507, elements 316, error 287, model 203, catalog 179, **typer 29, lowering 10, plan 5**, ids 12, values 7, sql 2 |
| lowering | types 902, catalog 493, ids 242, error 66, values 63, **elements 48**, model 4; 0 store edges today |

## 2. The specific claims

**(a) syntax → model.** Verified exactly: 21 model types, 127 sites (7 of the 21 dead imports in `ElementParser`); "used 25
times" exact (16 + 2 in `ElementParser`, 7 in section grammars). W1.9 omits: five constructions straight to model with no
protocol record (`ElementParser.java:505` DataDefinition, `:1332` PrimitiveExtension, `:1373` ClassDefinition, `:2504`
NativeFunctionDefinition; `OverlayElementSink.java:41` OpaqueElementDefinition; marked "not yet migrated"); the parse
result `ParsedModel` is a model type (consumers: builtin 7, compiler 20, ide 4, normalizer 15, server 6, root 17, test 2)
and `ImportScope` (15 parser sites) must move into syntax; the 19 section grammars each have `toModel(...)` (declared
`RawSectionGrammar.java:39`, `LexableSectionGrammar.java:50`; called `ElementParser.java:385,471`); `values` (20) and
`spi` (33) are real syntax deps; refusals change phase (`ElementParser.java:741` turns `UnsupportedMappingShape` into a
`ParseException`, so moving the conversion changes W1.4's failure class and what the parser-equivalence lanes count as
rejected); the parser-equivalence tests use six model types (23 references in `Sectionize.java`,
`OwnCorpusConformanceTest.java`, `Surfaces.java`), so W1.9's gate "the lanes depend on `//core:syntax` alone" is
unreachable as written; AGENTS.md's layer table ("tokens → `model.PackageableElement`") needs an edit in the same push.

**(b) Is `model` syntax or semantics? Both, and that is the defect.** Its records are parse-level (string names, protocol
bodies, model→protocol 321 sites, "the structure the parser saw", `PackageableElement.java:6`); NameResolver rewrites the
same family into FQNs (415 sites): one IR on both sides of a phase boundary, what rule 0.10 forbids and D12 replaces.
Placement: `PackageableElement`, `NativeFunctionDefinition`, all `*Definition`/`*Mapping` records → a new `decls`
(parsed declarations) target above syntax; `FromProtocol`, `MappingFromProtocol`, `RelOpFromProtocol` → the converter in
`decls`; `ImportScope` → syntax; `FunctionId` → `ids` once `FunctionId.of/ofAll(Function)` moves out (34 callers; it drags
Function, SignatureMangle and protocol into the id type); `SetId` stays in `decls` until a real id type exists (W4.3). The
syntax row's "the parse records of model" contradicts W1.9's "the conversion moves to the stage after".

**(c) builtin → parser.** Verified: 11 sites in 3 files, 854 parses at class load (`Pure.java:148/318/738`: `nativeClass`,
`nativeEnum`, `signature` = 831 signatures + 23 class/enum; `Prelude.java:55` the 300 KB `prelude.pure`;
`SystemMetamodel.java:1517`). Build-time generation is feasible (`Pure.java` is already generated by `//spec:gen_natives`)
with two constraints: constructor calls for 831 declaration trees exceed the JVM's 64 KB static-initializer limit (chunk,
or emit a serialized resource that also feeds W2.1's boot index); "catalog uses syntax types, never the parser" cannot be
expressed with one `syntax` target: split into `syntax_tree` (protocol, protocol.spec, ImportScope) and `parser` (lexer,
parser, section, spi).

**(d) resolver → lowering and plan: every edge, 15 sites, 4 classes, 6 files.** `lowering.AsorRef` (`GraphEmission.java:5,
3193`, `ObjectReferenceDecode.java:4,58`, `Substitution.java:2,1723`×2): 121 lines, base-only, moved into lowering at step 0;
move it below both. `lowering.Aggregates` (`isReducer`, `isDemandReducer`: `CorrelatedSubselects.java:1861,1867`,
`GraphEmission.java:2152`): a fact about functions; catalog or a typer annotation. `plan.LazyRows`
(`ConstructedInstances.java:109,117,121`): 43 lines, base-only; move to store. `plan.PlanRows.scopeId`
(`ConstructedInstances.java:145`, `ElementReferences.java:284`): move to store. One push, not a by-product of W4.3.

**(e) The quartet split order.** The `core/BUILD.bazel` comment "one cycle of 208 classes" is wrong at class level. `binder`
can be carved today with zero moves (NameResolver is generated, so its `_GENERATED` path moves with it). `typed` can be
carved today (no typed→typer edges). `elements` needs four upward sites cut (`Temporal.java:87,98,99`,
`TypeClassifier.java:47`) AND `world` (ModelBuilder, KnowledgeLayer, TableIndex, SynthFqn, StoreLookups, RelationalKinds,
DerivedProps, SymbolTable) carved alongside (elements→world 42 sites, world→elements 1, `KnowledgeLayer.java:406`; leaving
world in the leftover `compiler` target makes a target cycle, which Bazel refuses). W3's typed/typer split needs
`ContextReading` (1,048 lines) and `ExecutionContext`'s reader methods moved into typer (the record stays; `TypedFrom` holds
one), and `SourceSubst` and `Env` moved into inliner. The typed row "types, ids" also needs call nodes to carry an id
instead of `TypedFunction`: 9 declarations but 560 `.callee()` readers (resolver 236, typer 163, lowering 77, driver ~70);
no wave item owns it.

**(f) Who depends on the typed HIR.** resolver 5,923 sites (53 of 56 files); spec 2,285 (69 of 84); root/driver 1,178 (18 of
23); lowering 1,052 (49 of 74); plan 105 (5); testdatagen 33 (1); element 3 (1); exec 1 (1): 197 files. `TypedSpec`
directly permits 63 types; with `TypedRelationOp` there are 82 `Typed*.java` files.

## 3. A corrected, simulated map

Wrong or missing in §1b: syntax must allow values and spi and split into tree and parser; catalog depends on `decls`
(1,038); elements omits world, catalog, binder, ids, decls; typed "types, ids" unreachable without the callee change; typer
omits types, ids, binder (until W2.3a), inliner, sql; mappings uses world and binder today, not the typer; lowering omits
types, catalog, ids, values, elements and has no store edge; missing rows: ids, types, decls, world, values, error, spi,
cache, ide, validation, probe, test, the driver (root package, 23 files), the inliner's real members.

Simulation (`sim.py`, `out/corrected-map-sim.txt`): with these placements and cuts the target graph is acyclic and no edge
points up this order:

| target | contents | direct deps needed | wave |
|---|---|---|---|
| base, json, values, error, spi, cache | as today; AsorRef to a low leaf | base | exists |
| sql / sql_dialect | as today | base / sql | done |
| ids | FunctionId without `of(Function)`; later ClassId, PropertyId, VarId | base | W2.1 |
| syntax_tree | protocol, protocol.spec, ImportScope | base, json, values | W1.9 |
| parser | lexer, parser, section | syntax_tree, spi, values, error | W1.9 |
| decls | today's model plus the converter | syntax_tree, base, error | W1.9 |
| catalog | builtin, platform | decls, ids, syntax_tree, error (parser only as a build tool) | W2.1 |
| types | compiler.element.type, `Type→SqlType` moved out | catalog, ids, syntax_tree | W2.1 |
| **world** | ModelBuilder and friends | decls, syntax_tree, types, catalog, error | **W2.3a (missing from plan)** |
| resolved | the D12 family | ids, syntax_tree, error, types? | W2.3a |
| binder | NameResolver, BareNames, ResolvedNames | syntax_tree, decls, catalog, resolved, error | W2.3a |
| elements | compiler.element | world, binder, catalog, types, decls, syntax_tree, ids, error | W2.3a |
| typed | spec.typed minus ContextReading | types, ids, elements\*, values, sql\*, decls\*, catalog (2) | W3 |
| inliner | StatementInline, LiteralMapUnroll, SourceSubst, Env | typed, types, binder, elements, syntax_tree | W3 / W4.2 |
| typer | spec plus ContextReading | typed, elements, types, catalog, binder, inliner, ids, values, error, sql\*; syntax (1,701) until W2.3a | W3 |
| mappings | normalizer | today world, binder, decls, syntax, catalog; from W4.1 typer, typed, resolved | W4.1 |
| store | resolver plus LazyRows and scopeId | typed, types, elements, typer (named until W6.2), catalog, decls, ids, values, error | W4.3 |
| lowering | lowering | typed, types, sql, catalog, ids, values, elements, error | W5 |
| lineage → plan → runner → validation / testdatagen → driver → server / ide | the periphery | as measured; lineage below plan (plan→lineage 3) | W6 |
| probe, test | out of the product jar | | W6.4 |

\* an edge to remove only if the plan keeps its stricter row (TypedFunction→ids, TypedFrameRef's SqlQuery,
TypedViewRelation→FunctionDefinition).

Cuts assumed (sites): W1.9 parser→decls 112; builtin parse calls 11; `Type`→SqlType, SqlExpr, ClassDefinition 15;
FunctionId.of 6; Temporal 3, TypeClassifier 1, KnowledgeLayer 1; ExecutionContext→ContextReading 6; store→lowering/plan 15.

## 4. Java and Bazel engineering review

1. **Exhaustiveness is not enforced.** 76 of 77 pattern switches over `Typed*` have a default or catch-all; 1,313
   `instanceof Typed*` tests; AGENTS.md bans `default ->` only in SQL render methods. Rule 0.10 and W5.2 ("javac lists
   every reader") need an ErrorProne checker (the plugin path exists for NullAway) and a ratchet on instanceof, or
   W3.6's and D11's kind splits compile green and fall through silently.
2. **Sealed families pin targets**: a sealed root and its records share a package and target; a member naming another
   stage's type drags that stage into the IR's deps (`TypedFrameRef(SqlQuery)`, `TypedNativeCall(TypedFunction)`). Each new
   IR should name its member types' targets up front.
3. **Record equality is structural, which hurts IR keys**: equal subtrees collide (hence 49
   `identityHashCode`/`IdentityHashMap` sites and NavReducer's non-deterministic names); W1.1's position-keyed table has the
   same hazard for synthesised nodes; prefer an explicit `NodeId`; for W2.5 keep only the id in `VarId`'s record, not the
   display name.
4. Immutability is shallow but disciplined (`List.copyOf` on record collections, rejecting nulls; W5.2's deep immutability
   achievable).
5. **Language level**: `.bazelrc` pins `--java_language_version=21` though the runtime is 25; unnamed `_` patterns (22) and
   flexible constructor bodies (25) are unavailable; worth changing before writing 60–80-arm switches; prove NullAway's
   JSpecify gate fires through record deconstruction with a seeded violation.
6. **D10's per-model memoization**: `ConcurrentHashMap.computeIfAbsent` forbids recursive updates (known at
   `PureModelContext.java:249`, `ClassLayouts.java:81`); demand-driven typing is recursive and can cycle (needs an
   in-progress sentinel, cycle diagnostics, diagnostics sorted by (span, code)); a retention policy (the server caches models,
   `cache/HandleStore`); the dispatcher is single-threaded (`LegendHttpServer.java:314`), so determinism matters more than
   locking.
7. **No memory or performance budgets**: parsed decls, the resolved family and the typed HIR coexist per model; add a
   heap-after-resolve measurement on `scale_stresstest100k` to W2.3a's gate. `resources:memory:*` only schedules; the ceiling
   is `--config=ci`'s `-Xmx8g`. **"7 GB runners" is wrong for Linux and Windows**: both `neema2/legend-lite` and the kmk
   fork are public, so standard Linux/Windows runners are 4 vCPU / 16 GB by GitHub's published specs (not verified on a
   runner); only macos-14 has 7 GB (already `ci-small`). The 8 GB reference lane could run in the Linux lane; confirm with
   `free -g` first.
8. **Rule 0.12's genquery test is sound but weak**: the target list is kept by hand twice (`tools/deps/BUILD.bazel:110` and
   `core-layers.txt`), so a newly carved target not added is never checked (enumerate with `kind(java_library, //core:*)`);
   it reads `deps` only (an added `exports` or `runtime_deps` passes); it freezes today's graph, not the map (add a map file
   with shrink-only named exceptions, each with an owner item, and test layers ⊆ map + exceptions); it freezes 4 dead deps (a
   declared-equals-used check would catch them). Bazel's own form of "may depend on" is `visibility` on each carved target
   (fails at analysis time; the umbrella `:core` stays visible). Say which of `ArchitectureTest`'s ArchUnit rules (1,292
   lines) retire at W7.

## 5. Ranked findings

1. High: the §1b rows aren't direct-dependency lists, so rule 0.12's exact comparison can never pass. Replace them with
   the simulated map, or declare base, ids, types, error, values implicitly allowed.
2. High: no row or wave for `world` or `decls`; W2.3a cannot carve `elements` without `world` (42 sites); the normalizer
   uses ModelBuilder at 139 sites.
3. High: W1.9 is under-scoped (5 straight-to-model constructions, `ParsedModel`, `ImportScope`, the 19 grammars' `toModel`,
   values/spi, refusals changing phase, the parser-equivalence tests' model types); its gate is unreachable as written.
4. High: one `syntax` target cannot give "syntax types but never the parser"; split `syntax_tree` and `parser`.
5. Medium: typed "types, ids" needs a callee migration (560 readers), ContextReading moved out, TypedFrameRef's SqlQuery.
6. Medium: exhaustiveness not enforced; add a checker before W3.6 and D11.
7. Medium: resolver→lowering/plan is 15 sites; one early push.
8. Medium: `FunctionId` isn't a leaf; move the mangling out before carving `ids`.
9. Medium: the genquery test's gaps; pair it with `visibility`.
10. Low: build-time catalog generation must chunk around the 64 KB initializer limit, or serialize.
11. Low: SQL knowledge in the front end (`Type.kindOfSqlType` 13 sites; typer→sql 10); decide.
12. Low: language level 21 vs runtime 25; the corrected CI memory premise.

## 6. Guessed vs verified

| plan claim | status |
|---|---|
| resolver depends on lowering and plan | verified: 15 sites, 4 classes |
| builtin depends on parser | verified: 11 sites, 854 class-load parses |
| parser uses 21 model types; FromProtocol 25 times | verified exactly; the stated reason ("converts to semantic records") is wrong: the records are parse-level, and 5 constructions bypass FromProtocol |
| normalizer, lineage, validation, lowering, plan depend on the whole compiler | true only at Bazel-target grain; at class level lowering and normalizer use no typer; lineage 1 binder site, validation 2 typer sites, plan 4 |
| syntax row (base/json/errors) | guessed: needs values and spi; "parse records" undefined; contradicts W1.9 |
| catalog, elements, typed, typer, lowering rows | guessed (omissions measured in §1) |
| store never depends on lowering or plan | verified achievable (15 sites) |
| quartet split W2.3a → W3 | the order holds, but `world` must be carved at W2.3a |
| `core-layers.txt` is exact | true of Bazel; 4 of its edges are dead in source |
| BUILD comment "one cycle of 208 classes" | wrong at class level |
| "CI's 7 GB runners" | wrong for Linux and Windows (public repo); true for macos-14 |
