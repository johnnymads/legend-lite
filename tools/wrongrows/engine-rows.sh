#!/bin/bash
# The whole stress corpus through legend-engine in rows mode, in batches of services, each batch
# its own JVM with a time limit: one hanging service costs one batch, never the run (D23).
#   tools/wrongrows/engine-rows.sh <rows-dir> [--data=<damaged.pure>] [batch-size] [limit-seconds]
set -u
cd "$(dirname "$0")/../.."
OUT="$1"; shift
DATA=""; if [ "${1:-}" != "" ] && [[ "${1:-}" == --data=* ]]; then DATA="$1"; shift; fi
BATCH="${1:-100}"; LIMIT="${2:-900}"
S=core/src/test/resources/stress; P=projects
mkdir -p "$OUT"
files=()
for proj in core-types core-tenor core-fx core-ratings core-instrument core-calendar core-units core-account core-geo fee-core index-core; do
  for f in model.pure store.pure mapping.pure; do [ -f "$P/$proj/$f" ] && files+=("$PWD/$P/$proj/$f"); done
done
for f in "$S"/*.pure; do files+=("$PWD/$f"); done
grep -ho '^Service stress::[A-Za-z0-9_]*' "$S"/*.pure | awk '{print $2}' | sort -u > "$OUT/services.txt"
total=$(wc -l < "$OUT/services.txt" | tr -d ' ')
bazel build //tools/engine-runner:testable 2>&1 | grep -E 'ERROR' && exit 1
# the runner's jars are SNAPSHOTTED: a bazel build during the hour-long run would replace them
# under the running JVMs (the runner depends on //core)
mkdir -p "$OUT/jars"
find -L "$PWD/bazel-bin/tools/engine-runner/testable.runfiles" -name '*.jar' -exec cp -L {} "$OUT/jars/" \;
JAVA="$(bazel info output_base 2>/dev/null)/external/rules_java++toolchains+remotejdk25_macos_aarch64/bin/java"
BIN=("$JAVA" -Xmx6g -cp "$OUT/jars/*" perf.TestableMain)
n=0; b=0
while [ $n -lt "$total" ]; do
  b=$((b+1))
  svcs=(); while IFS= read -r s; do svcs+=("--testable=$s"); done < <(sed -n "$((n+1)),$((n+BATCH))p" "$OUT/services.txt")
  log="$OUT/batch-$b.log"
  ( "${BIN[@]}" "${files[@]}" "${svcs[@]}" --rows="$OUT" ${DATA:+"$DATA"} > "$log" 2>&1 ) &
  pid=$!; t=0
  while kill -0 $pid 2>/dev/null && [ $t -lt "$LIMIT" ]; do sleep 5; t=$((t+5)); done
  if kill -0 $pid 2>/dev/null; then kill -9 $pid; echo "batch $b: KILLED after ${LIMIT}s (services $((n+1))-$((n+BATCH)))" | tee -a "$OUT/batches.txt"; else
    echo "batch $b: $(grep -E 'total$' "$log" | tail -1) $(grep -E '^run|parse' "$log" | tail -1)" | tee -a "$OUT/batches.txt"; fi
  n=$((n+BATCH))
done
echo "rows: $(ls "$OUT"/*.rows.json 2>/dev/null | wc -l | tr -d ' ') of $total"
