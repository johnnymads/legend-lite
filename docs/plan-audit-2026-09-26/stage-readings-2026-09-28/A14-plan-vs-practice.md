# A14 — The rewrite plan judged as a compiler design, 2026-09-28

Reader's report, preserved. Judged the PLAN, not the code; read in full: AGENTS.md, core/README.md, TENETS,
TENET_CHARTER, WORLD_MAP, COMPILER_DESIGN_2026_09_25, REAL_PLAN_2026_09_25, PLAN_AUDIT_2026_09_26,
EXECUTION_PLAN_2026_09_26, every file in docs/plan-audit-2026-09-26/, UPSTREAM_BOUNDARY_PROGRAM §3, the last 400 lines of
GATES.md. Code spot-checks at `6ab32198d`. Abbreviations: EP = EXECUTION_PLAN, CD = COMPILER_DESIGN, PA = PLAN_AUDIT,
S3 = step3-design (revision 2 unless "v1"), PGA = program-audit-2026-09-27, KR = kernel-reading, RM = reference-matching.

**Short answer:** the architecture is right and the reference-fidelity work is exceptional; the sequencing and the gates
are the weak points. Worst gaps: no variable binding (no step builds variable symbols, yet the evaluator step assumes
them); the reference differential covers under half of plain calls and none of the forms; the `Callee` ruling has no
member case; several steps are ordered against their own dependencies.

## 1. What the plan is
Target (CD §3 as corrected by PA §1–2): six stages each owning one question and producing one immutable value — Load
(manifest closure → World and DeclarationTable); Parse (spellings with spans only); Bind (element references become
declarations; each call a candidate set of declaration ids; member access unbound until typing); Type (one declaration per
call by the reference's rule; unification over type and multiplicity variables; forms as typing-rule rows keyed by id);
Evaluate (narrowed by PA §2 and EP step 7 to a SHAPE evaluator replacing eleven rewriters, computing no SQL values);
Lower (the existing MIR is the plan; a dialect `supports()` walk; rendering). Identity `FunctionId` (upstream mangled
signature id, compared whole). The call node carries a sealed `Callee` — `Spelled(name)` | `Bound(spelled,
List<FunctionId>)`, ruled 2026-09-27; `Bound` never empty; a `Spelled` reaching the typer is a compiler bug. One
implementation table (Intrinsic/Form/Body/Refused/Unimplemented, CD §4). Order: 0 targets + annotation move (done); 1
positional differential (done, OVERLOAD 450 / PACKAGE 11); 2 lowering by FunctionId (done); 3a–3e (referents on the node;
candidate rule imports ∪ core-29 ∪ Root; FEP loop + matcher; merge point by table; TDS erasure out); 4 typer split; 5 forms
by a candidate's Form row; 6 kernel (the 164); 7 shape evaluator after a charter ruling; 8 registry owns rules; 9 load by
manifest, names constant; 10 package split, size guard deleted; ANSI later, separately. Rulings: no string identity; no
PCT/category checks in the compiler; no tolerant load mode; no caches before the algorithm is proven; probe before switch;
one variable at a time; a special case to keep rosters means the design is wrong. Gates: rosters LOST 0; OVERLOAD/PACKAGE
0; probe multisets; shrink-only pins; quiet-machine timing.

## 2. Is it the right architecture?
- **Parse:** right and done. Weak: dot access split across `AppliedProperty` and `AppliedFunction(propertyCall=true)`; no
  record of which grammar produced a tree. The reference's FunctionExpression carries exactly one of `functionName`,
  `propertyName`, `qualifiedPropertyName`, chosen by syntax (KR A2, FEP:283-388).
- **Declaration-id lists on the call node, typer chooses:** correct with precedents (Swift `OverloadedDeclRefExpr`;
  Roslyn method groups; rustc resolves paths to DefId in resolve and methods in typeck). The per-World `(package,name) →
  List<FunctionId>` index IS the symbol table. Caching on the node is justified: identity-keyed side tables cannot
  survive the ~180 post-resolution rebuild sites (step3-homework-audit #1).
- **Variables are missing.** CD §3.3 binds variables to their binding occurrence; no step in EP 0–10 does it; step 7 assumes
  it; AlphaRename and SourceSubst remain. The plan builds half a binder.
- **Member access:** javac `JCFieldAccess`, Roslyn `MemberAccessExpression`, Swift `UnresolvedDotExpr`→`MemberRefExpr`
  resolve in the typer against the receiver type; so does the reference (FEP:290-380, 954-1094). CD §3.3 had
  `Member(receiver, Name)`; the ruling has two cases and 126 zero-candidate corpus calls per lane would throw (106
  dot-spelled). Agree with PGA option (a): `Member(name)` from `propertyCall`; the seven arrow-spelled qualified
  properties become differential rows; `new` needs its declaration. The ruling was made before the inventory — the plan's
  own failure mode #2 (EP §0).
- **Desugars re-enter overload resolution** (S3 §1: ~69 mints as `Bound(spelled, group)`, kernel picks again). javac
  `Lower` works on Symbols; Roslyn lowering emits a bound call with a method symbol. `Pure.AT_*` groups are good (Roslyn's
  "well-known members") but re-resolving makes desugared picks move when 3c changes the matcher, blamed on the kernel.
- **Forms vs a general typer:** direction right; order wrong — step 5 re-routes 65 `applyCore` arms before step 6 decides
  which of the 39 checkers exist only for kernel gaps (step 5's owed homework IS step 6's classification). Step 6's missing-
  rule list omits the reference's `GenericTypeOperation` handling (TIC:344-370), how the reference types the new relation
  API from signatures (`T+Z`, `Z⊆T`); our kernel already partly unifies SchemaAlgebra (InferenceKernel.java:253,376,426).
  Relation forms with schema-algebra signatures should become generic calls; only legacy TDS forms and column-spec
  post-match fix-ups (FEP:394-489) are truly special.
- **Identity = mangled signature id:** the right EXTERNAL key (upstream's element name; stable across processes; AGENTS
  invariant 5 forbids live refs in long-lived fields; rustc does DefId/DefPathHash + interned data). Caveat: lossy
  (`SignatureMangle.typeId` simple raw name, erased args, model/SignatureMangle.java:59-68); the four qualified-property
  collisions of step 2 show our model can mint ids the reference never has; 3d's "one declaration per id, duplicates
  refused" is mandatory.
- **Implementation table as the registry:** sound (rustc intrinsics; Calcite operator table + convertlets). Keep it
  derived from the rule maps with its totality pin; step 8's inversion (131+ lambdas into row values, PA §2) is churn.
- **TDS erasure kept as a typing fact until 3e:** wrong — typing decides overloads (`relation::size` counts rows,
  `collection::size` one object; 32 vs 14 picks, homework §1). PGA #3 right; 3e's inventory first. Of S3 §3's two carriers
  pick nominal `TabularDataSet` as the type, the schema as a side fact, a widened `isRelationShaped` in lowering; the
  other (erased type + nominal fact) is two truths for one value.
- **Walls / "no tolerant modes":** a wall is standard error recovery (Roslyn ErrorTypeSymbol, rustc ty::Error). "No
  tolerant modes, ever" (D7(a)) confuses continuing after an error with accepting bad input: the census's 28-round 72.7 s
  retry loop exists because the strict builder aborts on the first error; "zero candidates → wall at the resolver" moves
  failure from a body to a whole element (PGA #2; 407 of 410 failures are in function bodies). CD §5's diagnostics are the
  right target and in no step.

## 3. Executable as sequenced?
Dependencies ignored: Typer and Lowerer at 3,499/3,500 with an empty allowlist (CodeShapeGuardrailTest.java:38,48) → step
4 before 3a (and the Lowerer's family split is at step 8 though step 3 edits lowering); the member case before 3a, A4
unnumbered; 3e's inventory before 3c; D's classification before B; variable symbols before C. 3a ≈5× the stated size (S3
~80 sites; PGA #10: 107 `af.function()` readers + ~45, 69 mints, 289 constructions); step 2 fitted only because a generator
produced registration sets equal by construction — 3a has no such closed form. One variable at a time: excellent and
honoured inside step 3, but 3b and 3c both move OVERLOAD rows, so the differential must be re-run and filed per push.
Gates: the positional differential is the only external oracle, with SOURCE_DRIFT 52,266 (jar 4.138.5 vs trees 4.145.0)
and ABSENT 42,174 (forms, rewrites) against AGREE 42,589 — "OVERLOAD 0" certifies under half of plain calls and none of
the forms; steps 5 and 6 judge themselves. Probe multisets right for refactors; for behaviour changes "explained" is prose.
Regex pins count spellings (a mint via `Pure.IF.qualifiedName()` passes; NAME_COMPARE's function share is 78 of 208, not
20 of 207). Timing: no quiet reading since step 0 on a shared desk; rustc's perf gate uses instruction counts for this
reason. Line guard invites line golf. **Drift across sessions is the largest execution risk:** normative text spread over
≥7 superseding documents; hand-typed numbers already disagree with the code (category pin 13→11 vs 14; Pure.java 2,870 vs
2,769; signatureKey readers 93 vs 81; EP §3's gate command vs rule 0.7); a fresh session reads ~7,000 lines to learn one
step's state. Most likely to fail: 3c (exact lenient order because typing an untyped lambda against a non-Function
parameter throws, TI:114-117; reference breaks exact ties by set order; the reference re-processes arguments statefully
during reverse inference FEP:491-523 while our typer is functional; per-candidate lambda typing adds cost to the stage
already 34% of samples); 3a (size, line guard, unruled member case, a proof that cannot hold until the merge point's 43
bare names move into the resolver); step 6 (LUB merging, reverse inference, the silent-survival divergence that must be
declared as a differential elision); step 9 (open-ended M2M features).

## 4. Expert?
Unusually good: KR's twelve methods as line-cited pseudo-code with 35 traps; layering as a compile error (strict deps
caught two missed edges); refusing a second plan IR; step 2's generator-proven registration sets with identical PICK
multisets; a 2× timing regression caught and fixed at the algorithm; ANSI deferred until a third backend can probe it;
adversarial audits of its own designs before code. Established practice followed: bind before type; candidate sets with
most-specific resolution; variance-aware LUB; well-known-member groups; a typed MIR with exhaustive render arms; dialect
capability as a separate check. Invented where a compiler engineer would not: regex spelling counts as the progress
metric; a hard line limit plus a ban on extracting helpers; plan state in documents; the two-case Callee ruled before its
inventory; desugars routed back through overload resolution; "no tolerant mode" instead of poison types; "one evaluator
replaces eleven rewriters" (real compilers use many small typed passes; the defect is untyped rewriters with textual
renaming). Reading the `NormalizeRequiredFunction` stereotype is how the reference marks normalize-required functions — a
typed annotation on the declaration, not a "category check".

## 5. Clean-sheet (differential-faithful)
1. Syntax tree: one `Call` node with a syntactic callee (Named, Member, Syntax), a span and an import-group id (the
   reference's `_importGroup`); value/function split as the reference (`let`, `new`, `cast` are functions).
2. World: interned declarations keyed by FunctionId or FQN, per-kind `(package,name)` indexes, C3 linearizations and
   variance, core-29 (Pure) and engine-32 lists generated and drift-tested, duplicate ids an error.
3. Resolver: element references per the reference's ImportStub (one import set, ambiguity an error, Root fallback); a
   Named call caches candidate ids on the node; zero candidates poisons the call, not the element; every local a unique
   `VarId`.
4. Typer: a self-contained reference matcher (FEM/FM/GTM/TM/MM) with one test per KR trap, under the FEP loop;
   bidirectional lambda typing; a TypeInferenceContext equivalent incl. GenericTypeOperation; Member resolved against the
   receiver type emitting the reference's rewrites (automap `map`, `extractEnumValue`, milestoning dates) so our typed tree
   matches the reference's processed graph; desugars emit typed nodes bound to a single id.
5. Typed normalization: inlining by VarId, shape folding within the charter, store resolution.
6. Lowering: the existing MIR, the `supports()` walk, rendering.
7. Oracle: a canonical typed-tree dump (function id, resolved type parameters, type and multiplicity per expression)
   diffed against the reference at the SAME pinned release; gates steps 3, 5 and 6.
Keep: steps 0–2, the probe discipline, FunctionId, the per-World index, the reference loop, walls with reasons, the MIR,
ANSI later. Reorder: re-pin the reference dump to 4.145.0 and add types; rule the Member case (fold A4's member half into
step 3); typer split before 3a; 3e's inventory before 3c; D's classification before B; a variable-symbol step before C.
Drop: E's ownership inversion; the line guard as a gate (replace with a below-top-level package-cycle rule); "one
evaluator" as a goal; hand-typed numbers in plan documents.

## 6. Top ten
1. STRUCTURAL: the binder has no variable half — add a VarId step after 3, prerequisite of step 7.
2. STRUCTURAL: the differential covers under half of plain calls and none of the forms — run at 4.145.0, add types and multiplicities, gate B and D on TYPE-DIFF 0.
3. WRONG: the Callee ruling lacks the member case and preceded its inventory — add Member(name); schedule A4's member binding in step 3; give `new` a declaration.
4. RISK: order violates dependencies — step 4 before 3a; 3e inventory before 3c; D's classification before B.
5. WRONG: TDS kept as an erased type with a matcher exception — nominal TabularDataSet, schema as a side fact, no matcher exception.
6. RISK: desugars re-enter overload resolution — bind one id where the desugar knows it; group only where the reference searches (automap `map`).
7. RISK: plan state in superseding documents with drifting hand-typed numbers — one living design per stage; numbers from tools.
8. RISK: the timing gate cannot be enforced on a shared desk — gate on a deterministic cost metric, wall-clock as confirmation.
9. WRONG (framing): "no tolerant modes" conflates error recovery with tolerance — strict = collect all diagnostics, poison, fail on any error; schedule CD §5.
10. RISK: forms/kernel boundary misdrawn, E's inversion churn — test whether each relation form types generically from its schema algebra; keep only legacy TDS and column-spec fix-ups as Form rows; keep the table derived.
