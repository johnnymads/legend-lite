package com.legend.sql.dialect;

import com.legend.compiler.element.type.ExprType;
import com.legend.plan.UpstreamRelationType;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A Database built from DuckDB's own catalog (T2) is real legend-lite: it compiles, and the
 * COMPILER types each column -- every DuckDB type DESCRIBE reports, read by the DuckDB dialect.
 */
class CatalogModelTest {

    /** The compiler reports Variant by its path. */
    private static final String VARIANT = com.legend.compiler.element.type.PlatformTypes.VARIANT;

    private static final Map<String, String> EXPECTED = new LinkedHashMap<>();

    static {
        EXPECTED.put("VARCHAR", "String");
        EXPECTED.put("BOOLEAN", "Boolean");
        EXPECTED.put("TINYINT", "Integer");
        EXPECTED.put("SMALLINT", "Integer");
        EXPECTED.put("INTEGER", "Integer");
        EXPECTED.put("BIGINT", "Integer");
        EXPECTED.put("UTINYINT", "Integer");
        EXPECTED.put("USMALLINT", "Integer");
        EXPECTED.put("UINTEGER", "Integer");
        EXPECTED.put("UBIGINT", "Decimal");
        EXPECTED.put("HUGEINT", "Decimal");
        EXPECTED.put("FLOAT", "Float");
        EXPECTED.put("DOUBLE", "Float");
        EXPECTED.put("DECIMAL(9,2)", "Decimal");
        EXPECTED.put("DATE", "StrictDate");
        EXPECTED.put("TIMESTAMP", "DateTime");
        EXPECTED.put("TIMESTAMP_NS", "DateTime");
        EXPECTED.put("TIMESTAMP WITH TIME ZONE", "DateTime");
        EXPECTED.put("JSON", VARIANT);
        EXPECTED.put("STRUCT(a INTEGER, b VARCHAR)", VARIANT);
        EXPECTED.put("INTEGER[]", VARIANT);
        EXPECTED.put("MAP(VARCHAR, INTEGER)", VARIANT);
        EXPECTED.put("TIME", "String");
        EXPECTED.put("UUID", "String");
        EXPECTED.put("INTERVAL", "String");
        EXPECTED.put("ENUM('a', 'b')", "String");
    }

    private static final String WRAPPER = """
            ###Connection
            RelationalDatabaseConnection t::C { store: t::DB; type: DuckDB; specification: DuckDB { }; auth: Test; }
            ###Runtime
            Runtime t::RT { mappings: []; connections: [ t::DB: [ c: t::C ] ]; }
            """;

    @Test
    void everyDuckDbTypeCompiles_andTheCompilerTypesIt() {
        List<CatalogModel.Column> columns = new java.util.ArrayList<>();
        int i = 0;
        for (String type : EXPECTED.keySet()) {
            columns.add(new CatalogModel.Column("c" + i++, type));
        }
        CatalogModel.Database db = CatalogModel.database("t::DB", null, "T", columns, new DuckDb(), true);
        ExprType root = com.legend.Compiler.resultType(db.text() + WRAPPER, db.accessor());
        List<String> types = UpstreamRelationType.columns(root).stream()
                .map(c -> UpstreamRelationType.typePath(c.type())).toList();
        assertEquals(List.copyOf(EXPECTED.values()), types, db.text());
    }

    @Test
    void aTypeTheDdlCannotSayIsConvertedAtTheSource_named() {
        CatalogModel.Database db = CatalogModel.database("t::DB", "s", "orders", List.of(
                new CatalogModel.Column("id", "BIGINT"),
                new CatalogModel.Column("at", "TIMESTAMP WITH TIME ZONE"),
                new CatalogModel.Column("big", "UBIGINT")), new DuckDb(), true);
        assertEquals(List.of(new CatalogModel.Conversion("at", "CAST(timezone('UTC', \"at\") AS TIMESTAMP)"),
                new CatalogModel.Conversion("big", "CAST(\"big\" AS DECIMAL(20,0))")), db.conversions());
        assertTrue(db.text().contains("Schema s"), db.text());
        assertEquals("#>{t::DB.s.orders}#", db.accessor());
    }

    @Test
    void aNestedColumnIsAVariantAsStored_evenOnAReadOnlySource() {
        CatalogModel.Database db = CatalogModel.database("t::DB", null, "orders", List.of(
                new CatalogModel.Column("items", "STRUCT(sku VARCHAR)[]"),
                new CatalogModel.Column("attrs", "MAP(VARCHAR, INTEGER)")), new DuckDb(), false);
        assertEquals(List.of(), db.conversions());
        assertEquals(List.of(), db.excluded());
        assertTrue(db.text().contains("items SEMISTRUCTURED") && db.text().contains("attrs SEMISTRUCTURED"), db.text());
    }

    @Test
    void aReadOnlySourceLeavesOutWhatItCannotConvert_namingIt() {
        CatalogModel.Database db = CatalogModel.database("t::DB", null, "orders", List.of(
                new CatalogModel.Column("id", "BIGINT"),
                new CatalogModel.Column("at", "TIMESTAMPTZ")), new DuckDb(), false);
        assertEquals(List.of("at"), db.excluded());
        assertEquals(List.of(), db.conversions());
        assertTrue(!db.text().contains("at "), db.text());
        assertThrows(IllegalArgumentException.class, () -> CatalogModel.database("t::DB", null, "T",
                List.of(new CatalogModel.Column("at", "TIMESTAMPTZ")), new DuckDb(), false));
    }

    @Test
    void twoColumnsOneNameApartByCaseAreRefused() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> CatalogModel.database("t::DB", null, "T", List.of(new CatalogModel.Column("a", "INTEGER"),
                        new CatalogModel.Column("A", "INTEGER")), new DuckDb(), true));
        assertTrue(e.getMessage().contains("'A'"), e.getMessage());
    }

    @Test
    void awkwardNamesReadThroughTheAccessor_andRenderAsTheDatabaseSpellsThem() {
        CatalogModel.Database db = CatalogModel.database("t::DB", "my schema", "total \"pnl\" 2024",
                List.of(new CatalogModel.Column("a b", "INTEGER")), new DuckDb(), true);
        assertEquals("#>{t::DB.\"my schema\".\"total \\\"pnl\\\" 2024\"}#", db.accessor());
        ExprType root = com.legend.Compiler.resultType(db.text() + WRAPPER, db.accessor());
        assertEquals(List.of("a b"), UpstreamRelationType.columns(root).stream().map(c -> c.name()).toList());
        String sql = com.legend.Compiler.plan(db.text() + WRAPPER, db.accessor() + "->select(~['a b'])", "t::RT").sql();
        assertTrue(sql.contains("FROM \"my schema\".\"total \"\"pnl\"\" 2024\""), sql);
        for (String name : List.of("select", "a-b", "2024")) {
            CatalogModel.Database k = CatalogModel.database("t::DB", null, name,
                    List.of(new CatalogModel.Column("a", "INTEGER")), new DuckDb(), true);
            assertEquals(List.of("a"), UpstreamRelationType.columns(
                    com.legend.Compiler.resultType(k.text() + WRAPPER, k.accessor())).stream().map(c -> c.name()).toList(),
                    name);
        }
        // upstream splits the accessor on '.': a dotted name cannot be carried
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> CatalogModel.database(
                "t::DB", null, "a.b", List.of(new CatalogModel.Column("a", "INTEGER")), new DuckDb(), true));
        assertTrue(e.getMessage().contains("a.b"), e.getMessage());
    }

    @Test
    void aBlobIsRefused_namingTheColumn() {
        DialectCapability e = assertThrows(DialectCapability.class, () -> CatalogModel.database("t::DB", null, "T",
                List.of(new CatalogModel.Column("payload", "BLOB")), new DuckDb(), true));
        assertTrue(e.getMessage().contains("payload") && e.getMessage().contains("BLOB"), e.getMessage());
    }

    @Test
    void aNameThatIsNotAnIdentifierIsQuoted_withTheLexersEscapes() {
        assertEquals("\"total pnl\"", CatalogModel.ident("total pnl"));
        assertEquals("\"a\\\"b\"", CatalogModel.ident("a\"b"));
        assertEquals("region", CatalogModel.ident("region"));
    }
}
