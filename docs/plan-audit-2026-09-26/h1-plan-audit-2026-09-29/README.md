# H1 — adversarial audit of the execution plan, 2026-09-29: synthesis

Five readers audited `docs/EXECUTION_PLAN_2026_09_26.md` as rewritten on 2026-09-28, each against the code at
`772547a18` on `compiler/rebuild` and the pinned reference trees. Each was asked: is every item true, buildable, ordered
right, gated with power, and sized honestly? Their reports are kept whole in this directory; this page is what the plan
takes from them. The plan revision that applies it is the plan's "rev 2026-09-29".

| report | waves | verdict | plan's size | auditor's size |
|---|---|---|---|---|
| `W0-W1-safety-gates.md` | W0, W1 | executable after changes; W1 re-cut | 2–3 + 4–6 | 3–5 + 8–12 |
| `W2-resolved-tree.md` | W2 | not executable as written; W2.3 blocked on three design answers | 6–9 | 12–18 |
| `W3-reference-typer.md` | W3 | not executable as written; W3.2–3.5 re-plan | 6–10 | 11–18 |
| `W4-middle.md` | W4 | re-plan before executing | 10–15 | 32–51 |
| `W5-W7-back-end-runtime.md` | W5, W6, W7 | W5, W6 not executable as written; W7 after fixes | 5–8 + 6–10 + 3–5 | 10–16 + 12–20 + 2–4 |

**The architecture stands.** No reader found the target (§1 of the plan) wrong. Every reader found the route to it
under-specified: wrong facts about today's code, missing co-work, ordering that forces a big bang, and gates that cannot
see the regression the item risks. The program is roughly twice the plan's estimate: **≈90–145 working sessions**
against 45–65. W4 alone is a third of it.

## Cross-cutting findings (each seen by two or more readers)

1. **Gates without power.** Rosters pin names, not SQL; the reference lane cannot see H; ~921 passes are multiset
   compares; "not grown" passes when coverage shrinks. The fix every reader converged on: a **corpus-wide, per-test,
   per-dialect product-SQL snapshot** through an injected observer, byte-identical for refactor slices, with the store
   resolver made deterministic first (W0-W1 #8, W4 F10, W5 #9). It becomes new item W1.7 and gates W4 and W5.
2. **The reference lane cannot yet give type rows.** Only two typed node kinds carry a position; none carries resolved type
   parameters; form nodes (filter/map/project…) have no id. W1.1 starts with call rows; a typer-recorded
   (position → type, bindings) side table and form ids are items, not assumptions (W0-W1 #2, W3 #8, #12).
3. **The 3,500-line guard collides with the first edits** of W1.2, W1.6, W2.3 and W5.1 (Typer 3,499, Lowerer 3,499,
   SpecParser 3,494, MappingProtocolParser 3,496, Scalars 3,476). The plan already drops it in W7; it moves to W0.
4. **Untyped nodes are minted after D in two stages**: ~294 in the normalizer and ~301 in the typer, embedding resolved
   subtrees. Under D1 they need ONE builder that makes `ResolvedExpr` from a spelling and a scope (W2 #2, #3).
5. **Name-keyed substitution is everywhere**, not in "four engines": ≥10 sites across D½, E, G, G½, H and I. W2.5 keys only
   what W4.2 keeps; H and I switch in W4 (W2 #12, W4 F8, F12).
6. **Identity before extraction.** W4.3 cannot extract passes while its maps are keyed by node identity and dotted strings;
   `PropertyId` is used by W4 but introduced by no item (W2 #19, W4 F3).
7. **Run-time reads of the live database** make "plan the whole body, then run it" impossible without late-bound plan nodes
   (W5-W7 #14).
8. **Failure unit.** Rule 0.9 plus eager resolution turns today's per-body and per-set poisoning into whole-build failures
   (W2 #8, W4 F6). This needs a ruling, not an implementer's choice.
9. **Order errors**: W2.8 before W3.3; W3.3 before the type facts and the TDS switch; W5.4 in parallel; W6.2 before W6.3;
   the fuzzer at the end when W5 needs it as an oracle; W0.2(c) before its probe.

## Decisions the plan now owes (numbered D6–D11 in the plan)

| id | question | raised by | blocks |
|---|---|---|---|
| D6 | W0.4: a product-SQL corpus lane, or move the engine-scan-order pass into the harness | W0-W1 #7 | W0.4, W1.4 |
| D7 | The judge charter: TENET_CHARTER C2b/C2c and Z2 say verdicts are World 1's (host) job; JUDGING_TWO_MODES made the database judge the product goal. Amend the charter, or keep the host judge | W5-W7 #16, #17 | W6.3, W6.2 |
| D8 | The shape evaluator's scope: may compile-time string `+` produce an identifier (column name)? | W4 F7 | W4.2 |
| D9 | The manifest world: the open 2b stdlib question, WORLD_MAP rule 8, a named register for excluded roadmap test files | W4 F9 | W4.4 |
| D10 | The failure unit under rule 0.9: does an ill-typed body or mapping set that nothing demands fail the build? | W2 #8, W4 F6 | W2.3a, W4.1 |
| D11 | Rule 0.10 for H: the physical IR as a distinct relational skeleton with typed-HIR scalar leaves, introduced last in W4.3 behind a print-back adapter | W4 F1, W5-W7 #4 | W4.3 |

## Facts in the plan that were wrong (corrected in rev 2026-09-29)

- W1.6: the 39 checkers already live in their own files; the seams are the pre-dispatch desugars (`Typer:700-1310`), the
  overload machinery (`:1465-2090`) and `accessProperty` (`:2951-3192`).
- W0.2(a): `EngineStyleH2`'s `legend_h2_extension_*` names are engine golden text, not defects.
- W0.1: binding to localhost does not stop a browser page; `/api/pure/v1/execution/execute` has the same exposure through
  caller-declared connections.
- W2.4: "106 names per corpus lane" is 106 distinct names across both lanes and the census; per lane it is 126 calls.
- W2.5: "four substitution engines" is ≥10; alpha-renaming becomes id-freshening, not deletion.
- W3.1: ~95 relation readers, not 45, plus erasure sites the count missed; 557 `new ExprType(` sites.
- W3.2: union-find is the wrong binding model; the reference keeps ONE `TypeInferenceContext` per call across candidates.
- W3.6: `CoreFn.of` has 21 sites; the typer's 16 go in W3.6, the rest in W4 and W6.
- W5.1: the lowering table cannot BE the implementation table (`:platform` cannot depend on lowering's types); it is a
  derived table checked one-to-one against it.
- W5.2: `SqlSource.Join.Kind` is already an enum; its `sql` field is the defect.
- W7: `compiler_mid` does not exist; the cyclic group is `//core:compiler`.
- §5: "W0.1 and W5.4 have separate owners": one session owns everything; W5.4 must be serial.

## Verified true
D3's "no new downloads" (all 27 modules resolved and downloaded; each `-pure` jar ships its `.pure` sources, and
`core_relational`'s 553 files are byte-identical to the pinned tree). W0.2(b) and (e) are correct and small as written.
The target table's stage split.
