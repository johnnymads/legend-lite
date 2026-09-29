# W0.6 homework 3 — section imports, sourceless Pure mapping, service-test provision key

Read-only homework, drafted by a subagent at `compiler/rebuild` @ `89dc45871` and persisted verbatim by the parent session
(2026-09-29). No bazel command was run. **Reproduction evidence:** `bazel-testlogs/core/core_tests/test.outputs/junit/TEST-junit-jupiter.xml`
(run Sep 29 01:46, after the last edit to every touched main/test file) records all three `@KnownDefect` pins as passing,
which under `KnownDefect` (`core/src/test/java/com/legend/testing/KnownDefect.java:8-20`) means the defect is present.
Pinned trees: pure 5.99.0 = `$P`, engine 4.145.0 = `$E` (`$(bazel info output_base)/external/+http_archive+legend_{pure,engine}_src`).
Paths under `core/src/main/java/com/legend/` unless stated.

---

## 1. Section imports keyed by element FQN (`SectionImportScopeKnownDefectTest`, owner W2.2)

**Symptom / reproduction.** Source with three `###Pure` sections: §1 declares `a::whichOne` and `b::whichOne`; §2 `import
a::*;` + `test::f(Integer[1])`; §3 `import b::*;` + `test::f(String[1])`; both `f` bodies call bare `whichOne()`.
`NameResolver.resolve(Compiler.parseModel(src))` binds BOTH overloads to `a::whichOne`; the §3 overload must bind
`b::whichOne`. Wrong binding → wrong results.

**Root cause.** `ElementParser.java:275` declares `Map<String, ImportScope> elementImports`; the token-walk arm writes
`elementImports.putIfAbsent(e.qualifiedName(), sectionImports.build())` at `:325` (same first-wins at the raw-section arm
`:393` and the claimed-section arm `:478`). `NameResolver.java:258` reads `ImportScope own =
model.elementImports().get(el.qualifiedName())`, so every element sharing the FQN gets the first section's scope; `:262`
then does `new Scope(own == null ? model.imports() : own, …)` — a union-scope fallback for missing entries. The key cannot
distinguish overloads: only functions/natives may legally repeat an FQN (a repeated non-function FQN is refused as
"Duplicated element", `ModelBuilder.java:396-402`), so the defect is confined to function overloads split across sections
or files.

**What the reference does.** Pure: each section's `imports` becomes one `ImportGroup` `import_<source>_<n>` (`n` per
section, `$P/.../top/TopGraphBuilder.java:90-91`, `AntlrContextToM3CoreInstance.java:294,458-467,3982-3985`), passed into
the parser of every element in that section (`:322-356`); each `ImportStub` carries its own `_importGroup`
(`navigation/importstub/ImportStub.java:189-205`). Binding is per reference, at parse, with no by-element-name lookup
(matches `reference-matching.md` §1: FEM uses `fe._importGroup()`). Engine: the section index is keyed by element path
(`PureModel.java:311`, first-wins `putIfAbsent`), but a function's path is its signature-mangled name (`name +
getFunctionSignature(func)`, `DomainParseTreeWalker.java:148,535`), so overloads get distinct keys. The correct key is
the declaration occurrence, not the FQN.

**Every site of this defect class (FQN-keyed, breaks under overloads):**

| site | map | effect |
|---|---|---|
| ElementParser.java:325, 393, 478 | elementImports, first-wins | the bug |
| ElementParser.java:326, 391, 477 | elementOffsets, first-wins | an error in overload 2 reported at overload 1's line (Compiler.java:98 decorates via `elementOffsets().get(e.element())`) |
| Compiler.java:212, 216, 218 (`parseSources`) | offsets / elementImports / elementSources, **last-wins across files** | cross-file variant: overload A in file1 (`import a::*`) and B in file2 (`import b::*`) **both resolve with file2's imports**; errors attributed to file2 (Compiler.java:445-447). Multi-source / corpus path; not probed on the corpus |
| Compiler.java:190-199 | dedup key from `String.valueOf(pd.type())` pre-resolution | two files declaring `x::f(p: T[1])` with T imported from different packages get the same key → the second dropped as a "duplicate" (reported, not silent). Spelling identity; owner W2.1 ("refuse model↔model duplicate ids"). Not reproduced |
| NameResolver.java:276 | walls `putIfAbsent(fqn)` | only the first overload's failure reported (diagnostic; element kept) |
| PureTests.java:97 | `elementImports().get(fqn)` | a zero-arg `@Test` sharing its FQN with an overload in an earlier section gets the wrong imports (latent) |
| pct/.../ChannelB.java:260 | same | PCT harness (latent) |
| parser-equivalence/.../Sectionize.java:76-84 | sorts by `elementOffsets.get(fqn)` | overloads sort to the first overload's position (test tool) |
| ide/ModelOrchestrator.java:127,135-145; ide/ModelIndexer.java:98-102 | union imports; index keyed by FQN refuses overloads as "duplicate top-level element" | IDE package, no product callers (grep); note only |

Not affected (each keys a non-overloadable kind, FQN is identity): `ModelBuilder.importsOf` (`:1270`; callers mappings,
AssociationSynthesis.java:379, StoreSubstitutionRewrite.java:360); `ModelNormalizer.java:169` (the synthesized function's
`ownerFqn` is a class/association/mapping/view — constructors MappingNormalizer.java:639…, AssociationSynthesis.java:543, …).

**Principled fix — attach imports by section (= W2.2 exactly).**
1. `ParsedModel` carries `List<Section>`, `Section(ImportScope imports, @Nullable String sourceName, List<Declared>
   declared)`, `Declared(PackageableElement element, int offset)`; `elements()` becomes the flattened view;
   `elementImports`/`elementOffsets`/`elementSources` deleted. The convenience constructors (`ParsedModel(elements,
   imports)` — NameResolverTest ~12×, KnowledgeLayerTest:187, PhaseHCensusTest:178, Phases:32, ModelOrchestrator:127) build
   one section with the given imports (today's behaviour).
2. Rebuild sites go through `ParsedModel.mapElements` / `filterElements` that keep sections intact (no caller keeps
   indices aligned): NameResolver:289, KnowledgeLayer:478, SystemMetamodel:1579, Compiler:359 (the prelude-shadow filter),
   Compiler:298 (boot concat: system metamodel elements become an empty-scope section), ChannelB:140.
3. Writers: ElementParser opens a `Section` on each `###` boundary and on the import-reset at `:311`, and appends each
   element to it (`:325-327`, `:381-394`, `:467-479`); `Compiler.parseSources` appends each unit's sections tagged with
   the source name, dropping deduped elements from their section.
4. Readers: `NameResolver.resolve` iterates sections and scopes each element by its own section — **the union fallback at
   `:262` is deleted**; `ModelBuilder.from` records the section scope for non-function elements at ingest (`importsOf`
   keeps its signature); ModelNormalizer:169 uses that index; PureTests:97 and ChannelB:260 read the scope from the section
   they iterate.
5. Error position: NameResolver's `ModelException` carries the `Declared` offset/source it is resolving; Compiler.java:98/445
   use it. Errors thrown by later phases still name only an FQN — attribution text, not wrong results; W1.2 (spans).

**Correct today?** Yes: needs nothing from W2.0/W2.1 (no `ResolvedExpr`, no World tables); the parser already knows each
occurrence's section and the fix carries it through. The resolution rule is unchanged (including today's own-package
tier; W2.3b owns the rule). Inert on the prelude: a script over `prelude.pure` (175 sections, 93 `function` declarations,
regex-based) found **0** function FQNs spanning sections with different imports.

**Blast radius.** Guardrails: `CodeShapeGuardrailTest` (ElementParser's `pos` cursor row at :91 — untouched unless
method-size limits are hit), `PlatformSurfaceGuardrailTest` (lists ElementParser); `JavaEvalLedgerTest` names
`Compiler.java` at :1179 (a file list, not a line pin; not verified that no line pin moves); PhaseHCensusTest:173-178
builds a ParsedModel. No test reads `elementImports`/`elementOffsets` directly (grep of core/src/test). Rosters: the
corpus/CANDIDATES may move wherever the corpus has cross-file or cross-section overloads (last-wins today) — not measured.

**Gate.** Remove the pin; assert `b::whichOne`. Adversarial: (a) cross-file — the same shape through
`Compiler.parseSources` with two sources (today both bind file2; after: each its own file); (b) overload 1 in a section
with **no** import and bare `whichOne()`: resolve error names overload 1's line, overload 2 still resolves; (c) two
overloads in one section share its scope; (d) a compile error in overload 2 reports overload 2's line; (e) a PureTests
`@Test test::t()` in §3 next to `test::t(x)` in §2 gets §3's imports; (f) non-function duplicates across sections still
refused "Duplicated element"; (g) CANDIDATES and corpus rosters identical, or the moved rows listed as the cross-file
overloads above.

---

## 2. Pure mapping with no `~src` (`SourcelessPureMappingKnownDefectTest`, owner W2.3a)

**Symptom / reproduction.** `Class my::Person {name: String[1];}` + `###Mapping import my::*; Mapping my::M ( Person: Pure
{ name: 'x' } )` → `NameResolver.resolve(...)` throws `NullPointerException("resolver passthrough")`.

**Root cause.** `NameResolver.java:1134-1148`: `sourceClass` is correctly computed `null` when there is no `~src`
(`:1136-1137`); when anything changed, the rebuild does `yield new ClassMapping.Pure(className, …, p.root(),
nn(sourceClass), filter, bindings)` (`:1147-1148`), and `nn` is `Objects.requireNonNull(v, "resolver passthrough")`
(`:1962-1963`). Fires whenever the rebuild path runs: a bare class name (as here), **or** an FQN class whose `~filter` or
bindings resolve something.

**Reference.** `~src` is optional: engine grammar `(mappingSrc | mappingFilter)*`
(`$E/.../PureInstanceClassMappingParserGrammar.g4:26`); engine compiler `srcClass == null ? null : resolveType(…)` then
`._srcClass(srcClass)` (`$E/.../ClassMappingFirstPassBuilder.java:108,116`); M3 `srcClass : Type[0..1]`
(`$P/.../platform_dsl_mapping/grammar/mapping.pure:161`); lite's own record declares it nullable
(`model/ClassMapping.java:302-320`). Downstream already handles null: `MappingNormalizer.synthM2M` refuses with a
NORMALIZE error "declares no ~src" (`:1133-1146`); `MappingPrePass.java:252` (`HashMap.get(null)`); `ScanRelations.java:859`
null-checks.

**Other sites of this class.** Checked the `nn()` targets at NameResolver :786, :799, :862/880, :1432, :1821 against
their record components (PropertyDefinition.type, DerivedPropertyDefinition.type, FunctionDefinition.returnType,
ServiceDefinition.functionBody, NewInstanceCast.src): none `@Nullable`. The other ~25 `nn()` sites (mapping,
relational-op, association arms): components not annotated `@Nullable` in the records opened; not verified one by one.

**Fix.** Pass `sourceClass` through without `nn` at `:1148`. Correct today, independent of W2.3a (which rewrites this
file later, but nothing here depends on it).

**Blast radius.** NameResolver only; referenced by PhaseHCensusTest:173 and StackRatchetWitnessTest:145 (not line pins);
no golden.

**Gate.** Remove the pin; assert `className == "my::Person"`, `sourceClass == null`. Adversarial: (a) FQN `my::Person:
Pure { ~filter [bare-name enum/constant ref] … }` with no `~src` (only the filter changes — also an NPE today); (b) a
binding referencing an imported enum bare (`Color.RED`) with no `~src`; (c) `~src Person` bare resolves to `my::Person`;
(d) `Compiler.compileModel` on the sourceless mapping succeeds and a query through it fails with the "declares no ~src"
NORMALIZE message, not an NPE (not verified whether synthM2M runs at compile or query time; pin whichever it does against
the engine, which compiles it).

---

## 3. Service-test provisioning keyed by `String.hashCode` (`ServiceTestProvisionKeyTest`, owner W6.4)

**Symptom / reproduction.** ServiceA's suite loads CSV `ID,NAME\n1,Aa\n`, ServiceB's `…BB…`: different strings, equal
`hashCode` (`"Aa"`/`"BB"` collide; the collision survives any same-position substitution). On one runner A passes, then B
runs on A's rows and FAILs; B passes on a fresh runner.

**Root cause.** `test/ServiceTestRunner.java:321-323`: each provision's identity is `schema.table:` +
`t.values().hashCode()`; `:334-338`: the `runtimes` cache key is `runtimeFqn|identity|…`, so a collision returns the
cached `TestRuntime` whose overlay connection carries A's CSV (`:354-372`). **Second site, `:366`:** `rtName = runtime +
"$test$" + Integer.toHexString(key.toString().hashCode())` — even with `:323` fixed, keys differing only by an `Aa`/`BB`
substitution still hash equal, so both runtimes get **the same name**, and `shared(rt.runtimeFqn())` (`:199`,
`:377-384`) hands B A's session under the SHARED policy (the platform's seed key there is a record of the connection
definitions, `StatementExecutor.java:1995-2019`, so it likely re-seeds — whether that replaces or mixes rows is not
verified; either way suite isolation is lost).

**Every other hashCode-as-identity site in core/src/main** (grep `hashCode()`, `toHexString`, `identityHashCode`;
`equals`/`hashCode` method bodies excluded):

| site | use | risk |
|---|---|---|
| resolver/ConstructedInstances.java:90-98 | `"q:"+hex(op.toString().hashCode())+":"+len` keys `seen` and `rowsById` | two different constructed ops of the same length collide → the second is served the first's rows: wrong results (latent; the substitution trick makes it easy to construct) |
| resolver/FunctionBodyRows.java:37 | lambda scope id `"fn:"+hex(hash)+":"+len` (callers ElementReferences.java:290) | same |
| plan/PlanRows.java:51 | plan scope id fallback when the call has no span (the spanned path at `:48` is exact) | same, for synthesized plans |
| resolver/NavReducer.java:63, 75 | variable names `"_e"+System.identityHashCode(node)` | identity hashes are not unique → a collision would capture a variable (owner W2.5, VarId fresh ids) |
| probe/Shadow.java:112 | diagnostic label | not identity; excluded |

The `:len` suffix gives no protection (the colliding substitutions preserve length). No test golden pins any `fn:`/`q:`/`plan:`
id (grep of core/src/test).

**Correct key — value equality of the sources** (the pattern StatementExecutor:1995-2004 already uses: "the key is a
record of them and value equality does the comparing"). In ServiceTestRunner: `Provision.identity` (String) → `record
CsvTableKey(String schema, String table, String values)`, `record ProvisionKey(String store, List<CsvTableKey> tables)`
— deliberately excluding `sourceInformation` (`PRelationalCsvTable` is a record including `SourceInfo`,
`Protocol.java:514-524`, and identical data should still share); `runtimes` → `Map<RuntimeKey(String runtimeFqn,
List<ProvisionKey>), TestRuntime>`; `rtName = runtime + "$test$" + runtimes.size()` (an ordinal); `shared` keyed by that
unique name (or the session held on `TestRuntime`). This also removes the separator ambiguity of concatenated keys. Latent
sites: ConstructedInstances → `Map<RelationalOperation, String>` with ordinal ids (the op is a record); FunctionBodyRows /
PlanRows must stay rebuild-stable across callers, so the id should be the **whole text**, not its hash (not verified
against SQL literal quoting of long ids).

**Correct today?** Yes; no later-wave structure needed (W6.4 only moves the runner out of the product jar).

**Blast radius.** ErrorShapeGuardrailTest:59 pins `ServiceTestRunner.java` at 4 catch sites (unchanged if no catch is
added); JdbcSurfaceCensusTest:152 lists the file (unchanged if no JDBC call is added); ArchitectureTest mentions the
runner; StressServiceSuitesTest (stress tag, pass-floor ratchet at :145) may see counts move if any corpus collision existed
(unlikely; not measured). CodeShapeGuardrailTest:276 mentions FunctionBodyRows, JavaEvalLedgerTest:922 PlanRows — comments
or rows to re-check if those files are touched.

**Gate.** Remove the pin; under FRESH_PER_TEST, B passes after A on one runner. Adversarial: (a) the same pair under
`Sessions.SHARED`: B passes and `sessions().size() == 2` (`:481`) — catches `:366`; (b) two suites with **identical** CSV
under SHARED share one runtime/session (`sessions().size() == 1`) — sharing preserved; (c) the same CSV via a `###Data`
reference and inline shares one runtime; (d) two runs A, B, A: the second A still passes; (e) if the latent sites are fixed
too: two constructed-instance ops / function-body lambdas differing only by `'Aa'`/`'BB'` literals get distinct ids and
rows (reachability of these paths from a user query not verified).

---

**Summary.** All three are reproduced wrong-binding / wrong-data defects with a correct fix available today: (1) sections
carry imports (W2.2's own design, pulled forward; ~12 main files + test constructors); (2) drop `nn()` at
NameResolver.java:1148; (3) value-record keys and ordinal runtime names in ServiceTestRunner. Found beyond the brief: the
cross-file last-wins variant in `Compiler.parseSources` (Compiler.java:212-218), the more likely one in real models, and
three latent content-hash ids in the resolver/plan path.
