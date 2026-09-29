# A03 — Model, builtin catalog, values, error, spi — read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 85 files, 14,832 lines. `Pure.java`: every code line read; the 831
`signature("…")` rows and 488 `AT_…` rows checked by script. SystemMetamodel's embedded `###Mapping` text read for
structure and samples. Paths relative to `core/src/main/java/com/legend/`.

## 1. What it is
Shared vocabulary, not a stage. `model` (62 files, 7,049): sealed `PackageableElement` (25 kinds); three
protocol→model converters `FromProtocol` 827, `MappingFromProtocol` 750, `RelOpFromProtocol` 188; phase-E output
types (`MappingDefinition` with `NormalizationFacts`, `NormalizedModel`); identity schemes `FunctionId`/`SignatureMangle`,
`SetId`, `DerivedPropertyNames`. `builtin` (9 files, 6,504): `Pure.java` — 831 function signatures, 12 native classes,
6 native enums parsed via `ElementParser` at class-load, `Lite` constants, 488 generated `AT_…` groups; `NativeFn`
(21 implementer-family enums); `DynaFn` (232 rows); `EngineHandlers`; `Prelude` and `SystemMetamodel` (Pure parsed at
class-load); `Subsumed`, `TdsLegacy`, `DecisionProbe`. `values` (971): temporal carriers, `LiteralText`. `error` (244).
`spi` (64). model → protocol, base; builtin → model, parser, protocol, error; no back-edge from parser/protocol.

## 2. Verdict
**Identity is a lossy String.** `FunctionId` is `record FunctionId(String qualified)` (FunctionId.java:18) from
`SignatureMangle.mangle`, which keeps only the text after the last `::` of each type (SignatureMangle.java:69-70),
drops generic arguments (`Generic g -> g.name()`, :64), folds every function type to `Function` and relation type to
`Relation` (:65-67). `Pure.Index` `FN_BY_ID.put` has no collision check (Pure.java:616) while `NativeFn.indexById`
does (NativeFn.java:74-77). Script over the 831 signatures: 0 collisions today — luck, not design. Catalog keyed by
FQN string (`CLASS_BY_FQN`, `ENUM_BY_FQN`, `FN_BY_FQN`, Pure.java:589-605); bare name by substring (:617-619); user
visibility `!startsWith(Lite.PKG) || LITE_SURFACE.contains(bare)` (:620-621). Name-matching rules disagree:
`TdsLegacy.matches` bare or FQN (TdsLegacy.java:60-62); `NativeFn.Member.matches` also `endsWith("::"+bare)`
(NativeFn.java:52-55), contradicting the exact-FQN rule at Pure.java:550-557 and TdsLegacy.java:10-12; `RowGetter.of`
strips the package (NativeFn.java:1173-1180). `DerivedPropertyNames.split` parses lifted names apart
(DerivedPropertyNames.java:21-25). `LiteralText` reduces enum/element values to simple names (:41-58).

**IR.** Sealed roots and records (PackageableElement, ClassMapping, PropertyMapping, RelationalOperation,
RelationalDataType, FilterMapping, PoisonKey, ClassBinding, RelationalSource); `RelationalOperation.children/withChildren`
exhaustive (RelationalOperation.java:53-92). **Not phase-indexed:** the same `FunctionDefinition`/`ClassDefinition`
carry simple names before resolution and FQNs after (Function.java:51-54; FunctionDefinition.java:180-182;
ClassDefinition.java:97); `ColumnRef.databaseName` null until phase D (RelationalOperation.java:182-202);
`ClassMapping.setId()` defaulted in D (ClassMapping.java:133-138). `CleanSheetMappingDefinition` vs `MappingDefinition`
is the one real phase split (good). **Not pure data:** `MappingDefinition` carries phase-E facts (:69-101),
`RelationalSource` stamps (:486-547) and include-resolution behaviour with a bare-path package heuristic (:467-473)
that silently skips a missing include (:477-479); `ClassMapping` owns SQL column-naming contracts `"stc_"`, `"$pk:"`,
`"$fk:"`, `"$member"` (:52-128) and an AST rewrite `bindSrc` (:501-509); `AssociationMapping.Cross/ModelJoin.propertyMappings()`
return silent `List.of()` (:83-85,110-112). `OpaqueElementDefinition` says every compiler dispatch "falls through their
`default` arms" for it (:12-13).

**Types as data.** Catalog types are parsed `TypeExpression`s (good). `RelationalOperation.Literal(Object)` untyped
(:227); `FunctionCall(String name,…)` dispatched by name (:237; `RelOpFromProtocol.dynaFunc` switch :137-172);
milestoning dates `String` (DatabaseDefinition.java:147-155); "SCHEMA.TABLE" one string (RelationalOperation.java:165-167);
`LiteralText.parse` returns `Object`, typed by first/last char (:31-72).

**Diagnostics.** No spans in model ("Positions are dropped here, on purpose", FromProtocol.java:24-27).
`LegendCompileException` = Phase + optional FQN, position rendered as `"[line:col]"` text (:58-81); no severity, code,
span or sink. `ResolutionException` has no element. `NotImplementedException`, `AssertFailed`, `DataError`,
`FromProtocol.UnsupportedConnectionShape` (:376-390), `MappingFromProtocol.UnsupportedMappingShape` (:51-67) are not
`LegendCompileException`s. User errors thrown as ISE/IAE (FromProtocol.java:88-94; ClassMapping.java:333,467).
`Phase` includes `RENDER` (:29) though AGENTS.md says it does not.

**Fallbacks.** MappingFromProtocol: :495-501 catches MissingDatabase, returns null, DROPS the class mapping; :230-236
foreign-store null; :320 merge null; :336 other operation null; :150,172 dataspace includes skipped; :433-434
half-specified `[src,tgt]` nulled; :111 non-"PURE" → RELATIONAL; :671 firstNonNull → mainDb; :732 exception type chosen
by `what.contains("requires a database")`. FromProtocol: placeholder strings `"<targets>"`, `"<notifier>"`, `"<query>"`
(:650-652,688); Json→SemiStructured (:334); size/precision/scale 0, VARCHAR MAX (:336-352); catalog/serviceName/database
`""`, Athena port 0 (:764-783); `(int) s.port()` casts. RelOpFromProtocol unknown operator → FunctionCall (:168-172).
SystemMetamodel.spelling `default -> String.valueOf(t)` (:1505). ClassBindings/AssociationBindings `putIfAbsent`
first-wins (MappingDefinition.java:143,185-186); RowGetter `putIfAbsent` (NativeFn.java:1168); `"JSON"`→SemiStructured
(RelationalDataType :137).

**Layering.** `DecisionProbe` reads `LL_SHADOW`, static `INSTALLED` via ServiceLoader (:79-90), 31 product call sites.
`MappingResolutionException.traced` reads a system property and `printStackTrace(System.err)` (:25-31).
`SystemMetamodel.withoutSystemShadows` is a model transform throwing NORMALIZE errors inside builtin (:1561-1582).
`Pure`, `Prelude`, `SystemMetamodel` run the parser in static initialisers; static collections filled by field
initialisation order (Pure.java:126,302,369,588-627); overload tie-break depends on declaration order in the Java file
(:363-368).

**Duplication/dead.** `LEGACY_ASSOC_PREDICATE_FQN`/`LEGACY_LOCAL_PROPERTY_FQN` (Pure.java:1665,1678) duplicate
`Lite.*` (:401-402); `families()` registers RowGetter twice (NativeFn.java:104,106); each of 21 NativeFn enums repeats
~35 lines of boilerplate; include loop duplicated (MappingFromProtocol.java:147-163 vs 169-186); date validators
duplicated (PureDateLiteral.java:639-670 vs PureTimeLiteral.java:158-187); stale/orphan comments (Pure.java:170-231,
257-288, 547-549, 592-599, 674-679; NativeFn.java:432; PropertyMapping.java:82-102; model/package-info.java:15-17).
`DynaFn.dialects()`/`inference()` feed no product logic.

**PureDateLiteral DEFECT.** `shift` calls `LocalDateTime.of(y,mo,d,h,mi)` before validation (PureDateLiteral.java:381-386,
585-600): in the documented no-validation mode (:133-138) `%2024-02-30T10:00+0500` throws `DateTimeException` while
`+0000` early-returns (:582); `toInstantFloor` same exposure (:263-289); javadoc contradicts itself (:51 vs :133);
PureTimeLiteral validates in its constructor (:52-75) — two policies.

## 3. Clean-sheet and delta
One symbol table for builtins and user code; `DeclId` interned at declaration entry; overload identity (owner symbol,
resolved signature) with packages; the engine mangle an ATTRIBUTE for textual references. Natives as a `.pure`
resource parsed once, referenced from Java via a generated handle class; overload groups a query, not 488 committed
constants. Visibility an `internal` modifier checked by the resolver (replacing INTERNAL_DESUGAR 16, ENGINE_VOCAB_SHIMS 12,
LITE_SURFACE 4). Each consuming phase owns its `DeclId → implementation` map with a boot totality check. Syntax /
resolved / normalized IRs; converters to `frontend.protocol`; SQL naming contracts to resolver/lowering.
`Diagnostic(code,severity,phase,Span,args,related[])` in a sink.
Keep: PureDateLiteral/PureTimeLiteral (after the fix), RelationalOperation (type `Literal`), RelationalDataType,
FilterMapping, PoisonKey, ClassBinding/RelationalSource, spi, SetId, Subsumed. Delete: DecisionProbe (per its own plan),
duplicate FQN constants, DynaFn's unused columns, dead comments, the second RowGetter registration.

## 4. Top findings
1. STRUCTURAL: identity is a lossy mangled String; add a collision guard now; make `DeclId` identity.
2. STRUCTURAL: catalog is a 2,769-line Java class parsing Pure in static init; tie-breaks by declaration order.
3. STRUCTURAL: `NativeFn` encodes downstream implementers (LowererForm, TyperForm, ResolverForm, JavaRoutine, Effect, Carrier…) inside the catalog.
4. STRUCTURAL: lite partition as bare-name string sets.
5. STRUCTURAL: `model` neither pure data nor phase-indexed.
6. DEFECT: silent drops in the protocol converters (MappingFromProtocol.java:495-501 et al.; exception type from message text :732).
7. STRUCTURAL: diagnostics have no spans; exceptions outside the taxonomy.
8. DEFECT: PureDateLiteral crash when validation is off.
9. SMELL: env/system-property/stderr in product code (DecisionProbe, MappingResolutionException).
10. SMELL: SystemMetamodel builds 1,583 lines of Pure by string concatenation; shadow test compares by spelling.

Counts: builtin 9/6,504; model 62/7,049; values 3/971; error 8/244; spi 3/64. 831 signatures, 12 classes, 6 enums;
488 AT_ groups over 831 members; NativeFn 21 families; DynaFn 232 rows (PURE 159, SHIM 8, TRANSLATED 24,
UNSUPPORTED 41); converters 1,765 lines in model. Repo reach: `Pure.AT_*` 359 refs/32 files; `Pure.isToOneCall` 72/30;
`FunctionId.of(` 33/16 (a per-call mangle at `platform/ImplementationTable.java:212`); DecisionProbe 31 sites.
