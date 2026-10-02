package com.legend.warehouse.server.duck;

import com.legend.base.Nullable;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;

/**
 * Where DuckDB's native library is. Given explicitly (a native image ships it
 * beside the binary), or else taken from DuckDB's JDBC jar on the classpath,
 * which carries it for every platform: extracted once to a cache file named by
 * its size, and reused by every later start.
 */
public final class DuckLibrary {

    private DuckLibrary() {
    }

    /**
     * Loads DuckDB: from {@code explicit} when given; in a native image, from beside the executable
     * (the image ships with it); on the JVM, from DuckDB's JDBC jar on the classpath.
     */
    public static void load(@Nullable Path explicit) throws IOException {
        if (explicit != null) {
            Duck.load(explicit);
        } else if (nativeImage()) {
            Duck.load(besideExecutable());
        } else {
            Duck.load(extracted());
        }
    }

    /** The library beside a native executable: under its platform name, or {@code libduckdb_java.so}. */
    private static Path besideExecutable() throws IOException {
        Path dir = executableDir("--duckdb-library");
        for (String name : new String[] {resourceName(), "libduckdb_java.so"}) {
            Path p = dir.resolve(name);
            if (Files.isRegularFile(p)) return p;
        }
        throw new IOException("DuckDB's library is not beside the executable in " + dir + " (" + resourceName()
                + " or libduckdb_java.so); pass --duckdb-library");
    }

    /** Whether this is a native image, whose DuckDB library and extensions ship beside it. */
    public static boolean nativeImage() {
        return System.getProperty("org.graalvm.nativeimage.imagecode") != null;
    }

    /** The running executable's directory; {@code flag} is what to pass instead when it cannot be told. */
    public static Path executableDir(String flag) throws IOException {
        String command = ProcessHandle.current().info().command().orElseThrow(
                () -> new IOException("cannot tell where this executable is; pass " + flag));
        Path dir = Path.of(command).toAbsolutePath().getParent();
        if (dir == null) throw new IOException("no directory for " + command + "; pass " + flag);
        return dir;
    }

    /** DuckDB's version, as its drivers report it ("v1.5.5"). */
    public static String version() {
        return Duck.api().version();
    }

    /** The resource name DuckDB's JDBC jar uses for this platform. */
    static String resourceName() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        boolean arm = arch.equals("aarch64") || arch.equals("arm64");
        if (os.contains("mac")) return "libduckdb_java.so_osx_universal";
        if (os.contains("linux")) return arm ? "libduckdb_java.so_linux_arm64" : "libduckdb_java.so_linux_amd64";
        if (os.contains("windows")) return "libduckdb_java.so_windows_amd64";
        throw new IllegalStateException("no DuckDB library for " + os + "/" + arch);
    }

    private static synchronized Path extracted() throws IOException {
        String name = resourceName();
        ClassLoader loader = DuckLibrary.class.getClassLoader();
        try (InputStream probe = loader.getResourceAsStream(name)) {
            if (probe == null) {
                throw new IOException("DuckDB's library " + name + " is not on the classpath;"
                        + " pass its path (--duckdb-library)");
            }
        }
        Path dir = Path.of(System.getProperty("java.io.tmpdir"), "legend-warehouse-duckdb");
        Files.createDirectories(dir);
        long size;
        try (InputStream in = loader.getResourceAsStream(name)) {
            if (in == null) throw new IOException("lost " + name);
            size = in.transferTo(java.io.OutputStream.nullOutputStream());
        }
        Path target = dir.resolve(name + "-" + size);
        if (Files.isRegularFile(target) && Files.size(target) == size) return target;
        Path partial = Files.createTempFile(dir, name, ".partial");
        try (InputStream in = loader.getResourceAsStream(name)) {
            if (in == null) throw new IOException("lost " + name);
            Files.copy(in, partial, StandardCopyOption.REPLACE_EXISTING);
        }
        Files.move(partial, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return target;
    }
}
