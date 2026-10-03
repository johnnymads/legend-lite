"""jar_entry: one file out of a Java library's jar, as a build output.

The warehouse's native image loads DuckDB's native library from beside it (or from
--duckdb-library), and that library rides inside DuckDB's JDBC jar, one per platform. This
takes it out with Bazel's own zipper, in an action, so the file is an ordinary Bazel output
with a runfiles path -- never unzipped by a script.
"""

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

def _warehouse_run_impl(ctx):
    # DuckDB loads an extension file by name: the download is gzipped, so it is unpacked here, under
    # the exact name the server looks for in --duckdb-extensions
    ext = ctx.actions.declare_file(ctx.label.name + "_extensions/postgres_scanner.duckdb_extension")
    ctx.actions.run_shell(
        inputs = [ctx.file.postgres_extension_gz],
        outputs = [ext],
        command = "gzip -dc \"$1\" > \"$2\"",
        arguments = [ctx.file.postgres_extension_gz.path, ext.path],
        mnemonic = "GunzipDuckdbExtension",
    )
    server = ctx.executable.server
    files = [server, ctx.file.library, ext]
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
extensions="$(dirname "$here/{ext}")"
cd "${{BUILD_WORKING_DIRECTORY:-.}}"
exec "$server" --duckdb-library "$library" --duckdb-extensions "$extensions"{fixed} "$@"
""".format(server = server.short_path, library = ctx.file.library.short_path, ext = ext.short_path, fixed = fixed))
    runfiles = ctx.runfiles(files = files).merge(ctx.attr.server[DefaultInfo].default_runfiles)
    return [DefaultInfo(executable = script, runfiles = runfiles)]

def shell_quote(s):
    return "'" + s.replace("'", "'\\''") + "'"

warehouse_run = rule(
    implementation = _warehouse_run_impl,
    executable = True,
    attrs = {
        "server": attr.label(executable = True, cfg = "target", mandatory = True),
        "library": attr.label(allow_single_file = True, mandatory = True),
        "postgres_extension_gz": attr.label(allow_single_file = True, mandatory = True),
        "site": attr.label(allow_single_file = True, doc = "A directory served as the page (--site)."),
        "args_before": attr.string_list(doc = "Fixed arguments, before the caller's."),
    },
    doc = "Runs the native warehouse with DuckDB's library and extensions (and a site) beside it: one `bazel run`.",
)
