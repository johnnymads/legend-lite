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
