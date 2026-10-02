# The DataCube app on Windows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bazel run //datacube:app -- postgresql://…` and `bazel run //warehouse:serve` work on Windows x64 with the same native warehouse binary as macOS and Linux.

**Architecture:** The native image (`//warehouse:server_native`), DuckDB's library and DuckDB's postgres extension get Windows arms. `warehouse_run` becomes a macro: macOS and Linux keep today's bash launcher, Windows gets a hermetic-launcher stub (a native `.exe` with the server's arguments baked in), and an `alias` keeps the public target names. A new `//warehouse:launcher_test` judges the launcher on every platform; CI's `native` lane runs on Windows too.

**Tech Stack:** Bazel 9.2.0 (bzlmod), rules_graalvm 0.12.0 / GraalVM CE 25.0.2, hermetic_launcher 0.0.16, DuckDB 1.5.5 (JDBC 1.5.5.1), Java 21 bytecode on JDK 25, JUnit 5 through `//tools/junit:defs.bzl`'s `junit_test`, Node 22 through rules_js, GitHub Actions.

**Spec:** `docs/WINDOWS_APP_DESIGN_2026_10_02.md` — read it first; this plan argues from it.

## Global Constraints

- Windows **x64** only (DuckDB's jar has no Windows ARM64 library).
- `bazel_dep(name = "hermetic_launcher", version = "0.0.16")`; `platforms` moves from `1.0.0` to `1.1.0`.
- DuckDB's postgres extension `v1.5.5`, `windows_amd64`, pinned by sha256 like the other four.
- macOS and Linux: `bazel run //datacube:app` and `//warehouse:serve` behave as before (the bash script still `exec`s the server where `bazel run` was started).
- Public names unchanged: `//datacube:app`, `//warehouse:serve`.
- Files are written with LF line endings (`.gitattributes`: `* -text`; nothing converts them).
- AGENTS.md: no fallbacks, no defaults; a comment says why, dated where it records a measurement.
- Work on branch `windows-support`. One commit per task; the message says what and why and ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Never push** (the user decides).
- Run Bazel from **PowerShell** on the Windows desk, with the user's PATH loaded:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`.
  Not from Git Bash: MSYS rewrites `//label` arguments.
- The desk already has Developer Mode on, Git for Windows at `C:\Program Files\Git`, Visual Studio 2022 Build Tools 17.14 with MSVC 14.44, and has run `bazel fetch --configure --force` since installing it.

## File map

| File | Responsibility | Task |
|---|---|---|
| `MODULE.bazel`, `MODULE.bazel.lock` | the `windows_amd64` extension pin; `hermetic_launcher`; `platforms` 1.1.0 | 1, 2 |
| `warehouse/defs.bzl` | `POSTGRES_EXTENSION`'s Windows arm; `warehouse_run` as a macro (extensions directory, POSIX script, Windows stub, alias) | 1, 2 |
| `warehouse/BUILD.bazel` | the native targets without Windows exclusions; `windows_x86_64`; `launcher_test` | 1, 2 |
| `warehouse/src/test/java/com/legend/warehouse/launcher/LauncherTest.java` | new: the launcher, judged | 2 |
| `datacube/BUILD.bazel` | `app` and `live_snap_test` without Windows exclusions; `verify_app` names its launcher | 3 |
| `datacube/demo/verify-app.mjs` | the launcher from Bazel; the process tree stopped on Windows | 3 |
| `.github/workflows/gates-run.yml` | the `native` lane on Windows, with `launcher_test` | 4 |
| `docs/GATES.md` | the `native` lane's row | 4 |
| `docs/DATACUBE_ON_POSTGRES.md`, `README.md`, `docs/WAREHOUSE_W1_DESIGN_2026_09_26.md` | Windows in the user guide; the prerequisites; owed → done | 5 |
| `docs/WINDOWS_APP_DESIGN_2026_10_02.md` | the measured results | 6 |

---

### Task 1: The native warehouse on Windows

**Files:**
- Modify: `MODULE.bazel:339-352` (the `duckdb_postgres_extension_*` comprehension)
- Modify: `warehouse/defs.bzl:40-47` (`POSTGRES_EXTENSION`)
- Modify: `warehouse/BUILD.bazel` (lines 95-114, 129-146, 148-174, 176-192, 194-203)
- Modify: `MODULE.bazel.lock` (Bazel rewrites it)

**Interfaces:**
- Produces: `//warehouse:windows_x86_64` (a `config_setting`), `@duckdb_postgres_extension_windows_amd64//file`, and `//warehouse:server_native`, `:duckdb_library`, `:tests_native`, `:postgres_live_native` buildable on Windows. `NOT_ON_WINDOWS` survives only on `:serve` (Task 2 removes it).

- [ ] **Step 1: See the test skipped today**

Run: `bazel test //warehouse:tests_native`
Expected: `//warehouse:tests_native SKIPPED` (the target is incompatible with Windows).

- [ ] **Step 2: Take the Windows extension's sha256**

Run (PowerShell):
```powershell
$f = Join-Path $env:TEMP 'postgres_scanner.duckdb_extension.windows_amd64.gz'
curl.exe -sSfL -o $f 'http://extensions.duckdb.org/v1.5.5/windows_amd64/postgres_scanner.duckdb_extension.gz'
(Get-Item $f).Length
(Get-FileHash $f -Algorithm SHA256).Hash.ToLower()
```
Expected: a length of about 10,117,726 bytes and a 64-hex-digit hash. Keep the hash for Step 3.

- [ ] **Step 3: Pin it in MODULE.bazel**

In the `http_file` comprehension, after the `linux_arm64` line, add (the hash is Step 2's output):
```python
    "linux_arm64": "59849e8a4be00fa0ec8c4db0d26707999061d103b902bf32322fa5cde1fc393d",
    "windows_amd64": "<the 64 hex digits Step 2 printed>",
}.items()]
```

- [ ] **Step 4: Select it in `warehouse/defs.bzl`**

Replace the `POSTGRES_EXTENSION` select with:
```python
POSTGRES_EXTENSION = select({
    "//warehouse:macos_arm64": "@duckdb_postgres_extension_osx_arm64//file",
    "//warehouse:macos_x86_64": "@duckdb_postgres_extension_osx_amd64//file",
    "//warehouse:linux_x86_64": "@duckdb_postgres_extension_linux_amd64//file",
    "//warehouse:linux_aarch64": "@duckdb_postgres_extension_linux_arm64//file",
    "//warehouse:windows_x86_64": "@duckdb_postgres_extension_windows_amd64//file",
})
```

- [ ] **Step 5: The native targets in `warehouse/BUILD.bazel`**

Replace the native-image block (the comment from `# THE SERVER AS A NATIVE IMAGE (W1e)` through the `native_image(...)` call) with:
```python
# THE SERVER AS A NATIVE IMAGE (W1e): GraalVM's native-image over :server_lib's runtime class
# path, which Bazel supplies -- the same jars `bazel run //warehouse:server` runs. Everything
# must link when the image is built (--link-at-build-time): a class missing from the class
# path fails the build, where native-image's default compiles each method that names it into a
# NoSuchMethodError at run time (the 2026-09-26 break). On Windows it links with Visual Studio's
# MSVC, which Bazel's C++ toolchain finds (docs/WINDOWS_APP_DESIGN_2026_10_02.md).
native_image(
    name = "server_native",
    extra_args = [
        "--link-at-build-time",
        "--enable-native-access=ALL-UNNAMED",
    ],
    main_class = "com.legend.warehouse.server.WarehouseServer",
    deps = [":server_lib"],
)
```
In `postgres_live_native` and `tests_native`, delete the line `target_compatible_with = NOT_ON_WINDOWS,`.

After the `linux_aarch64` `config_setting`, add:
```python
config_setting(
    name = "windows_x86_64",
    constraint_values = [
        "@platforms//os:windows",
        "@platforms//cpu:x86_64",
    ],
)
```
Replace `duckdb_library` with:
```python
# DuckDB's native library for this platform, out of its JDBC jar: what the image loads.
jar_entry(
    name = "duckdb_library",
    entry = select({
        "@platforms//os:macos": "libduckdb_java.so_osx_universal",
        ":linux_x86_64": "libduckdb_java.so_linux_amd64",
        ":linux_aarch64": "libduckdb_java.so_linux_arm64",
        ":windows_x86_64": "libduckdb_java.so_windows_amd64",
    }),
    jar = "@maven_warehouse//:org_duckdb_duckdb_jdbc",
)
```
Immediately above `warehouse_run(name = "serve", ...)`, put the exclusion it still needs, with its reason:
```python
# `bazel run` cannot start warehouse_run's bash launcher on Windows; Task 2 of
# docs/WINDOWS_APP_PLAN_2026_10_02.md gives Windows its own and removes this.
NOT_ON_WINDOWS = select({
    "@platforms//os:windows": ["@platforms//:incompatible"],
    "//conditions:default": [],
})
```
(The block replaced above held the old `NOT_ON_WINDOWS` definition, between the comment and
`native_image`; it is gone with it, and this one is now its only definition.)

- [ ] **Step 6: Build the native pieces**

Run: `bazel build //warehouse:server_native //warehouse:duckdb_library @duckdb_postgres_extension_windows_amd64//file`
Expected: `Build completed successfully` (the native image takes a minute or two the first time; `MODULE.bazel.lock` changes).

- [ ] **Step 7: Run the suite against the native binary**

Run: `bazel test //warehouse:tests_native //warehouse:tests`
Expected: both `PASSED`.

- [ ] **Step 8: Commit**

```bash
git add MODULE.bazel MODULE.bazel.lock warehouse/defs.bzl warehouse/BUILD.bazel
git commit -m "Windows: the native warehouse, its DuckDB library and postgres extension" -m "server_native links with Visual Studio's MSVC; duckdb_library takes libduckdb_java.so_windows_amd64 from the same jar; MODULE.bazel pins DuckDB 1.5.5's windows_amd64 postgres extension. tests_native passes on Windows x64. //warehouse:serve stays excluded until its launcher can run there (docs/WINDOWS_APP_DESIGN_2026_10_02.md)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Windows launcher, judged on every platform

**Files:**
- Create: `warehouse/src/test/java/com/legend/warehouse/launcher/LauncherTest.java`
- Modify: `warehouse/BUILD.bazel` (`tests_lib`'s glob; `serve`; the `NOT_ON_WINDOWS` Task 1 left; new `launcher_test`)
- Modify: `warehouse/defs.bzl` (the whole file below)
- Modify: `MODULE.bazel` (`platforms`, `hermetic_launcher`), `MODULE.bazel.lock`

**Interfaces:**
- Consumes: Task 1's `//warehouse:server_native`, `:duckdb_library`, `POSTGRES_EXTENSION`.
- Produces: `warehouse_run(name, server, library, postgres_extension_gz, site = None, args_before = [])` making `<name>_extensions` (a directory holding `postgres_scanner.duckdb_extension`), `<name>_posix` (bash; not Windows), `<name>_windows` (hermetic-launcher; Windows only) and `<name>` (an `alias` picking one). `//warehouse:launcher_test`. The env var `WAREHOUSE_SERVE` names the launcher's runfiles path.

- [ ] **Step 1: Write the test**

Create `warehouse/src/test/java/com/legend/warehouse/launcher/LauncherTest.java`:
```java
package com.legend.warehouse.launcher;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.legend.testing.EmbeddedPostgres;
import com.legend.testing.Repo;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;

/**
 * //warehouse:serve as `bazel run` starts it (docs/WINDOWS_APP_DESIGN_2026_10_02.md, §3): the bash launcher
 * on Linux and macOS, hermetic-launcher on Windows. Nothing else runs a warehouse_run launcher on every
 * platform; {@code //datacube:verify_app} is manual.
 */
class LauncherTest {

    /** {@code $(rootpath //warehouse:serve)}: this platform's launcher, in this test's runfiles. */
    private static final Path LAUNCHER = Repo.path(required("WAREHOUSE_SERVE"));

    @Test
    void theCallersArgumentsReachTheServerAndItsExitCodeComesBack() throws Exception {
        // an unquoted '&': a .bat, or Bazel's bash launcher on Windows, cuts the argument there
        Process p = start(List.of("--port", "x&y"));
        List<String> said = linesUntilExit(p);
        assertEquals(2, p.exitValue(), String.join("\n", said));
        assertTrue(said.contains("warehouse: For input string: \"x&y\""), String.join("\n", said));
    }

    @Test
    void theServerItsLibraryAndThePostgresExtensionResolveThroughTheLauncher() throws Exception {
        EmbeddedPostgres pg = EmbeddedPostgres.shared();
        Path data = Files.createTempDirectory(Path.of(required("TEST_TMPDIR")), "launcher-data");
        // a catalog by URL, '&' and all: attaching it loads the postgres extension from the directory the
        // launcher named
        String url = "postgresql://" + EmbeddedPostgres.USER + "@127.0.0.1:" + pg.port()
                + "/postgres?sslmode=disable&connect_timeout=10";
        Process p = start(List.of("--data", data.toString(), "--port", "0", "--user", "alice:alice-pw", url));
        try {
            String listening = awaitLine(p, "warehouse listening on ");
            assertTrue(listening.matches("warehouse listening on 127\\.0\\.0\\.1:\\d+, catalogs \\[main, postgres\\]"),
                    listening);
        } finally {
            stop(p);
        }
    }

    private static Process start(List<String> args) throws IOException {
        List<String> command = new ArrayList<>();
        command.add(LAUNCHER.toString());
        command.addAll(args);
        ProcessBuilder b = new ProcessBuilder(command).redirectErrorStream(true);
        // the launcher finds the server, DuckDB's library and the extension in this test's runfiles
        b.environment().put("RUNFILES_DIR", Repo.root().getParent().toString());
        return b.start();
    }

    /** Everything the launcher and the server printed, once both have exited. */
    private static List<String> linesUntilExit(Process p) throws IOException, InterruptedException {
        List<String> lines;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
            lines = r.lines().toList();
        }
        assertTrue(p.waitFor(60, TimeUnit.SECONDS), "the launcher did not exit");
        return lines;
    }

    /** The first line starting with {@code prefix}, within two minutes; failing that, what was printed. */
    private static String awaitLine(Process p, String prefix) throws Exception {
        List<String> seen = Collections.synchronizedList(new ArrayList<>());
        CompletableFuture<String> found = new CompletableFuture<>();
        Thread reader = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                // read to the end, so a server that keeps printing never blocks on a full pipe
                for (String line = r.readLine(); line != null; line = r.readLine()) {
                    if (line.startsWith(prefix)) found.complete(line);
                    seen.add(line);
                }
            } catch (IOException e) {
                found.completeExceptionally(e);
            }
            found.completeExceptionally(new IllegalStateException(
                    "the launcher exited before printing '" + prefix + "':\n" + String.join("\n", seen)));
        }, "launcher-output");
        reader.setDaemon(true);
        reader.start();
        try {
            return found.get(120, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            return fail("no line '" + prefix + "…' in 120 s:\n" + String.join("\n", seen));
        }
    }

    /** The launcher and the server it started: on Windows two processes; elsewhere one, the launcher exec'd it. */
    private static void stop(Process p) throws InterruptedException {
        p.descendants().forEach(ProcessHandle::destroy);
        p.destroy();
        if (!p.waitFor(30, TimeUnit.SECONDS)) {
            p.descendants().forEach(ProcessHandle::destroyForcibly);
            p.destroyForcibly().waitFor();
        }
    }

    private static String required(String variable) {
        String value = System.getenv(variable);
        if (value == null) throw new IllegalStateException(variable + " is not set: run //warehouse:launcher_test");
        return value;
    }
}
```

- [ ] **Step 2: Its target, and keep it out of `tests_lib`**

In `warehouse/BUILD.bazel`, change `tests_lib`'s `srcs` to:
```python
    # launcher/ is :launcher_test's alone: it needs the launcher and a Postgres in its runfiles
    srcs = glob(
        ["src/test/java/**/*.java"],
        exclude = ["src/test/java/com/legend/warehouse/launcher/**"],
    ),
```
After the `serve` target, add:
```python
# THE LAUNCHER, JUDGED (docs/WINDOWS_APP_DESIGN_2026_10_02.md, §3): //warehouse:serve as `bazel run`
# starts it, on every platform -- the caller's arguments intact, the exit code back, and the server,
# DuckDB's library and the postgres extension resolved through it, attaching the Postgres 16 that
# gate 7P starts (@embedded_postgres, //testing EmbeddedPostgres).
junit_test(
    name = "launcher_test",
    size = "medium",
    srcs = ["src/test/java/com/legend/warehouse/launcher/LauncherTest.java"],
    data = [
        ":serve",
        "@embedded_postgres//:pg/PG_ROOT",
        "@embedded_postgres//:postgres",
    ],
    env = {"WAREHOUSE_SERVE": "$(rootpath :serve)"},
    jvm_flags = ["-Dembedded.postgres.root=$(rlocationpath @embedded_postgres//:pg/PG_ROOT)"],
    select = ["--select-class=com.legend.warehouse.launcher.LauncherTest"],
    deps = [
        "//testing",
        "@maven_test//:org_junit_jupiter_junit_jupiter_api",
    ],
)
```

- [ ] **Step 3: See it skipped on Windows**

Run: `bazel test //warehouse:launcher_test`
Expected: `//warehouse:launcher_test SKIPPED` (`:serve` is still incompatible with Windows, so the test is too).

- [ ] **Step 4: The module's dependencies**

In `MODULE.bazel`, replace the `platforms` line and its comment with:
```python
# The OS and CPU constraints the native targets select on. 1.1.0: what hermetic_launcher requires.
bazel_dep(name = "platforms", version = "1.1.0")
```
After `register_toolchains("@graalvm_toolchains//:toolchain_gvm")`, add:
```python

# `bazel run`'s launcher for the native warehouse on Windows (warehouse/defs.bzl, warehouse_run;
# docs/WINDOWS_APP_DESIGN_2026_10_02.md): a native stub with the server's arguments baked in, which
# starts the server with the caller's arguments intact -- where a .bat and Bazel's bash launcher
# split a Postgres URL at '&'. Released stubs: no Rust toolchain.
bazel_dep(name = "hermetic_launcher", version = "0.0.16")
```

- [ ] **Step 5: `warehouse_run` as a macro**

Replace `warehouse/defs.bzl` with:
```python
"""The warehouse's build helpers: jar_entry, POSTGRES_EXTENSION and warehouse_run.

jar_entry takes one file out of a Java library's jar, as a build output. The warehouse's native
image loads DuckDB's native library from beside it (or from --duckdb-library), and that library
rides inside DuckDB's JDBC jar, one per platform. This takes it out with Bazel's own zipper, in an
action, so the file is an ordinary Bazel output with a runfiles path -- never unzipped by a script.

warehouse_run is `bazel run`'s launcher for the native warehouse (docs/WINDOWS_APP_DESIGN_2026_10_02.md).
"""

load("@hermetic_launcher//launcher:launcher_binary.bzl", "launcher_binary")
load("@rules_java//java/common:java_info.bzl", "JavaInfo")

def _jar_entry_impl(ctx):
    jars = ctx.attr.jar[JavaInfo].runtime_output_jars
    if len(jars) != 1:
        fail("%s: expected one jar in %s, found %d" % (ctx.label, ctx.attr.jar.label, len(jars)))
    out = ctx.actions.declare_file(ctx.attr.entry)
    ctx.actions.run(
        executable = ctx.executable._zipper,
        arguments = ["x", jars[0].path, "-d", out.dirname, ctx.attr.entry],
        inputs = jars,
        outputs = [out],
        mnemonic = "JarEntry",
        progress_message = "Extracting %s from %s" % (ctx.attr.entry, jars[0].basename),
    )
    return [DefaultInfo(files = depset([out]), runfiles = ctx.runfiles(files = [out]))]

jar_entry = rule(
    implementation = _jar_entry_impl,
    attrs = {
        "jar": attr.label(providers = [JavaInfo], mandatory = True),
        "entry": attr.string(mandatory = True, doc = "The entry's path in the jar; also the output's name."),
        "_zipper": attr.label(
            default = "@bazel_tools//tools/zip:zipper",
            executable = True,
            cfg = "exec",
        ),
    },
    doc = "Extracts one entry of a Java library's jar as a file named after it.",
)

# DuckDB's postgres extension for the platform being built, as MODULE.bazel pins it: one choice for
# every launcher (//warehouse:serve, //datacube:app).
POSTGRES_EXTENSION = select({
    "//warehouse:macos_arm64": "@duckdb_postgres_extension_osx_arm64//file",
    "//warehouse:macos_x86_64": "@duckdb_postgres_extension_osx_amd64//file",
    "//warehouse:linux_x86_64": "@duckdb_postgres_extension_linux_amd64//file",
    "//warehouse:linux_aarch64": "@duckdb_postgres_extension_linux_arm64//file",
    "//warehouse:windows_x86_64": "@duckdb_postgres_extension_windows_amd64//file",
})

def _duckdb_extensions_impl(ctx):
    # DuckDB loads an extension file by name: the download is gzipped, so it is unpacked here, under the
    # exact name the server looks for, into a directory of its own -- what --duckdb-extensions names, and
    # what a launcher can name too (a runfiles manifest lists a directory output, not a file's parent)
    out = ctx.actions.declare_directory(ctx.label.name)
    ctx.actions.run_shell(
        inputs = [ctx.file.gz],
        outputs = [out],
        command = "mkdir -p \"$2\" && gzip -dc \"$1\" > \"$2/postgres_scanner.duckdb_extension\"",
        arguments = [ctx.file.gz.path, out.path],
        mnemonic = "GunzipDuckdbExtension",
    )
    return [DefaultInfo(files = depset([out]))]

_duckdb_extensions = rule(
    implementation = _duckdb_extensions_impl,
    attrs = {"gz": attr.label(allow_single_file = True, mandatory = True)},
    doc = "DuckDB's postgres extension, gunzipped into a directory of its own.",
)

def _posix_launcher_impl(ctx):
    server = ctx.executable.server
    files = [server, ctx.file.library, ctx.file.extensions]
    fixed = ""
    if ctx.file.site:
        files.append(ctx.file.site)
        fixed += " --site \"$here/{}\"".format(ctx.file.site.short_path)
    for arg in ctx.attr.args_before:
        fixed += " " + shell_quote(arg)
    script = ctx.actions.declare_file(ctx.label.name + ".sh")
    ctx.actions.write(script, is_executable = True, content = """#!/usr/bin/env bash
# The warehouse with everything it loads beside it -- DuckDB's library, its postgres extension and,
# for the app, the DataCube site -- from runfiles; then it runs where `bazel run` was started, so a
# relative path among the caller's arguments is the caller's.
set -euo pipefail
here="${{RUNFILES_DIR:-$0.runfiles}}/_main"
[[ -d "$here" ]] || here="$(pwd)"
server="$here/{server}"
library="$here/{library}"
extensions="$here/{extensions}"
cd "${{BUILD_WORKING_DIRECTORY:-.}}"
exec "$server" --duckdb-library "$library" --duckdb-extensions "$extensions"{fixed} "$@"
""".format(
        server = server.short_path,
        library = ctx.file.library.short_path,
        extensions = ctx.file.extensions.short_path,
        fixed = fixed,
    ))
    runfiles = ctx.runfiles(files = files).merge(ctx.attr.server[DefaultInfo].default_runfiles)
    return [DefaultInfo(executable = script, runfiles = runfiles)]

def shell_quote(s):
    return "'" + s.replace("'", "'\\''") + "'"

_posix_launcher = rule(
    implementation = _posix_launcher_impl,
    executable = True,
    attrs = {
        "server": attr.label(executable = True, cfg = "target", mandatory = True),
        "library": attr.label(allow_single_file = True, mandatory = True),
        "extensions": attr.label(allow_single_file = True, mandatory = True, doc = "A directory (--duckdb-extensions)."),
        "site": attr.label(allow_single_file = True, doc = "A directory served as the page (--site)."),
        "args_before": attr.string_list(doc = "Fixed arguments, before the caller's."),
    },
    doc = "macOS and Linux: a bash script that execs the native warehouse with its files from runfiles.",
)

def warehouse_run(name, server, library, postgres_extension_gz, site = None, args_before = []):
    """`bazel run`'s launcher for the native warehouse, one name on every platform.

    DuckDB's library, its postgres extension and (for the app) a site go beside the server, then the
    caller's arguments. On macOS and Linux a bash script execs the server where `bazel run` was started.
    On Windows `bazel run` can start no script, and a .bat or Bazel's bash launcher splits a Postgres URL
    at '&', so a hermetic-launcher stub starts the server with its arguments intact; it runs the server in
    the runfiles folder (docs/WINDOWS_APP_DESIGN_2026_10_02.md, §2 and its known limits).

    Args:
        name: the target `bazel run` runs (an alias of <name>_posix or <name>_windows).
        server: the native warehouse (//warehouse:server_native).
        library: DuckDB's native library for the platform (//warehouse:duckdb_library).
        postgres_extension_gz: DuckDB's postgres extension download (POSTGRES_EXTENSION).
        site: a directory served as the page (--site), or None.
        args_before: fixed arguments, before the caller's.
    """
    extensions = name + "_extensions"
    _duckdb_extensions(name = extensions, gz = postgres_extension_gz)
    _posix_launcher(
        name = name + "_posix",
        server = server,
        library = library,
        extensions = ":" + extensions,
        site = site,
        args_before = args_before,
        target_compatible_with = select({
            "@platforms//os:windows": ["@platforms//:incompatible"],
            "//conditions:default": [],
        }),
    )
    embedded = [
        "--duckdb-library",
        "$(rlocationpath %s)" % library,
        "--duckdb-extensions",
        "$(rlocationpath :%s)" % extensions,
    ]
    data = [library, ":" + extensions]
    if site:
        embedded += ["--site", "$(rlocationpath %s)" % site]
        data.append(site)
    launcher_binary(
        name = name + "_windows",
        # the stub holds ten arguments, the entrypoint among them: the app uses nine
        entrypoint = server,
        embedded_args = embedded + args_before,
        data = data,
        target_compatible_with = ["@platforms//os:windows"],
    )
    native.alias(
        name = name,
        actual = select({
            "@platforms//os:windows": ":" + name + "_windows",
            "//conditions:default": ":" + name + "_posix",
        }),
    )
```

- [ ] **Step 6: `serve` on every platform**

In `warehouse/BUILD.bazel`, delete the `NOT_ON_WINDOWS` definition and its comment (Task 1 put them above `serve`), and make `serve`:
```python
# THE WAREHOUSE, BUILT AND RUN IN ONE STEP: the native server, DuckDB's library and DuckDB's postgres
# extension (pinned per platform in MODULE.bazel), all from Bazel. Flags pass through:
#   bazel run //warehouse:serve -- --postgres shop='host=db dbname=shop user=reader password=secret'
warehouse_run(
    name = "serve",
    library = ":duckdb_library",
    postgres_extension_gz = POSTGRES_EXTENSION,
    server = ":server_native",
)
```
Run: `Select-String -Path warehouse\BUILD.bazel -Pattern NOT_ON_WINDOWS`
Expected: no output.

- [ ] **Step 7: Run the test**

Run: `bazel test //warehouse:launcher_test --test_output=errors`
Expected: `//warehouse:launcher_test PASSED`, with 2 tests successful. If `$(rootpath :serve)` is refused as naming more than one file, use `$(rootpaths :serve)` and take the one ending in `.exe` or `.sh`; record why in the BUILD comment.

- [ ] **Step 8: The launcher from a terminal**

Run (`bazel run` itself hands the launcher the argument here, as a user's terminal does):
```powershell
bazel run //warehouse:serve -- --port 'x&y'; "exit: $LASTEXITCODE"
```
Expected: `warehouse: For input string: "x&y"` and `exit: 2`.

- [ ] **Step 9: The warehouse targets together**

Run: `bazel test //warehouse:all`
Expected: `tests`, `tests_native`, `launcher_test` PASSED (`postgres_live` and `postgres_live_native` are manual and not run).

- [ ] **Step 10: Commit**

```bash
git add MODULE.bazel MODULE.bazel.lock warehouse/defs.bzl warehouse/BUILD.bazel warehouse/src/test/java/com/legend/warehouse/launcher/LauncherTest.java
git commit -m "warehouse_run on Windows: hermetic-launcher starts the native server, arguments intact" -m "bazel run cannot start a script on Windows, and a .bat or Bazel's bash launcher splits a Postgres URL at '&'. On Windows warehouse_run is now a hermetic-launcher stub with the server's arguments baked in; macOS and Linux keep their bash script, which names the extension's directory instead of taking the file's dirname. An alias keeps //warehouse:serve's name. //warehouse:launcher_test judges the launcher on every platform: '&' intact, the exit code back, and a Postgres catalog attached through it (docs/WINDOWS_APP_DESIGN_2026_10_02.md, §2-3)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The DataCube app, live-vs-snap and `verify_app` on Windows

**Files:**
- Modify: `datacube/BUILD.bazel` (`live_snap_test` ~560-596, `app` ~710-727, `verify_app` ~818-829)
- Modify: `datacube/demo/verify-app.mjs` (imports line 11; the checks lines 18-25; the spawn lines 36-39; the `finally` lines 144-148)

**Interfaces:**
- Consumes: Task 2's `warehouse_run` macro (the `app` call keeps its arguments) and `//warehouse:serve`.
- Produces: `//datacube:app` and `//datacube:live_snap_test` on Windows; `verify_app` reads `WAREHOUSE_SERVE`.

- [ ] **Step 1: See the test skipped today**

Run: `bazel test //datacube:live_snap_test`
Expected: `//datacube:live_snap_test SKIPPED`.

- [ ] **Step 2: The targets**

In `datacube/BUILD.bazel`, `live_snap_test`: replace its comment's last sentence and delete its `target_compatible_with = select({...}),` block, so the comment reads:
```python
# LIVE VERSUS SNAP over a real warehouse (docs/WAREHOUSE_D1_DESIGN_2026_09_26.md):
# every cube case live on the Bazel-built native warehouse as a reader, then
# snapped into DuckDB-WASM, the answers compared.
```
`app`: delete its `target_compatible_with = select({...}),` block, and extend its comment:
```python
# THE APP (docs/DATACUBE_APP_PLAN_2026_10_02.md): the native warehouse serving this site, one user,
# the browser opened on the tables of the databases named (on Windows through hermetic-launcher:
# warehouse/defs.bzl):
#   bazel run //datacube:app -- postgresql://bob@db:5432/shop [--table sales.orders]
```
`verify_app`: add the launcher's path:
```python
js_binary(
    name = "verify_app",
    data = [
        ":dist",
        ":node_modules/playwright",
        "//warehouse:serve",
    ],
    entry_point = "demo/verify-app.mjs",
    # this platform's launcher (warehouse/defs.bzl): a script on Linux and macOS, an .exe on Windows
    env = {"WAREHOUSE_SERVE": "$(rlocationpath //warehouse:serve)"},
    tags = ["manual"],
)
```

- [ ] **Step 3: The harness**

In `datacube/demo/verify-app.mjs`, line 11 becomes:
```js
import { spawn, spawnSync } from 'node:child_process';
```
After the `if (!PG || !TABLE || !GROUP) { ... }` block, add:
```js
// the launcher's runfiles path, named by //datacube:verify_app: a script on Linux and macOS, an .exe on Windows
const SERVE = process.env.WAREHOUSE_SERVE;
if (!SERVE) {
  console.error('run this as `bazel run //datacube:verify_app`: WAREHOUSE_SERVE names the launcher');
  process.exit(2);
}
```
Replace lines 36-39 -- the comment `// The warehouse as //datacube:app runs it, ...` and the
`const server = spawn(join(DATACUBE, '..', 'warehouse', 'serve.sh'), ...);` call -- with:
```js
// The warehouse as //datacube:app runs it, without --open: the address is read from what it prints.
const server = spawn(join(RUNFILES, SERVE),
  ['--port', '0', '--site', join(DATACUBE, 'dist'), '--single-user', PG],
  { env: { ...process.env, RUNFILES_DIR: RUNFILES, BUILD_WORKING_DIRECTORY: work }, stdio: ['ignore', 'ignore', 'pipe'] });
```
Replace `server.kill('SIGTERM');` in the `finally` with:
```js
  // on Windows the launcher and the server are two processes, and kill() would stop the launcher alone
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f']);
  else server.kill('SIGTERM');
```

- [ ] **Step 4: Run them**

Run: `bazel test //datacube:live_snap_test //datacube:tests`
Expected: both PASSED (`//datacube:tests` includes the Windows guardrail, which scans `demo/*.mjs`).
Run: `bazel build //datacube:app //datacube:verify_app`
Expected: `Build completed successfully`.

- [ ] **Step 5: Commit**

```bash
git add datacube/BUILD.bazel datacube/demo/verify-app.mjs
git commit -m "DataCube on Windows: the app and live-vs-snap build there; verify_app takes its launcher from Bazel" -m "The app's and live_snap_test's Windows exclusions existed for want of the native image (Task 1). verify_app named warehouse/serve.sh; it now takes the platform's launcher from Bazel (WAREHOUSE_SERVE), and on Windows stops the launcher and the server together (taskkill /t)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: CI runs the `native` lane on Windows

**Files:**
- Modify: `.github/workflows/gates-run.yml:66,69-70`
- Modify: `docs/GATES.md:25-26` (a row between `app` and `browser`)

**Interfaces:**
- Consumes: `//warehouse:tests_native`, `//warehouse:launcher_test`.

- [ ] **Step 1: The lane**

In `gates-run.yml`, the `native` entry of the lane list becomes:
```yaml
            {"key":"native", "name":"warehouse as a native image, and its launcher", "targets":"//warehouse:tests_native //warehouse:launcher_test"},
```
and these two lines are deleted:
```yaml
          # the native image is built on Linux and macOS (Windows needs its own toolchain setup: owed)
          if [ "$PLATFORM" = windows ]; then all=$(printf '%s' "$all" | jq -c '[.[] | select(.key != "native")]'); fi
```

- [ ] **Step 2: Check the edit landed and the filter is gone**

The lane list is a `jq` program that CI runs (its `lint workflows` job runs actionlint over the file); locally, check the text:
```powershell
$y = Get-Content .github\workflows\gates-run.yml -Raw
($y -match '"key":"native", "name":"warehouse as a native image, and its launcher", "targets":"//warehouse:tests_native //warehouse:launcher_test"\}') ; ($y -match 'select\(.key != "native"\)')
```
Expected: `True` then `False`.

- [ ] **Step 3: GATES.md's row**

In `docs/GATES.md`'s table, between the `app` and `browser` rows, add:
```markdown
| native | `//warehouse:tests_native`, `//warehouse:launcher_test` | the warehouse suite against the native binary, on Linux, macOS and Windows (since 2026-10-02); and `//warehouse:serve`'s launcher (bash on Linux and macOS, hermetic-launcher on Windows): the caller's arguments intact, the exit code back, and the server, DuckDB's library and the postgres extension resolved through it, a catalog attached on the embedded Postgres 16 |
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/gates-run.yml docs/GATES.md
git commit -m "CI: the native lane on Windows too, with the launcher test" -m "Windows was filtered out of the native lane for want of its toolchain; the windows-2022 runners carry Visual Studio 2022, which Bazel's C++ toolchain finds. The lane now also runs //warehouse:launcher_test on all three platforms." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The docs

**Files:**
- Modify: `docs/DATACUBE_ON_POSTGRES.md` (sections 1, 3, 4, 10; a new section 11)
- Modify: `README.md` (the "On Windows" list)
- Modify: `docs/WAREHOUSE_W1_DESIGN_2026_09_26.md:320,342,367`

- [ ] **Step 1: The user guide's requirements (section 1)**

Replace the `**OS**` row and the `**A C toolchain**` row with:
```markdown
| **OS** | macOS (Apple silicon or Intel), Linux (x86-64 or ARM64), or Windows 10/11 (x64). |
```
```markdown
| **A C toolchain** | The app is compiled to a native binary by GraalVM's `native-image`, which links with your system's compiler. On macOS: `xcode-select --install`. On Linux: `gcc`, plus the glibc and zlib development headers (Debian/Ubuntu: `sudo apt install build-essential zlib1g-dev`). On Windows: Visual Studio 2022 Build Tools with "Desktop development with C++" (`winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`). Install it before your first build; if Bazel ran first, run `bazel fetch --configure --force` once so that it finds the compiler. |
| **On Windows, also** | Developer Mode on (Settings → System → For developers) and Git for Windows at its default path; see the README's Windows prerequisites. Run the commands below in PowerShell. |
```

- [ ] **Step 2: The sample database in PowerShell (section 3)**

After the bash block that loads the sample (it ends with `SQL` and the closing fence), add:
````markdown
**In PowerShell** (Windows), the same:

```powershell
docker run -d --name datacube-pg -e POSTGRES_PASSWORD=admin -p 5432:5432 postgres:16
do { Start-Sleep 1; docker exec datacube-pg pg_isready -h 127.0.0.1 -U postgres *> $null } until ($LASTEXITCODE -eq 0)

@'
CREATE DATABASE shop;
\c shop
CREATE SCHEMA sales;
CREATE TABLE sales.orders (
  id integer PRIMARY KEY,
  ordered_at timestamptz NOT NULL,
  channel text NOT NULL,
  region text NOT NULL,
  product text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL
);
INSERT INTO sales.orders
SELECT g,
       timestamptz '2026-01-01 00:00:00+00' + g * interval '37 minutes',
       (ARRAY['web','store','phone'])[1 + g % 3],
       (ARRAY['north','south','east','west'])[1 + g % 4],
       (ARRAY['widget','gadget','gizmo','doohickey','sprocket'])[1 + g % 5],
       1 + g % 7,
       round((5 + (g % 50) * 1.37)::numeric, 2)
FROM generate_series(1, 5000) AS g;
CREATE ROLE reader LOGIN PASSWORD 'secret';
GRANT USAGE ON SCHEMA sales TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA sales TO reader;
'@ | docker exec -i datacube-pg psql -U postgres
```
````

- [ ] **Step 3: The password on Windows (section 4)**

After the bullet `- if neither has it, the app asks in the terminal: ...`, add:
```markdown

On Windows, libpq's password file is `%APPDATA%\postgresql\pgpass.conf` (same line format; no file
mode to set), and the variable is set in PowerShell with
`$env:PGPASSWORD = 'secret'; bazel run //datacube:app -- ...`.
```

- [ ] **Step 4: verify_app in PowerShell (section 10)**

After the bash block of section 10, add:
````markdown
In PowerShell:

```powershell
bazel run //datacube:install_browser
$env:DATACUBE_APP_PG = 'postgresql://reader:secret@127.0.0.1:5432/shop'
$env:DATACUBE_APP_TABLE = 'sales.orders'; $env:DATACUBE_APP_GROUP = 'channel'
bazel run //datacube:verify_app
```
````

- [ ] **Step 5: Windows's limits (new section 11)**

Append:
```markdown

## 11. On Windows

The app on Windows is the same native binary, started by a small native launcher
([hermetic-launcher](https://github.com/hermeticbuild/hermetic-launcher)) instead of the bash script
macOS and Linux use. Three differences:

- **The app runs in Bazel's folder, not yours.** A relative path among your arguments (say
  `?sslrootcert=ca.pem`) is read from Bazel's runfiles folder: give it as an absolute path, or run
  `bazel run --run_in_cwd //datacube:app -- ...`, which starts the app where you are.
- **An argument containing `"` arrives changed** (and a quoted argument ending in `\` gains a `\`).
  Postgres URLs and connection strings, which quote with `'`, are unaffected.
- **x64 only.** Windows on ARM is not supported.

Ctrl+C stops the app as on the other platforms; Windows then reports the exit as `0xC000013A`
(stopped by Ctrl+C), which is not an error.
```

- [ ] **Step 6: The README's Windows prerequisites**

In `README.md`, replace `**On Windows**, three more things, once:` with `**On Windows**, four more things, once:` and, after the Bazelisk bullet, add:
```markdown
- **Visual Studio 2022 Build Tools**, "Desktop development with C++": `bazel build //...` builds the
  native warehouse, which links with MSVC. Install it before Bazel first runs, or run
  `bazel fetch --configure --force` once after, since Bazel keeps the C++ toolchain it found first.
```

- [ ] **Step 7: Owed → done in the warehouse design**

In `docs/WAREHOUSE_W1_DESIGN_2026_09_26.md`:
- line 320, `core changes). Linux and macOS; Windows is owed.` → `core changes). Linux, macOS and, since 2026-10-02, Windows (docs/WINDOWS_APP_DESIGN_2026_10_02.md).`
- line 342, `- **CI:** the \`native\` lane (Linux, macOS) runs \`bazel test //warehouse:tests_native\`, with the Arrow` → `- **CI:** the \`native\` lane (Linux, macOS and, since 2026-10-02, Windows) runs \`bazel test //warehouse:tests_native //warehouse:launcher_test\`, with the Arrow`
- line 367, `**Owed:** Windows native builds (a separate toolchain setup). (Results held for their retention:` → `**Windows native builds:** done 2026-10-02 (docs/WINDOWS_APP_DESIGN_2026_10_02.md). (Results held for their retention:`

- [ ] **Step 8: Nothing stale left**

Run: `Select-String -Path docs\DATACUBE_ON_POSTGRES.md,README.md,docs\WAREHOUSE_W1_DESIGN_2026_09_26.md,warehouse\BUILD.bazel,datacube\BUILD.bazel,.github\workflows\gates-run.yml -Pattern 'not supported yet','Windows is owed','toolchain is owed','Not on Windows','not built there yet'`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add docs/DATACUBE_ON_POSTGRES.md README.md docs/WAREHOUSE_W1_DESIGN_2026_09_26.md
git commit -m "docs: DataCube on Windows, in the user guide and the README" -m "Windows x64 in the requirements (Visual Studio Build Tools, and bazel fetch --configure --force when Bazel ran first), the sample database and verify_app in PowerShell, libpq's password file on Windows, and Windows's three known limits (docs/WINDOWS_APP_DESIGN_2026_10_02.md). The warehouse design's owed Windows native build is done." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End to end on the Windows desk

**Files:**
- Create (scratch, not committed): `LoadSample.java`, `send-ctrl-c.ps1` in the session's scratchpad directory
- Modify: `docs/WINDOWS_APP_DESIGN_2026_10_02.md` (a "Measured" section)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Every gate**

Run: `bazel test //...`
Expected: every test PASSED; nothing SKIPPED (the two native tests that were skipped on Windows now run, and `launcher_test` is new). Note the count.

- [ ] **Step 2: A Postgres 16 with the guide's sample, without Docker**

The embedded binaries have `initdb` and `pg_ctl` but no `psql`; the sample goes in through Postgres's JDBC driver, which Bazel already fetched. In PowerShell, from the repository root:
```powershell
$scratch = Join-Path $env:TEMP 'windows-app-e2e'
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$ob = (bazel info output_base) -replace '/', '\'
$pg = "$ob\external\+embedded_postgres+embedded_postgres\pg\bin"
$cluster = Join-Path $scratch 'pg-shop'
Set-Content -Path (Join-Path $scratch 'pw.txt') -Value 'admin' -NoNewline
& "$pg\initdb.exe" -D $cluster -U postgres --auth-host=scram-sha-256 --auth-local=trust --pwfile=(Join-Path $scratch 'pw.txt') -E UTF8 --no-locale
Add-Content -Path "$cluster\postgresql.conf" -Value "`nport = 5433`nlisten_addresses = '127.0.0.1'`n"
& "$pg\pg_ctl.exe" -D $cluster -l "$cluster\log.txt" -w start
```
Write `$scratch\LoadSample.java`:
```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

// The sample of docs/DATACUBE_ON_POSTGRES.md section 3, through JDBC (the embedded Postgres has no psql).
public class LoadSample {
    public static void main(String[] a) throws Exception {
        String base = "jdbc:postgresql://127.0.0.1:" + a[0] + "/";
        try (Connection c = DriverManager.getConnection(base + "postgres", "postgres", "admin");
             Statement s = c.createStatement()) {
            s.execute("CREATE DATABASE shop");
            s.execute("CREATE ROLE reader LOGIN PASSWORD 'secret'");
        }
        try (Connection c = DriverManager.getConnection(base + "shop", "postgres", "admin");
             Statement s = c.createStatement()) {
            s.execute("CREATE SCHEMA sales");
            s.execute("CREATE TABLE sales.orders (id integer PRIMARY KEY, ordered_at timestamptz NOT NULL,"
                    + " channel text NOT NULL, region text NOT NULL, product text NOT NULL,"
                    + " quantity integer NOT NULL, unit_price numeric(10,2) NOT NULL)");
            s.execute("INSERT INTO sales.orders SELECT g,"
                    + " timestamptz '2026-01-01 00:00:00+00' + g * interval '37 minutes',"
                    + " (ARRAY['web','store','phone'])[1 + g % 3],"
                    + " (ARRAY['north','south','east','west'])[1 + g % 4],"
                    + " (ARRAY['widget','gadget','gizmo','doohickey','sprocket'])[1 + g % 5],"
                    + " 1 + g % 7, round((5 + (g % 50) * 1.37)::numeric, 2)"
                    + " FROM generate_series(1, 5000) AS g");
            s.execute("GRANT USAGE ON SCHEMA sales TO reader");
            s.execute("GRANT SELECT ON ALL TABLES IN SCHEMA sales TO reader");
        }
        System.out.println("loaded: shop.sales.orders, 5000 rows; reader/secret");
    }
}
```
Run it with Bazel's JDK and the driver Bazel fetched:
```powershell
$java = "$ob\external\rules_java++toolchains+remotejdk25_win\bin\java.exe"
$jdbc = (Get-ChildItem -Recurse "$ob\execroot\_main\bazel-out\x64_windows-fastbuild\bin\external" -Filter 'postgresql-*.jar' | Select-Object -First 1).FullName
& $java -cp $jdbc (Join-Path $scratch 'LoadSample.java') 5433
```
Expected: `loaded: shop.sales.orders, 5000 rows; reader/secret`. (If no `postgresql-*.jar` is found, run `bazel build //pct:pct_postgres` first: it fetches it.)

- [ ] **Step 3: The app, as the guide runs it**

Tell the user first: this opens their default browser on the app.
```powershell
$env:PGPASSWORD = 'secret'
bazel run //datacube:app -- postgresql://reader@127.0.0.1:5433/shop --table sales.orders
```
Expected in the terminal: `warehouse listening on 127.0.0.1:8765, catalogs [main, shop]`, then `DataCube: http://127.0.0.1:8765/#key=…&table=sales.orders` and `Press Ctrl+C to stop.`; the browser shows `sales.orders` Live. The user presses Ctrl+C; the prompt returns.

- [ ] **Step 4: Ctrl+C leaves nothing behind (scripted)**

Write `$scratch\send-ctrl-c.ps1`:
```powershell
# Sends CTRL_C_EVENT to every process attached to the console of process $TargetPid, as a Ctrl+C
# keypress in that console would. Run in its own pwsh process: it detaches from its own console first.
param([Parameter(Mandatory)][int]$TargetPid)
Add-Type -Namespace Win -Name Con -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint pid);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(System.IntPtr handler, bool add);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(uint ev, uint group);
'@
$null = [Win.Con]::FreeConsole()
if (-not [Win.Con]::AttachConsole([uint32]$TargetPid)) { exit 1 }
$null = [Win.Con]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)
$null = [Win.Con]::GenerateConsoleCtrlEvent(0, 0)
Start-Sleep -Milliseconds 500
$null = [Win.Con]::FreeConsole()
```
Then run the app in a console of its own and send that console a Ctrl+C. A console window opens and
closes, and the app's built-in `--open` opens a browser tab; `--port 8766` keeps clear of Step 3's port:
```powershell
$before = @(Get-ChildItem $env:TEMP -Directory -Filter 'datacube-*' | Select-Object -ExpandProperty Name)
$err = Join-Path $scratch 'app.err'
$bazel = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\bazel.exe'
$p = Start-Process -FilePath $bazel -ArgumentList @('run', '//datacube:app', '--', 'postgresql://reader@127.0.0.1:5433/shop', '--port', '8766') -WorkingDirectory (Get-Location) -RedirectStandardError $err -PassThru
$deadline = (Get-Date).AddSeconds(300); while ((Get-Date) -lt $deadline -and -not ((Test-Path $err) -and (Select-String -Path $err -Pattern 'Press Ctrl\+C' -Quiet))) { Start-Sleep 1 }
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8766/).StatusCode
$during = @(Get-ChildItem $env:TEMP -Directory -Filter 'datacube-*' | Select-Object -ExpandProperty Name | Where-Object { $_ -notin $before })
& (Get-Process -Id $PID).Path -NoProfile -File (Join-Path $scratch 'send-ctrl-c.ps1') -TargetPid $p.Id
$p.WaitForExit(30000) | Out-Null; Start-Sleep 2
"temp dir during: $during"; "still there after: " + @($during | Where-Object { Test-Path (Join-Path $env:TEMP $_) }).Count
"processes left: " + @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'server_native|app_windows' }).Count
```
Expected: `200`; one `datacube-…` directory during; `still there after: 0`; `processes left: 0`.

- [ ] **Step 5: verify_app**

Ask the user before this step: `install_browser` downloads Playwright's Chromium (about 150 MB).
```powershell
bazel run //datacube:install_browser
$env:DATACUBE_APP_PG = 'postgresql://reader:secret@127.0.0.1:5433/shop'
$env:DATACUBE_APP_TABLE = 'sales.orders'; $env:DATACUBE_APP_GROUP = 'channel'
bazel run //datacube:verify_app
```
Expected: every line starts with `ok:`, among them `grouped by channel: 3 groups`; exit 0; afterwards `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'server_native' }` returns nothing.

- [ ] **Step 6: Stop the Postgres**

```powershell
& "$pg\pg_ctl.exe" -D $cluster -w stop
Remove-Item Env:PGPASSWORD, Env:DATACUBE_APP_PG, Env:DATACUBE_APP_TABLE, Env:DATACUBE_APP_GROUP
```

- [ ] **Step 7: Record what was measured**

Append to `docs/WINDOWS_APP_DESIGN_2026_10_02.md`:
```markdown

## Measured (Windows 11 x64, <date>)

- `bazel test //...`: <N> tests, all pass, none skipped.
- The app against Postgres 16.15 (the embedded binaries, port 5433, the guide's sample): opened on
  `sales.orders`; Ctrl+C left no process and removed its temporary directory.
- `bazel run //datacube:verify_app`: every line `ok:`.
```
with the date and the count from Step 1.

- [ ] **Step 8: Commit**

```bash
git add docs/WINDOWS_APP_DESIGN_2026_10_02.md
git commit -m "docs: the DataCube app on Windows, measured end to end" -m "Every gate on a Windows 11 x64 desk; the app against Postgres 16 with the guide's sample; Ctrl+C leaves nothing behind; verify_app all ok." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Not in this plan

- Pushing, and the CI run that judges macOS and Linux: the user's call.
- The two hermetic-launcher issues (the `"` quoting bug; a working-directory option): drafted for the user to post.
