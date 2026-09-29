# H3 — the reference lane spike, 2026-09-29: legend-pure runs from the pinned jars

**Question.** Can the real legend-pure compiler load and compile `core_relational`'s module closure from the jars already
pinned in `@maven_upstream` (engine 4.145.0, pure 5.99.0), inside Bazel, so the reference differential (W1.1) runs at the
SAME release as our spec trees instead of the 4.138.5 shaded jar?

**Answer: yes.** Receipts: `~/legend/platform-architecture/receipts/reference-differential/pinned-4.145.0-2026-09-29/`.

## What was done
- `tools/reference/BUILD.bazel` (new, testonly): `java_binary //tools/reference:ref_resolutions` over the unchanged
  `RefResolutions.java`, whose deps are the 26 `-pure` jars of `core_relational`'s manifest closure plus `legend-pure-m3-core`,
  `legend-pure-m4` and the seven `legend-pure-m2-*-grammar` jars. No MODULE.bazel change: every artifact was already
  resolved in `maven_upstream_install.json` (the closure computed from the pinned trees' `*.definition.json` files: 27
  modules; `platform` lives in `legend-pure-m3-core`).
- The `-pure` jars ship what the runtime needs: `core_relational.definition.json`, `pure-core_relational.par` and all 553
  `.pure` files of the module (checked with `unzip -l`).

## Measured (load 7 at start — the other account's processes were still running; not a timing)
| run | result |
|---|---|
| load + compile the closure | 34.6 s (35.4 s on a second run) |
| peak memory | 5.3 GB RSS (`/usr/bin/time -l`) |
| dump, `/core_relational/` only | 6,528 functions, 129,397 calls |
| dump, the four prefixes the old dump used (`/core_relational/ /platform/ /core_functions_ /core/`) | 13,871 functions, 235,668 calls |

## The join, old jar vs pinned release, against the same dump of ours
`tools/reference/join.py`, no source-drift file passed in either run:

| bucket | 4.138.5 jar vs our older dump | 4.145.0 jars vs the same dump | 4.145.0 vs our dump at HEAD (`caf0cf71f`) |
|---|---|---|---|
| AGREE | 55,294 | 72,467 | **72,081** |
| OVERLOAD | 540 | 771 | **769** |
| PACKAGE | 465 | 14 | **14** |
| DRIFT (declaration absent on one side) | 7 | 32 | 32 |
| ABSENT (syntax/forms/rewrites) | 81,184 | 68,760 | 68,232 |
| PROPERTY_AS_CALL | 58 | 39 | 39 |
| EXTRA | 30,798 | 15,864 | 15,825 |

At the pinned release the positions line up: AGREE rises by about 17,000 and PACKAGE falls from 465 to 14 with no drift
exclusion. The step-1 record's SOURCE_DRIFT bucket (52,266 rows) is no longer needed. The OVERLOAD rows are the known
families (top: `isEmpty` `[0..1]` vs `[*]` 523; `average` 36+9; `elementToPath` 30; `greaterThan` `[0..1]` 24;
`hasGeneratedMilestoningPropertyStereotype` 21+21; `stdDevSample` 10; `max`/`min` `[1..*]` families) — W3's work list.
PACKAGE 14 includes `size` 9 (the TDS erasure, W3.1/W3.4).

## What W1.1 still has to build (not done by the spike)
1. **Types and multiplicities.** `RefResolutions` dumps bindings only; add, per call site and per expression, the
   reference's resolved type parameters, `genericType` and `multiplicity` (from the processed `FunctionExpression`), and
   the same from our typed HIR in `OurResolutionsTest`.
2. **A test, not a binary.** A `java_test` (tagged `manual`, `resources:memory:8192`) that runs both dumps, joins them in
   Java (port `join.py`), and compares the disagreement set to a committed file with a reason per row; red on a new row.
3. **Our side is survivorship-biased**: `OurResolutionsTest` drops failing source files until the model builds (A13).
   The lane must report the bodies it could not compare, as a count that only falls.
4. **Column unit.** The join matches by (source, line, column); both sides must count columns the same way (A01 #5 found
   our spans use UTF-16 units while error positions use code points). Verify against the reference's `SourceInformation`
   on a non-ASCII line before trusting positions on such lines.
