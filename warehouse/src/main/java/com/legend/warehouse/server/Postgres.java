package com.legend.warehouse.server;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
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

    /**
     * THE session zone of every Postgres connection a catalog makes: UTC, as Postgres's own
     * {@code -c TimeZone} option. The platform's temporal contract is naive UTC (legend-lite's Postgres
     * dialect sets the same zone where it holds the connection, {@code Postgres.sessionSetup}); a
     * {@code timestamptz} column then reads as its UTC instant -- its year and month, a comparison with
     * a timestamp literal -- whatever the server's configuration says (docs/DATACUBE_APP_PLAN_2026_10_02.md,
     * leg B). Neither DuckDB's extension nor libpq sets it (measured 2026-10-02: the zone came from the
     * server's configuration file).
     */
    static final String SESSION_ZONE = "UTC";

    private static final Pattern TIME_ZONE_OPTION =
            Pattern.compile("(?i)(?:^|\\s)(?:-c\\s*|--)timezone=(\\S*)");

    /**
     * The connection string a catalog attaches with: {@code dsn} (libpq key=value pairs, or a
     * {@code postgresql://} URL, read into them) as key=value pairs, with {@link #SESSION_ZONE} added to its
     * {@code options} after any option it already gives. A DSN that sets another zone is refused, by name:
     * its catalog would read zoned timestamps in that zone.
     */
    static String inSessionZone(String catalog, String dsn) {
        Map<String, String> params = PostgresUrl.isUrl(dsn.strip()) ? PostgresUrl.params(dsn.strip()) : keyValues(catalog, dsn);
        String options = params.getOrDefault("options", "");
        Matcher m = TIME_ZONE_OPTION.matcher(options);
        if (m.find()) {
            if (!m.group(1).equalsIgnoreCase(SESSION_ZONE)) {
                throw new IllegalArgumentException("Postgres catalog " + catalog + " sets TimeZone=" + m.group(1)
                        + " in its options; a catalog reads in " + SESSION_ZONE + ": remove it");
            }
        } else {
            params.put("options", (options.isBlank() ? "" : options.strip() + " ") + "-c TimeZone=" + SESSION_ZONE);
        }
        return PostgresUrl.keyValues(params);
    }

    /**
     * A libpq key=value connection string's pairs, in order, as libpq reads them (fe-connect.c
     * {@code conninfo_parse}): {@code key = value}, a value bare up to white space or single-quoted, a
     * backslash escaping the next character in either. A key given twice keeps its last value, as in libpq.
     */
    static Map<String, String> keyValues(String catalog, String dsn) {
        Map<String, String> out = new LinkedHashMap<>();
        int i = 0;
        int n = dsn.length();
        while (true) {
            while (i < n && Character.isWhitespace(dsn.charAt(i))) i++;
            if (i >= n) return out;
            int keyStart = i;
            while (i < n && dsn.charAt(i) != '=' && !Character.isWhitespace(dsn.charAt(i))) i++;
            String key = dsn.substring(keyStart, i);
            while (i < n && Character.isWhitespace(dsn.charAt(i))) i++;
            if (key.isEmpty() || i >= n || dsn.charAt(i) != '=') {
                throw new IllegalArgumentException("Postgres catalog " + catalog
                        + ": its connection string is not key=value pairs (at '" + (key.isEmpty() ? "=" : key) + "')");
            }
            i++;
            while (i < n && Character.isWhitespace(dsn.charAt(i))) i++;
            StringBuilder value = new StringBuilder();
            if (i < n && dsn.charAt(i) == '\'') {
                i++;
                while (true) {
                    if (i >= n) {
                        throw new IllegalArgumentException("Postgres catalog " + catalog
                                + ": its connection string has an unterminated quoted value for '" + key + "'");
                    }
                    char ch = dsn.charAt(i++);
                    if (ch == '\'') break;
                    if (ch == '\\' && i < n) ch = dsn.charAt(i++);
                    value.append(ch);
                }
            } else {
                while (i < n && !Character.isWhitespace(dsn.charAt(i))) {
                    char ch = dsn.charAt(i++);
                    if (ch == '\\' && i < n) ch = dsn.charAt(i++);
                    value.append(ch);
                }
            }
            out.remove(key);
            out.put(key, value.toString());
        }
    }

    /** A libpq connection-string value: single-quoted, its quotes and backslashes escaped. */
    static String quote(String value) {
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }

    /** The comment a statement's Postgres query leads with; only ever a server-made statement id. */
    static String tag(String statementId) {
        if (!STATEMENT_ID.matcher(statementId).matches()) {
            throw new IllegalArgumentException("not a statement id: " + statementId);
        }
        return "/* wh:" + statementId + " */";
    }
}
