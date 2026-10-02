package com.legend.warehouse.server;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.legend.warehouse.server.duck.Database;
import com.legend.warehouse.server.duck.DuckLibrary;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Postgres catalogs without a Postgres (the live checks are WarehousePostgresLiveTest): the command line,
 * the SQL a statement and a cancel become, and the catalog-level grant.
 */
class PostgresCatalogTest {

    static final String ID = "0b6f3c2e-1d2a-4c5b-9e8f-7a6b5c4d3e2f";

    // -- the command line ------------------------------------------------------------------------

    @Test
    void postgresCatalogsAreNamedBesideDuckDbOnes() throws Exception {
        WarehouseServer.Config c = WarehouseServer.parse(new String[] {
            "--catalog", "lake", "--postgres", "sales=host=db port=5432 dbname=sales user=reader",
            "--postgres", "hr=postgresql://reader@db/hr?options=-c%20statement_timeout%3D60000",
            "--duckdb-extensions", "/opt/ext"});
        assertEquals(List.of("lake"), c.catalogs());
        assertEquals(Map.of("sales", "host=db port=5432 dbname=sales user=reader",
                "hr", "postgresql://reader@db/hr?options=-c%20statement_timeout%3D60000"), c.postgres());
        assertEquals(Path.of("/opt/ext"), c.duckdbExtensions());
        // without --catalog, main is still made: grants are managed from a DuckDB catalog
        WarehouseServer.Config d = WarehouseServer.parse(new String[] {
            "--postgres", "sales=host=db", "--duckdb-extensions", "/opt/ext"});
        assertEquals(List.of("main"), d.catalogs());
        assertTrue(WarehouseServer.parse(new String[] {}).postgres().isEmpty());
    }

    @Test
    void theCommandLineRefusesWhatCannotWork() {
        for (String[] args : List.of(
                new String[] {"--postgres", "sales", "--duckdb-extensions", "/x"},          // no DSN
                new String[] {"--postgres", "sales=", "--duckdb-extensions", "/x"},
                new String[] {"--postgres", "Sales=host=db", "--duckdb-extensions", "/x"},  // a bad name
                new String[] {"--postgres", "a=host=db", "--postgres", "a=host=db2", "--duckdb-extensions", "/x"},
                new String[] {"--catalog", "a", "--postgres", "a=host=db", "--duckdb-extensions", "/x"},
                new String[] {"--postgres", "main=host=db", "--duckdb-extensions", "/x"},  // main is made
                new String[] {"--postgres", "a=host=db"},   // on the JVM the extension's directory is required
                new String[] {"--postgres"})) {
            assertThrows(IllegalArgumentException.class, () -> WarehouseServer.parse(args), String.join(" ", args));
        }
    }

    @Test
    void aMissingExtensionFailsTheStartNamingWhereItLooked() throws Exception {
        DuckLibrary.load(null);
        Path dir = Files.createTempDirectory("pg-no-ext");
        var e = assertThrows(java.io.IOException.class,
                () -> new Catalogs(dir, List.of("main"), Map.of("sales", "host=nowhere password=secret"), dir));
        assertTrue(e.getMessage().contains(Postgres.EXTENSION_FILE), e.getMessage());
        assertFalse(e.getMessage().contains("secret"), "the DSN is never echoed: " + e.getMessage());
    }

    // -- the SQL ----------------------------------------------------------------------------------

    @Test
    void aStatementIsOneLiteralTaggedWithItsId() {
        assertEquals("SELECT * FROM postgres_query('pg', '/* wh:" + ID + " */ SELECT 1 AS a\n/**/')",
                Postgres.query("SELECT 1 AS a", ID));
        // quotes are doubled: the client's text never leaves the literal
        assertEquals("SELECT * FROM postgres_query('pg', '/* wh:" + ID + " */ SELECT ''it''''s'') --\n/**/')",
                Postgres.query("SELECT 'it''s') --", ID));
        assertEquals("SELECT * FROM postgres_query('pg', '/* wh:" + ID + " */ SELECT 1\n/**/')",
                Postgres.query("SELECT 1 \n\t ", ID));
    }

    @Test
    void aTrailingSemicolonAnEmptyStatementAndNulAreRefused() {
        for (String sql : List.of("SELECT 1;", "SELECT 1 ;  \n", "SELECT 1; SELECT 2;", "", "   ", "SELECT '\0'")) {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> Postgres.query(sql, ID), sql);
            if (sql.strip().endsWith(";")) assertTrue(e.getMessage().contains("trailing ';'"), e.getMessage());
        }
    }

    @Test
    void aCancelNamesOnlyTheServersOwnStatementId() {
        assertEquals("SELECT * FROM postgres_query('pg', 'SELECT pg_cancel_backend(pid) FROM pg_stat_activity"
                + " WHERE strpos(query, ''/* wh:" + ID + " */'') > 0"
                + " AND pid <> pg_backend_pid() AND usename = current_user')", Postgres.cancel(ID));
        for (String bad : List.of("x", "%", "' OR true --", ID + "'", ID.toUpperCase(), ID + " */")) {
            assertThrows(IllegalArgumentException.class, () -> Postgres.cancel(bad), bad);
            assertThrows(IllegalArgumentException.class, () -> Postgres.query("SELECT 1", bad), bad);
        }
    }

    // -- the grant --------------------------------------------------------------------------------

    @Test
    void usageOnACatalogParses() {
        assertEquals(new AdminStatements.Usage(true, "sales", "carol"),
                AdminStatements.parse("GRANT USAGE ON CATALOG sales TO carol", "main"));
        assertEquals(new AdminStatements.Usage(false, "sales", "analysts"),
                AdminStatements.parse("revoke usage on catalog \"sales\" from analysts;", "main"));
        for (String sql : List.of("GRANT USAGE ON CATALOG sales FROM carol", "REVOKE USAGE ON CATALOG sales TO carol",
                "GRANT USAGE ON SCHEMA sales TO carol", "GRANT USAGE ON CATALOG a.b TO carol",
                "GRANT USAGE ON CATALOG sales TO carol, dave", "GRANT USAGE ON CATALOG sales")) {
            assertNull(AdminStatements.parse(sql, "main"), sql);
        }
    }

    @Test
    void usageGrantsTheCatalogAndNoObjectInIt() throws Exception {
        DuckLibrary.load(null);
        try (Database system = Database.open(null)) {
            Grants g = new Grants(system);
            try {
                g.createRole("analysts");
                g.grantRole("analysts", "carol");
                g.grantSelect(Grants.Grant.usage("Sales", "analysts"));
                assertTrue(g.canUseCatalog(g.principals("carol"), "sales"));
                assertTrue(g.canUseCatalog(g.principals("analysts"), "SALES"));
                assertFalse(g.canUseCatalog(g.principals("dave"), "sales"));
                assertFalse(g.canUseCatalog(g.principals("carol"), "main"));
                // USAGE is not SELECT on anything, there or anywhere
                assertFalse(g.canSelect(g.principals("carol"), "sales", "", ""));
                assertFalse(g.canSelect(g.principals("carol"), "sales", "main", "t"));
                assertFalse(g.canSeeSchema(g.principals("carol"), "sales", ""));
                // a schema grant is not USAGE of the catalog
                g.grantSelect(new Grants.Grant("main", "pub", "", "dave"));
                assertFalse(g.canUseCatalog(Set.of("dave"), "main"));
                g.revokeSelect(Grants.Grant.usage("sales", "analysts"));
                assertFalse(g.canUseCatalog(g.principals("carol"), "sales"));
            } finally {
                g.close();
            }
        }
    }
}
