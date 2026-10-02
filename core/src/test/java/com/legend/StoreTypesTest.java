package com.legend;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * A store column's DECLARED type, from the model to the SQL (docs/STORE_TYPES_HOMEWORK_2026_10_02.md).
 *
 * <p>Step 0, the probe: today a table holding one OTHER column does not compile at all -- the first
 * reference to it throws, even when no query reads that column -- through the relation accessor and
 * through a class mapping alike (StoreCompiler.columnType). Step 1 types OTHER as String and turns
 * these into what then holds.
 */
class StoreTypesTest {

    private static final String MODEL = """
            ###Pure
            Class s::Host { id: Integer[1]; name: String[0..1]; }
            ###Relational
            Database s::DB ( Table HOSTS (ID INTEGER PRIMARY KEY, NAME VARCHAR(32), ADDR OTHER) )
            ###Mapping
            Mapping s::M (
              *s::Host: Relational { ~mainTable [s::DB] HOSTS
                id: HOSTS.ID, name: HOSTS.NAME }
            )
            ###Connection
            RelationalDatabaseConnection s::Conn { store: s::DB; type: DuckDB;
              specification: DuckDB { }; auth: Test; }
            ###Runtime
            Runtime s::RT { mappings: [s::M]; connections: [ s::DB: [ c1: s::Conn ] ]; }
            """;

    @Test
    void todayTheAccessorRefusesATableHoldingAnOtherColumnItNeverReads() {
        RuntimeException e = assertThrows(RuntimeException.class,
                () -> Compiler.plan(MODEL, "#>{s::DB.HOSTS}#->select(~[ID])", "s::RT"));
        assertTrue(String.valueOf(e.getMessage()).contains("has no scalar Pure type"), e.getMessage());
    }

    @Test
    void todayAClassMappingRefusesATableHoldingAnOtherColumnItNeverMaps() {
        RuntimeException e = assertThrows(RuntimeException.class,
                () -> Compiler.plan(MODEL, "s::Host.all()->project(~[id: h|$h.id])", "s::RT"));
        assertTrue(String.valueOf(e.getMessage()).contains("has no scalar Pure type"), e.getMessage());
    }
}
