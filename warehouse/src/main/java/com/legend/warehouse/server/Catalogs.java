package com.legend.warehouse.server;

import com.legend.base.Nullable;
import com.legend.json.Json;
import com.legend.warehouse.server.duck.Collect;
import com.legend.warehouse.server.duck.Conn;
import com.legend.warehouse.server.duck.Database;
import com.legend.warehouse.server.duck.Result;
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
        // every connection the attach makes is in the platform's UTC session (Postgres.SESSION_ZONE)
        String attached = Postgres.inSessionZone(name, dsn);
        Database db = Database.open(null);
        try {
            db.attachPostgres(extension, attached, Postgres.ATTACH);
            db.lockDown(null);
            requireSupportedVersion(name, db);
        } catch (DuckException | IOException e) {
            db.close();
            // the DSN may carry a password: name the catalog, never echo the connection string
            String why = String.valueOf(e.getMessage()).replace(attached, "<dsn>").replace(dsn, "<dsn>");
            throw new AttachFailed(name, why, why.contains(NO_PASSWORD));
        }
        databases.put(name, db);
        postgres.add(name);
    }

    /** libpq's words when it found no password to send (fe-auth.c); a caller with a terminal can ask for one. */
    private static final String NO_PASSWORD = "no password supplied";

    /** The oldest Postgres the dialect is written for (docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md, Q7). */
    static final int MIN_SERVER_VERSION_NUM = 160000;

    private static void requireSupportedVersion(String name, Database db) throws DuckException, IOException {
        try (Conn c = db.connect(Statements.SERVER);
             Result r = c.execute("SELECT * FROM postgres_query('" + Postgres.ATTACH + "', 'SELECT current_setting(''server_version_num'') AS v')")) {
            List<List<Json.Node>> rows = Collect.json(r, 1);
            int version = Integer.parseInt(((Json.Str) rows.get(0).get(0)).value());
            if (version < MIN_SERVER_VERSION_NUM) {
                throw new IOException("Postgres catalog " + name + " is PostgreSQL " + version / 10000
                        + "; DataCube needs " + MIN_SERVER_VERSION_NUM / 10000 + " or newer");
            }
        } catch (DuckException | IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("could not read Postgres catalog " + name + "'s server version: " + e.getMessage(), e);
        }
    }

    /** A Postgres catalog that could not be attached, by name; whether libpq lacked a password. */
    public static final class AttachFailed extends IOException {
        public final String catalog;
        public final boolean missingPassword;

        AttachFailed(String catalog, String why, boolean missingPassword) {
            super("could not attach Postgres catalog " + catalog + ": " + why);
            this.catalog = catalog;
            this.missingPassword = missingPassword;
        }
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
