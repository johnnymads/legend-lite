// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package org.finos.legend.lite.pct.extension;

import com.legend.testing.EmbeddedPostgres;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * The database a PCT lane runs its suite on, chosen by the target ({@code LEGENDLITE_PCT_BACKEND}, an
 * environment variable: it must survive the fork into the test JVM), one connection per executed
 * expression:
 *
 * <ul>
 *   <li>unset: a fresh in-memory DuckDB;</li>
 *   <li>{@code h2}: a fresh in-memory H2, with the portability sweep's session settings;</li>
 *   <li>{@code postgres}: this JVM's embedded Postgres 16 (leg P2), a new session on its database.</li>
 * </ul>
 *
 * Session settings are the dialect's, applied at the platform's connection seam
 * ({@code SqlDialect.sessionSetup}, from {@code Compiler.dialectOf}); this only opens the connection.
 */
final class PctBackend {

    private PctBackend() {
    }

    static Connection connect() throws SQLException {
        String backend = System.getenv("LEGENDLITE_PCT_BACKEND");
        if (backend == null) {
            return DriverManager.getConnection("jdbc:duckdb:");
        }
        return switch (backend) {
            case "h2" -> DriverManager.getConnection("jdbc:h2:mem:" + com.legend.exec.H2Settings.SETTINGS, "sa", "");
            case "postgres" -> DriverManager.getConnection(EmbeddedPostgres.shared().jdbcUrl("postgres"));
            default -> throw new IllegalStateException("LEGENDLITE_PCT_BACKEND=" + backend + ": a PCT lane runs on"
                    + " DuckDB (unset), h2 or postgres");
        };
    }
}
