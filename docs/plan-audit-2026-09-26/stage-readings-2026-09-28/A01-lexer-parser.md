# A01 — Lexer + parser (phases A, B, C), read whole 2026-09-28

Reader's report, preserved. Tree `6ab32198d`. 26 files, 17,046 lines, all read. Paths relative to
`core/src/main/java/com/legend/`. **Correction on re-check:** finding 1 below is REFUTED — legend-pure's own
`AntlrContextToM3CoreInstance.processOp` (pinned tree, :1909-1939, `isStrictlyLowerPrecendence` :1880-1884) has
the same one-level snatch, so legend-pure also parses `1 < 2+3*4` as `1 < (2+3)*4`. Reproducing it is fidelity.
The `EngineQuirks.java:43-49` javadoc calling `1 < 14` "real Pure's precedence" is what is wrong.

## 1. What it is
Input `String`. `Lexer.tokenize` (lexer/Lexer.java:150): one batch pass, a hand-written scanner with an island
mode (`islandDepth` :159) that raw-skips opaque `###` sections (:375-389); returns `TokenStream` (three parallel
`int[]`: types, starts, ends) plus section headers and skipped sections.

Outputs: (a) `ElementParser.parse(source|TokenStream, Dialect)` (parser/ElementParser.java:219-228) →
`model.ParsedModel`, most elements via `protocol.Protocol.P*` records then `model.FromProtocol`/
`MappingFromProtocol` ("PROTOCOL-FIRST", :666-746); a few straight to model (`primitiveElement` :1318,
`nativeFunctionElement` :2500, association projection :1373). (b) `SpecParser.parse`/`parseCodeBlock`
(SpecParser.java:288-361) → `ValueSpecification`. (c) `PmcdParser.parseDocument` (PmcdParser.java:110) → PMCD JSON
via `ProtocolEmitter`. (d) `SpecParser.parseLambda` (:308) used by `server/PureV1Api.java:82`. (e) `GqlParser`.
Phases: lex → section route (registry or switch) → recursive descent per element → expression bodies located by
bracket-counting pre-scan, sliced and re-parsed by `SpecParser` → protocol → model transform.
Dependencies (FQN refs in parser/): protocol 249, protocol.spec 152, base 81, model 46, parser.section 45, spi 18,
values, error, ide (javadoc). `parser/package-info.java:28` "Only lexer and the JDK" is false.

## 2. Verdict
**Grammar.** Hand-written recursive descent over one shared cursor interface `TokenStreamCursor` (1,448 lines of
`default` methods, TokenStreamCursor.java:99). Expressions port the ANTLR walk of the engine's
`DomainParseTreeWalker` step for step: a "combined expression" loop with two accumulators (SpecParser.java:535-568)
plus `OperatorParts` (OperatorParts.java:58-187). Relational operations (DatabaseProtocolParser.java:694-1204) are
conventional RD. GraphQL is scannerless. **No error recovery**: every error throws, no sync points.

**Operators.** `+ - *` build `AppliedFunction(op, [PureCollection(operands)])` with `infix` set — one n-ary
collection per same-op run (OperatorParts.java:156-161); `/` and comparisons pairwise (:145-167). Parentheses set
`grouped` instead of a node (SpecParser.java:1091-1093). Operator identity is a string (`acc.op().equals("or")`,
`isRelationalComparison(String)`, OperatorParts.java:63,118,169-187). `EngineQuirks.RELATIONAL_ARITH_MISASSOCIATION`
(EngineQuirks.java:54, used OperatorParts.java:119) applies in every dialect — see the correction above.

**Semantic decisions on unresolved strings (should not be in a parser):**
- quote/eval fold: a call whose simple name is `compileLegendValueSpecification`/`compileLegendGrammar` has its
  string argument parsed as code, a whole model for the latter (QuotedSpecParser.java:55-118; SpecParser.java:1230-1237);
  a user function of that simple name in any package would be folded too;
- a small binder: let-bound string constants with lambda-shadowing by sentinel identity (SpecParser.java:248-272, 452-454);
- `Ptr.name` always becomes `EnumValue` (SpecParser.java:1411-1414);
- relation binding column-vs-expression by `ptr.fullPath().contains("::")` (MappingProtocolParser.java:1098-1100);
- operation class-mapping kind from an exact unresolved FQN with `default -> null` (:1577-1590); bare `merge_…`
  accepted, bare `union_…` not;
- synthetic set ids computed in the parser (`SetId.of`, `"_Aggregate_"+i`, `"_Main"`; :2961,3100,3106);
- relational column refs qualified with the current database and a `"default"` schema at parse
  (DatabaseProtocolParser.java:784-786,1095,1182-1203).
Counts: 164 string-literal `.equals` (MappingProtocolParser 55), 14 `::` splits, 64 `case "…"`, 9 hard-coded `meta::`.

**IR.** Two output IRs (protocol records, model elements) plus PMCD JSON. Parse-time desugaring mints 24 function
names (letFunction, equal, not, plus, minus, times, divide, lessThan, lessThanEqual, greaterThan, greaterThanEqual,
and, or, range, newUnit, getAll, getAllVersions, getAllVersionsInRange, all, allVersionsInRange, at, new,
tableReference, meta::legend::lite::tds; SpecParser.java:466,620-670,1034,1159,1274-1325,2681,3018). Surface lost:
`let`→`letFunction(CString(name),v)`, `$x[0]`→`at`, `[a:b]`→`range(0,…)` (default start 0, :1034-1036),
`^X(..)`→`new(ptr, NewInstance)`. Synthetic variables `_path`, `_gf<depth>` (:2797,3419); a ColSpec named
`"->subType"` (:3396). `AppliedFunction` carries three wire-only booleans `propertyCall`, `grouped`, `infix`
excluded from `equals` (AppliedFunction.java:65-72,156-166), set positionally (`…, false, false, true)` at 14 sites).
`propertyCall=true` at exactly 2 sites: dot-call `recv.f(args)` (SpecParser.java:1402) and `.all(nonLiteral)` (:1291).
Construction sites: SpecParser 22, OperatorParts 7.

**Positions.** UTF-16 offsets; line/col from lazy caches (TokenStream.java:175-285); `slice` shares the parent's
line index (:345). Spans built as engine `SourceInfo` (1-based, inclusive end; TokenStreamCursor.java:1215-1220).
**Two column conventions:** `columnOf` counts code points (TokenStream.java:217-220), `startColumn`/`endColumn`
count UTF-16 units (:249,:256); `spanOf` uses UTF-16, `throwAt` (TokenStreamCursor.java:422) and `charSpan`
(SpecParser.java:3273-3277; IslandScan.java:41-45) code points. Islands re-lexed from padded strings
(MappingProtocolParser.java:2911-2949, 1625-1638, 3184-3196). Graph-fetch errors repositioned by editing message
text (SpecParser.java:3302-3323). 25 engine span-quirk emulation sites in 6 files (e.g. DatabaseProtocolParser.java:570-573,
MappingProtocolParser.java:251,345,2220,3092-3095, RelationIslands.java:52-53, ElementParser.java:1831).

**Diagnostics.** `ParseException(message,line,column)` bakes `"[l:c] "` into the message (ParseException.java:39-42);
no file identity. 14 direct constructions (2 unpositioned: IslandScan.java:243,276); 4 `IllegalStateException`
(PmcdParser.java:91,674; SectionGrammarRegistry.java:43; SpecParser.java:719). Raw crashes: ClassCastException on
`[m]` (MappingProtocolParser.java:612-613), `Long.parseLong` overflow (TokenStreamCursor.java:830),
`-Double.parseDouble(text())` before the type check (DatabaseProtocolParser.java:1008).

**Fallbacks (invariant 4).** Every dialect: bad strict-time literal → `CTime(null,…)` (SpecParser.java:959-963);
dated path segment re-parsed as `"|"+arg`, else silently `new Variable(rawText)` (:2827-2830); non-lambda colspec
wrapped as thunk (:2437); typed-colspec backtracks by catching ParseException (:2369); quote/eval fold turns
ParseException into null (QuotedSpecParser.java:97,175); `skipTopLevelNonElement` drops `Diagram`, top-level
`^Instance(...)` and a stray `)` even at LEGEND_ENGINE (ElementParser.java:508-540); relation columns default `[1]`
(TokenStreamCursor.java:1436); main table schema `"default"` (MappingProtocolParser.java:1160); unknown operation
function → discriminator null (:1589); `canAggregate` via `Boolean.parseBoolean` of any token (:2998); milestoning
values accept any token (DatabaseProtocolParser.java:479), `…IS_INCLUSIVE` via `getOrDefault("false")` (:506,518).
PLATFORM only: unregistered sections recorded not refused (ElementParser.java:365-366); class projection → empty
class (:858-866); association projection returns a ClassDefinition (:1373-1375); XStore entries after a missing comma
discarded (MappingProtocolParser.java:1553-1556); graph-fetch trailing comma (SpecParser.java:3345). Deferred walls:
graph-fetch/path literals set an `unsupported` flag instead of refusing (SpecParser.java:2836-2842, 3261-3269).

**Layering and duplication.** The parser calls model transforms and the JSON emitter. The lexer knows the DSL
section catalogue (Lexer.java:310-317). Four section-name authorities (`Lexer.LEXABLE_SECTIONS`,
`SectionGrammarRegistry` :51-119, PmcdParser `IMPORT_AWARE` :58 / `TAIL_SECTIONS` :77 / `CONNECTION_FLAVORS` :704
plus its own switch :289-366 with magic site kinds 0–12 :558-676). Two document drivers (`ElementParser.parseModel`
:268-422; `PmcdParser.parseSections/strictWalk` :148-475; PmcdParser.java:83-86 records the authorities disagreeing
once). Dialect gates inline: 48 sites (ElementParser 19, SpecParser 18, MappingProtocolParser 3, PmcdParser 3,
NumberLiterals 2, TokenStreamCursor 2, QuotedSpecParser 1); dialect also changes semantics (float precision
NumberLiterals.java:65-70, BigInteger widening :39-42, date validation SpecParser.java:940); `DatabaseProtocolParser`
carries an unused dialect (:53-59). 56 reserved keywords, 54 also admitted as identifiers; other contextual keywords
matched by text. Relational multi-word tokens fused in every section. `TokenType.BOOLEAN` never emitted, still
tested (MappingProtocolParser.java:1674); dead `boolOpHere` arms (DatabaseProtocolParser.java:722,726). Duplicate
grammars: decorations (ElementParser.java:2753-2893 vs TokenStreamCursor.java:853-929), graph fetch (SpecParser.java:3333-3471
vs IslandScan.java:190-385), relation islands (ElementParser.java:2284-2441 vs MappingProtocolParser.java:3217-3287);
the bracket-extent loop ~20 times. `ElementParser.topLevelIndexes` (:170-194) has no caller. SpecParser: 111 direct
`pos++` vs 4 `advance()`. ~34 orphaned/misplaced javadocs. Stale docs: `parseDocString` "NO escape resolution" but
unescapes (SpecParser.java:886-895); ElementParser status "Mapping NOT yet supported" (:74-78);
`RelationalGrammarParser` named but absent (DatabaseProtocolParser.java:17).

**Size.** MappingProtocolParser 3,496; SpecParser 3,494; ElementParser 2,902; TokenStreamCursor 1,448. Longest methods:
`DatabaseProtocolParser.parseAtom` 222; `parseLegacyTest` 180; `parseMember`/`parseServiceStoreClassMapping`/
`parsePureClassMapping` 169 each; `ElementParser.parseConstraint` 164; `parseAggregationAware` 163.

## 3. Clean-sheet design and delta
Source layer `SourceFile(id,text,LineMap)`, one column unit, `Span(file,start,end)`. Lexer emits trivia, knows no
sections; a sectionizer splits on line-anchored `###`, each section lexed by its registry-named mode with a base
offset (no padding). Only true/false (and `let`) reserved. Pratt expression parser with an explicit precedence table
(the engine's association reproduced deliberately, see correction) producing a surface AST (`Binary(opEnum)`,
`Unary`, `Call(callee path,args,style∈{Prefix,Arrow,Dot})`, `Property`, `Paren`, `Let`, `New`, `Index`, `Range`,
`UnitLit`, `PathLit`, `Island(kind,span)`); embedded expressions parsed in place against a stop set. Diagnostics
collected with recovery on `;`, `}`, section headers. Separate passes: DialectValidator; ProtocolLowering (the wire
tree: n-ary runs, span quirks, `propertyCall`); Desugar after NameResolver keyed on resolved identities. One registry
entry per section; one document walker for model and PMCD.
Reuse: TokenStream storage (fix columns), DatabaseProtocolParser operation grammar, GqlParser, NumberLiterals,
ParseException idiom, SectionGrammarRegistry idea, OperatorParts (moved to protocol lowering). Delete: the parse-time
quote/eval fold and `constStrings`, IslandScan's duplicate graph-fetch grammar, `topLevelIndexes`,
`TokenType.BOOLEAN`, dead `boolOpHere` arms, PLATFORM stubs that emit wrong/empty elements.

## 4. Top findings (as reported; #1 refuted)
1. ~~DEFECT: engine precedence bug in every dialect~~ — REFUTED (legend-pure has the same rule).
2. STRUCTURAL: semantic decisions on unresolved strings (evidence above). Change: surface AST; desugar after D.
3. STRUCTURAL: two document drivers, four section-name authorities.
4. STRUCTURAL: bracket-counting pre-scan + slice-and-reparse (25 sites) and padded re-lex; error repositioning by message edit.
5. DEFECT: span vs error columns in different units (TokenStream.java:249,256 vs :217-220).
6. STRUCTURAL: wire concerns in the parser and on the AST (`propertyCall`, `grouped`, `infix`; 25 span-quirk sites).
7. DEFECT: raw unpositioned crashes (MappingProtocolParser.java:612-613; TokenStreamCursor.java:830; DatabaseProtocolParser.java:1008; IslandScan.java:243,276).
8. DEFECT/SMELL: silent fallbacks (list above).
9. SMELL: 48 inline dialect gates and dialect-dependent literal semantics.
10. SMELL: `TokenStreamCursor` god interface; duplicated grammars; dead code.
