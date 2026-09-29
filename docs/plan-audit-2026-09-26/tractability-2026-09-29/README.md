# Tractability audit of plan rev H2, 2026-09-29: synthesis

The user asked for "another final audit / sweep to make sure tractable / implementable". Five independent read-only
reviewers checked rev H2 at `34c49baad` against the code (each report persisted verbatim in substance by the parent):

| # | scope | file | verdict |
|---|---|---|---|
| 1 | W0.6 pushes 1–3, mentally implemented against the code; every test case re-derived | `1-w06-pushes-1-3.md` | push 1 needs amendments (SourceSubst works on the protocol tree, has no fresh-name supply, and the rename would trip `PROTOCOL_DESUGAR_DEBT`; two tests miss their sites); push 2 needs a design choice first (16 name-blind row resolvers); push 3 implementable, 46 constructor sites not 17 |
| 2 | W0.6 pushes 3–6 | `2-w06-pushes-3-6.md` | push 3 (prefixes) amendments (union arms, ordering); push 4 has a second, association channel; 5a is ~24 files and must not change the `###` scoping rule in the same push; A implementable (risk: substituted multiplicity); A2 is not local (equality kind per node); H also `times([])`; D is not a wrong result (two H2 versions) |
| 3 | W0.4, W0.7 and every W1 item | `3-w0-w1.md` | most "ready with amendments"; spikes needed for W1.1c, W1.10a, W1.11; W1.8 blocked as written (no MIR yet); W1.10b's TLP formula wrong at Pure level; W1.10c needs a new engine entry point; W1 realistically 29–49 sessions |
| 4 | W2–W7 sequencing and the big items | `4-w2-w7.md` | one back-edge (W3.6 needs D11, ruled after it); four prerequisites not itemised; three double-claimed pieces; C4 undecidable as written; W2.3a/W3.3/W4.3 need finer decomposition; W3.7 not runnable as specified |
| 5 | mechanical consistency sweep | `5-consistency.md` | 52 findings: ids, stale citations, numbers that do not add up, status, wording against rulings, undefined terms |

Found in passing, new suspects for W0.6: MatchFold picks the first statically conforming arm, not the most specific
(`[1, 2.5]->map(x|$x->match([i:Integer[1]|0, n:Number[1]|1]))` → `[1,1]`, Pure `[0,1]`); MatchFold never binds `extraParam`;
MatchChecker keeps only the last branch's second parameter name.

## Engineering decisions taken in rev H3 (the user may overrule any; none changes a ruling)

- **E1 — W0.6 push 2 (let scope): the Barendregt convention at the lowering boundary** (review 1, option b). One typed pass
  before `lower()` α-renames every lambda binder whose name is a seeded let, a plan parameter or an expression-position let,
  reusing push 1's `FreeVars` and deterministic renaming; the verifier (W1.3) then asserts "no binder shadows a query-scope
  name". Why: it establishes, today, the unique-binder invariant W2.5's `VarId` later gives by construction; the 16
  name-blind row resolvers stay correct without being rewritten twice (they are rewritten once, by W5.1b, against ids).
- **E2 — SourceSubst renaming: deterministic avoidance, no counter** (review 1): rename `b` to `b_<k>` with the smallest `k`
  not free in the env values or the body and not a binder of the body; protocol-package helpers (`Variable.renamed`, a let
  rename) keep `PROTOCOL_DESUGAR_DEBT` from growing. Same rule in MatchFold and the inliner's new sites.
- **E3 — W0.6 push 4 (head match): both channels.** Write the association-channel variant of the repro first; if it fails,
  extend the same hoist to `AssociationJoins.withOuterDatedWindow`'s callers in a push 4b; only a shape that needs W4.3's
  explicit join tree is pinned (rule 0b.11). The `nullTolerant` path is deleted only when both channels no longer call it.
- **E4 — A2 (ModelJoin/XStore equality): confirm, then pull W5.2's equality-kind node forward** as a W0.6 push: two
  equality kinds (Pure total equality; SQL `=`) as distinct nodes emitted where the condition's origin is known (normalizer
  and resolver synthesis), consumed by the lowerer; the `verbatim` stamp and the operand-shape test go. Why: D14 says fix
  now, a per-join flag is wrong once conditions merge, and the node is the target design (nothing thrown away).
- **E5 — D (`ANY_VALUE` on H2 2.1.214):** `MIN(x)` for comparable scalar types (a valid "any non-empty value" for an
  unordered `first`), a `DialectCapability` refusal for JSON/ARRAY carriers, each tested; not counted as a wrong result.
- **E6 — 5a (section imports) is a keying change only;** the `###` import leak (an import-free section inheriting the
  previous section's imports) is a separate W0.6 push after a probe counts elements resolving only through it (D14: fix now,
  not W2.3b).
- **E7 — 5c:** provisions keyed by value (identical CSV via a `###Data` reference and inline share a runtime); the three
  latent content-hash ids are pinned `@KnownDefect(owner = "W6.4")` (not reproduced from a user query).
- **E8 — H also fixes `times([])`** (`COALESCE(…, 1)`), numeric returns only.
- **E9 — W2.3a lineage:** `ScanRelations` moves straight to the typed HIR (W6.4's design, pulled into W2.3a push 4a) instead
  of being ported to `ResolvedExpr` and then again.
- **E10 — owners made single:** form recognition / `CoreFn.of` → W2.3a; LUB with variance → W3.5; equality kinds → E4
  (W0.6), W5.2 keeps null-strictness and determinism; VarId in H → W4.3 step 0/2, in I → W5.1b; D10's compile-all failure
  flip → W2.2b push 2.
- **E11 — W3.7 runs before W3.6** with D11 ruled at a mini-checkpoint C3a; the spike lives on a throwaway branch
  `spike/d11` (never merged), its report in `docs/`; failure or timeout means option S.
- **E12 — W1.8 moves to W5.0** (a dialect fuzzer over today's `sql` tree with `SqlTyping` as the well-typedness oracle).
- **E13 — sizes re-cut:** the program is ≈125–195 sessions by these reviews' per-item judgement (W1 29–45 alone); the first
  week's 3–5× overestimate on mechanical items is noted, and C1 re-fits from logged cost.

## Still the user's to rule

D20 (`splitPart`), D21 (Float literal cliff) — unchanged, each blocks one fix. C4's numeric thresholds are proposed in the
plan and confirmed at C3. D9 and D19 now have a deadline (C3).
