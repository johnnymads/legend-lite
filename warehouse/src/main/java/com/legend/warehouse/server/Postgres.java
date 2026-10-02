package com.legend.warehouse.server;

import java.util.regex.Pattern;

/**
 * A Postgres catalog (docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md §Q1): an in-memory DuckDB database that
 * has loaded DuckDB's {@code postgres} extension and attached one Postgres database, READ_ONLY, before it
 * was locked down. The client sends POSTGRES SQL, one SELECT; the server runs it there, unread, through
 * {@code postgres_query}, and answers its rows in the API's formats like any DuckDB result.
 *
 * <p>WHO MAY READ WHAT: DuckDB cannot parse Postgres SQL, so the {@link Authorizer} does not run. The
 * warehouse grants a whole catalog ({@code GRANT USAGE ON CATALOG c TO r}; owners need none), and the
 * Postgres LOGIN ROLE IN THE DSN IS THE DATA SECURITY BOUNDARY: every user of the catalog reads what that
 * role may read. Give it SELECT on what the catalog should show and nothing else; the READ_ONLY attach
 * (DuckDB opens each query in a READ ONLY transaction) and the prepared statement (one statement only)
 * are a second wall, not the first.
 *
 * <p>CANCEL: DuckDB's interrupt does not reach Postgres (measured: the query runs to completion). Each
 * statement leads with a comment {@code /* wh:<statementId> *}{@code /}; a cancel or a timeout cancels
 * the Postgres backends whose query carries it, from a second connection. The statement id is the
 * server's own UUID, never the client's text. Postgres shows the first {@code track_activity_query_size}
 * bytes (1024 by default) of a query, after DuckDB's {@code COPY (SELECT <columns> FROM (} prefix: a
 * result with a very long column list may push the tag out of sight. The backstop is in the DSN:
 * {@code options='-c statement_timeout=<ms>'} bounds every query whatever happens to the cancel.
 */
final class Postgres {

    private Postgres() {
    }

    /** What each Postgres catalog's database calls its attached Postgres database. */
    static final String ATTACH = "pg";

    /** The extension file a {@code --duckdb-extensions} directory holds. */
    static final String EXTENSION_FILE = "postgres_scanner.duckdb_extension";

    private static final Pattern STATEMENT_ID = Pattern.compile("[0-9a-f-]{36}");

    /**
     * The DuckDB statement that runs the client's Postgres {@code sql}: tagged with the statement id, inside
     * one string literal (its quotes doubled). A trailing {@code ;} is refused (the text is spliced into
     * DuckDB's {@code COPY (SELECT ... FROM (<sql>) ...)}); a second statement is Postgres's to refuse.
     */
    static String query(String sql, String statementId) {
        String body = sql.stripTrailing();
        if (body.isBlank()) throw new IllegalArgumentException("the statement is empty");
        if (body.endsWith(";")) {
            throw new IllegalArgumentException("a Postgres catalog runs one SELECT, spliced into a subquery:"
                    + " remove the trailing ';'");
        }
        if (body.indexOf('\0') >= 0) throw new IllegalArgumentException("the statement contains a NUL character");
        // the trailing newline ends a final line comment, and the empty block comment keeps DuckDB from
        // trimming that newline away: otherwise "-- ..." would swallow DuckDB's closing parenthesis
        return "SELECT * FROM postgres_query('" + ATTACH + "', '" + tag(statementId) + " "
                + body.replace("'", "''") + "\n/**/')";
    }

    /**
     * The DuckDB statement that cancels, in Postgres, every query tagged with {@code statementId} that the
     * catalog's login role runs (a role may cancel its own backends), but its own.
     */
    static String cancel(String statementId) {
        return "SELECT * FROM postgres_query('" + ATTACH + "', 'SELECT pg_cancel_backend(pid) FROM pg_stat_activity"
                + " WHERE strpos(query, ''" + tag(statementId) + "'') > 0"
                + " AND pid <> pg_backend_pid() AND usename = current_user')";
    }

    /** The comment a statement's Postgres query leads with; only ever a server-made statement id. */
    static String tag(String statementId) {
        if (!STATEMENT_ID.matcher(statementId).matches()) {
            throw new IllegalArgumentException("not a statement id: " + statementId);
        }
        return "/* wh:" + statementId + " */";
    }
}
