package com.legend;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.legend.compiler.element.type.Type;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * A store column's DECLARED type, from the model to the SQL (docs/STORE_TYPES_HOMEWORK_2026_10_02.md).
 *
 * <p>Step 1, the typing (ruled 2026-10-02): a type Pure cannot name -- OTHER, DISTINCT -- is a String;
 * a nested value -- ARRAY, OBJECT, SEMISTRUCTURED -- is a Variant. Until then a table holding one
 * OTHER column did not compile at all, even for a query that never read it (step 0's probe, now
 * these). A milestoning date declared OTHER stays refused: compared as text it would be silently wrong.
 */
class StoreTypesTest {

    private static final String MODEL = """
            ###Pure
            Class s::Host { id: Integer[1]; name: String[0..1]; addr: String[0..1]; }
            ###Relational
            Database s::DB ( Table HOSTS (ID INTEGER PRIMARY KEY, NAME VARCHAR(32), ADDR OTHER,
                TAGS ARRAY, META SEMISTRUCTURED) )
            ###Mapping
            Mapping s::M (
              *s::Host: Relational { ~mainTable [s::DB] HOSTS
                id: HOSTS.ID, name: HOSTS.NAME, addr: HOSTS.ADDR }
            )
            ###Connection
            RelationalDatabaseConnection s::Conn { store: s::DB; type: DuckDB;
              specification: DuckDB { }; auth: Test; }
            ###Runtime
            Runtime s::RT { mappings: [s::M]; connections: [ s::DB: [ c1: s::Conn ] ]; }
            """;

    @Test
    void aTableHoldingAnOtherColumnCompilesThroughTheAccessor() {
        // step 0 pinned "has no scalar Pure type" here, for a query that never read ADDR
        assertTrue(Compiler.plan(MODEL, "#>{s::DB.HOSTS}#->select(~[ID])", "s::RT").sql().contains("ID"));
    }

    @Test
    void aTableHoldingAnOtherColumnCompilesThroughAClassMapping() {
        assertTrue(Compiler.plan(MODEL, "s::Host.all()->project(~[id: h|$h.id])", "s::RT").sql().contains("ID"));
        // and a property mapped TO it is a String property, as declared
        assertTrue(Compiler.plan(MODEL, "s::Host.all()->project(~[addr: h|$h.addr])", "s::RT").sql().contains("ADDR"));
    }

    @Test
    void aTypePureCannotNameIsAStringAndANestedValueIsAVariant() {
        Map<String, String> types = columnTypes("#>{s::DB.HOSTS}#");
        assertEquals("String", types.get("ADDR"), types.toString());
        // the grammar's ARRAY keyword parses to OTHER, as upstream's does (DatabaseProtocolParser,
        // RelationalParseTreeWalker): written in a model it is a type Pure cannot name. A typed
        // Array -- what a database's own catalog yields -- is a Variant (StoreCompilerTypesTest).
        assertEquals("String", types.get("TAGS"), types.toString());
        assertEquals("Variant", types.get("META"), types.toString());
        assertEquals("Integer", types.get("ID"), types.toString());
    }

    @Test
    void aViewOverAnOtherColumnTypesItAsAString() {
        String model = MODEL.replace("META SEMISTRUCTURED) )",
                "META SEMISTRUCTURED)\n    View HOST_ADDRS (id: HOSTS.ID, addr: HOSTS.ADDR) )");
        assertEquals("String", columnTypes(model, "#>{s::DB.HOST_ADDRS}#").get("addr"));
    }

    @Test
    void aMilestoningDateDeclaredOtherIsRefusedByName() {
        String model = """
                ###Relational
                Database s::Hist ( Table PRICES ( milestoning( business(BUS_FROM = FROM_Z, BUS_THRU = THRU_Z) )
                    ID INTEGER PRIMARY KEY, FROM_Z OTHER, THRU_Z DATE ) )
                """;
        RuntimeException e = assertThrows(RuntimeException.class, () -> Compiler.compileModel(model));
        assertTrue(String.valueOf(e.getMessage()).contains("milestoning column 'FROM_Z'"), e.getMessage());
    }

    private static Map<String, String> columnTypes(String query) {
        return columnTypes(MODEL, query);
    }

    private static Map<String, String> columnTypes(String model, String query) {
        Type.RelationType rt = Type.schemaView(Compiler.compileQuery(model, query).info().type());
        Map<String, String> out = new LinkedHashMap<>();
        for (Type.Column c : rt.columns()) {
            out.put(c.name(), c.type() instanceof Type.ClassType ct ? ct.fqn().replaceAll(".*::", "")
                    : c.type() instanceof Type.Primitive p ? p.typeName() : c.type().toString());
        }
        return out;
    }
}
