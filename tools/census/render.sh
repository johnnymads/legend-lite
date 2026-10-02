#!/bin/bash
# The render census, one side: build this checkout's //core:core_tests_deploy.jar, then lower every case
# once and render it with DuckDb, H2, EngineStyleH2 and Postgres (RenderCensus.java) into
# runs/census/render/<label>.tsv. Run at two commits over the SAME cases, then diff the two files.
# RenderCensus compiles against the jar of the commit being measured, so it runs at any commit,
# including ones older than this tool. See README.md.
set -eu
label=${1:?usage: tools/census/render.sh <label> <cases.tsv>...}; shift
bin=$(bazel info output_base 2>/dev/null)/external/rules_java++toolchains+remotejdk25_macos_aarch64/bin
out=runs/census/render
mkdir -p "$out/$label"
bazel build //core:core_tests_deploy.jar >/dev/null 2>&1
cat bazel-bin/core/core_tests_deploy.jar > "$out/$label.jar"
"$bin/javac" -cp "$out/$label.jar" -d "$out/$label" tools/census/RenderCensus.java
"$bin/java" -Xss16m -cp "$out/$label.jar:$out/$label" RenderCensus "$out/$label.tsv" "$@" 2>&1 | grep -v "WARN\|SLF4J"
