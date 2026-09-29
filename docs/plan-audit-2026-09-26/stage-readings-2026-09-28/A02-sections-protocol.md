# A02 — Section grammars + protocol (parse products and the wire), read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 76 files, all read. Paths relative to `core/src/main/java/com/legend/`.

## 1. What it is
(a) `protocol/spec` (33 files, 2,577 lines): the untyped expression IR. Sealed `ValueSpecification` over 29 variants
(ValueSpecification.java:45-72) plus sealed `ColumnInstance`, `TypeAnnotation`; shared `children()/withChildren()/
mapChildren()` (:86-235). (b) `protocol/*` (~13,400 lines): `Protocol.java` — 289 records, 26 sealed interfaces,
both element parse product (`PClass` "the parser's output", Protocol.java:2930-2939) and wire model; six hand
`StringBuilder` JSON emitters (8,586 lines: ProtocolEmitter, TailEmitter, MappingEmitter, ConnectionEmitters,
AuthSpecEmitter, GqlEmitter); `ProtocolReader` (JSON→IR); `ProtocolUpgrade` (JSON→JSON); `PureComposer` (JSON→Pure
text); `SourceInfo`, `SpanOrigin`. (c) `parser/section` (23 files, 9,578 lines): 18 hand RD grammars for
Connection/Runtime/Service/Persistence/DataSpace/…, producing `Protocol.P*` and also `toModel(...)` into `model`
(19 implementations). protocol ↔ protocol.spec import each other (`ColSpec.java:66-67` uses `Protocol.PStereotype`).

## 2. Verdict
**Names.** Every reference is a `String`. Defensible pre-resolution, not once resolver output rides on parse nodes:
`AppliedFunction.candidateFqns` (AppliedFunction.java:68) "filled ONLY by the name resolver" (:170-178);
`NewInstanceCast.targetSetId` (:64) read by 16 normalizer/resolver/compiler files; `KeyExpression.isLocal` (:47).
`lastIndexOf("::")` in 10 of 23 section files, all after `Protocol.unquotePath`, not quote-aware, although
`Protocol.splitFqn` (Protocol.java:3110-3126) claims to be the only splitter; `SectionParse.head` (SectionParse.java:40-44)
contradicts it. Whole-token string compares: 140 section grammars, 24 ProtocolEmitter, 27 TailEmitter, 13 PureComposer,
10 ProtocolUpgrade. Emitter branches on function names `"letFunction"` (ProtocolEmitter.java:2490), `"new"` (:2515),
`"tableReference"` (:2525,2541), `"minus"` (:3225), caret specials by class name (:2604-2621), and sniffs
`indexOf('~')` (:2098), `value.contains("T")` (Protocol.java:905), `path.indexOf('(')` (TailEmitter.java:873).

**IR discipline.** Root closed; `children/withChildren` exhaustive with no default (good). Immutability inconsistent:
289 records, 51 `List.copyOf`; `PConfigValue.PCMap` holds a mutable `LinkedHashMap` (Protocol.java:1708); `PSection`
admits nulls (:2997-3003); `PEnumSourceValue.value`, `PRelLiteral.value` typed `Object`. ≈45 `String kind/type`
discriminators; `PPersistenceNode.kind` magic sentinels `"__part__"`, `"__empty__"`, `"__noDedup__"`, `"#path"`.
Five dual-faced spec variants (PathLiteral, GraphFetchLiteral, TdsLiteral, QuotedTreeCall, QuotedGrammarCall) said to
be dissolved by NameResolver "on first touch" — nothing in the types stops a later phase seeing them. `default ->`
over sealed types: ProtocolEmitter.valueSpec (:2259, hides NewInstanceCast, MultiplicityRef, Wildcard; javadoc
"Literals only so far" :2023-2027), valueSpecWithSpan (:2388), genericType (:1842), superType (:1692), gftParam
(:2985); MappingEmitter.nestedClassMapping (:1082); ConnectionEmitters.vendorDatasourceSpec (:488);
TypeExpression.rawClassName (:255); PFunction.mangleType (Protocol.java:2837); 110 in section grammars (mostly
correct unknown-key refusals).

**Equality and positions.** Six spec variants include `pos` in equality (CByteArray, GqlIsland, QuotedTreeCall,
QuotedGrammarCall, SqlIsland, TdsLiteral; plus TypeAnnotation.MultiplicityRef); `NewInstance`/`NewInstanceCast` have
no position. `AppliedFunction.equals` ignores `propertyCall`, `grouped`, `infix` (AppliedFunction.java:157-163) though
the emitter differs on them (ProtocolEmitter.java:2457, 2688-2690). `TypeExpression.Generic.equals` ignores
`typeVariableValues` (TypeExpression.java:135-145): `Varchar(10)` equals `Varchar(200)`. Positions as semantic
discriminators: `tbl.pos()==null` (island vs call, ProtocolEmitter.java:2541-2545), `c.pos()==null` (:3157-3158),
`enumerationPos()==null` (:2107), `lam.pos()!=null` (:2315).

**Field-dropping rebuilds (DEFECT).** `withChildren` drops `AppliedProperty.pos` (ValueSpecification.java:177-178),
`LambdaFunction.pos` (:179-180), `ColSpecArray.pos` (:198-199), ColSpec stereotypes/tagged values (:206-208),
`GraphFetchLiteral.subTypeTrees` (:151-152). The let path drops `colType`, `colTypeMult`, annotations
(ProtocolEmitter.java:2364-2366). Live rewriter: ServiceSectionGrammar.java:401.

**Types as data.** `TypeExpression`/`Multiplicity` structured (good), bypassed: `Generic.multiplicityArguments`
`List<String>` (TypeExpression.java:100), `NewInstance.typeMultiplicityArguments` `List<String>` (NewInstance.java:80),
so the emitter re-parses multiplicity text (`parseMultArg`, ProtocolEmitter.java:3107-3126). Function-activator and
DataSpace pointers kept as reconstructed signature text (FunctionActivatorSectionGrammar.java:239-241;
DataSpaceSectionGrammar.java:597-602); `PFunctionActivator` flattens to `Map<String,String>` (Protocol.java:1647);
ownership encoded as `"Deployment " + id` (FunctionActivatorSectionGrammar.java:112).

**Diagnostics.** Section grammars good (360 positioned throws). Escapes: `Long.parseLong` (ServiceSectionGrammar.java:302;
FileGenerationSectionGrammar.java:146), `Double.valueOf` (DataQualityValidationSectionGrammar.java:421),
ClassCastException in `MongoDBSectionGrammar.schemaOf` (:233,273-275; `"title": null` → `JSON_NULL` cast to String),
12 `requireNonNull`. Protocol throws 46 unpositioned.

**Fallbacks.** PersistenceSectionGrammar.java:629-649 classifies leaf node vs scalar by CamelCase shape;
DataQualityValidationSectionGrammar.java:55 `default -> "DataQualityRelationComparison"`; ProtocolReader.java:287
missing `lowerBound` → 0, :321 `sourceId` → `""`; PureComposer.java:559-572 missing multiplicity → `*`, :163-165
missing body → `""`; MongoDB defaults (:123-128, :234 `"object"`); GenerationSpecification id defaults to path (:93);
`ProtocolEmitter.foldNegation` default returns unchanged (:3234-3252); `ProtocolUpgrade` `default -> af` (:138);
`DiagramSectionGrammar.parseRaw(src)` defaults to LEGEND_LITE (:53); `PCMap` collapses duplicate keys
(FileGenerationSectionGrammar.java:172).

**Layering and duplication.** Parser does model work (19 `toModel`; Snowflake `mode: local` synthesis
ConnectionSectionGrammar.java:648-665) and holds wire knowledge (Elasticsearch `_type` triples :93-109, Deephaven wire
types :29-33, FileGeneration `lowerFirst`). Persistence rules split parser/emitter (PersistenceSectionGrammar.java:180-316
vs TailEmitter.java:1039-1177, 1480-1494) keyed by `"slot/kind"`. Parser imports the emitter (SPI feed). 6
`TokenStreamCursor` implementations: three identical slice cursors, three identical offset cursors with DIFFERENT
offset composition (Runtime applies column offset on line 1 only, RuntimeSectionGrammar.java:185-196, documenting a +6
drift fix; Persistence composes unconditionally, PersistenceSectionGrammar.java:489-494 — latent same bug).
`ElementwiseSectionGrammar` loop re-implemented 3× (Connection :62-92, Runtime :41-71, FunctionActivator :63-103);
15 island scanners; 10 depth scanners; 86 keyed-block HashSets, 64 `once(...)`. Negative-literal folding twice
(ServiceSectionGrammar.foldSignedLiterals :373; ProtocolEmitter.foldNegation :3222) both truncating BigInteger via
`longValue()`. Two caret tables that disagree (ProtocolEmitter.java:2604-2621 vs ProtocolUpgrade.java:109-138; only the
latter has AggregateValue). Six parallel test-data type pairs, each with two emitters. Assertion switch 3×;
`localMappingProperty` emission 3×; `qualifiedName()` defined 31×; two private boolean parsers
(ConnectionSectionGrammar.java:697; ServiceStoreSectionGrammar.java:351); AWS Static credentials parsed twice with
different validation (ConnectionSectionGrammar.java:1989-2010 vs :2075-2100). Dead: `seenKeys`
(ConnectionSectionGrammar.java:514); unused `key` in `parseReconStrategy`; orphan javadocs (ProtocolEmitter.java:1219-1221,
3128; SpanOrigin.java:42-48; Protocol.java:814). Stale docs claim PService/PPersistence emission "walls"
(ServiceSectionGrammar.java:24-27; PersistenceSectionGrammar.java:24; Protocol.java:1045-1047; ProtocolEmitter.java:80-82)
though TailEmitter emits both; `PInMemory`/`PLocalFile` named but absent (Protocol.java:2339-2343).

**ProtocolEmitter: serializer or grammar?** Neither cleanly: carries let-span rule (:2326-2392), operator-chain
truncation reading `infix`/`grouped` (:2688-2701), caret desugaring (:2594-2621), data-walker divergences
(:3150-3302), persistence kind resolution. `PureComposer` is a second printer over raw `Json.Obj`
(PureComposer.java:111-156) with its own operator table (:40-44). One wire shape known by four walkers; the reader is a
partial mirror (no keyExpression/path/rootGraphFetchTree/TDS/SQL/GQL rules despite ProtocolReader.java:39-46).

**Size.** ProtocolEmitter 3,497; Protocol 3,194; TailEmitter 2,522; ConnectionSectionGrammar 2,363. Methods ≥150:
MappingEmitter.mapping ~245, ProtocolEmitter.valueSpec ~230, parseDatasourceSpec ~210, connectionValue ~204,
parseEsAuthIsland ~200, parseRelationalConnectionBody ~184, TailEmitter.persistenceNode ~164, parseService ~155.
228 separator `if (i > 0) b.append(',')`; 29 unescaped dynamic appends into JSON (e.g. TailEmitter.java:1381,1669;
ProtocolEmitter.java:398,550; MappingEmitter.java:1244).

## 3. Clean-sheet and delta
Lossless concrete tree for sections (`Block(kind,entries,span)`, `Value = Str|Int|Bool|Path|List|Block|Island|Expr`)
from one table-driven section parser with one island scanner and one offset cursor; declarative per-element schemas
validating the block tree and building typed records; expression IR split by phase (`ParsedExpr` positions only, no
resolver fields; resolver annotations in `ResolvedExpr` or a side table; wire trivia in a `SyntaxTrivia` side record;
positions uniformly out of equality and never discriminators); one codec per element type with paired emitter and
reader; `PureComposer` printing from the IR; parser → syntax, model builder → model, codec → wire.
Keep: sealed spec root and `children/withChildren` (after fixing rebuilds), TypeExpression/Multiplicity, Escapes,
Gql/GqlEmitter, SpanOrigin, positioned grammar errors. Restructure: 6 cursors → 2, scanners → cursor helpers, every
FQN split through `splitFqn`, `toModel` out of `parser/section`, `candidateFqns`/`targetSetId`/`isLocal` out of parse
records, typed multiplicity args, enums for string kinds, unify the test-data pairs, merge caret tables.

## 4. Top findings
1. STRUCTURAL: parse IR carries later-phase data and wire trivia; equality hides it.
2. DEFECT: `withChildren` and the emitter drop fields; positions act as discriminators — a rewrite can change the wire.
3. DEFECT: equality inconsistent across spec types (6 include pos; `Generic` ignores type-variable values).
4. STRUCTURAL: persistence grammar a stringly-typed tree, rules split parser/emitter, guesses by CamelCase.
5. STRUCTURAL: ~18k lines of the same few patterns by hand.
6. DEFECT: FQN splitting not quote-aware at 13 sites; divergent cursor offset composition; Diagram escapes not decoded.
7. DEFECT: unpositioned escapes and silent truncation (BigInteger→long, int casts).
8. STRUCTURAL: four independent wire walkers; reader partial.
9. SMELL: parser layer does model and wire work.
10. SMELL: 29 unescaped JSON appends; stale contract docs.
