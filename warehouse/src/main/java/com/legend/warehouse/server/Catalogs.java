package com.legend.warehouse.server;

import com.legend.base.Nullable;
import com.legend.warehouse.server.duck.Conn;
import com.legend.warehouse.server.duck.Database;
import com.legend.warehouse.server.duck.DuckException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * The warehouse's catalogs: in W1, one DuckDB database file per catalog,
 * owned by this process (W0 Q4: a writable file belongs to one process),
 * opened through DuckDB's C API. Behind this class so DuckLake (W0 Q5) can
 * take its place for on-demand readers without the API noticing.
 *
 * <p>A POSTGRES catalog ({@link Postgres}) is an in-memory DuckDB database with one Postgres database
 * attached, READ_ONLY, before it is locked down. Both kinds share one namespace of names.
 *
 * <p>Every connection belongs to one principal: what
 * {@code system.main.authenticated_user()} answers on it, from outside SQL.
 */
public final class Catalogs implements AutoCloseable {

    private static final Pattern NAME = Pattern.compile("[a-z][a-z0-9_]{0,62}");

    private final Path dataDir;
    private final Map<String, Database> databases = new TreeMap<>();
    private final Set<String> postgres = new HashSet<>();

    public Catalogs(Path dataDir, List<String> names) throws IOException, DuckException {
        this(dataDir, names, Map.of(), null);
    }

    /**
     * {@code postgresDsns}: Postgres catalogs by name, each a libpq connection string; {@code extensions}:
     * the directory holding DuckDB's {@code postgres_scanner.duckdb_extension}, required when there are any.
     */
    public Catalogs(Path dataDir, List<String> names, Map<String, String> postgresDsns, @Nullable Path extensions)
            throws IOException, DuckException {
        this.dataDir = dataDir;
        Files.createDirectories(dataDir);
        Files.createDirectories(dataDir.resolve("import"));
        try {
            for (String n : names) open(n);
            for (Map.Entry<String, String> e : postgresDsns.entrySet()) {
                if (extensions == null) throw new IllegalArgumentException("a Postgres catalog needs --duckdb-extensions");
                openPostgres(e.getKey(), e.getValue(), extensions);
            }
        } catch (IOException | DuckException | RuntimeException e) {
            close();
            throw e;
        }
    }

    public static boolean validName(String name) {
        return NAME.matcher(name).matches();
    }

    private void open(String name) throws DuckException {
        claim(name);
        Database db = Database.open(dataDir.resolve(name + ".duckdb"));
        db.lockDown(importDir());
        databases.put(name, db);
    }

    private void openPostgres(String name, String dsn, Path extensions) throws IOException, DuckException {
        claim(name);
        Path extension = extensions.resolve(Postgres.EXTENSION_FILE);
        if (!Files.isRegularFile(extension)) {
            throw new IOException("DuckDB's postgres extension is not at " + extension + " (--duckdb-extensions)");
        }
        Database db = Database.open(null);
        try {
            db.attachPostgres(extension, dsn, Postgres.ATTACH);
            db.lockDown(null);
        } catch (DuckException e) {
            db.close();
            // the DSN may carry a password: name the catalog, never echo the connection string
            throw new IOException("could not attach Postgres catalog " + name + ": "
                    + String.valueOf(e.getMessage()).replace(dsn, "<dsn>"));
        }
        databases.put(name, db);
        postgres.add(name);
    }

    private void claim(String name) {
        if (!validName(name)) throw new IllegalArgumentException("bad catalog name: " + name);
        if (databases.containsKey(name)) throw new IllegalArgumentException("catalog " + name + " is named twice");
    }

    /** Whether {@code catalog} is a Postgres catalog (its statements are Postgres SQL, passed through). */
    public synchronized boolean isPostgres(String catalog) {
        return postgres.contains(catalog);
    }

    /** Where an owner puts files to load: the one directory a catalog may read files from. */
    public Path importDir() {
        return dataDir.resolve("import");
    }

    public synchronized List<String> names() {
        return List.copyOf(databases.keySet());
    }

    /** A new connection to the catalog for {@code principal}, or null when there is no such catalog. */
    public @Nullable Conn connect(String catalog, String principal) throws DuckException {
        Database db;
        synchronized (this) {
            db = databases.get(catalog);
        }
        return db == null ? null : db.connect(principal);
    }

    @Override
    public synchronized void close() {
        for (Database db : databases.values()) db.close();
        databases.clear();
        postgres.clear();
    }
}
