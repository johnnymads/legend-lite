package com.legend.warehouse.server;

import com.legend.warehouse.server.duck.Conn;
import java.io.IOException;
import java.util.List;

/**
 * The databases a catalog can attach and pass its SQL through to (docs/DATACUBE_APP_PLAN_2026_10_02.md, A4):
 * one row per kind, as data, and the only place the warehouse names one. A catalog is NATIVE (DuckDB's own
 * tables: per-object grants, the Authorizer, sessions) or ATTACHED to one of these (its SQL is the attached
 * database's, passed through unread; a reader needs USAGE of the whole catalog). Each operation below is an
 * exhaustive switch: a new row does not compile until every operation answers for it.
 */
enum Attachment {

    /** A Postgres database, through DuckDB's postgres extension ({@link Postgres}). */
    POSTGRES("Postgres", "postgres", "postgres_scanner.duckdb_extension", List.of("pg_catalog", "information_schema"));

    /** What an attached catalog's database calls the database it attached. */
    static final String ALIAS = "attached";

    /** Its database type as a Pure connection names it ({@code type: Postgres}): what a model of its tables declares. */
    final String databaseType;
    /** DuckDB's {@code ATTACH ... (TYPE <duckdbType>)}. */
    final String duckdbType;
    /** The extension file a {@code --duckdb-extensions} directory holds for it. */
    final String extensionFile;
    /** The attached database's own schemas: not the user's data, never listed. */
    final List<String> systemSchemas;

    Attachment(String databaseType, String duckdbType, String extensionFile, List<String> systemSchemas) {
        this.databaseType = databaseType;
        this.duckdbType = duckdbType;
        this.extensionFile = extensionFile;
        this.systemSchemas = systemSchemas;
    }

    /** The connection string the attach is made with: the session contract pinned in it (the UTC zone). */
    String connectionString(String catalog, String dsn) {
        return switch (this) {
            case POSTGRES -> Postgres.inSessionZone(catalog, dsn);
        };
    }

    /** The DuckDB statement that runs the client's {@code sql} in the attached database, tagged for a cancel. */
    String passthrough(String sql, String statementId) {
        return switch (this) {
            case POSTGRES -> Postgres.query(sql, statementId);
        };
    }

    /** The DuckDB statement that stops, in the attached database, what {@code statementId} started there. */
    String cancel(String statementId) {
        return switch (this) {
            case POSTGRES -> Postgres.cancel(statementId);
        };
    }

    /** Refuses, by name, an attached server older than the dialect is written for. */
    void requireSupported(String catalog, Conn c) throws IOException {
        switch (this) {
            case POSTGRES -> Postgres.requireSupportedVersion(catalog, c);
        }
    }
}
