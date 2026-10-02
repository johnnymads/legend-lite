"""THE POSTGRES THE POSTGRES LANES RUN ON (docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md, Q5; leg P2).

A real Postgres server's binaries -- zonky's embedded-postgres builds, the same ones its Java launcher
unpacks -- for the host platform, pinned by version and sha256, downloaded from Maven Central and unpacked
by Bazel itself (the jar is a zip holding one .txz): no Docker (the hosted macOS and Windows runners have
none), no host tool, and no jar on any classpath. A test starts the server from them
(//testing:embedded_postgres). Postgres 16, the oldest the dialect is written for, so nothing newer
creeps into it.
"""

_VERSION = "16.15.0"

# platform -> (zonky's artifact suffix, the archive inside the jar, the jar's sha256)
_BUILDS = {
    "mac os x/aarch64": ("darwin-arm64v8", "postgres-darwin-arm_64.txz", "65b953905f0a4d46030767a6b44a52360170d69a7985f1b02aa435f2f6256a83"),
    "mac os x/x86_64": ("darwin-amd64", "postgres-darwin-x86_64.txz", "1229188b99515d2160d5cb6222bc96d9c5f3a248268df3bc2dfe0047e6c233d8"),
    "linux/amd64": ("linux-amd64", "postgres-linux-x86_64.txz", "653abc065c682b85d3da50168fb95dc524bd85426cdec9ce3695a550ef431df2"),
    "linux/x86_64": ("linux-amd64", "postgres-linux-x86_64.txz", "653abc065c682b85d3da50168fb95dc524bd85426cdec9ce3695a550ef431df2"),
    "linux/aarch64": ("linux-arm64v8", "postgres-linux-arm_64.txz", "f846a9989d686b7977d6eca9bc9d8b2b69e3f70c7eb60e032197d9c574a6136c"),
    "windows/amd64": ("windows-amd64", "postgres-windows-x86_64.txz", "51c7812dc1af47c9a2ccb64fe74efb88c515cff2da347ce72aab92b4cc8e1191"),
}

def _platform(rctx):
    name = rctx.os.name.lower()
    if name.startswith("windows"):
        name = "windows"
    return name + "/" + rctx.os.arch

def _embedded_postgres_impl(rctx):
    key = _platform(rctx)
    if key not in _BUILDS:
        fail("no embedded Postgres build is pinned for " + key + " (tools/postgres/postgres.bzl)")
    suffix, archive, sha256 = _BUILDS[key]
    url = "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-{s}/{v}/embedded-postgres-binaries-{s}-{v}.jar".format(s = suffix, v = _VERSION)
    rctx.download(url = url, output = "binaries.jar", sha256 = sha256)
    rctx.extract("binaries.jar", output = "jar")
    rctx.extract("jar/" + archive, output = "pg")
    rctx.delete("binaries.jar")
    rctx.delete("jar")

    # PG_ROOT marks the install's root for the launcher (its bin/, lib/, share/ are beside it)
    rctx.file("pg/PG_ROOT", "postgres " + _VERSION + " " + key + "\n")
    rctx.file("BUILD.bazel", """\
# Postgres {v} for {k}: the whole install, and the marker a test finds its root by.
filegroup(
    name = "postgres",
    srcs = glob(["pg/**"]),
    visibility = ["//visibility:public"],
)

exports_files(["pg/PG_ROOT"])
""".format(v = _VERSION, k = key))

embedded_postgres = repository_rule(
    implementation = _embedded_postgres_impl,
    doc = "The host platform's pinned Postgres binaries, unpacked.",
)
