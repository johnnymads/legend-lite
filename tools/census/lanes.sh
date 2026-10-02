#!/bin/bash
# The execution census, one side: run every lane with the statement dump (LEGEND_LITE_DUMP_SQL) and the
# debug-only PCT case recorder (LL_PCT_CASES), and keep each lane's log and recorded cases under
# runs/census/<label>/. Run at two commits, then compare with lanes_diff.py. See README.md.
set -u
label=${1:?usage: tools/census/lanes.sh <label>}
lanes=(//core:core_tests //core:stress_suites //spec:corpus_duckdb //spec:corpus_h2 //spec:corpus_warehouse
       //pct:pct_duckdb //pct:pct_h2 //pct:pct_channel_b)
mkdir -p runs/census/$label
bazel test "${lanes[@]}" --test_env=LEGEND_LITE_DUMP_SQL=1 --test_env=LL_PCT_CASES=1 --cache_test_results=no \
  > runs/census/$label/bazel.out 2>&1
grep -E "^//" runs/census/$label/bazel.out
T=$(bazel info bazel-testlogs 2>/dev/null)
for l in "${lanes[@]}"; do
  p=${l#//}; p=${p/://}
  cat "$T/$p/test.log" > "runs/census/$label/${p//\//_}.log"
  if [ -f "$T/$p/test.outputs/pct-cases.tsv" ]; then
    cat "$T/$p/test.outputs/pct-cases.tsv" > "runs/census/$label/${p//\//_}.cases.tsv"
  fi
done
