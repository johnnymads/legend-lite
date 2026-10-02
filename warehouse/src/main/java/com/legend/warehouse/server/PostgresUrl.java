package com.legend.warehouse.server;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A Postgres catalog written the way {@code psql} takes a database, {@code postgresql://bob@db:5432/shop}
 * (docs/DATACUBE_APP_PLAN_2026_10_02.md, leg A1): named after its database, and read as the libpq
 * key=value connection string a {@code --postgres} catalog is attached with. A password left out is
 * libpq's to find ({@code ~/.pgpass}, {@code PGPASSWORD}); every statement is bounded by
 * {@link #DEFAULT_TIMEOUT} unless the URL sets its own {@code options}.
 */
record PostgresUrl(String catalog, String dsn) {

    /** Postgres stops any statement past this ({@code statement_timeout}), whatever happens to a cancel. */
    static final String DEFAULT_TIMEOUT = "-c statement_timeout=60000";

    static boolean isUrl(String arg) {
        return arg.startsWith("postgresql://") || arg.startsWith("postgres://");
    }

    static PostgresUrl parse(String url) {
        URI u;
        try {
            u = new URI(url);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("not a Postgres URL: " + e.getMessage());
        }
        String path = u.getRawPath();
        if (u.getRawAuthority() != null && u.getHost() == null) {
            // several hosts (h1,h2) or a malformed one: java.net.URI reads them as a registry name
            throw new IllegalArgumentException("one host per Postgres URL: " + u.getRawAuthority());
        }
        if (path == null || path.length() < 2 || path.indexOf('/', 1) >= 0) {
            throw new IllegalArgumentException("a Postgres URL names its database, as postgresql://user@host:5432/db");
        }
        String database = decode(path.substring(1));
        if (!Catalogs.validName(database)) {
            throw new IllegalArgumentException("the database '" + database + "' is not a catalog name ([a-z][a-z0-9_]*):"
                    + " name it with --postgres NAME=DSN");
        }
        Map<String, String> params = new LinkedHashMap<>();
        if (u.getHost() != null) params.put("host", u.getHost().replaceAll("^\\[|\\]$", ""));
        if (u.getPort() != -1) params.put("port", Integer.toString(u.getPort()));
        params.put("dbname", database);
        String userInfo = u.getRawUserInfo();
        if (userInfo != null) {
            int colon = userInfo.indexOf(':');
            params.put("user", decode(colon < 0 ? userInfo : userInfo.substring(0, colon)));
            if (colon >= 0) params.put("password", decode(userInfo.substring(colon + 1)));
        }
        String query = u.getRawQuery();
        if (query != null) {
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                if (eq <= 0) throw new IllegalArgumentException("a Postgres URL parameter is key=value: " + pair);
                String key = decode(pair.substring(0, eq));
                if (params.containsKey(key)) throw new IllegalArgumentException("the URL gives '" + key + "' twice");
                params.put(key, decode(pair.substring(eq + 1)));
            }
        }
        params.putIfAbsent("options", DEFAULT_TIMEOUT);
        return new PostgresUrl(database, keyValues(params));
    }

    /** The connection string with {@code password} added: what the terminal was asked for. */
    static String withPassword(String dsn, char[] password) {
        return dsn + " password=" + quote(new String(password));
    }

    private static String keyValues(Map<String, String> params) {
        StringBuilder b = new StringBuilder();
        for (Map.Entry<String, String> e : params.entrySet()) {
            if (!b.isEmpty()) b.append(' ');
            b.append(e.getKey()).append('=').append(quote(e.getValue()));
        }
        return b.toString();
    }

    /** A libpq connection-string value: single-quoted, its quotes and backslashes escaped. */
    private static String quote(String value) {
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }

    private static String decode(String s) {
        return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
