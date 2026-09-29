# Independent audit of plan rev H4 (2026-09-29)

Asked for by the user ("your own unbiased view: is it right / expert / implementable / correct / tractable?"), by one
session, no subagents, at `327d43365`. The plan was read whole; claims were checked against the code and the pinned
upstream trees, not against earlier audits. This is input for **C1**. It changes no ruling and no order; rule 0b.18
(build, don't re-plan) stands, and W0.6 push 1 is first under every recommendation below.

## Verdict

| question | answer |
|---|---|
| Right (target, §1)? | **Yes.** A conventional front end, a logical algebra with mappings as views, a semantic SQL tree. Option R of D11 is the expert design; the plan is right to make it an experiment and not an assumption |
| Expert (order, §4)? | **Mostly.** Phase 1 (fix, build the row oracle, run the decisive experiment, decide) is the right opening. Three order problems below |
| Correct (facts)? | **Largely.** 9 of 10 sampled citations match the code exactly; one count is stale |
| Implementable? | **Yes for Phase 1.** W0.6 push 1's homework matches the code site by site. Phases 3–5 are outlines until C1, which the plan says itself |
| Tractable? | **Only if Phase 2 is cut and the process tax falls.** The destination has no number, and the catalogue still carries Phase 4 dependencies inside Phase 3 items |

## Findings, by weight

1. **The destination has no number.** D17 says "much less code"; rule 0b.17 is a ratchet (each item net-negative), not
   a target. A yardstick from the pinned engine tree (4.145.0, non-test Pure): `pureToSQLQuery/` 14,730 lines, the
   router 9,177, milestoning 1,040, mapping execution 903, graph fetch 1,338: **about 27k lines** for the job lite's
   normalizer + resolver + lowering do in **70.9k** (11.2k + 35.9k + 23.7k). Pure is denser than Java and lite serves
   two databases, so parity is not the target, but a middle of 30–35k is a defensible one. **C1 should set it**, and
   W3.7's report should state the spike's lines per case beside the lines of today's resolver those cases execute.
2. **Hygiene is fixed twice.** Three of the 14 wrong-results defects are capture or scope defects; core has at least six
   substitution engines. W0.6 pushes 1–2 fix them by name (deterministic renaming, a Barendregt pass before lowering);
   `VarId` arrives in Phase 4 (W2.5) and re-keys G½, H and I again. The plan's own catalogue contradicts its order here:
   W4.3 step 0 and W5.1b (Phase 3) say "keyed by `VarId` (W2.5)" (Phase 4). **Recommendation for C1:** a `VarId` on the
   typed HIR alone (the typer allocates; no dependency on `ResolvedExpr`) as the first Phase 3 item; W2.5 then only
   extends the ids back into D. W0.6 pushes 1–2 stay as ruled (D14): they are the stopgap a shipping product needs.
3. **The expensive W0.6 fixes run before the oracle that could judge them.** Pushes 4, 5, 5b and 10 change temporal
   joins and equality in the resolver; their expected rows are derived by reading. W1.10c (engine rows) is Phase 1
   step 4. **Recommendation:** pushes 1–3, 6–9, 11–13 as listed; then W1.10c; then 4, 5, 5b, 10 with the engine's rows
   as the expectation. Same scope, same phase, a stronger gate. The user's call.
4. **Phase 2 holds items the middle does not need.** Phase 3 needs W0.4, W1.5, W1.7, W1.3's verifier and W1.10b.
   W1.1b/c/d (front-end oracles), W1.2(a) (LSP diagnostics), W1.9 (caching proof), W1.11 and W1.12 gate Phase 4 or
   nothing in Phase 3. Moving them makes Phase 2 about 6–9 sessions instead of 10–16. W1.14 (the gate diet) should be
   Phase 2's **first** item: every push pays that tax (30 register files for the corpus lanes, 23 guardrail classes of
   about 7k lines, three of four pushes red on pins first).
5. **The D11 experiment is biased toward S.** It starts with the three hardest cases, is time-boxed, and "failure or
   timeout means S". A spike can fail on incidentals (graph-fetch JSON) and rule out the better design. **Recommendation:**
   a ladder (a filter and project over a plain mapping; one association join; then the three hard cases), a verdict per
   case, and a quantitative criterion (finding 1). Timeout with two of three hard cases passing is a finding for the
   user, not an automatic S.
6. **W1.10c has a hidden cost: the two front doors.** The corpus is Pure source; the engine's plan generator takes
   engine grammar. The stress corpus is engine grammar already and works today through `tools/engine-runner`. The corpus
   mappings live in the engine's own Pure graph (`core_relational` ships its test models in `src/main`), so `RowsMain`
   can name them without a PMCD, but each query lambda must be re-spelled. **Recommendation:** draw the first
   mapping-heavy set from the stress corpus; add corpus-derived cases after `RowsMain` runs.
7. **"The front end is healthy" is true of matched calls only.** 72,081 AGREE against 769 OVERLOAD, but lite fails to
   type 1,342 bodies the reference types (11% of the 11,840 functions in both). Those are mostly the engine's own
   compiler written in Pure, which lite replaces with Java, so the order (middle first) still holds. The Phase 4 number
   should be read as that 1,342, not the 769.
8. **Counts typed by hand drift.** `instanceof Typed[A-Z]`: the plan says 1,781; the tree has 1,313 (the tractability
   audit said so and the plan kept the old number). Any shrink-only baseline must be printed by its tool (W1.0b), never
   copied from this page.
9. **Docs are now as large as the product.** `docs/` holds 440 Markdown files and 202k lines beside 229k lines of
   product Java; `GATES.md` is 6,330 lines. Rule 0b.18 is the right response. A session's required reading (§0 step 2)
   should stay the plan, the item's homework and three GATES entries, and nothing else.

## Outcome so far

Finding 3 was ruled by the user on 2026-09-29 (plan D22): the four resolver pushes of W0.6 run after the engine row
oracle. Finding 6's recommendation is in plan §4 Phase 1 step 3. Found while stressing W0.6 push 1: plan §1a's 100K
build figure (2.7 s) does not reproduce on this branch (15 s); corrected there. Two small additions for W1.0b: a quiet
timing should check the five-minute load as well as the one-minute, and a baseline should be two runs per lane, so a
noise band exists (today's two DuckDB corpus runs of the same code differed by 2%). The rest waits for C1.

## What was checked

Citations sampled (all under `core/src/main/java/com/legend/`): `resolver/StoreResolver.java` state and setter cycles;
`resolver/NavReducer.java:63,75`; `sql/dialect/AnsiSqlRenderer.java` `plainFloat`; `lowering/NullSemantics.java:116-123`;
`compiler/spec/InferenceKernel.java:88-90`; `Compiler.java:745-758`; `new IdentityHashMap` 10 and 27; `new ExprType(`
410 and 557; `server/LegendHttpServer.java:314`: all exact. Push 1's sites (`UserCallInliner.captureRisk` and `bind`,
`SourceSubst.substitute`, `MatchFold.inlineParam`, the pinned test) match the homework. Sizes by `wc` over `*/src/main`.
