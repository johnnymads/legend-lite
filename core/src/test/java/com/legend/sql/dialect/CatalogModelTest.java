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
                new CatalogModel.Column("items", "STRUCT(sku VARCHAR)[]"),
                new CatalogModel.Column("big", "UBIGINT")), new DuckDb(), true);
        assertEquals(List.of(new CatalogModel.Conversion("items", "to_json(\"items\")"),
                new CatalogModel.Conversion("big", "CAST(\"big\" AS DECIMAL(20,0))")), db.conversions());
        assertTrue(db.text().contains("Schema s"), db.text());
        assertTrue(db.text().contains("items SEMISTRUCTURED"), db.text());
        assertEquals("#>{t::DB.s.orders}#", db.accessor());
    }

    @Test
    void aReadOnlySourceLeavesOutWhatItCannotConvert_namingIt() {
        CatalogModel.Database db = CatalogModel.database("t::DB", null, "orders", List.of(
                new CatalogModel.Column("id", "BIGINT"),
                new CatalogModel.Column("items", "STRUCT(sku VARCHAR)[]")), new DuckDb(), false);
        assertEquals(List.of("items"), db.excluded());
        assertEquals(List.of(), db.conversions());
        assertTrue(!db.text().contains("items"), db.text());
        assertThrows(IllegalArgumentException.class, () -> CatalogModel.database("t::DB", null, "T",
                List.of(new CatalogModel.Column("items", "INTEGER[]")), new DuckDb(), false));
    }

    @Test
    void twoColumnsOneNameApartByCaseAreRefused() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> CatalogModel.database("t::DB", null, "T", List.of(new CatalogModel.Column("a", "INTEGER"),
                        new CatalogModel.Column("A", "INTEGER")), new DuckDb(), true));
        assertTrue(e.getMessage().contains("'A'"), e.getMessage());
    }

    @Test
    void anAwkwardColumnNameReadsThroughTheAccessor_anAwkwardTableNameIsRefused() {
        CatalogModel.Database db = CatalogModel.database("t::DB", "s", "T",
                List.of(new CatalogModel.Column("total \"pnl\"", "INTEGER")), new DuckDb(), true);
        ExprType root = com.legend.Compiler.resultType(db.text() + WRAPPER, db.accessor());
        assertEquals(List.of("total \"pnl\""),
                UpstreamRelationType.columns(root).stream().map(c -> c.name()).toList());
        // upstream splits the accessor on '.', unquoted: only a plain identifier survives it
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> CatalogModel.database(
                "t::DB", null, "my table", List.of(new CatalogModel.Column("a", "INTEGER")), new DuckDb(), true));
        assertTrue(e.getMessage().contains("my table"), e.getMessage());
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
