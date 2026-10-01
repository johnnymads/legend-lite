// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

import java.util.ArrayList;
import java.util.List;

/**
 * A Pure Database built from a database's own CATALOG (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md,
 * T2) -- the shape upstream's {@code pure/v1/utilities/database/schemaExploration} builds from
 * JDBC metadata, here from the STRUCTURED catalog rows a caller read (DuckDB's
 * {@code duckdb_columns()} joined to {@code duckdb_types()}: no type string is parsed; the user,
 * 2026-10-01). Each column's type is read by the database's own dialect
 * ({@link SqlDialect#catalogType}); a column whose value must be converted at the source
 * comes back with its conversion, for the caller to apply where the source allows it. The
 * browser's copy of this (a TypeScript type table) is deleted: the compiler decides.
 */
public final class CatalogModel {

    private CatalogModel() {
    }

    /**
     * One catalog column, as the database's catalog describes it.
     *
     * @param dataType    the column's own type name, as the catalog writes it ({@code DECIMAL(18,3)},
     *                    {@code JSON}, a user type's name): for an ALIAS and for messages, never parsed
     * @param logicalType its canonical type ({@code duckdb_types().logical_type}), or null when the
     *                    catalog names none
     * @param precision   a DECIMAL's precision, as a number; null for any other type
     * @param scale       a DECIMAL's scale, as a number; null for any other type
     */
    public record Column(String name, String dataType, @com.legend.base.Nullable String logicalType,
            @com.legend.base.Nullable Integer precision, @com.legend.base.Nullable Integer scale) {
    }

    /** A column's conversion at the source: SQL over the column, e.g. {@code to_json("items")}. */
    public record Conversion(String column, String sql) {
    }

    /**
     * The Database element's text; the relation accessor that reads the table
     * ({@code #>{db.schema.table}#}); the conversions its declarations need; and the columns
     * left out because their source cannot convert them.
     */
    public record Database(String text, String accessor, List<Conversion> conversions, List<String> excluded) {
    }

    /**
     * {@code ###Relational Database <path> ( [Schema s (] Table t ( col TYPE, ... ) [)] )}.
     * A column of a type the dialect cannot declare is refused, naming the column; so are two
     * columns one name apart only by case (the database would not tell them apart either).
     *
     * @param convertible whether the source can apply a conversion (an upload rewritten at
     *                    ingest can; a read-only table cannot). When it cannot, a column that
     *                    needs one is left out of the Database and named in {@code excluded}.
     */
    public static Database database(String path, @com.legend.base.Nullable String schema, String table,
            List<Column> columns, SqlDialect dialect, boolean convertible) {
        if (columns.isEmpty()) {
            throw new IllegalArgumentException("the table '" + table + "' has no columns");
        }
        accessorName("schema", schema);
        accessorName("table", table);
        List<String> lines = new ArrayList<>();
        List<Conversion> conversions = new ArrayList<>();
        List<String> excluded = new ArrayList<>();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (Column c : columns) {
            if (!seen.add(c.name().toLowerCase(java.util.Locale.ROOT))) {
                throw new IllegalArgumentException("the table '" + table + "' has two columns named '"
                        + c.name() + "'");
            }
            CatalogType t;
            try {
                t = dialect.catalogType(c);
            } catch (DialectCapability e) {
                throw new DialectCapability("column '" + c.name() + "': " + e.getMessage());
            }
            if (t.conversion() != null && !convertible) {
                excluded.add(c.name());
                continue;
            }
            lines.add(ident(c.name()) + " " + t.declared());
            if (t.conversion() != null) {
                conversions.add(new Conversion(c.name(),
                        t.conversion().replace("%s", sqlIdent(c.name()))));
            }
        }
        if (lines.isEmpty()) {
            throw new IllegalArgumentException("every column of '" + table
                    + "' needs a conversion its source cannot apply: " + String.join(", ", excluded));
        }
        String tableBlock = "Table " + ident(table) + "\n    (\n        "
                + String.join(",\n        ", lines) + "\n    )";
        String body = schema == null ? "    " + tableBlock
                : "    Schema " + ident(schema) + "\n    (\n        "
                        + tableBlock.replace("\n", "\n    ") + "\n    )";
        String accessor = "#>{" + path + "." + (schema == null ? "" : ident(schema) + ".") + ident(table) + "}#";
        return new Database("###Relational\nDatabase " + path + "\n(\n" + body + "\n)\n", accessor,
                List.copyOf(conversions), List.copyOf(excluded));
    }

    /**
     * A schema or table name the accessor can carry, quoted when it is not a plain identifier.
     * Upstream reads {@code #>{db.schema.table}#} by splitting on {@code .}, and the accessor's
     * grammar refuses {@code ( ) { } | ; =} and a line break: a name with any of those is refused.
     */
    private static void accessorName(String what, @com.legend.base.Nullable String name) {
        if (name != null && name.chars().anyMatch(ch -> ".(){}|;=\n".indexOf(ch) >= 0)) {
            throw new IllegalArgumentException("the " + what + " name '" + name
                    + "' cannot be read through #>{db." + what + "}#: a '.', '(', ')', '{', '}', '|', ';',"
                    + " '=' or line break cannot be carried there");
        }
    }

    /** A name as a Pure Database identifier: bare when it is one, else quoted with the
     *  lexer's backslash escapes (a doubled quote would end the token). */
    static String ident(String name) {
        if (name.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            return name;
        }
        return "\"" + name.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    /** A name as a SQL identifier, always quoted, for a conversion's column reference. */
    private static String sqlIdent(String name) {
        return "\"" + name.replace("\"", "\"\"") + "\"";
    }
}
