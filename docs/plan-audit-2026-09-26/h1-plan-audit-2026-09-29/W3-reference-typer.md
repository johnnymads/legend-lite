# H1 audit — W3 (W3.1–W3.6), the typer made the reference's (2026-09-29)

Reader's report, preserved as returned. Read: the plan, the review, A05, A06, reference-matching (with corrections),
kernel-reading, homework, the step-3 audit, step3-design (rev 2 and v1 §3/§8), the program audit, GATES 2026-09-27;
whole: `InferenceKernel.java` (2,049), `Bindings`, `TdsErasure`, `DeferredArgs`, `CallShapes`; from `Typer`:
applyFunction (:460-690), applyCore/applyGeneric (:1310-1548), normalization through typeLambda (:1590-2420),
candidatesOf (:2505-2567), the QP/row-accessor arms; nine checkers whole and the javadocs of all 39. Reference claims
checked in pinned legend-pure 5.99.0. Paths relative to `core/src/main/java/com/legend/`.

## 1. Item by item
**W3.1 TDS inventory.** The count is wrong: ~95 call sites of `Type.isRelation`/`relationValued`, not 45 (82 spelled
`Type.…(`: compiler 44, resolver 22, lowering 20, StatementExecutor 5, AssertVerdicts 4, DatabaseJudge 2; plus
line-split calls). Missing erasure sites: `TdsErasure.refineResult` on every call output (InferenceKernel:1048-1051);
`eraseTdsRow`/`TDS_ROW` (25 refs); `TypeAnnotations:152-163`; `CastChecker:33-39`; the source-level inlining gated on
`TabularDataSet` (`Typer.isSchemaErased`/`requiresNormalization`/`expandFunctionValuedHelperArgs`/
`rawSchemaErasedExpansion`, :1603-1794), whose gate changes meaning once `TabularDataSet` types standalone. "Schema as a
side fact" lands on 557 `new ExprType(` constructions; `ExprType` is a two-field record — a third field breaks all 557
or is silently dropped at every rebuild.

**W3.2 The matcher.** Needs what does not exist: C3 linearization (ours is BFS, `ancestorsOf`, InferenceKernel:1888-1903);
class type-parameter variance (`TypedClass.typeParameters` is `List<String>` :29; the parser drops `-U`,
ElementParser:970-973); lambda values carrying their carrier type (ours bare `FunctionType`; the reference types them
`LambdaFunction<{…}>`, raw distance to `Function` a C3 index); schema-algebra formals as NON_CONCRETE (a
`GenericTypeOperation` has no rawType, GTM:171; ours scores them −1, InferenceKernel:1443, and evaluates constraints
inside `unify`); a PrecisionDecimal row. These are parser and F changes, not a self-contained module. "Meta-variables
with union-find replace Bindings" is not matcher work (FM/GTM/TM/MM bind nothing) and is the wrong model (Q2). Only traps
C1–C11 and C31 are matcher traps; C12–C30, C32–C35 belong to W3.3, W3.5, W2.4.

**W3.3 The loop.** Inherits design v1 §3.2, four premises false: (a) "fresh Bindings per candidate; cleanProcess
unnecessary" — the reference pushes ONE context per call (FEP:124) and keeps it across candidates; `setScope` only
changes scope (FEP:136, TIC:709-712); `cleanProcess` unbinds only the argument value specs (FEP:823-827); candidate k+1
registers against candidate k's leftovers under first-wins, LUB and drop. (b) The reference's failure is only "lambda
parameter type not resolvable" (TI:131-134); body errors throw uncaught, TI:114-117 throws. Ours retries on every
`TypeInferenceException` (Typer:1937-1941) incl. `typeLambda`'s result-multiplicity check (`unifyMultResult`); the
reference judges a lambda's result through the strict FunctionTypeMatch after registering it unchecked (FEP:632-674). The
loop needs a register-don't-check `typeLambda`; 21 `typeLambda` sites (NavigateChecker 8, Typer 6, JoinChecker 4,
AsOfJoin 2, GroupLambdaAggs 1). (c) Zero-arg and annotated lambdas are first-pass VALUES in the reference (FEP:168,
:882-886); ours defers every `LambdaFunction` (DeferredArgs:34) — changes the lenient order (NULL vs FunctionTypeMatch).
(d) Our only reverse inference is `expected`, non-null at exactly one site (OverChecker:41); the loop must keep it until
W3.5.
**W3.4 TDS out.** Order wrong (finding 1).
**W3.5 Kernel rules.** The real core of W3; sized as one push; its classification must partly precede W3.3 (finding 2).
**W3.6 Forms.** "CoreFn.of deleted" impossible in W3: 4 of 21 sites are in lineage (W6), the normalizer (W4.1),
SourceSubst (W4.2).
**Size.** Plan 6–10; reader 11–18: W3.1 1; W3.2 2 (+ F/parser prerequisites); W3.3 2–3; W3.4 1–3; W3.5 3–5 (a context
port replacing `unify` and its 31 name-keyed binding accesses in the kernel, 14 outside, and SignatureApart's 159 lines);
W3.6 2–4.

## 2. Key questions
**Q1 order.** TDS inventory before the loop: right. The switches are wrong: the loop's strict re-rank ranks ARGUMENT
TYPES, and today's kernel manufactures types and accepts matches by rules the reference lacks — relation-source
multiplicity skip (InferenceKernel:339,818,1467,1494); Variant many-to-one (:821-825,1497); Enum metaclass accepts
String (:166-167); Any escape in `compatibleRebind` (:1950-1953); value LUB widening to Number/Any (:640-643); relation
rebinds that throw (:645-653) where the reference merges/concatenates/widens to Any (TIC:388-401); collection literals as
the sum of bounds (probe row 5); TDS erasure. Under "fix the type, never the rule", W3.3 stops on W3.5's work. W2.4
(member resolution with the reference's rewrites) runs before W3.2 but needs the lenient-first qualified-property rule
(FEP:200-203, :1087); today that selection goes through `resolveOverload`'s tie error via lifted `$prop$` functions
(Typer:558,643,1547).
**Q2 union-find.** No. The reference is NAME-keyed per context (`states.getLast().getTypeParameterValueWithFlag(name)`,
TIC:375), an ordered destructive log: first binding wins (:379-383); concrete meets concrete → `findBestCommonGenericType`
by variance (:423-424); relation meets relation → merge or Any (:388-401); a concrete existing value replaced by a generic
one and forwarded (:451-456); merge mode DROPS a concrete over a non-concrete (LUB commented out :472-480, "should
eventually be fixed"); forwards into other contexts (:490-494); collection-element states LUB-ed into the parent
(TI:150-198). Union-find is symmetric and order-free. Exactness = port the context machine keyed by (context, name) with
contexts persisting across candidates; that port deletes SignatureApart. Ours also invented a `rigid`/contravariant flag
(Bindings:29-51).
**Q3 cost.** Unmeasured. Catalog overloads: map 4, filter 3, project 3, if 2, match 2, eval 7, sort 6, extend 8, groupBy
11. Reference lambda-family calls in the closure ≥ ~11,000 (map 4,490; if 1,854; eval 1,548; filter 1,486; project 1,264;
match 716). A retry re-synthesizes the nested subtree: worst case Π kᵢ over depth. `compiler.spec` is 34–35% of sampled
CPU; per-test ceiling 60 s. Only 3 RETRY-ACCEPT shapes today (all `map`). A probe is needed (finding 16).
**Q4 silent survival.** Every corpus body compiles in the reference, so every silent survival there is repaired later by
the parent's `handleParameter` (FEP:596-616), because a generic call without resolved type parameters fails
`isInferenceSuccess` (FEP:874-876). Walling it walls bodies the reference accepts: roster LOST and compile-status growth.
"Declared as a reference-lane elision" hides exactly that. Probe row 3 (RETRY-ACCEPT) is disjoint from FEP:258's "none
accepted" path, not its upper bound.
**Q5 checkers.** Kernel gaps: If ("cannot run resolveOverload", IfChecker:21-26), Match, Eval. Match also diverges by
design (types the call as the SELECTED branch where the reference's `T` is the LUB; lowering depends on TypedMatch's
selection). By ruling, not gap: Concatenate (positional, user ruling 2026-09-05), Flatten. Emitters: Filter, Map, Select,
Write, Aggregate, Distinct, Rename, Cast, GetAll, From, Over, Slicing, Pivot, Extend, GroupBy, Project, AsOfJoin, Join,
Fold, Sort (W3.6's form rows). Lite product features: Navigate, Json, TdsJson, CsvCensus, GenerateTestData, MayExecute,
SourceUrl, TableReference, Tds, Columns, GraphFetch, New, IsDistinct. So "kernel-gap checkers retire" ≈ 3 of 39.
**Q6 needs from W1.1/W2.** From W1.1: spans on typed nodes (2 of 91 typed records carry SourceInfo; forms dumped as
position-less NODE rows, OurResolutionsTest:181); resolved type parameters on our call nodes (`Application(chosen,args,out)`
keeps none); one type normal form (relation struct vs `Relation<T>`, lambda carriers, PrecisionDecimal); join rules for
calls we insert (`toOne` 2,504 EXTRA) and for the reference's rewrites; tie detection for set-order ties; a
registration-trace mode (`PrintTypeInferenceObserver`); the reference matcher classes exposed to W3.2's tests. From W2:
spans on ResolvedExpr; a candidate ORDER rule; a lambda "has untyped parameter" flag; W2.8 admitting PCT-bodied
overloads with implementation rows; form nodes bound to ids so lambda families produce CALL rows.

## 3. Findings
1. BLOCKER — TDS order still inverted: W3.4's switch after W3.3 forces the matcher to keep the TDS tolerance
   (InferenceKernel:174-176,214-216,1362-1364,1384-1386) or lose legacy `tds::*` calls. Program audit #3 unaddressed.
   Change: W3.1 decides the carrier; W3.4's switch lands with or before W3.3.
2. BLOCKER — W3.3 before the type facts it ranks (Q1 list). Change: split W3.5 — type-fact half (literals `[n]`,
   relation/Variant multiplicities, TDS, lambda carrier types, Nil/Enum/Any escapes) before W3.3; register, reverse
   inference, LUB after.
3. WRONG — "meta-variables with union-find" (W3.2). Change: move to W3.5 as a port of TypeInferenceContext keyed by
   (context, name); SignatureApart deleted there.
4. WRONG — the loop's independence premise. Change: W3.3 carries the call's context across candidates; a probe counts
   calls where >1 candidate is tried.
5. WRONG — failure semantics (retry catches everything, Typer:1937-1941; the reference fails only at TI:131-134).
   Change: a register-only `typeLambda` for the loop; say which of the 21 sites keep checking.
6. GAP — silent survival unmeasured and misprobed. Change: probe "some candidate failed parameter inference and none
   accepted" plus calls typed only through `expected` or deferral order; if non-zero, reverse inference before the wall;
   drop "reference-lane elision".
7. GAP — the loop reaches only `checkGeneric` callers: `CoreFn.of` pre-dispatch (Typer:561-573); 11 direct
   `resolveOverload` sites (Typer 2, TableReference 2, Eval 2, TdsJson, Tds, SourceUrl, Let, Columns); `kernel.accepts`
   in MatchChecker ×5, NavigateChecker, ReceiverOwnedFunctions; the `_this` rule (:67); four QP routes; `derivedShadow`;
   `mostSpecific`/`nearestInLinearization`. Change: list each selector with its fate and wave.
8. GAP — the gate is blind where the loop matters: OVERLOAD rows only for the two positioned call kinds; lambda families
   are NODE rows. Change: give form nodes an id and a span before W3.3 claims anything for filter/map/if/eval/match.
9. GAP — OVERLOAD 0 is not a matcher outcome: 283 of 450 rows are `isEmpty`; our catalog has only `isEmpty(Any[*])`
   (Pure.java:1194; group :2384); the reference also has `isEmpty(Any[0..1])`, a PCT function with a body
   (isEmpty.pure:31). Admitting it needs W2.8 plus a lowering rule for the new id (lowering keyed by FunctionId,
   Scalars:445). average/max/min families probably the same (not verified). Change: W3.3's homework lists the ids each
   pick change needs registered.
10. GAP — W3.2's prerequisites span F and the parser (C3, variance, lambda carriers, NON_CONCRETE schema formals).
    Change: name them as W3.2 sub-pushes.
11. GAP — W3.2's gate only checks well-formedness against our own reading. Change: a differential property test running
    GTM/TM/MM/FM from the `legend-pure-m3-core` jar against ours over type pairs drawn from the World.
12. GAP — the type-row gates depend on things W1.1/W1.2 do not promise (Q6). Change: widen W1.1/W1.2, or restate the
    W3.3/W3.5 gates as call rows only.
13. GAP — W2.4 vs W3.2/W3.3 order (QP selection). Change: W2.4 keeps `resolveOverload` with the 3 LIFTED n>1 cases pinned;
    W3.3 switches it.
14. WRONG — "45 readers" (≈95 plus other erasure sites and 557 ExprType constructions).
15. WRONG — W3.6 cannot delete `CoreFn.of` (4 of 21 sites: lineage/ScanRelations ×2, normalizer/MappingNormalizer,
    SourceSubst ×2). Change: W3.6 deletes the typer's 16; the rest go with W4 and W6.
16. RISK — cost (Q3). Change: before W3.3, a probe logs per call the reference-lenient index of today's pick and the
    nesting depth; W3.3's gate includes a quiet timing against it and the 60 s ceiling.
17. RISK — "checkers retire" is small (~3); Match's type divergence and Concatenate/Flatten rulings need decisions.
18. NIT — "the reference's reason": FEP:258 raises nothing; the wall's text will be ours.
19. NIT — "32 → 14" is a hand count on the 4.138.5 jar; re-measure on the W1.1 lane.

## 4. Verdict
Not executable as written; executable after the listed changes, but W3.2–W3.5 need re-planning: TDS switch and
argument-type facts before the loop (1, 2); binding model a context port, not union-find (3, 4); failure semantics
matching the reference (5); silent survival measured by the right probe before anything is walled (6); gates that see
lambda-taking forms and per-expression types (8, 12). W3.1 executable once its scope is corrected (14); W3.6 once its
deletion list is cut to the typer's sites (15). Size 11–18 sessions, not 6–10.
