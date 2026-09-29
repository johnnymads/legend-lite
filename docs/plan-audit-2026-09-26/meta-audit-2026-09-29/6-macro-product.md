# Meta-audit lens 6 — macro, product and users (compiler/rebuild at ee7617ec8, 2026-09-29)

Read-only review, persisted by the parent session. Read: the plan, TENETS, the charter, WORLD_MAP, AGENTS.md, README/FAQ,
IN_FLIGHT, the architecture review §1–3 and §8, the H1 synthesis, GATES 2026-09-26..29, SERVER_PROGRAM, the DataCube
audits, `wasm/README.md`, `datacube/bench/README.md`, CI workflows, git history; draft PR #8 read-only (40/40 checks pass).

## Verdict

The technical target is right, and the engineering discipline is unusually strong (probe before switch, byte-identical
gates, a reference lane at the pinned release, done items that are real). As a program it is framed as a compiler-quality
project with no user in it:
- every gate is "don't regress" (rule 0.3 "LOST 0"); no wave has a positive user outcome or a metric that must move;
- known wrong-answer bugs wait behind refactors (pinned to W2.5, W4.2, W4.3: ~30–110 sessions away);
- the IDE sees the new diagnostics last (the LSP reads them only in W6.4);
- the planner that ships in the browser has no latency, size or memory budget;
- main and DataCube are frozen on a long-lived branch that main fast-forwards to only at wave boundaries, contradicting
  the user's standing rule to push to main when green; W4 alone is 32–51 sessions;
- scope doubled twice in ~36 hours (15–20 → 45–65 → 90–145 → 96–151) with no kill or re-plan checkpoint;
- W4-internal decisions (D8, D11) are ruled on day one while program-level questions (users, branch, performance,
  releases) have not been asked.

Recommendation: keep the target and the discipline; re-cut as a program that gives users something each wave: fix
wrong-rows bugs first; wire the LSP early; land on main slice by slice; add performance budgets; a go/no-go before W4.3;
cut ~40% of scope.

## 1. Users, and when each wave gives them something

No document names users. From code and docs: DataCube users (32.7k lines of TypeScript, legend-engine's exact API per
`datacube/docs/ENGINE_API_CONTRACT.md`, planning in the browser through the TeaVM WASM planner, `wasm/README.md`,
`datacube/src/wasm-planner.ts`); legend-engine API clients (`server/PureV1Api.java`); model authors in an IDE (`/lsp`);
the planned warehouse and server modes (`SERVER_PROGRAM_2026_09_26.md`). Stated goals: row equality with engine
semantics, 100% push-down, replacing legend-pure/legend-engine. The plan serves one goal (fidelity to legend-pure,
measured by corpus and reference lane); mentions DataCube once (W0.1's Origin note); never WASM, TeaVM, latency, memory
or the warehouse.

| wave | cumulative sessions | what a user gets |
|---|---|---|
| W0 (done bar W0.4) | 3–5 | raw-SQL route gone, loopback + Origin allow-list; splitPart on plain H2; `toOne` no longer folds wrongly; W0.4 removes harness-only ORDER BYs from product DuckDB SQL |
| W1 | 13–20 | almost nothing directly; parser diagnostics get codes and spans but the LSP reads them only at W6.4 |
| W2 | 28–43 | section-imports overload bug (W2.2), mapping NPE (W2.3a), let-shadowing wrong results `[11,11,11]` (W2.5) |
| W3 | 39–61 | overload picks match legend-pure; nothing requires shrinking the 1,342 "reference typed, we FAILED" |
| W4 | 71–112 | the wrong-rows fixes: exists correlation `[BETA]` for `[]`, lost milestoning window (W4.3); inliner capture `[60,60,60]` (W4.2); M2M (W4.4b) |
| W5 | 81–128 | H2 dialect correctness and escaping (W5.3); Postgres (W5.5) |
| W6 | 93–148 | LSP real positions (W6.4); global static state leaves the server (W6.2); ServiceTestRunner collision |

Most user value lands after ~session 70; silently wrong rows are fixed last. Re-order: (a) fix every reproduced
wrong-rows defect in W0/W1 with a targeted correct fix today (the pin flips; the rebuild's gates preserve it); (b) wire
the LSP to the W1.2 sink in W1.2; (c) make "fail roster shrinks" and "reference-typed-we-failed shrinks" positive W3/W4
targets; (d) check whether W5.3's non-dialect SQL concatenation sites are reachable from request input; if so, W0.

## 2. Ranked findings

- **F1. No user frame, no positive success metric.** Rule 0.3 is all no-regression; the fail rosters
  (`spec/src/test/resources/rcorpus/`: DuckDB 107, H2 361) have no targets. Change: each wave gets a plain-language user
  outcome and one number that must move, printed into GATES by the tool (roster shrink, REF-FAILED, positioned-diagnostic
  %, plan latency).
- **F2. Known wrong answers deferred behind architecture.** GATES 2026-09-29 W0.3: several defects return wrong rows,
  owned by W2.5/W4.2/W4.3; rule 0.11 institutionalises the deferral. "Principled architecture, unprincipled delivery."
  Change: a severity rule: wrong rows or security → fix now; rule 0.11 only for cosmetic/diagnostic defects.
- **F3. The long-lived branch freezes main and DataCube, against a standing rule.** origin/main unmoved since
  `caf0cf71f`; branch 32 commits ahead after one day; DataCube had ~45 commits on 09-28 and a 417-defect audit (2
  CRITICAL, 36 HIGH, e.g. timestamps wrong outside UTC) parked; the user's rule is to push to main when green. The gates
  already make each slice safe (CI runs on push to main; 40/40 pass). Change: trunk-based; re-open a DataCube lane via
  IN_FLIGHT rule 5; mark SERVER_PROGRAM paused.
- **F4. Scope inflates with no cut step and no checkpoints.** 15–20 → 45–65 → 90–145 → 96–151 inside ~36 hours; every
  audit added, none removed; W4.3 (18–30) "largest and least certain"; no kill/continue points. Change: checkpoints; every
  audit gets a "what can we cut" section.
- **F5. The planner runs in the browser; no performance or footprint budgets.** `wasm/README.md` (DataCube plans in the
  browser); `datacube/bench/README.md` (300 ms p95 target, 2.1–2.4× WASM penalty); `//wasm:planner` in the chain enforces
  TeaVM compatibility, not size or cold start; D12's resolved family beside the parsed model could roughly double model
  memory; the 100K-element build (2.7 s) is not a gate. Change: track plan latency p50/p95 over corpus queries, WASM
  bytes, `//wasm:startup` cold start, 100K-model heap and build time, with budgets.
- **F6. Micro before macro.** D8 ruled with a new charter clause for W4.2 (~session 60+); D11's census on the critical
  path before W2.1 though it only decides W4.3 step 7; seven decisions and five audits in one day while program-level
  questions were not asked. Change: last-responsible-moment rule; move W2.0b to W4.0.
- **F7. The IDE's new diagnostics arrive last.** `PureLspServer.java:177-219` guesses positions from message text; H4 §6
  schedules the LSP consumer for W6.4. Change: wire it in W1.2.
- **F8. The process is heavier than the product change.** `docs/` 311 files; GATES.md 6,240 lines; ~4.4k lines of docs vs
  ~8.5k of code+tests since the review; audits of audits; same-day drift (IN_FLIGHT "seven decisions open", plan §2 two;
  plan §7 "D12 open", §2 RULED). Change: one adversarial audit per wave; a generated status line; a one-page program page.
- **F9. The entry-point documents contradict each other.** AGENTS.md "Standing documents" points to ENGINEERING_LOG's
  active queue (newest 2026-08-14), never to the plan or IN_FLIGHT; PROGRAM_MAP, FOUNDATIONS_PLAN, ONE_PLATFORM_PLAN,
  END_TO_END_PLAN, SERVER_PROGRAM carry no superseded/paused banner; SERVER_PROGRAM's W0–W3 collide with the rebuild's
  W0–W7; README says ~120K lines (core/main is 217k), FAQ ~25K LOC / 955 tests / 19 s. Change: AGENTS.md routes to
  IN_FLIGHT then the plan; banners; rename server legs S0–S3; refresh README/FAQ.
- **F10. The key oracle is local-only and machine-bound.** The reference lane (8–12 GB) is manual and not in CI; macOS
  runner 7 GB; timings need the other account idle. Change: run it on ubuntu (16 GB) in CI nightly or on the PR; record
  the other account's schedule as a dependency.
- **F11. No policy on upstream pin bumps during the program.** Pins 4.145.0 / 5.99.0; `tools/bump` exists; the reference
  lane and "copy the reference's oddities" key on the pin. Change: freeze pins; a bump only as its own slice at a wave
  boundary.
- **F12. Multi-user safety comes late.** 46 census statics and 3 ThreadLocals removed only in W6.2; ServiceTestRunner
  collision in W6.4; the server is shared by DataCube and API clients. Change: audit which statics a concurrent request
  can reach; move those to W1/W2.
- **F13. Some scope is gold-plating relative to users.** Rule 0.12 carve-outs everywhere, W1.9, W5.2, W5.4, W6.1, W4.3
  steps 7–9 + D11's skeleton, W7's guard deletions: defensible (the user asked for layers proved by targets) but no user
  outcome. Change: carve out a target only where its wave already rewrites the code; defer the rest.

Tenets respected: D8 ring-fenced; D10 matches TENETS.md; the upstream jars only in a test lane; own everything; rule
0.12. Contradictions: the branch strategy vs push-to-main-when-green (F3); rule 0.11 vs "do the principled thing" (F2);
stale entry points (F9); D12 and per-stage IRs unpriced against the WASM/footprint constraint (F5).

## 3. Missing at program level

- A program definition of done in user terms (e.g. LSP diagnostics positioned ≥95%, fail roster ≤ N, plan p95 ≤ X ms,
  WASM ≤ Y MB).
- A success metric per wave (one number that must move).
- Kill/continue checkpoints: end of W1 (gates delivered, estimate within 1.5×?); after W2.3a (re-plan if over 13
  sessions); end of W3 (OVERLOAD residue, REF-FAILED trend); **before W4.3: go/no-go** on decomposing the store resolver
  vs targeted fixes, on defect data; a calendar review every ~20 sessions.
- A risk register (owner, likelihood, trigger, mitigation) for W4.3 overrun, oracle drift, perf/WASM regression, owner
  bandwidth, other-account contention, 7 GB CI, the TeaVM API surface, pin bumps.
- Calendar mapping: work sized at ~5–7 sessions landed in one day on 09-29; nobody has said weeks or months.
- A rollback story for abandoning the program mid-way (trunk slices + converter seams make it cheap; write it down).
- Stakeholder review points: the user reviews at checkpoints, not every decision.
- A plain-language one-page status per wave.
- Decision recording with a "revisit when" field, one copy only.
- Performance, memory and WASM budgets (F5); multi-user server concerns (F12); upstream pin policy (F11).
- User documentation (a diagnostic-codes reference; stale README/FAQ); release cadence (zero git tags; tag main at each
  checkpoint); CI capacity (F10); the other-account dependency; whether DataCube, the warehouse and NLQ continue.

## 4. If I had to cut 40%

Keep the "minimum expert compiler" (~55–85 sessions): W0 and W1 without W1.9, with the LSP wired in W1.2; a new
wrong-rows fix-now slice (~3–5); W2.1–W2.5, W2.7–W2.9; W3.1–W3.3, W2.8, W3.6 limited to the typer's `CoreFn.of` sites;
W4.0, W4.1a, W4.2, W4.3 steps 1–6, W4.4a; W5.1a, W5.3, W6.3's judge SPI; W6.4 limited to server and LSP pieces plus
removing request-reachable statics.

| item | est. saved | decision |
|---|---|---|
| W4.3 steps 7–9, D11's relational skeleton, W5.1c | 10–16 | defer; decide at the pre-W4.3 go/no-go |
| W5.2 semantic MIR (keep removing `Join.Kind.sql`), W5.4 ANSI split | 4–6 | defer |
| W5.5 Postgres lane | 3–6 | defer until a user or X1 needs it |
| W6.1 staged plan IR, the rest of W6.2 | 4–7 | defer; only the static-state and runner seams users need |
| W1.9 and carve-outs where no wave rewrites the code (keep the no-new-edges test) | 3–5 | cut |
| W2.6 `Ref<Kind>` across ~211 sites | 2–3 | only where a W4 slice or a bug needs it |
| W3.5 kernel second half | 2–3 | when the reference lane shows the need |
| W7 as a wave | 2–4 | fold guard deletions into the owning slices |
| process: one audit per wave, no meta-audits, last-responsible-moment decisions | ~8–12 | ~10% overhead |

## 5. What a seasoned engineering director would say

"Your team has built one of the best verification harnesses I've seen on a reimplementation: a live reference compiler in
the loop, per-test SQL snapshots, expected-failure pins with owners. Keep all of it. But this is a 100–150-session
internal rewrite with no customer in the plan, no dates, no exit ramp, and an estimate that doubled twice before the first
real switch. You have reproduced bugs that return wrong rows, and you've scheduled their fixes for month three because
they belong to a later wave. Reverse that today: correctness first, architecture second. You froze your product,
DataCube, which had a 417-defect audit open, to put the compiler on a branch, though your own rule is to push green slices
to main. Your gates are good enough to land every slice on main, so do that and let the product move. You're ruling on
column-name folding for a wave two months out, but you can't tell me the plan-latency budget for a planner that runs in
the user's browser. Give me a one-page status per wave: what users got, three numbers, the next go/no-go. And a hard
decision point before W4.3: if we're over budget there, we fix the store resolver's bugs in place and stop. Build the
minimum expert compiler first. Earn the rest."

Key files: `docs/EXECUTION_PLAN_2026_09_26.md`, `docs/IN_FLIGHT.md`, `docs/GATES.md` (lines 5685–5852),
`docs/SERVER_PROGRAM_2026_09_26.md`, `docs/DATACUBE_AUDIT_PASS2_FINDINGS_2026_09_26.md`, `AGENTS.md` (lines 327–341),
`wasm/README.md`, `datacube/bench/README.md`, `h4-diagnostics-design-2026-09-29.md` §6,
`.github/workflows/gates-run.yml`.
