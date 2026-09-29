# Tractability review 5 — mechanical consistency sweep (2026-09-29)

Read-only sweep at `34c49baad`, drafted by a subagent and persisted verbatim in substance by the parent session. Read in
full: the plan, IN_FLIGHT, the register, AGENTS.md's routing and layer sections, charter C6.2a, the seven `— Rebuild` GATES
entries (:5685–:5897), the W0.6 homework README + reports 1–4, the cold read, the H2 note's revision, reading guide, §0,
§6, §7. ~95 cited file:line locations checked against the tree and the pinned trees; ~20 counts re-run; command targets
checked with `bazel query 'tests(//...)'` (144 tests; 129 non-manual; `//tools/deps` 5). `h2` = the ResolvedExpr note;
`README` = `w0.6-homework/README.md`; `rN` = `w0.6-homework/N-*.md`.

## 1. Item ids: undefined, duplicated, removed
- plan:135 "rule 0.13" → "rule 0b.13"; plan:216 "(rule 0.12)" → "(rule 0b.12)" (cold read #7 claimed these fixed).
- plan:306 (D11) and plan:605 (W4.0) reference "the W2.0b census", which is no longer an item → "the D11 census
  (`d11-homework-2026-09-29.md`, the questions after §6)".
- plan:241 (§1b `mappings` row) "W4.1" twice, no such item → "W4.1a".
- plan:95 (rule 0b.3) cites "(W1.1)", not an item in §4 → "(W1.1 (1); W1.1b)".
- plan:564 (W3.2b) "matcher trap (C1–C11, C31)" collides with checkpoints C1–C5 → "step-3 traps C1–C11, C31
  (`step3-design-2026-09-26.md` ~:600–620)". Trap C23 in that file (:619, automap "NOT `[0..1]`") still carries the
  corrected automap misreading and was not corrected in place.
- "S" ids collide: plan:391 and IN_FLIGHT:11 name server legs "S0–S3"; the register's rows are S1–S20 → rename the legs
  "SV0–SV3" (or always say "register row S3").
- "H2" means three things: the database, the design note ("W2.0 = H2", "H2 §6"), and plan rev H2 → "the ResolvedExpr note
  (H2)" wherever the note is meant.
- `reasons.tsv:10` gives PACKAGE `size` owner W3.4 — the old W3.4 (the TDS switch); today's W3.4 is "G½ substitutes" → owner
  W3.3a.
- README:47–48 cites rule 0b.8 as "the principled design"; 0b.8 has no such text → cite rule 0b.11 ("a correct targeted
  fix") or drop.
- h2:301 (§5, kept in force) "rule 0.5" → "rule 0b.5".
- Bracket citations all resolve; D1–D21 defined once; S1–S20 unique.

## 2. Cited paths and file:lines (mismatches among ~95 checked)
- plan:64, README:34, r2:6 cite `tools/junit/defs.bzl:25-66`; the file has 61 lines → ":25-61".
- plan:531 `MilestoningDatesPropagationFunctions.java:131-134`: the propagation gate is at :129
  (`NativeFunctionIdentifier.getNativeFunctionIdentifiersWithLambdaParamsAndMatchingFunctionName`) → ":127-130".
- plan:314 (D19), three errors on `tdsExtension.pure`: the helper `extendMatchColumns` is at :68-94 (not :66-95); it is
  called by the marked **`rowValueDifference`** (declared :22/:29, calls :39 and :56), not `columnValueDifference`
  (:96-102); `:73` holds `$r.isNull($col.name + '_1')` — the `$r.getInteger($col.name +'_1')` form is at :114 inside
  columnValueDifference.
- plan:220 names `out/violations.txt` under the java-dependency-graph receipts; it does not exist (`out/` has
  class-edges.tsv, corrected-map-sim.txt, graph.json, model-classes.txt, package-edges.*, sccs.json, string-refs.tsv) →
  regenerate or cite `corrected-map-sim.txt` alone.
- plan:426 (W1.3) "hand-builds 188 `ExprType`s": 188 was A07's half only; `grep -ro 'new ExprType(' resolver/` = **410**.
- plan:630 (W4.3 step 2) "36 `IdentityHashMap`s": `resolver/` has 10 constructions (25 mentions); all core 27 constructions
  → recount and state the grep.
- plan:404 (W1.1b) "394 sites": `grep -ro 'new Typed[A-Za-z]*(' compiler/spec` = 395 (nit: state the grep).
- AGENTS.md:255 "`ArchitectureTest:80` and `:215`" are a URI helper and `engineStyleRendererIsQuarantinedToTheRootLayer`;
  the sql rules are at :142 and :283 → name the two rules, drop line numbers.
- README:57 `inlineBody (:172-180, with the let values)`: the let loop is :168-175, the root rewrite :180-182 (r1:20 says
  :152-181) → ":168-183".
- No path-root convention: `server/PureV1Api.java`, `server/`, `sql/ScanOrder.java` are relative to
  `core/src/main/java/com/legend/` (a top-level `server/` does not exist) → add to §0 "paths without a module prefix are
  under `core/src/main/java/com/legend/`".

## 3. Numbers stated in more than one place
- plan:178 (§1a W3 row) '"reference typed, we FAILED" bodies 1,521': GATES:5755 gives **1,342** for that metric; 1,521 is
  "our bodies FAILED" (GATES:5752, plan:186) → 1,342, or rename the metric.
- plan:193 (C2) trigger "more than 13" sits inside W2.3a's 10–14 (plan:519) → "more than 14".
- W1's size does not add up (plan:386, :698): the six sized W1 items alone sum to 13–21, leaving 1 session for 11 unsized
  items incl. W1.2, W1.3, W1.13 → size them, or raise W1 to ≥ 24–32 and the total to ≥ 105–165. W0's "2–4 left" is tight
  too (W0.6 alone has six fix-push groups, each gated by the full chain).
- h2:67 (§0 row F) "9–13 sessions" and h2:318 "W2.3a totals 6–8 sessions": revision + guide = 10–14 (plan:519) → both 10–14.
- h2:52 "the typer's 16 `CoreFn.of` sites" vs plan:511 18 (grep over compiler/spec = 18) → 18.
- README:100 "open wrong-results defects 12 → 11 (… A, A2, H, D)" but README:13 lists D under "Not defects" and r4:28 rates
  D "nondeterminism only … loud error … no, pin"; a loud H2 error is not a wrong result under rule 0b.11 → "11 → 10 (the
  pinned seven, the head-kill, A, A2, H; D's `ANY_VALUE` refusal lands in push 6 but is not a wrong result)".
- GATES:5726 (the W0.5 record) "Chain green at the time (129/129, 5/5)" at `ed85b5166` (01:15): the fifth `tools/deps` test
  landed in `5a2c8132e` (06:41); GATES:5765 at `06eeb8142` (01:55) reports 128/128 and 4/4 → the actual line (presumably
  128/128, 4/4).
- GATES:5743 says `reasons.tsv` has "21 rows"; the file has 23 non-comment rows (dated history: fix or annotate).
- Agree: sizes 95–155 = the sum of wave ranges; 7 pinned defects; 134 readers (18+31+85); 169 files / 1,958 refs; ~500–600
  constructions; 32 vs 29 imports; 993/936; quiet times; 229,168/217,084 and per-package lines; 35,925; 1,748; 2,099
  classes; the cold read's 15 and 12.

## 4. Do the status lines tell one story?
§0 "Now", §5 step 1, IN_FLIGHT, GATES:5685 and README "Push 1" agree (W0.6 push 1 next, then W1.0b, W0.4, W0.7). Except:
- plan:335 marks W1.0 done, but its gate ("finds no contradiction the documents do not resolve") was not re-run after the
  fixes, and this sweep still finds contradictions (two the cold read marked fixed: #7 rule ids, #10 RELATIONAL_CORPUS) →
  "done after fixes; residual list in `tractability-2026-09-29/5-consistency.md`", or re-run the cold read.
- plan:377 (W0.6 gate) "rosters LOST 0 (read `docs/RELATIONAL_CORPUS.md`'s diff)" contradicts plan:61-62 and cold read #10
  → "rosters LOST 0 by the roster files".
- plan:328 (§3 row W0.0–W0.2) reads as if all of W0.2 is done; W0.2(c) moved to W3.3 → add "(c) moved to W3.3".
- `accessProperty`: plan:331, :579 say it moves in W3.3; GATES:5793 says "W2.4 rewrites it" → one owner in §3.
- plan:334 (§3 "W0.6 homework") cites a commit, not a GATES heading (plan:11) → add a GATES line or cite "Rebuild W1.0".
- GATES:5698 (W1.0) and :5728 (rev H2) break the §0 step 10 template: no summary lines ("green on the tree" only); W1.0 has
  no cost → add the `Executed N out of M` lines.
- A promised scope was dropped: GATES:5763 and `reasons.tsv:20` (ABSENT → W3.6) promise "ids and spans for form nodes" in
  "W1.1's second push"; W1.1b no longer contains it, so the ABSENT bucket (68,232) has no joining item before W2.3a's
  `ExprId` → add it to W1.1b, or re-own the row to W2.3a and say so in W1.1b.
- `//parser-equivalence:diagnostics` is missing from §0: IN_FLIGHT:18-19 gives its triggers; §0 step 6 never mentions it,
  and W1.9 is exactly such a change → add the trigger rule to step 6.

## 5. §0 commands (zsh on macOS)
All parse in zsh (`$OB/external/+http_archive…`, `HEAD~1` with extendedglob, quoted `'*.jar'` and `'— Rebuild'`); every
named target exists (`//core:guardrails`, `:census`, `:core_tests`, `:scale_stresstest100k`,
`//parser-equivalence:parser_parity`, `//spec:spec_tests`, `:reference_lane` (manual, `resources:memory:8192`),
`:corpus_duckdb`, `:corpus_h2`, `//pct:pct_duckdb`, `:pct_h2`, the five `//tools/deps:all` tests); the jshell path,
`rcorpus.test` (read at MinimalCorpusTest:152), every register class in step 5, the receipts root exist. Nits:
`//core:scale_stresstest100k` is **manual** (plan:177, :397), so `//...` never runs it — say so where it is a gate;
plan:51 `//core:update_generated` vs plan:430 `//:update_generated` (both exist; use the root one); receipt folder names
(`rebuild-w1.6`, README's `rebuild-W0.6-p1-probe/`) lack plan:80's `-<short-sha>`.

## 6. Wording that contradicts a ruling
- plan:412 (W1.1d) "nightly there if ≥ 12 GB": the lane reserves 8 GB (`spec/BUILD.bazel:159`) and lens 5 #10 marked
  "12 GB" stale → "if it has ≥ 8 GB free for the lane (plus the Bazel server)"; reconcile with plan:208 (7 GB / 16 GB).
- h2:29-31 "No callee strings on the node" vs h2:46-48 and plan:511 giving `Call` a fenced `String spelled` → "No callee
  strings used for dispatch: a `Call` carries `Candidates` and a `spelled` string fenced to diagnostics and printers".
- h2:33 makes candidate freezing conditional ("if push 1's probe counts 0 boot-body divergences"); D12 (plan:307) states
  it unconditionally → add "(subject to push 1's probe, h2 §7 ruling 2)" to D12.
- h2:312-315 (§6 pushes 3–4) still write `ResolvedBodies` (the side table); h2:318 and ruling 4 (h2:328-329) "Decouple D10
  from W2.3a" contradict plan:516 ("Poisoning per D10") and W2.2b "before W2.3a push 2" (plan:499); none in h2:7's
  supersession list → extend h2:7 to "§1, §6's `ResolvedBodies` and totals, the `Legacy` field in §2, and §7's rulings 1,
  3, 4 and 6".
- h2:51 "the plan's 'Form row'" → "Form table".
- C6.2a (TENET_CHARTER:182-183) omits D19's open edge (the motivating helper `extendMatchColumns` is `<<access.private>>`
  and unmarked) → add "(the reach into unmarked helpers is D19, open)".
- C6.2a's operation list (TENET_CHARTER:186-188) claims to be "drawn from what those library bodies actually use" but
  omits `removeAll`, used by columnValueDifference in a schema position (tdsExtension.pure:121-122) → add it, or say
  "illustrative until W4.2's pin".
- AGENTS.md:351-352 calls `RELATIONAL_CORPUS.md` "a gate artifact — regenerated" and `OUTSTANDING.md` "Generated"; no
  BUILD rule generates either (last touched 2026-09-06) → mark both "history (Maven-era; not regenerated)".
- Minor: r4:63 "port cases 4/5 as written" → "adopt the engine's multiplicity rule (its observable outcome)" (rule 0b.13);
  D12's and h2:35's "StaticFold and AlphaRename ported" means carried onto `ResolvedExpr` — say "carried over". GATES:5866
  "draft PR #8" and GATES:5763/:5854 "side table" are dated history, correctly superseded (plan:405): no change.

## 7. What a fresh reader would trip over
- plan:20-21: no blank line between the "Now" paragraph and "What this program is" (renders as one paragraph).
- Never expanded: PMCD (Pure Model Context Data), FEP (FunctionExpressionProcessor; also in register S6), TIC
  (TypeInferenceContext), FM/GTM/MM (FunctionMatch/GenericTypeMatch/MultiplicityMatch, with their pinned paths), HIR/MIR,
  LUB (least upper bound), M2M (model-to-model), PCT (Platform Compatibility Tests) → a short glossary in §0/§1.
- Used before or without definition: "G½" (plan:57; defined only in §1); "the claims ledger's `also` column" (plan:51);
  "reference lane" and "LOST" (plan:55, :93); CANDIDATES, PICK, OVERLOADS as probe row kinds (plan:177, :543, :549; from
  `LL_SHADOW`, never named); "E.6" (plan:513); "UNKNOWN-FN baseline" (plan:518); "REF-FAILED" (plan:194); "D½" (h2 §6);
  "WORLD_MAP rule 8" (plan:304) vs "WORLD_MAP §8" (plan:314) (the amendment section starts at WORLD_MAP.md:170, the list
  item at :183).
- The register lags its own rules: its intro (:10-11) says `reasons.tsv` cites rows by id (0 matches) → "will cite" (from
  W1.1b) or add S5/S6 ids to the ABSENT/`map`/`extractEnumValue` rows; S12, S13 have "—" for who decided; S16, S19 cite a
  homework report, not a decider and date → fill in or mark `pending`; S15 has its columns swapped (`exec/Equality.java:71-83`
  in the "why" column, register ids in evidence) and owner "open" (not an item).

**Counts:** 11 citation mismatches in ~95 checked; 9 number disagreements; 8 status issues; 10 wording conflicts with
rulings; 5 id collisions/ambiguities; 9 undefined ids/terms.
