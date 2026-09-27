# Step 3 design, revision 2 (2026-09-26, after the audit; the callee shape RULED 2026-09-27)

Supersedes §1, §2.3(1), §3.4, §5 and §8 of `step3-design.md` (v1); everything else in v1 stands
where this file does not say otherwise. Every audit finding (`step3-homework-audit-2026-09-26.md`,
numbered #1–#30) is dispositioned in §6. Still read-only: nothing under the tree changed for this.

## 1. The binding carrier: the node carries its referents (audit #1, #2, #4, #6, #7)

v1 kept the resolver's answer in an identity-keyed side table. The audit counted ~180 mint/rebuild
sites after resolution, three of which (`SourceSubst:187`, `AlphaRename:39`, `StaticFold:203`)
rebuild whole subtrees through `ValueSpecification.mapChildren` with no old→new pairing — a side
table cannot follow them, and synthesized bodies embed already-resolved nodes (`ModelNormalizer:320`),
so "disjoint keys" was false too. The carrier that survives every rewrite by construction is the
node itself: `AppliedFunction.withParameters` already copies every field (`:105-107`; the javadoc
records the 2026-08-12 regression from a copy that dropped one).

**Decision.** `AppliedFunction` carries `List<FunctionId> referents` in place of `List<String>
candidateFqns` — the declaration identities the resolver decided the call may mean, empty until
resolved. It is not a spelling: it is the identity compared whole (the ruling), the same value the
lowering registers by since step 2, and the same thing upstream's `FunctionExpression.func` is after
processing. The plan's "NEVER put `FunctionId` on the protocol node" was about the seven-package
cycle (`cycles.md` §4) — `FunctionId` sat in `platform`, then `model`, both above `protocol`. The
record itself (`FunctionId(String qualified)`, `model/FunctionId.java:18`) depends on nothing; only
its factories do (`of(Function)` → `SignatureMangle`, model). So:

- `com.legend.protocol.FunctionId` — the record, `compareTo`, and `all(List…)` (a list operation).
  Moved with the move tool (group F); `model.FunctionId` is gone, one type as before.
- `com.legend.model.FunctionIds` — `of(Function)`, `ofAll(Function…)` (the factories that need the
  declaration). Callers: 37 `of` + 12 `ofAll` in main/test, 488 generated `ofAll` in `Pure.java`
  (the generator emits the new spelling; `update_generated` proves the fixpoint). Mechanical.
- `protocol` may depend on `protocol` and `base` only (the model rule at `ArchitectureTest:339`
  says model reaches "only the parse vocabulary (protocol)"; nothing reaches below protocol but
  base) — a JDK-only record satisfies it. `cycles.md` §4's edge count is re-run before the push.

**RULED 2026-09-27 (the user, after the plain-language walk-through): the callee is a sealed
two-case type in the node's one slot that changes meaning at resolution.** Not a nullable field,
not an empty-list convention, not a second node hierarchy.

```java
package com.legend.protocol.spec;
/** What a call refers to. Exactly two cases; every reader switches on both. */
public sealed interface Callee permits Callee.Spelled, Callee.Bound {
    /** The call as written. The resolver has not run. A Spelled callee reaching
     *  the typer is a COMPILER BUG (a parsed node skipped resolution) and fails
     *  loudly with that message — never a user-facing "unknown function". */
    record Spelled(String name) implements Callee {
        public String spelled() { return name; }
    }
    /** The declarations the resolver decided the call may mean — never empty
     *  (zero candidates is a WALL with a reason at the call's span, and the
     *  tree does not continue). {@code spelled} is display for diagnostics
     *  only; nothing identifies a function by it. */
    record Bound(String spelled, List<FunctionId> declarations) implements Callee {
        public Bound {
            Objects.requireNonNull(spelled); declarations = List.copyOf(declarations);
            if (declarations.isEmpty()) throw new IllegalArgumentException("a bound callee names at least one declaration: " + spelled);
        }
    }
    String spelled();
}
```

`AppliedFunction(Callee callee, List<ValueSpecification> parameters, @Nullable SourceInfo pos, …flags)`
replaces `function` + `candidateFqns`. `withParameters` copies the callee like every other field.
`FunctionId` (`record FunctionId(String qualified)`, today `com.legend.model.FunctionId`) moves to
`com.legend.protocol` — the record depends on nothing; its factories (`of(Function)`, `ofAll`) move
to `com.legend.model.FunctionIds` (37 + 12 call sites, 488 generated in `Pure.java`, mechanical).

Why this shape (the reasoning the ruling rests on):
- **Records** are immutable values; the resolver builds a NEW node with a `Bound` callee and
  returns the new tree, as it does today when it rewrites a name. Nothing is mutated after
  construction (GHC's renamed tree, not javac's filled-in symbol slot).
- **Sealed with two permits** makes every `switch` over a callee exhaustive: a reader cannot
  forget the `Spelled` case, so "a parsed node reached the typer" is caught by the compiler at
  every site, and there is no third meaning for an empty list (today's text list means three
  things when empty — audit #5).
- **The compact constructor** puts "never empty" at the one place a `Bound` can be made.
- **The spelled name in both cases** keeps diagnostics saying `map` after resolution while
  making it impossible to use as an identity by accident: reading it is a visible `spelled()`
  call the guardrail counts.
- **One slot, not a second tree**: about thirty node kinds make the tree and exactly one field
  of one kind changes meaning at resolution; a phase-indexed slot is the standard answer when
  the rest of the tree is identical across phases (Trees That Grow), and it costs one type
  instead of thirty types plus every pass over them. Step 10 may grow a resolved tree of its
  own if it ever earns it.

**Who constructs what.**
- The parser and the normalizer's synthesized programs: `Spelled(name)` — text the resolver reads.
- The resolver: `Bound(spelled, ids)` — the candidate set under the rule of §2; zero → wall.
- The typer's own desugars (the ~69 typing-time mints, §9 of v1): `Bound(spelled, group…)`
  naming the overload group(s) they mean (`Pure.AT_COLLECTION_MAP`, …); there is no way to mint
  by name alone, so `MINT_BY_NAME` outside `parser/` and `normalizer/` goes to zero.
- Minted calls to a KNOWN single declaration: `Bound(spelled, List.of(id))`.

**Who reads what.** The typer's candidate collection: `switch (af.callee()) { case Bound b ->
ids…; case Spelled s -> throw compiler bug }`. Every one of the 33 `ResolvedNames` name-test sites,
the 21 `CoreFn.of(spelling)` form dispatches and the `contains("::")` readers become a switch and
must say which they wanted — the declarations (almost all of them) or the display name (diagnostics
and the differential's positional join only). That is the 3a migration and the point of it.

**Spelling after resolution (audit #5), under the ruled shape.** The resolver today rewrites a single match to its FQN and
leaves candidates empty (`NameResolver:1744-1745`), and readers key on `af.function().contains("::")`
(`ResolvedNames:25`, `StatementInline:202`, `PkInference:97`, `DeferredArgs.isOverCall:52`, the 33
`FAMILY_LOOKUP_BY_NAME` sites). Decision: the rewrite goes; `function()` keeps what the source
spelled (display, diagnostics, the differential's positional join, which reads the spelled name);
`referents()` is the only resolution fact. Every `contains("::")` reader becomes a `referents()`
reader — they are the NAME_COMPARE/FAMILY sites the plan already lists for step 3, and the guard
counts them down. `CoreFn.of(af.function())` (form dispatch by spelling, FORM_DISPATCH_BY_NAME 21)
becomes `CoreFn.owning(referents)` — a form owns declarations (`CoreFn.ownedFqns`, step 4b), so
the dispatch reads the referents, not the spelling. 3a's proof therefore is NOT "CANDIDATES rows
identical" alone (audit #8): it is the CANDIDATES multiset AND a new `REFERENTS` probe row at
`ResolvedNames.referents` (the 33 name-test sites' input) identical before and after.

**No `Bindings` type at all** (audit #4: the name is taken by the kernel's type-variable store,
`compiler/spec/Bindings.java`). No side table, no merge, no carrier on `Layer`/`CheckedLayer`/
`NormalizedModel` (audit #6): the bodies carry their referents wherever the bodies go, the boot
layer included. `NameResolver.resolve*` keep their signatures; `PureModelContext.from` keeps its.

**References that are not calls (audit #7).** `Typer:2665` and `EvalChecker:86` resolve a
`PackageableElementPtr` (a function used as a value) by `fullPath` through the TYPE rule. A
function reference is a declaration reference: `PackageableElementPtr` gains `@Nullable FunctionId
referent`, set by the resolver's element rule when the element is a function (one id per full
path: an FQN with several overloads used as a value is the reference's "found more than one time"
ambiguity, a wall with that text). The two readers ask `ptr.referent()`.

**The by-id lookup (audit #3).** `ctx.findFunctionById(id)` (`PureModelContext:365-380`) routes
through `findFunction(fqn)` and therefore through the merge point's gates until 3d; in 3a it returns
0–2 `TypedFunction`s per id (twin + native). Stated honestly: 3a's candidate set is "referents →
`findFunctionById` → what `functionsAt` admits today", and 3a is not revertible without 3d's
semantics being the same as today's — which they are, because 3a changes no gate. "Revert alone"
is withdrawn for 3a/3d as a pair; 3b and 3c stay individually revertible.

## 2. The candidate rule: which set the index takes (audit #11, #12, #14)

`toString` (`relation::toString`) showed the resolver's universe (`PLATFORM_FQNS` ⊇
`Pure.userResolvableFunctionFqns()`, `NameResolver:339-346`) is narrower than the catalog the merge
reads (`Pure.nativeFunctionsAt`, `BareNames:99`). The index of 3b takes ONE set and says so: every
declared function in the World — the model's definitions and `DeclarationTable`'s natives
(`Pure.all()`) — with the lite partition applied at the INDEX (a `meta::legend::lite::` declaration
is in the index only if it is on the product surface, the fact `userResolvableFunctionFqns` encodes
today), never at a tier. Owed before 3b: the count of natives in `Pure.all()` minus
`userResolvableFunctionFqns()`, by package, with the reason each is or is not reachable from Pure
source (the reference resolves every declared function in an imported package; a native we declare
but the reference does not is a step 1 differential row, not a resolution rule).

The index is per KIND: `(package, name) → List<FunctionId>` for functions; `knownFqns` stays for
elements and is what it is today (kind-blind, audit #14) — the type-position tier order changes only
after the "core first-match for types" probe count (v1 §2.5) says what it would break.

The classifier (`bare_tiers.py`) buckets ENGINE|FORM as FORM; corrected to "served by any tier the
reference does not have" (audit #12): `flatten` joins the list, six names, all in the record.

## 3. TDS erasure is its own sub-slice, 3e, after 3d (audit #26)

v1 folded "TDS erasure leaves the typer" into 3c on the claim that the lowering already reads TDS
from the type. False: `Type.isRelation` (`Type.java:383-386`) is `RELATION_CARRIERS.contains(raw) &&
one argument`, and `RELATION_CARRIERS` (`PlatformTypes:186-188`) holds the relation classes and
`metamodel::relation::TDS`, NOT `meta::pure::tds::TabularDataSet`. Forty-five readers of
`isRelation`/`relationValued` in lowering, the store resolver and the executor, plus the typer's
`rowCellRead` (`:2814`) and the TDS schema desugars, decide by that predicate; a legacy `project`
result typed `TabularDataSet[1]` would be a nominal class to all of them, and the SCHEMA of the
projected TDS (which R1 puts on the value today) would have nowhere to live. And the parameter half
(`InferenceKernel:1362,1384`: a `TabularDataSet` formal accepts a relation actual) was never probed.
The decision reverses `TDS_ERASURE_DESIGN_2026_09_11.md` §4b/§7 (Model B, R1 as the kernel's output
rule), which v1 did not cite.

So 3e is a slice with its own homework, after 3d and before step 4:
1. The inventory: the 45 sites, each with what it decides when the value is `TabularDataSet[1]`.
2. Where the schema of a legacy-projected TDS lives when the value is nominal: a `RelationType`
   the typer attaches as a side fact of the value (the way `ExprType` carries multiplicity), or
   the erased relation type kept as the value's type with `TabularDataSet` as a NOMINAL fact the
   matcher reads — the second keeps the 45 readers as they are and changes only the matcher's
   view. Decide by reading the 45, not before.
3. The parameter-half probe: PICK rows for every `tds::*` call over a relation actual, and for
   every `relation::*` call over a legacy-TDS actual (the eight `size` rows are one family of it).
4. Only then the switch; gate: the eight rows, the 32 → 14 count, rosters unchanged.

Until 3e, 3c's matcher treats `TabularDataSet` exactly as `paramTypeScore` does today for the
parameter half (a relation actual matches a TDS formal at distance 1, `InferenceKernel:1362-1364`;
a `Relation<T>` formal matches a TDS-erased actual, `:1380-1381`) — as a named, dated exception in
the matcher with the eight rows as its cost, removed by 3e. Otherwise 3c's OVERLOAD gate would be
blocked on 3e's inventory.

## 4. The kernel, corrected (audit #18–#25)

- Collection literals: v1 §3.1's claim was wrong (`Typer:2043` is `typeFuncColSpec`; the literal
  is typed at `:2722-2762` as the SUM of element bounds). v1 §8 stands: the reference types `[n]`.
  The reader v1 §8 worried about does not distinguish the two (`StatementExecutor:2565-2571` reads
  `isMany()`, true for `[2]` and `[1..2]` alike — audit #19); the August incident's reader is not
  in the tree any more. Decision: type the literal `[n]` (the reference's), with a probe first that
  counts literals whose sum ≠ size in the corpus (expected: the `[]->first()` shapes), and a roster
  diff. No "two facts".
- Qualified properties: the unconditional-accept path (KR B2) applies at `Typer:569`, `:589-641`,
  `:3020-3044` (the `applyGeneric` arms over lifted qualified properties), NOT `:2803` (that is the
  row-accessor lift). The probe counts `lifted.size() > 1` at those three.
- Automap: `CallShapes:80` triggers on `isMany()`; the reference on `!isToOne(m, strict=false)`
  (`[0]` and a multiplicity-parameter receiver automap; `[0..1]` does not). 3c changes `CallShapes:80`
  and the C23 test pins it.
- `PrecisionDecimal` (an extended primitive): `newTypeMatch` gains the row (KR A6 :302-305 — type
  variable values compatible, else no match).
- Three bypasses of the loop, not two: pre-resolved callee, property/qualified property, relation
  COLUMN (FEP:306-310).
- The strict re-rank is over the LENIENT-matched list (FEM:63-76 drops nulls), not "all arity
  candidates"; same outcome, said right.
- `expected`: the reference registers arguments first, then makes the return type concrete and
  REPROCESSES the arguments (FEP:503-514). Ours unifies `expected` with the return type first, then
  the arguments. Same bindings when the return type's variables are disjoint from the arguments';
  when they are not, the order can differ — a test for `over<T>`'s case pins that ours agrees with
  the reference's result, and if it does not, ours reprocesses like the reference.
- `isNative` readers: 8 on `TypedFunction` (`ReceiverOwnedFunctions:65,85`, `NumberKinds:55`,
  `UserCallInliner:239`, `Typer:1511,1601`, `InferenceKernel:1204`, `SignatureApart:71`); the class
  ones are unrelated. `FunctionCompiler:176` derives it.
- m3 facts: the three `contravariant: true` classes are `Property` (:1339), `PropertyRouteNode`
  (:3078), `Column` (:3535); `Class.properties : Property<T,Any|*>` carries the flag on the
  argument (:223); our catalog spells no `Property<Nil,…>` signature (only a comment, `Pure:216`),
  so the flag matters for user code over `Property` values and for `Column`; `path.pure` is not in
  the pinned tree — the parser's `-U` marker is m3-dialect grammar, its source is `ElementParser:969`.

## 5. Order of work, revised

| push | content | proof |
|---|---|---|
| 3a | `protocol.FunctionId` (move group F), `model.FunctionIds`; `AppliedFunction.referents` with the two factories; the resolver writes referents and stops rewriting spellings; the ten readers + the 33 name-test sites + the 21 form dispatches read referents; the ~69 typing-time mints bound by group; `PackageableElementPtr.referent` | CANDIDATES + REFERENTS multisets identical; MINT_BY_NAME outside parser/normalizer = 0; NAME_COMPARE/FAMILY/FORM pins shrink by the migrated sites; rosters unchanged; chain |
| probes | own-package hits; core first-match for types; `lifted.size() > 1` at the three QP arms; literals with sum ≠ size; `Pure.all()` minus user-resolvable by package | one push, probe only |
| 3b | the index (one set, per kind, lite partition at the index); imports ∪ core 29 ∪ Root; own-package tier out; `ParsedModel`/query entry points take the parser's existing `Dialect` (audit #15: `com.legend.parser.Dialect`, not a second one); engine tier only for `LEGEND_LITE`; prelude merge deleted | `resolver-added` rows in Pure source 6 → 0; PACKAGE rows 11 → 0; CANDIDATES changes explained |
| 3c | match values + trap tests; the loop; `[n]` literals; automap trigger; TDS exception named | OVERLOAD rows 450 → ≤ 8 (the TDS family), each remaining row named |
| 3d | merge point by table; gates deleted; one declaration per id (#43); walls at zero referents | OVERLOADS rows identical; walls named |
| 3e | TDS erasure out of the typer, by its own inventory | the 8 rows → 0; 32 → 14; rosters unchanged |

The differential's 450/11 are `GATES.md`'s numbers from the step 1 run; the step 1 receipt directory
holds a run at 747ff1c11 (79/7) from before the positional join — the 450/11 run's TSV is written
to `receipts/reference-differential/` at 3a's baseline so the gate has a file, not a line in a doc
(audit #17).

## 6. Disposition of every audit finding

| # | severity | disposition |
|---|---|---|
| 1 | BLOCKER | §1: the node carries referents; no side table |
| 2 | BLOCKER | §1: no merge exists |
| 3 | BLOCKER | §1: stated; "revert alone" withdrawn for 3a/3d |
| 4 | WRONG | §1: no `Bindings` type |
| 5 | GAP | §1: the spelling rewrite goes; readers read referents |
| 6 | GAP | §1: no carrier needed |
| 7 | GAP | §1: `PackageableElementPtr.referent` |
| 8 | GAP | §1: the REFERENTS probe row joins the proof |
| 9, 10, 16, 23, 25, 28 | NIT | citations corrected in §4 or accepted; v1's lines are stale by 1–9 and are re-cited at implementation |
| 11 | GAP | §2: one set, lite partition at the index; the count owed |
| 12 | GAP | §2: classifier corrected; six names |
| 13 | GAP | §1/§5: the REFERENTS probe row |
| 14 | GAP | §2: per kind for functions; elements after the probe |
| 15 | GAP | §5: the parser's `Dialect` on the query entry points |
| 17 | NIT | §5: the differential TSV as a receipt at 3a's baseline |
| 18 | WRONG | §4: `[n]`, v1 §3.1 withdrawn |
| 19 | GAP | §4: no "two facts"; the reader does not distinguish |
| 20 | GAP | §4: `CallShapes:80` in 3c |
| 21 | WRONG | §4: the three QP arms |
| 22 | GAP | §4: `PrecisionDecimal` row |
| 24 | WRONG | §4: m3 facts corrected |
| 26 | BLOCKER | §3: 3e, its own inventory; 3c carries a named exception |
| 27 | GAP | §1: a bound mint cannot be empty; an unresolved node after resolution is the wall, per body, as today's "unknown function" is |
| 29 | WRONG | corrected on main (615ab5b40): samples ≠ wall; re-time owed |
| 30 | GAP | corrected on main: six names; the 33 sites get the REFERENTS row |


---

# Appendix: the first design (v1, 2026-09-26 afternoon) — SUPERSEDED where revision 2 above says so

Kept whole because the audit (`step3-homework-audit-2026-09-26.md`) cites its section numbers. Its §1 (the identity-keyed side table), §2.3(1), §3.4, §5 and §8 are replaced by revision 2 §1–§5; §0, §2 (except 2.3(1)), §3.1–3.3, §3.5, §4, §6, §7 and §9 stand.

# (v1) Step 3 design — Bindings, the reference's candidate rule, the reference's kernel (2026-09-26)

Read-only design written while the foundations cleanup (`//base`, `//json`, `//tools/nullaway`) is
in flight. Every claim below cites the code read today (our tree at 16d2f8ba3; the reference via
`kernel-reading-2026-09-26.md`, cited as KR §A/§B/§C). Destination when the tree is free:
`docs/plan-audit-2026-09-26/step3-design-2026-09-26.md`; the execution plan's step 3 text points at it.

## 0. What step 3 is, and how it is cut

The plan says #47 + A1 are one slice because the kernel's tie tolerance (`allSameShape`,
`InferenceKernel:1133`) is what lets a catalog native and its bodied twin coexist. That stays true,
but "one slice" does not mean one push. It is one ACCEPTANCE (the differential's OVERLOAD rows,
450 today, at zero; PACKAGE rows, 11, at zero) reached by four pushes, each full-chain green, each
with its own probe line, none of which changes a roster by itself:

| push | what changes | what proves it |
|---|---|---|
| 3a | `Bindings` produced by the resolver; `candidateFqns` deleted from the node; the ten readers move | CANDIDATES rows identical before/after (multiset), like step 2's probe |
| 3b | the candidate RULE: imports ∪ core group ∪ Root; own-package tier gone; engine tier only for `LEGEND_LITE` trees; the three engine-only packages out of the core group; index built once per World | the `resolver-added` rows go to zero in Pure source (4 today, explained); PACKAGE rows 11 → 0; CANDIDATES rows change only where the record explains |
| 3c | the kernel: `TypeMatch`/`MultiplicityMatch`/`FunctionMatch` values with the reference's order; the candidate loop with per-candidate lambda typing and the strict re-rank; the scoring deleted; TDS erasure out of the typer | OVERLOAD rows 450 → 0; the eight `size` rows gone; PICK rows identical |
| 3d | the merge point reads the declaration table only: category gate, PCT gate, `SUPPRESSED_ONCE` deleted; one declaration per id (#43); walls with reasons at zero candidates | OVERLOADS rows identical; census walls ≤ 32 with each new one named |

3a and 3b are resolver work; 3c is kernel work; 3d is the element compiler. 3a→3b→3c→3d is the
dependency order (3c needs 3b's candidate sets to be the reference's, or the differential blames
the rule for the kernel's choices; 3d needs 3c's strict re-rank, or twins tie). Each is small
enough to hold in one head and to revert alone.

## 1. Bindings (3a)

### 1.1 The value

```java
package com.legend.compiler;
/** The resolver's answer per CALL NODE: the declarations a spelled call may mean.
 *  Immutable; keyed by node IDENTITY (a protocol node is a value type — two
 *  textually equal calls are two nodes and may resolve differently under two
 *  sections). Produced by NameResolver, read by the typer through the model
 *  context. Never on the node (the protocol package is below model and compiler:
 *  cycles.md §4). */
public final class Bindings {
    private final IdentityHashMap<AppliedFunction, List<FunctionId>> byNode;   // copied, unmodifiable views
    public static final Bindings EMPTY;
    public List<FunctionId> of(AppliedFunction call);   // empty list = the resolver left it bare (a wall, 3d)
    public boolean has(AppliedFunction call);
    public int size();
    Bindings merged(Bindings other);                     // disjoint key sets, or IllegalState
}
```

`FunctionId` is `com.legend.model.FunctionId` (step 2 moved it beside the declaration type). A
binding lists DECLARATION identities, not FQNs: the resolver already knows the universe of declared
functions (today `knownFqns` holds FQNs and mangled ids, `NameResolver:387-397`), and the typer's
`candidatesOf` today re-reads every FQN through `ctx.findFunction(fqn)` (`Typer:2536-2557`). With
ids the typer asks `ctx.findFunctionById(id)` (exists: `ModelContext:94`) — one overload per id, no
FQN fan-out, and the identity is compared whole (the ruling).

Why identity-keyed and not a field: `AppliedFunction` is a record whose `equals` today INCLUDES
`candidateFqns` (`AppliedFunction:150`), so two nodes that differ only in candidates are unequal —
the rewriters (`OperatorParts:67,123,136`, `SortChecker:184`, `CallShapes:87`) rebuild nodes and
carry the list across by hand. Under `Bindings`, a rewriter that mints a new node from an old one
must RE-KEY the binding (`Bindings.rekey(old, new)` — a compiler-side helper the four rewriters
call), or the typer sees an unbound node and walls it. That is the honest failure mode: a rewrite
that forgot its bindings is loud, where today it silently carries a stale list.

### 1.2 Production

`NameResolver.resolve*` return a pair:

```java
public record Resolved(ParsedModel model, Bindings bindings) {}
public static Resolved resolveAlongside(ParsedModel parsed, ...);   // Compiler:236, :427
public static Resolved resolve(ParsedModel parsed);                  // Compiler:302, tests
public record ResolvedQuery(ValueSpecification query, Bindings bindings) {}
public static ResolvedQuery resolveQueryIn(ValueSpecification q, ImportScope imports, Set<String> universe);
public static ResolvedQuery resolveQuery(ValueSpecification q);
```

Inside the resolver, `resolveVs`'s `AppliedFunction` arm (`NameResolver:1705-1750`) stops writing
`candidateFqns` and writes `bindings.put(newNode, ids)` instead; the "IDEMPOTENT" branch
(`:1708-1709`, a node already carrying candidates is not re-resolved) becomes `bindings.has(node)`.
The resolver's own `Scope` gains the `Bindings.Builder` (a mutable `IdentityHashMap` sealed at the
end of `resolve`); `Scope` is already a record threaded through every `resolve*` method, so no
signature below the entry points changes.

`ModelNormalizer.resolveSynthesized` (`:150-180`) merges the per-body `ResolvedQuery.bindings()`
into the model's (`Bindings.merged`: key sets are disjoint because the synthesized bodies are fresh
nodes). `Compiler.buildModule`/`compileModel` pass `resolved.bindings()` to
`PureModelContext.from(...)` (three overloads, `:141-165`; one new parameter, the old shapes
deleted, callers updated — there are five in `Compiler` and the harnesses). `ModelContext` gains
`Bindings bindings()`; `PureModelContext` stores it. A query resolved on its own
(`Compiler.resolveQuery:763`, the test runners, `ChannelB:262`) gets its `Bindings` from
`ResolvedQuery` and passes it to the typer with the statements — `SpecCompiler`/`Typer` take
`Bindings` for the query beside `ctx.bindings()` for the model (`Bindings.merged` again; the
query's nodes are new).

### 1.3 Consumption — the ten readers, by fate

| reader | today | under Bindings |
|---|---|---|
| `Typer.candidatesOf` `:2536-2557` | union of `ctx.findFunction(fqn)` over `candidateFqns`, else `functionCandidates(name)` | `bindings.of(af)` → `ctx.findFunctionById(id)` each; empty → the bare path (3b makes it a wall) |
| `Typer.functionCandidates(AppliedFunction)` `:2527` | probe source `bare`/`node` | source `bound`/`unbound` |
| `ResolvedNames.referents` `:24-34` (26 `names` sites) | `candidateFqns` + `BareNames.catalog` at arity | `bindings.of(af)` as ids; the arity filter stays; NO catalog fan-out (the resolver already listed every declaration) — this is where the 4–6% goes |
| `StatementInline:203` | `candidateFqns` or the FQN | `bindings.of(af)` |
| `PkInference:98-99` (lineage) | walks `candidateFqns` when `fd` is empty | `bindings.of(af)`; lineage is above compiler, fine |
| `ValidateDesugar:283` | same | same |
| `OperatorParts:67,123,136` (parser!) | copies the list onto rebuilt nodes | the parser runs BEFORE resolution: these nodes carry an EMPTY list today (`OperatorParts` is phase B); the copies are no-ops and the argument simply goes |
| `SortChecker:184`, `CallShapes:87` | copy onto a rebuilt node | `bindings.rekey(af, inner)` — or, for `CallShapes`, resolve the new node's callee the way a synthesized program is (`ResolvedNames` today mints "bare natives … which need no further resolution", `Compiler:766-769`): a minted call to a KNOWN declaration binds directly (`Bindings.bind(node, id)`), no spelling |
| `NameResolutionContractTest` | asserts `candidateFqns` rows | asserts `bindings.of(call)` ids |

Then `AppliedFunction.candidateFqns` and its three constructors that take it are deleted; `equals`/
`hashCode` drop it (`:150,:155`). `ResolvedNames`' javadoc and `BareNames`' javadoc are rewritten
for the new contract (they describe `candidateFqns` today).

### 1.4 What 3a does not do

It does not change which declarations a call may mean: the resolver computes the same set it does
today (its tiers, then the prelude merge from `BareNames.catalogTiered`), only records it as ids on
the side. That is why 3a's proof is "CANDIDATES rows identical as multisets", exactly step 2's
discipline.

## 2. The candidate rule (3b)

### 2.1 The reference's rule, restated from KR §A3 and §A12

- Qualified call `a::b::f(...)`: the functions named `f` in package `a::b` EXACTLY (absolute; the
  imports are not consulted; an unknown package is zero candidates and "can't find a match", never
  "unknown package" — FEM:161-164).
- Bare call `f(...)`: `function_getFunctionsForName(f)` filtered to packages in ONE SET: the core
  import group (29, m3.pure:181-209) ∪ the section's imports ∪ Root (FEM:167-168, Imports.java:52-65).
  No own-package tier. No precedence between core and section (it is a set). Unknown import paths
  vanish silently (Imports.java:64).
- Element (type) names: the same set for imports; `>1` hits is an error ("has been found more than
  one time in the imports"), `0` hits falls back to a Root-level element, then "has not been
  defined!" (IS:204-233). Also no own-package tier.

### 2.2 Ours today (`NameResolver:362-381`, `:641-705`)

- CALL position: wildcards, THEN own package, THEN the core group, each `addKnown` (a set-membership
  test against `knownFqns`), union of all three — then `resolveNameMulti` if empty.
- `resolveNameMulti` (types and the fallback): wildcards first-match → own package → core group
  FIRST-MATCH (a precedence, where the reference has a set and an ambiguity error).
- The prelude merge (`:1717-1737`): when the resolver captured candidates and the section has the
  prelude, `BareNames.catalogTiered(name)` adds the engine surface, the core group's natives and the
  form's owned FQNs — the probe (homework §5) says the engine tier adds four names in Pure source.
- Our core group has 32 entries: the reference's 29 plus `metamodel::variant`,
  `metamodel::relation`, `precisePrimitives` (`NameResolver:213`, generated from the ENGINE's
  `CompileContext.META_IMPORTS` — the engine-input language's list, `engine-resolution.md`).

### 2.3 The change

1. **One index, built once per World.** `Map<(package, simpleName), List<FunctionId>>` over every
   declared function (model definitions + catalog natives), built where `knownFqns` is built today
   (`:387-397`, per `resolve` call) and stored on the `Scope`; `DeclarationTable` (`PureModelContext:584-591`)
   is the natives' half. The set `knownFqns` stays for TYPE names (elements are not functions).
2. **Call position** = the reference's set: `wildcards ∪ CORE_29 ∪ {Root}` looked up in the index,
   union over packages, in the index's order (package order is irrelevant: the kernel orders
   candidates by match, KR §A4). Qualified → `index.get((pkg, name))`. The own-package tier is
   deleted (`:372-374`, and `resolveNameMulti:678-684` for types — with a probe count first, see 2.5).
3. **Type position** = the reference's: the same set, `>1` distinct hits → wall "found more than one
   time in the imports: [a, b]"; `0` → Root element or wall "has not been defined". The core group
   is no longer first-match for types either (`:696-702`) — a probe count first (2.5).
4. **The engine tier leaves Pure source.** `ParsedModel` gains `Dialect dialect()` (`PURE`,
   `LEGEND_LITE`); `SpecParser`/`ElementParser` set it from the entry (the server `LegendHttpServer:231`,
   `Compiler.plan:515`, the wasm planner mark `LEGEND_LITE`; every corpus/census/PCT loader is
   `PURE`). `BareNames.tiered` takes the dialect: ENGINE rows only for `LEGEND_LITE`. The three
   engine-only packages leave `CORE_IMPORTS` for `PURE` (the generator emits both lists: the
   reference's 29 from `m3.pure`, the engine's 32 from `CompileContext`; `CoreImportsParityTest`
   pins both).
5. **The prelude merge** (`:1717-1737`) becomes unnecessary once the index holds the natives: the
   core group lookup finds `meta::pure::functions::string::joinStrings` in the index like any
   declaration. It is deleted, with `BareNames.catalogTiered`'s resolver role; `BareNames` keeps
   the `LEGEND_LITE` engine tier and the form tier for the typer's bare path until 3d walls it.

### 2.4 The four engine-only names (homework §5)

- `currentUserId` (`meta::pure::functions::runtime`): the reference needs an import in the calling
  file. Read the corpus file's imports at the switch; if it imports `runtime`, the rule finds it; if
  not, the reference does not compile that call either and the differential's compile-status rows
  say so. Never a tier.
- `get` (variant), `wtd`, `ytd`: overloads the reference never sees (the file's own or the core
  `collection::get` are the reference's candidates). Under the new rule our candidate set equals
  the reference's; the kernel picks the same function it picks today (the probe's PICK rows prove
  it).

### 2.5 Probe before the switch (the ruling)

Two counts the current probe does not give, to take with `LL_SHADOW=1` before 3b lands:
- **OWN-PACKAGE hits**: how many resolutions (call and type position) were served by the own-package
  tier ALONE (no wildcard, no core hit). Each is a file the reference compiles only because its
  section imports its own package — or a file the reference does not compile (the differential
  says which). Expected small; every one listed in the record.
- **CORE-FIRST-MATCH hits for types**: how many type names resolve through the core group's ORDER
  (a name in two core packages, first wins) — the reference would say "found more than one time".
  The `functionType` case in the resolver's own comment (`:694-700`: `functions::meta` vs
  `profiles`) is the known one; the reference's kinds keep a function and a profile apart, so the
  index must be per KIND (functions vs elements) — which 2.3(1) already is.

## 3. The kernel (3c)

### 3.1 Values, not scores

```java
sealed interface TypeMatch permits Simple, NonConcrete, RelationMatch, FunctionMatch, Bottom, Null
  record Simple(int distance)                         // 0 = exact (C3 index of the formal's raw in the actual's linearization)
  record NonConcrete()                                // formal is a type variable
  record RelationMatch(List<GenericMatch> columnTypes, List<MultMatch> columnMults)
  record FunctionMatch(List<GenericMatch> paramTypes, List<MultMatch> paramMults, GenericMatch ret, MultMatch retMult)
  record Bottom()                                     // actual is Nil
  record Null()                                       // actual untyped (lenient only)
  int compareTo(TypeMatch o)                          // KR §A7's table, verbatim; Relation vs Function returns -1 both ways: keep it, never sort a mixed pair
record GenericMatch(TypeMatch raw, List<GenericMatch> typeArgs, List<MultMatch> multArgs)   // KR §A6 compareTo: raw, then args lexicographic, then LENGTH
sealed interface MultMatch permits Exact, NonConcreteMult, SimpleMult(lower, upper), NullMult    // KR §A8's order: Exact < NonConcrete < Simple(upper asc, lower asc) < Null
record CandidateMatch(GenericMatch[] types, MultMatch[] mults)   // FM:69-103: all types left to right, then all mults
```

`newTypeMatch(formal, actual, covariant, mode)` maps KR §A7 onto `Type`:

| formal \ actual | rule |
|---|---|
| any formal, `actual == null` (lenient: an untyped lambda slot) | `Null` (strict: no match) |
| structurally equal | `Simple(0)` |
| both `RelationType` | `RelationMatch` by aligned columns (TM:436-488) |
| actual is Nil | `Bottom` — BEFORE the function branch (TM:394) |
| formal `FunctionType` | actual must be `FunctionType` (else no match); equal → `Simple(0)`; else `FunctionMatch` with params CONTRAvariant, result covariant (TM:490-544) |
| actual `FunctionType`, formal not | `Simple(1)` iff formal is Any (TM:413-416) |
| formal `TypeVar` | `NonConcrete` (target behaviour is MATCH_ANYTHING at FM:140 — always) |
| actual `TypeVar` | strict: `NonConcrete` iff formal is Any, else no match; lenient: `NonConcrete` (GTM:206-226) |
| classes / primitives / enums / generics' raw | `distance = linearization(actual raw).indexOf(formal raw)`; `-1` → no match; then, unless formal is Any or actual is Nil, the type arguments (formal's, against the actual's arguments VIEWED AT the formal's raw class — the homogenisation, GTM:247-251) with the class's parameter variance, and the multiplicity arguments |

What we need that we do not have:
- **A linearization**, not a boolean. `ModelContext.isSubtype` (`:367`) answers yes/no; the kernel
  needs `List<String> linearization(fqn)` in C3 order (KR §A12). Our classes hold
  `superClassFqns` in declaration order (invariant 5); C3 over that is ~40 lines, cached per
  class on the model context like `isSubtype`'s ancestor sets (task #17 made those sets — the
  linearization is the ORDERED form of the same fact, built at the same time; not a memo on a
  call). Primitives: `Integer → [Integer, Number, Any]`, `Float → [Float, Number, Any]`,
  `StrictDate/DateTime → [·, Date, Any]`, others `[·, Any]` (`primitiveFqn` + the existing
  primitive lattice in `ctx.isSubtype`). Enums: `[E, Enum, Any]`. Relation/Function raw:
  `[Relation, Any]` etc. `Any` is index 0 of its own list only.
- **Type arguments at a supertype**: `typeArgumentsViewedAt(actual: GenericType, formalRaw)` —
  for `Class<X>` vs `Type` it is empty; for `Pair<U,V>` subclasses it substitutes along the
  generalization's type arguments. Our `TypedClass` keeps `superClassFqns` as strings; a generic
  generalization (`Class Foo extends Bar<String>`) needs the ARGUMENTS too. Check first
  (`ClassCompiler`): if we drop the arguments of a generalization today, that is a step 3 finding
  to fix at the element compiler before the matcher can be right for generic classes.
- **Class type-parameter variance**: GTM:258-263 flips covariance for a parameter declared
  `contravariant`. Grep the pinned m3/engine `.pure` for `contravariant` in class declarations
  before deciding whether `TypedClass` needs the flag (if no platform class uses it, the flag is
  a declared-but-unused fact and the matcher assumes covariant; record it either way).
- **Multiplicity**: `Multiplicity.Bounded(lower, upper|null)` and `Var` map onto MM:160-302
  directly (`upper == null` is `*`); `Exact` is structural equality; the `[1..*]`-rejects-`[*]`
  arithmetic and the `MAX_VALUE` upper for `*` formals come verbatim; a `Var` actual (a value
  whose multiplicity is the enclosing function's `m`) strict-matches only a `[*]` formal as
  `Simple(MAX, MAX)` (MM:240-247).
- **Collection literals** type `[n]` (IVP:212) — today the checker's `TypedCollection` gets
  `Bounded(n, n)` (`Typer:2043`), so this holds already; the `[]` literal must be `Nil[0]`
  (IVP:206, KR §C3) — check `synth(PureCollection)` for the empty case.

### 3.2 The loop

Replaces `checkGenericTyped` (`Typer:1833-1848`), `checkWithDeferred` (`:1891-1937`),
`selectRankedByPresentArgs` (`:2133-2165`), `lambdaAritiesFit`, `DeferredArgs.shapesMatch`'s role
as a pre-filter, and the whole of `InferenceKernel.resolveOverload` (`:1068-1215`) with its
tie-breaks, `score`, `scoreNonLambda`, `paramTypeScore`, `paramMultScore`, `multiplicityTightness`,
`mostSpecific`, `moreSpecific`, `nearestInLinearization`. `resolveChosen`, `unify`, `unifyMult`,
`resolveOutput`, `SignatureApart` and `typeLambda` STAY: they are the "type the arguments and the
result under the chosen candidate" half, which the reference also has (its `register`/`registerMul`
and `processLambda`); the matcher decides, the unifier binds.

```
apply(call, args /*value args typed, deferred slots null*/, candidates /*Bindings → ids → TypedFunction*/):
  if candidates.isEmpty(): WALL "no function 'f' visible from this section: imports [...], core group; qualified package p declares no f"   (3d)
  arity = candidates with parameters.size == args.size                       // FM:121-127 (count only)
  // 1. lenient order (FEM:63-77 with lenient=true): untyped slots are Null matches (last), T-typed args NonConcrete
  ordered = arity.map(c -> (c, matchLenient(c, args))).filter(match != null).sortedBy(match)  // equal matches keep DECLARATION order (FEM:73 bucket order; ours is deterministic by declaration, the reference's by its name index — a known nondeterminism we do not copy)
  if ordered.isEmpty(): throw "no overload of 'f' matches (…)"               // FEP:258 with no inference failure
  anyFailed = false; firstFailure = null
  for (c, _) in ordered:                                                     // FEP:131
     b = fresh Bindings; typed = args.clone()
     // 2. unify the value args under c (FEP:153/:591 register); a mismatch here cannot happen for a lenient match except through type arguments — treat as inference failure
     // 3. type each deferred slot against c's parameter (FEP:156-175, processLambda, TI:108-148)
     for i in deferred slots, in order:
        p = c.parameters[i].type
        if p is not a concrete Function<…> (TypeVar / Any / nominal carrier):   // TI:114-117 THROWS in the reference
            if the lambda is SELF-TYPABLE (zero-arg or fully annotated): typed[i] = synth(lambda); unify(p, …)   // our existing arm, Typer:1966-1995 — the reference's "isLambdaWithEmptyParamType == false" case: a lambda with typed params is a VALUE, no inference
            else: WALL "can't infer the parameters' types for the lambda; specify them" (the reference's text) — recorded as inference failure for the loop AND surfaced if no candidate accepts
        else: typed[i] = typeLambda(lambda, p, b, env)   // on TypeInferenceException: anyFailed = true; firstFailure ?= e; break (the && short-circuit, FEP:629/:170: later slots are NOT typed)
     if a slot failed: continue                                               // FEP:204-207: skipped WITHOUT the strict test
     // 4. the strict re-rank over ALL arity candidates against the args as typed under c (FEP:210)
     best = strictBest(arity, typed)   // FEM:90-151, lenient=false: nulls reject, T-typed args match only Any; ties → TypeInferenceException("Too many matches for f(sig): a, b")
     if best == c: return build(c, typed, b)                                  // FEP:211-214
     // else: not accepted; the next candidate gets its turn (its lambdas retyped from scratch — our typed[] is per-iteration, so there is no Unbinder/cleanProcess: FEP:223-227 is unnecessary in a functional typer)
  if anyFailed: WALL "no candidate of 'f' accepted the lambda arguments; first failure: …"   // FEP:258 would SILENTLY keep the last candidate (KR §B3) — we do not (invariant 4); the probe counts these before the switch
  throw "no overload of 'f' accepts (…)"                                      // throwNoMatchException, FEP:1183-1228 (candidates listed when < 20)
```

Two paths bypass the loop, as in the reference (FEP:200-203, KR §B2): a call whose callee is
already a DECLARATION (a minted call to a known id: `Bindings.bind`) and a PROPERTY / QUALIFIED
PROPERTY access — the first lenient-ordered candidate, no strict test, no tie error. Today the
qualified-property arm is `Typer:2803` (`kernel.resolveOverload(lifted, [receiver, name])`); it
becomes `first(orderedLenient(lifted, args))`.

The `expected` type (`resolveOverload(…, expected)`, `Typer:1813`) is the reference's
`updateTypeInferenceContextSoThatReturnTypeIsConcrete` (FEP:189-192, KR §A1): it binds the return
type's variables from the context BEFORE the arguments when a parameter cannot. It stays as an
input to `build` (unify the return type with `expected` first, as `resolveChosen` does), not to
the matcher (the reference's matcher never sees it).

### 3.3 What "Too many matches" means for us

The reference raises it inside the loop for the first candidate whose inference succeeded (KR §C13).
On a corpus call the reference compiles, our raising it means our TYPES differ from the reference's
(a distance computed differently, a missing type argument, a multiplicity we widened). The stop
rule: fix the type, never the rule. The differential's OVERLOAD rows are exactly this list, 450
today; the eight `size` rows are the TDS case (3.4).

### 3.4 TDS erasure leaves the typer

`TdsErasure.refineResult` (`TdsErasure:31-41`) rewrites a native's declared `TabularDataSet` result
into the argument's relation type; `paramTypeScore` scores `TabularDataSet` formals against relation
actuals as subtype matches (`InferenceKernel:1362-1364`, `:1384-1386`) and `Relation<T>` formals
against any relation (`:1380-1381`). Under 3.1, `TabularDataSet` is a class: a `Relation<T>` formal
against a `TabularDataSet` actual is no match (Relation is not in TDS's linearization), a
`TabularDataSet` formal matches it at distance 0, `Any` at its distance. `refineResult` is deleted;
the kernel's output is the declared result type. The lowering already reads "this value is a TDS"
from the type for the legacy api (`PlatformTypes.RELATION_CARRIERS`, `:186-188`); what changes for
it is that a legacy `project` result is typed `TabularDataSet[1]` and `$tds->size()` is
`collection::size` (one object), exactly the reference's meaning (homework §1). Gate: the eight rows
go to zero; the 32 → 14 count matches; no roster moves (the projected TDS has one row in every test
that asserts its size today — homework §1 checked).

Risk to probe first: any corpus test whose SQL depends on `relation::size` over a legacy TDS having
counted ROWS. The PICK rows (`size_Relation_1__Integer_1_` vs `size_Any_MANY__Integer_1_`) before
and after the switch list every such call; the 32 today are the upper bound.

### 3.5 Tests that pin the traps (KR §C), written before the kernel

Unit tests on the matcher values, one per trap, no model needed beyond a two-class hierarchy:
C1 `T` formal below every `Simple(n)` incl. Any; C2 `T` actual strict-matches only Any; C3 `[]`
is `Nil[0]` and `Bottom` ranks below `NonConcrete`; C4 Any skips type args, a lambda vs Any is
`Simple(1)`; C5 `[1..*]` rejects `[*]`, beats `[*]` for `[3]`; C6 `MAX_VALUE` uppers; C8 raw, then
args, then LENGTH; C9 types before multiplicities across all positions; C11 lenient Null last,
strict rejects; C12/C13 the accept rule and "Too many matches" on a real tie; C19 the
short-circuit; C23 automap trigger on `[0]`, `[2]`, `[*]`, `[1..*]`, `m` and NOT `[0..1]`; C31 C3
distance under multiple inheritance (a diamond). Plus the reference's own examples from
`reference-matching.md`: `map`'s `{T[m]->V[m]}` vs `{T[0..1]->V[0..1]}` for a `[1]` source,
`filter/map/if/match/fold/sortBy` lambda families, `elementToPath(Type)` vs `(PackageableElement)`.

## 4. The merge point and the twins (3d)

`FunctionCompiler.functionsAt(fqn)` (`:34-93`) becomes `functionsAt(FunctionId id)` reading
`DeclarationTable` — the natives' declarations by id — and the model's definitions by id, nothing
else. Deleted: the bare branch (`:35-54`, the typer no longer asks by spelling once `Bindings` is
the input), `PlatformTypes.isPlatformOwnedFunction` and `PLATFORM_OWNED_FUNCTIONS` (`:690-696`),
`addModelOverloads`'s PCT stereotype test (`:96-116`, `PCT_PROFILE`), `SUPPRESSED_ONCE`, the
stderr lines, the `ArchitectureTest:946` allowlist row. What replaces the two gates is ONE rule at
the table (task #43): one declaration per id. A model definition whose id is a catalog native's id
is the same declaration; the implementation table says what implements it (Intrinsic/Form → the
native's rule; Body → the definition's body; today's "platform-owned" and "PCT.function suppressed"
are both "the table has an Intrinsic/Form row for this id"). Two model definitions with one id in
one World is a duplicate — refused by the model builder with the reference's message, not tolerated
(the census's four qualified-property collisions from step 2 are A4's, pinned; nothing else
collides today: `ModelIntegrity:153-162` checks by id since step 2).

`TypedFunction.isNative()` (13 readers incl. `Typer:1674`, `StatementInline:33`) becomes "the
implementation table has an Intrinsic/Form row for `id()`" — `ImplementationTable` is in
`platform`, below `compiler`, so the model context can ask it.

Zero candidates is a WALL with a reason at the call's span (the resolver's wall sink exists:
`resolve(parsed, walls)`), listing the packages searched. The loaders stay tolerant until step 7
(`buildModule`, `MinimalCorpus:293`, `compileAll:117-133`); a wall is a named row in the census, not
a throw.

## 5. Gate, numbers to read, stop rule

| what | before (16d2f8ba3) | after 3d |
|---|---|---|
| differential OVERLOAD rows | 450 | 0 |
| differential PACKAGE rows | 11 | 0 |
| PROPERTY_AS_CALL rows | 31 | 31 (A4's) |
| `resolver-added` probe rows in Pure source | 4 | 0 |
| rosters DuckDB / H2 | 107 / 361–354 fail of 2613 | same, LOST 0 |
| census walls / failures / kernel | ≤ 32 / ≤ 1,447 / ≤ 164 | each new wall named |
| FUNCTION_CATEGORY_CHECK pin | 14 | 12 (the two merge-point gates) |
| NAME_COMPARE / CATALOG_LOOKUP_BY_NAME / FAMILY_LOOKUP_BY_NAME pins | 208 / 10 / 33 | shrink by the deleted sites (the 26 `ResolvedNames.names` readers, `BareNames`' catalog role, `MatchChecker.nativeNamed`, `RowGetter.of(spelling)`) |
| corpus_duckdb passes, alone, load < 3 | 32s / 39s | on the curve; the loop types lambdas per candidate — measure after 3c, the reference pays the same |

Stop rule: a roster row that can only be kept by a name test, a tier, or a tolerance in the kernel
stops the slice. "Too many matches" on a corpus call the reference compiles → fix the type.

## 6. Order of work when the tree is free

1. Copy this file into `docs/plan-audit-2026-09-26/`; point the plan's step 3 at it (docs only).
2. Probe additions for 2.5 (own-package hits; core first-match for types) + the "silent survival"
   count for 3.2 (how many corpus calls would take FEP:258's path: any candidate's lambda typing
   failed and a later one was accepted anyway — count `checkWithDeferred`'s retries that succeed
   on a non-first candidate today, they are that set's upper bound). One push, probe only.
3. 3a. 4. 3b. 5. 3c (matcher values + tests first, then the loop, then TDS). 6. 3d.
Each: homework line → probe → switch → gate → deletion → GATES.md → push.

## 7. Open questions to settle by reading, not by deciding

- Do our compiled classes keep the TYPE ARGUMENTS of a generalization (`Foo extends Bar<String>`)?
  If not, generic homogenisation (GTM:247) cannot be right and the element compiler is fixed first.
- Does any platform class declare a `contravariant` type parameter? (grep the pinned trees.)
- Where does the `[]` literal get `Nil[0]` today, and does anything downstream rely on `Nil[*]`?
- How many corpus calls take the property/qualified-property UNCONDITIONAL path with more than one
  lenient candidate (the reference takes the first, KR §B2)? The probe can count `lifted.size() > 1`
  at `Typer:2803`.

## 8. §7 answered by reading (same afternoon)

- **Generalization type arguments are kept.** `TypedClass` carries `superClassFqns` AND
  `superTypes` (`TypedClass:30-31`), the latter classified WITH their arguments over the class's own
  parameters (`ClassCompiler:39-46`). Homogenisation (GTM:247) has what it needs: walk `superTypes`
  substituting the class's parameters, up to the formal's raw class.
- **Contravariant type parameters exist and matter.** The pinned `m3.pure` declares three classes
  with a `contravariant: true` parameter (`m3.pure:1339, 3078, 3535`, each `[U contravariant, V]`
  — `Property<U,V>` and two siblings, to be named when the file is read at 3c), and
  `AbstractProperty.genericType` is `Property<T contravariant, Any>` (`:223,:228`). Our catalog
  spells those signatures `Property<Nil,Any|*>` for exactly this reason (the reference's
  `getGenericType` gives a contravariant parameter `Nil`, IVP:167-168, KR §A11): an actual
  `Property<Person,String|1>` matches the formal `Nil` contravariantly (the value is the SUPER
  side, Nil the sub side → `Bottom`, a match — GTM:258-263 with TM:394). Without the flag the
  covariant reading gives `linearization(Person).indexOf(Nil) = -1`, no match, and every
  `meta::pure::functions::meta` call over a property fails. So: the DECLARATION of a class carries
  its type parameters' variance (`TypedClass.typeParams` becomes `List<TypeParam(name,
  contravariant)>`; `Type.GenericType` stays variance-free — variance is the class's fact, read
  at the class); the natives generator emits the flag for the m3 classes it declares; the parser
  accepts the grammar's spelling for user classes (check `ElementParser` for `contravariant`
  before 3c; if the grammar has no user spelling, the three m3 classes are the whole set and a
  generator constant is honest).
- **The empty literal is `Nil[0]` already** (`Typer.collection`, the `orElseGet(NIL)` arm). But
  the literal's MULTIPLICITY is NOT the reference's: ours is the SUM of the elements' bounds
  (`[[]->first(), 'a']` is `[1..2]`, the "audit-of-R1" comment), the reference's is exactly
  `[n]` for n values whatever their multiplicities (IVP:211-212, KR §B9/§C34). This is a matcher
  input: against `f(x:String[1..*])` and `f(x:String[*])` the two typings rank differently
  (`SimpleMult` distances). The comment says `[2..2]` made the egress wall fire on a correct
  one-element runtime result — a RUNTIME check reading a STATIC literal multiplicity. Decision for
  3c, to be probed first: type the literal `[n]` (the reference), and make the egress wall read
  the element EXPRESSIONS' multiplicities (the sum) as its runtime expectation — the wall's
  question is "how many values can this evaluate to", which is the sum; the matcher's question is
  "what does the reference's matcher see", which is `[n]`. Two facts, two readers; the literal
  node can carry both (`TypedCollection` keeps its elements). Count first how many corpus
  literals have a non-`[1]` element (the probe: `TypedCollection` whose sum ≠ size).
- **The property/qualified-property unconditional path** (KR §B2): count `lifted.size() > 1` at
  `Typer:2803` with the probe before 3c; today a tie there throws "ambiguous overload", the
  reference takes the first lenient candidate.
- **The grammar spelling exists and is DROPPED today.** `ElementParser.parseTypeParamName`
  (`:969-978`) accepts `Path<-U,V|m>` (`-U` contravariant, `+V` covariant, m3 `path.pure:17`)
  and keeps only the name ("the marker is grammar only: our checker binds type parameters
  nominally"). Under 3c the marker is a declaration fact the matcher reads: the parser keeps it
  on `ClassDefinition.typeParams` (a `TypeParameter(name, contravariant)` record in `model`), the
  element compiler carries it onto `TypedClass`, and the natives generator emits it for the m3
  classes it declares from the pinned tree (the three `contravariant: true` sites). No fallback:
  a class with no marker is covariant, as in the reference (`getBooleanValue(…, false)`, GTM:262).

## 9. Correction from the self-audit: the minted calls (2026-09-26, later)

§1.3 counted the READERS of `candidateFqns` (ten) and missed the WRITERS the resolver never sees:
the compiler mints call nodes by a literal bare name after resolution — `new AppliedFunction("map",
…)` — and those resolve today through the typer's bare path (`Typer.functionCandidates(String)` →
`ctx.findFunction("map")` → `FunctionCompiler.functionsAt` bare branch → `BareNames` tiers). The
guardrail counts them: MINT_BY_NAME 143 sites. By owner (identity-sites.tsv, last run):

| owner | sites | under Bindings |
|---|---|---|
| `parser/SpecParser` 17, `OperatorParts` 1 | 18 | BEFORE resolution: the resolver binds them like any parsed call — nothing to do |
| `normalizer/*` (RelOpTranslator 21, MappingNormalizer 19, ViewRelation 7, JoinChainEmission 7, UnionSynthesis 1, DeclaredCoercions 1) | 56 | synthesized programs go through `resolveSynthesized` (E.6) — the resolver binds them; nothing to do beyond 3a's `Resolved` pair |
| `compiler/spec/*` (Typer 30, LambdaBodies 7, JoinChecker 6, JsonChecker 4, CallShapes 4, IsDistinct 2, GroupLambdaAggs 2, GroupBy 2, Project/Fold/Extend/Distinct/StaticFold 1 each) | ~62 | TYPING-TIME desugars: minted and re-entered into `synth` in the same pass; the resolver never sees them. **These must bind by declaration in 3a**, or 3d's wall fires on every one |
| `validation/ValidateDesugar` 5, `compiler/StatementInline` 1, `test/ServiceTestRunner` 1 | 7 | the same: bind by declaration |

Spellings at the typing-time mints (the literal strings): `map` ×9, `project` ×4, `isEmpty` ×4,
`equal` ×4, `not`, `extend`, `distinct` ×3, `toString`, `rename`, `over`, `join`, `if`, `groupBy`,
`concatenate`, `col`, `cast`, `and` ×2, and one each of `toOneMany`, `toOne`, `slice`, `select`,
`restrict`, `pair`, `letFunction`, `joinStrings`, `isNotEmpty`, `isDistinct`, `get`, `format`,
`fold`, `filter`, `execute`, `count`, `at`, and ONE qualified (`variant::convert::toVariant`).
Every one is a name in the core group; a desugar means "the platform's `map`", never a user
function — which is exactly what step 2's OVERLOAD GROUPS name (`Pure.AT_COLLECTION_MAP`,
`Pure.AT_RELATION_MAP`, …).

**The mechanism.** A desugar names the declaration GROUP(S) it means and lets the kernel pick the
overload — the same currency the lowering registers by since step 2:

```java
// Typer (or a Mint helper it owns): the node AND its binding, in one call
AppliedFunction mint(List<FunctionId> group, List<ValueSpecification> args, @Nullable SourceInfo pos);
AppliedFunction mint(List<FunctionId> g1, List<FunctionId> g2, …)     // a name in two core packages: map = AT_COLLECTION_MAP + AT_RELATION_MAP
```

The typer holds a `Bindings.Builder local` for the compilation (identity-keyed, its own state like
`Env`, discarded with the typer — not a cache, not shared); `mint` records `node → ids` there;
`candidatesOf(af)` reads `ctx.bindings().of(af)` then `local.of(af)`; nested mints (a minted `map`
whose lambda body holds a minted `isEmpty`) are covered because the inner node is recorded when
minted, before the body is synthesized. `Bindings.rekey` (§1.3) is the same helper for the four
node rewriters. Nothing spells a name: the guard's MINT_BY_NAME pin drops from 143 to the 74
pre-resolution sites (parser + normalizer), and those stay honest text — they are Pure programs
the resolver reads.

A desugar that today mints a QUALIFIED callee (`toVariant`) binds `Pure.AT_VARIANT_CONVERT_TO_VARIANT`
the same way. A desugar whose callee is a USER function (none found in the spellings above; the
inliners mint `TypedUserCall` nodes, already typed, `CallNodes` — 7 users) keeps its typed mint.

**The cut, corrected.** 3a is: the `Resolved` pair from the resolver; `Bindings` on the model
context; the ten readers; AND the ~69 typing-time mints bound by group. It is the largest of the
four pushes (~80 sites, mechanical, each a spelling → a group constant, the same shape as step 2's
215 registration sites — a generator can do the constant lookup from the spelling and the group
table, with the per-site review the step 2 record describes). Its proof stays "CANDIDATES rows
identical as multisets": a mint bound to `AT_COLLECTION_MAP + AT_RELATION_MAP` yields the same
candidate set the bare path yields today for `map` — the probe says so or the group is wrong.
Where the bare path today ALSO reached an engine-tier or form-tier FQN for a minted name, the
CANDIDATES row changes and the record explains it (expected: none for these spellings, all core).
