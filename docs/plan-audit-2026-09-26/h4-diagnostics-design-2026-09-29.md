# H4 — diagnostics design, 2026-09-29 (for W1.2)

Plan rule 0.9 (ruled 2026-09-28): strict means collect every diagnostic in one pass, poison the failed unit, fail the
build on any error. This note says what that is made of, what exists today, and how it lands without a big bang.
Paths relative to `core/src/main/java/com/legend/`.

## 1. What exists today (measured 2026-09-29 at `b3af51609`)

**Throw sites by package** (`throw new X(` in main code): lexer 1, parser 32, protocol 45, model 32, builtin 17,
compiler (D) 12, compiler/element (F) 37, compiler/spec (G) 266, normalizer (E) 117, resolver (H) 293, lowering (I) 154,
sql 79, exec 44, plan 35. **By type:** NotImplementedException 461, IllegalStateException 336, TypeInferenceException 197,
IllegalArgumentException 102, ModelException 93, MappingResolutionException 46, DialectCapability 37,
UnsupportedOperationException 24, ParseException 24, DataError 17, and a tail.

**The taxonomy.** `error/LegendCompileException` (abstract, a `Phase` enum PARSE…EXECUTE plus an optional element FQN;
position rendered into the message as `"[line:col]"`, :58-81) with subclasses `ModelException`, `ResolutionException`,
`MappingResolutionException`, `parser/ParseException`, `compiler/spec/TypeInferenceException` (and
`SchemaInvariantException`). Outside it: `NotImplementedException` (and `WalledBodyException`), `AssertFailed`,
`DataError`, `sql/dialect/DialectCapability` (an `IllegalStateException`), and hundreds of raw `IllegalState`/
`IllegalArgument` thrown for user errors (stage readings A03 #7, A04, A05 #8, A09, A11).

**Positions.** `protocol/SourceInfo(sourceId, startLine, startColumn, endLine, endColumn)` — the engine's convention,
1-based, inclusive end — sits on protocol nodes. It is dropped when elements become model records ("Positions are
dropped here, on purpose", `model/FromProtocol.java:24-27`), survives in the typed HIR only on `TypedNativeCall.pos` and
`TypedUserCall.pos`, and is absent from every synthesized node (normalizer, typing-time mints). No error after the parser
carries a span as data (A04 §2, A05 §2, A06 §2).

**Tolerance today.** The tolerant entry points collect `Map<String,String>` walls keyed three different ways (element FQN,
overload id, source name; A11) and keep the first line of each message (`getMessage().split("\n")[0]` at
`NameResolver:277`, `KnowledgeLayer:452`, `ModelIntegrity:96`); the strict ones abort on the first throw. The corpus
classifies failures by grepping message text; the LSP guesses positions from message text (`server/PureLspServer.java:177-219`).

**The column unit.** legend-pure's section splitter counts code points (`TopParser.java:57`, `CharStreams.fromString`);
its M3 grammar — the one that produces the source information our differential joins on — counts UTF-16 units
(`M3AntlrParser.java:654`, `ANTLRInputStream`). Our spans count UTF-16 units (`lexer/TokenStream.java:249,256`) and our
error columns count code points (`TokenStream.java:217-220`, `TokenStreamCursor.java:422`, `SpecParser.java:3273-3277`,
`IslandScan.java:41-45`). **Decision: UTF-16 units everywhere** (the reference's M3 unit and our span unit); the four
code-point sites change. A test with a non-BMP character before a call pins it against the reference lane.

## 2. The design

```java
package com.legend.error;
record Span(String sourceId, int startLine, int startColumn, int endLine, int endColumn) // = SourceInfo's shape, UTF-16 columns
enum Severity { ERROR, WARNING, INFO }
enum Code { PARSE_UNEXPECTED_TOKEN, RESOLVE_UNKNOWN_ELEMENT, RESOLVE_AMBIGUOUS_ELEMENT, RESOLVE_NO_FUNCTION,
            TYPE_NO_MATCH, TYPE_TOO_MANY_MATCHES, TYPE_CANNOT_INFER_LAMBDA, …, INTERNAL, UNCLASSIFIED }   // one enum, grows
record Diagnostic(Code code, Severity severity, Phase phase, @Nullable Span span,
                  List<String> args, List<Related> related, String message) { record Related(Span span, String note) {} }
final class DiagnosticSink { void report(Diagnostic d); boolean hasErrors(); List<Diagnostic> all(); }
```

- **One `Span` type**: `protocol.SourceInfo` becomes (or aliases) it; `error` stays the leaf package both sides import.
- **Codes are the contract.** Tests assert codes and spans, never message text. The corpus roster's failure class
  (W1.4) is the first error's code.
- **Synthesized nodes carry provenance.** A node the normalizer or a desugar builds carries the span of the construct it
  came from (the mapping line, the call it desugars), so an error inside generated code points at the user's text.
  `null` span only for platform-internal nodes, and then `related` names the declaration.
- **Poison, per stage.** The resolver emits a `ResolvedExpr.Error(span)` node where a name could not be resolved (the call
  is poisoned, the body continues); the typer gives it the error type, which unifies with everything silently so one
  mistake yields one diagnostic (rustc's `ty::Error`, Roslyn's `ErrorTypeSymbol`); a body with an ERROR is not lowered;
  an element whose declaration is poisoned is a wall. Every stage keeps going to report every error it can.
- **Strict at the API edge.** `compile*` returns `(value, diagnostics)`; entry points that must produce a value throw
  ONE `CompilationFailed(diagnostics)` when there is any ERROR. The wall maps are replaced by the sink.
- **Exceptions remain for compiler bugs only** (`IllegalStateException("compiler bug: …")`, an `INTERNAL` diagnostic when
  caught at the edge) and for I/O. A user error thrown as `IllegalStateException` is a defect to convert.

## 3. How it lands (W1.2 and after)

1. **Types + sink + a bridge (one push).** `Span`, `Diagnostic`, `Code`, `DiagnosticSink`; each driver entry point creates a
   sink; a bridge at each stage boundary turns any `LegendCompileException` escaping the stage into a diagnostic
   (`UNCLASSIFIED` unless the exception carries a code) with the best span available. Nothing else changes; a new guard
   pins the count of `UNCLASSIFIED` reports in the corpus run as shrink-only.
2. **Parser (one push).** The 24 `ParseException` sites report `PARSE_*` codes with spans; the four code-point column
   sites switch to UTF-16; the graph-fetch message-editing relocation (`SpecParser.java:3302-3323`) is deleted.
3. **Resolver.** Rides W2.3–W2.6: the new resolver reports into the sink from its first line (it is new code).
4. **Typer.** Rides W3: the matcher and the loop report `TYPE_*` codes; the 197 `TypeInferenceException` sites convert as
   the code around them is rewritten; the rest convert in one sweep at the end of W3.
5. **Elements, normalizer, store resolver, lowering, dialects.** Convert when their wave rewrites them (F in W2.1, E in
   W4.1, H in W4.3, I/J in W5); until then the bridge classifies them by phase.
6. **Consumers.** The corpus harness and the LSP read the sink (W1.4 for the corpus; the LSP in W6.4).

Gate for each push: every existing test green; the corpus rosters unchanged by NAME; the `UNCLASSIFIED` count only falls;
a golden test per converted stage showing code + span for a representative error.

## 4. Open items for the implementer
- Whether `Phase` keeps `RENDER` (AGENTS.md says it does not exist; `LegendCompileException.java:29` has it) — align the
  document with the code, one way.
- Which exceptions escape today's tolerant loaders and where (`Compiler.buildModule`, `compileAllBodies`,
  `FunctionCompiler.compileAll`) — inventory before step 1 so the bridge sits at the right boundaries.
