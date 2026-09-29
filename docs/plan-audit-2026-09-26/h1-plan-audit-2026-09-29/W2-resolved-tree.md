# H1 audit — W2 (W2.1–W2.8), the resolved tree, branch `compiler/rebuild` @ 772547a18, 2026-09-29

Reader's report, preserved as returned (the parent persists it). Read-only. Read: the whole plan, the architecture review,
A01, A02, A04, A05, A06, the program audit, step3-design, reference-matching, the GATES probe-push record. Whole:
`NameResolver`, `ModelNormalizer`, `FunctionCompiler`, `ResolvedNames`, `BareNames`, `StatementInline`. Parts:
`PureModelContext`, the resolve paths in `Compiler`, `Typer.synth` and `candidatesOf`, `ValidateDesugar`, `ScanRelations`
entry points. Counts by grep over `core/src/main/java/com/legend/` (paths relative to it). **Not verified:** the pinned
reference trees (no bazel run); `new.pure:29` and other reference citations rest on `reference-matching.md`.

## Who produces and who reads the parse tree after D today

**Producers after D:** `NameResolver` (`resolve`, `resolveAlongside`, `resolveQuery`, `resolveQueryIn`) and
`KnowledgeLayer.adopt`; phase E — 15 normalizer files, 294 untyped-node constructions (96 `new AppliedFunction`), then a
re-resolve at E.6 (`ModelNormalizer.java:142-187`); `DerivedProps.lift`; the query chain `StatementInline` →
`ValidateDesugar` → `LiteralMapUnroll` (`Compiler.java:869-889`); the typer's desugars — 301 untyped-node constructions and
59 rebuild calls in `compiler/spec` (Typer 120; 93 are `AppliedFunction`).

**Readers after D:** E via `ResolvedNames` (`MappingNormalizer.java:722,733-734,2811`); F — `TypedFunction.java:58`
`Optional<List<ValueSpecification>> body`, `Property.java:50`, `findClassDefinition`/`findFunctionDefinitions`
(`PureModelContext.java:642-663`); G — `synth`, `Env` aliases, 61 `compiler/spec` files with 387 `protocol.spec`
references; raw payloads inside the typed HIR (`TypedCsvCensus.java:23`, `TypedTestDataGen.java:20`, `ContextReading` raw
twins `ExecutionContext.java:252`); executor `PlanAllocations.java:370-470` walks `protocolBody`; lineage `ScanRelations`
(25 `.function()` reads); `testdatagen`, `TdsLegacy.matches` (38 call sites), `validation`, the test runners.

In total **108 main files (~48k lines) outside parser/protocol/lexer/model** reference the untyped tree. Under D1 every
reader of a resolved body becomes a `ResolvedExpr` reader in W2.3.

## Findings

1. **BLOCKER — nothing is said about what holds a resolved body.** D's output is a `ParsedModel` whose bodies sit in ~15
   fields across two Bazel targets below `compiler` (`core/BUILD.bazel:45-46,92`): `protocol` —
   `ConstraintDefinition.java:20`, `DerivedPropertyDefinition.java:50`, `Realization.java:32,53`; `model` —
   `FunctionDefinition.java:72`, `ServiceDefinition.java:63`, `ClassMapping.java:199-210,321,366,459`,
   `AssociationMapping.java:90,101`, `ClassDefinition.java:113`, `MeasureDefinition.java:35`, `MappingDefinition.java:305`.
   `FunctionId` lives in `model`, so a `ResolvedExpr` carrying `Candidates(List<FunctionId>)` cannot sit in a `protocol`
   record. The superseded design moved `FunctionId` into `protocol` (step3-design §1); W2 dropped that. **Change:** before
   W2.3, H2 chooses one of: `ResolvedExpr` in `protocol` with the `FunctionId` move; records generic over the expression
   type; a parallel family of resolved element records — and names every record field that changes.
2. **BLOCKER — Phase E cannot work as it does now.** E runs after D, reads resolver output, and embeds resolved user
   subtrees inside new untyped calls (`MappingNormalizer.java:1151-1153` builds `filter(source, pcm.filter())`; `:1228`),
   relying on idempotent re-resolution (`ModelNormalizer.java:146-148`; IDEMPOTENT branch `NameResolver.java:1734-1737`). A
   `ValueSpecification` parent cannot hold a `ResolvedExpr` child, so E.6 cannot exist under D1. **Change:** W2.3 adds one
   `compiler` builder turning a spelling plus a scope into Candidates with the resolver's index and rule, returning
   `ResolvedExpr`; E's mints go through it; E.6 is deleted.
3. **BLOCKER — "the typer reads ResolvedExpr", but the typer builds untyped nodes and feeds them back to itself.** The 301
   constructions in `compiler/spec` re-enter `synth` embedding already-resolved subtrees (`CallShapes.java:89`,
   `JsonChecker.java:45`, `EvalChecker.java:84`, `Typer.java:224`); `Env` stores untyped aliases by name
   (`Env.java:21,63-134`); SourceSubst, AlphaRename, StaticFold, LambdaBodies, CallShapes rewrite the typer's input. W2.7 is
   placed after W2.3 but these sites must change in W2.3. **Change:** W2.3 ports every G construction to the builder
   (CANDIDATES neutral); W2.7 then narrows each overload group to one declaration; an ArchUnit rule that `compiler.spec`
   does not construct `protocol.spec` nodes — without it D1's "javac proves it" is untrue.
4. **BLOCKER (ordering) — `Member(name)` and `new` must exist in W2.3's first tree.** W2.3 turns zero candidates into a
   diagnostic; 106 distinct dot-spelled names reach the typer with no candidate (GATES.md:5718) and take the property route
   (`Typer.java:589-641`). `new` owns no declaration (`CoreFn.java:391`); the parser mints `new(receiver, NewInstance)`
   (`SpecParser.java:1670-1674,1700-1703`). Deferring both to W2.4 poisons these calls. **Change:** W2.3 carries `Member` and
   a plan for `new`; W2.4 becomes the semantic push (the reference's rewrites and the arrow-spelling change).
5. **WRONG, breaks rule 0.5 — W2.3 changes the tree and the candidate rule in one push.** "The reference's rule (imports ∪
   core ∪ Root)" contradicts "the merge point's bare-name rule moves into the resolver": the tiers are ENGINE / CORE(32) /
   FORM (`BareNames.java:55-80`). The 41 minted names never pass the resolver (typer mints). "CANDIDATES identical except
   rows the reference lane explains" cannot hold across a rule change; known moves: 10 own-package hits outside core
   (GATES:5710), 8 names the reference lacks (GATES:5722-5728), 76 parsed bare names in core_tests. **Change:** W2.3a — the
   new tree with today's full rule (BareNames tiers included) inside D, CANDIDATES identical; W2.3b — the reference's rule,
   chosen per Dialect.
6. **GAP — no candidate rule for engine input.** Engine input resolves through the Handlers map, the engine's whole namespace
   (`engine-resolution.md:16-31`), not imports plus 32 packages; W2.2/W2.3 give only the Pure-source rule; the
   `EngineHandlers` tier serves engine input today.
7. **GAP — the parser's minted names.** The parser mints 24 names (A01; `SpecParser.java:466,620-670,1034,1159,1274-1325,
   2681,3018`). Of the 27 parsed bare names several have no declaration the reference's rule would find: `tableReference`
   (FORM tier only), `col`, `agg`, `func`, `olapGroupBy`, `tdsRows`. Each needs a declaration or a syntax node D binds by
   declaration, or W2.3's zero-candidate diagnostic fires.
8. **RISK — unit of poisoning vs lazy checking.** Today an unknown function fails per body when that body is typed
   (`Typer.java:1836-1843`, `Compiler.java:1122-1132`); 407 of 410 census unknown-function failures are in function bodies
   (GATES:5716). D resolves every body eagerly, so under rule 0.9 a strict build would fail on an unused helper. **State:**
   a D diagnostic poisons its body and surfaces only when that body is demanded. E-synthesized calls carry no SourceInfo
   (A06), so "positioned" needs a rule for them (e.g. the owner element's span).
9. **GAP — when the World index is built.** `knownFqns` is built on every `resolve` (`NameResolver.java:398-408`);
   `ModelBuilder` after D and adoption (`Compiler.java:253-256`); E's lifted functions join the index only at the E→F gate
   (`PureModelContext.java:154-167`), yet E's mints call them (`UnionSynthesis.java:151`) and so does the typer (`$prop$`
   routes); the boot layer is resolved once per process (`Compiler.java:260-306`). **Change:** W2.1 specifies three layers:
   a cached boot index, a graph index built before D, an extension after E. "Built once per World" is false as written.
10. **RISK — candidate sets frozen at D.** Today `candidateFqns` are FQNs re-expanded against the current World at typing
    time (`Typer.java:2543-2567` → `findFunction(fqn)`). `Candidates(List<FunctionId>)` fixes the set at D; boot bodies are
    resolved once per process, so an overload a graph adds at a boot body's FQN stops being a candidate. Probe first.
11. **GAP — `VarId` needs a binder scope D lacks.** `Scope` has no variable environment (`NameResolver.java:2042-2047`);
    lambda parameters are only type-resolved (`:1855-1877`); `let` is a call whose binder is a `CString`, recognised by
    spelling (`Typer.java:268-285`). Binders created after D: constraint/derived-property `this`
    (`ModelNormalizer.java:310-312,330-332`); service-lambda parameters that become function parameters (`:381-392`);
    `ValidateDesugar`'s `new Variable("this")`; `StatementInline`'s `_s<N>_`; `ServiceTestRunner.java:182`; the parser's
    `_path` and `_gf<n>`; free service path parameters. **Change:** D allocates ids for implicit binders (E and validation
    reuse them); `ParameterDefinition` gains a `VarId`; G gets a fresh-id supply.
12. **WRONG — "the four substitution engines".** Name-keyed substitution is in many more places: D½/G —
    `StatementInline.java:97-111` (via SourceSubst), AlphaRename, StaticFold, `UserCallInliner.java:1167`,
    `Env.java:109-134`; E — `RelationReads.java:183-190`, `XStorePureEnds.java:285-300`; H — `GraphEmission.java:1589-1597,
    2722`, `StoreResolver.java:98`, `TemporalFrame.java:2648`, `SyntheticHeads.java:1911`; I — `Lowerer.java:2591,2791`.
    `TypedVariable` references: resolver 328, lowering 30, driver 25. Re-keying G½/H in W2.5 duplicates W4.2/W4.3, which
    delete them. **Change:** W2.5 adds `VarId` (keeping the display name) to `ResolvedExpr` and `TypedVariable` and switches
    D, E, G readers; G½, H, I switch inside W4.2/W4.3; W1.3's verifier asserts every variable reference is bound in scope and
    ids are unique.
13. **WRONG — "name-based alpha-renaming is deleted where VarId makes it moot".** AlphaRename renames binders of an inlined,
    duplicated helper body (`AlphaRename.java:7-12`); copying a body copies its ids, so each copy still needs fresh ids. The
    work becomes id-freshening, not deletion.
14. **GAP — kinds and reach of `Ref<Kind>`.** W2.6's "≈167 sites" covers only pointer and enum-value sites (155 in main by
    grep — plausible). Omitted: ~56 `resolveName` sites in element records; type names in `TypeExpression` inside bodies
    (lambda parameter types, casts, `@Type`, `NewInstance.className`). Omitted kinds: Package (`PureModelContext.java:427`);
    a function by signature id (`NameResolver.java:1719-1727`); a unit `Measure~unit` (`:1711-1718`); m3 multiplicity
    constants; Profile. The parser decides `EnumValue` without the element's kind, so D must re-check.
15. **RISK — lazy loading (AGENTS.md invariant 5).** Ids as typed FQN wrappers are compatible (the invariant cites
    `ClassType(fqn)`). The plan table's "`DeclId` handles" are not: boot-layer resolved bodies are cached once per process
    and shared by every graph (`Compiler.java:260-306`); per-World interned handles inside them break that sharing, and a
    handle needs the declaration registered. **Change:** trees carry only FQN-wrapper ids and `FunctionId`; `DeclId` stays
    internal to the tables.
16. **RISK — W2.2 drops three packages for Pure source.** GATES.md:455: the corpus "spells `Relation<(…)>` bare because of"
    the engine's three extra packages; `reference-matching.md:27-36` says the reference's core group has 29. Probe type
    resolutions served only by `variant`, `relation`, `precisePrimitives` before the switch. W2.2 must update the other
    `elementImports` readers (`Compiler.java:214`, `PureTests.java:97`, `ModelNormalizer.java:169`, `ModelBuilder.java:263`,
    `KnowledgeLayer.java:479`, `SystemMetamodel.java:1580`, 7 harness sites). `elementOffsets` has the same first-wins key
    (`ElementParser.java:326,391`).
17. **RISK (ordering) — W2.8 before W3.3.** Deleting the platform-owned and PCT gates (`FunctionCompiler.java:78-86,
    103-123`) adds model overloads at platform FQNs to candidate sets ranked by today's two algorithms; the superseded design
    recorded "3d needs 3c's strict re-rank, or twins tie" (`step3-design:300`). Move W2.8 after W3.3 or gate on OVERLOADS and
    PICK rows identical. W2.8 also omits the silent dropping of broken overloads (`FunctionCompiler.java:139-158`, task
    #56), which rule 0.9 forbids.
18. **RISK (ordering) — W2.1 refuses duplicate ids while twins exist.** A native and a model definition share an id until
    W2.8 (`findFunctionById` returns twin plus native, `PureModelContext.java:365-380`). Until W2.8, refuse only
    model↔model duplicates.
19. **WRONG — cross-reference and a missing item.** "Collisions stay walls until W3.5": W3.5 is kernel rules (plan :156);
    the collisions are property identity ("A4's", `step3-design:638`). `PropertyId` is used by W4.1 and W4.3 (plan
    :45,163,170) but introduced by no item; it belongs in W2.4.
20. **GAP — `new` in W2.4.** The reference declares `new(Class, String, KeyExpression[*])` (per `reference-matching.md`);
    our node `new(receiver, NewInstance)` also covers the copy form `^$x(…)` (the reference's `copy.pure:33`) and lite
    `NewInstanceCast` (`SpecParser.java:1670-1674`). W2.4 needs a reshape, a `copy` declaration and a lite declaration.
    `.all(nonLiteral)` also sets `propertyCall=true` (`SpecParser.java:1276-1290`), so a Member minted from that flag must
    exclude it.
21. **GAP — semantic flags.** The typer reads `infix` (`Typer.java:453-458,1825,1931`); `CallShapes.java:63` reads
    `propertyCall`. `ResolvedExpr` must carry both, not only a wire side record.
22. **RISK — gates.** W2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8 state no gate. W2.3's CANDIDATES comparison: its key is the
    spelling (`Typer.java:2534-2539`), which changes for the 962 single matches the resolver rewrites today; poisoned calls
    disappear from the rows; W1.1 dumps picks, not candidate sets (plan :101-104), so "rows the reference lane explains"
    cannot be computed. **Specify:** compare by (site, candidate set); count poisoned calls by diagnostic code against the
    UNKNOWN-FN baseline (21 names, 410 census failures); W2.7 PICK rows identical; W2.8 OVERLOADS rows identical; W2.5 the
    verifier plus golden dumps modulo ids.
23. **WRONG (numbers).** "106 names per corpus lane, program audit #1": #1 counts 126 zero-candidate calls per lane; 106 is
    probe #8's distinct dot-spelled names across both lanes and the census. "~69 typing-time mints": 93 `AppliedFunction`
    constructions in G (69 literal-spelled), 301 untyped-node constructions in total. W2.5 construction counts check out
    (88, 118, 126 files), but readers are 63 `Variable` + 227 `TypedVariable` pattern sites, plus H/I per #12.
24. **RISK — size.** W2.3 alone reaches the 108 reader files, the body-holding records, and 294 + 301 construction sites:
    W2.3 is 4–6 sessions; W2 is 12–18, not 6–9.
25. **NIT.** W2.7's normalizer half is work W4.1 throws away; route E through the builder. `ValidateDesugar`'s javadoc says
    it runs "BEFORE name resolution"; `Compiler.java:869-889` runs it after.

## Direct answers
- **W2.3–W2.6 as four pushes on one tree type?** Only with a different cut: W2.3 defines the whole family incl. Member, with
  variables and element references still carrying names; W2.5/W2.6 add id fields and switch that variant's readers (javac
  finds them). Member cannot be a later push (#4).
- **The ~180 compiler-side construction sites?** Really ~300 in G plus 294 in E; all become `ResolvedExpr` builder calls in W2.3.
- **VarId while engines rename by text?** Yes, if names stay as display fields; keying on ids is safe only once each engine
  mints fresh ids (#12, #13).
- **Element ids as typed FQN wrappers vs lazy loading?** No conflict; `DeclId` handles stored in trees do conflict (#15).

## Verdict
W2 is not executable as written. W2.3 cannot start until H2 decides what holds resolved bodies (#1), how E produces
`ResolvedExpr` (#2), and where G's ~300 mints go (#3). W2.3/W2.4 order is wrong (#4); W2.3 changes tree and rule in one
push (#5). After: split W2.3 into a/b, Member and `new` into W2.3a, add the builder, give W2.1 its three-layer index
lifecycle, add binder-scope work to W2.5, correct the substitution and alpha-renaming claims, gate W2.8 on or after W3.3,
state a gate for every item. Honest estimate about twice the plan's.
