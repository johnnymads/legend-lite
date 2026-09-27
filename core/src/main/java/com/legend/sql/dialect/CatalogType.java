// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

/**
 * A database column type, as its CATALOG reports it, read by the database's own dialect
 * into what a Pure Database declares (docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md, T2).
 *
 * @param declared   the store type the Database declares for the column ({@code VARCHAR(4096)},
 *                   {@code DECIMAL(20,0)}, {@code SEMISTRUCTURED})
 * @param conversion the SQL, over {@code %s} (the column), that turns the stored value into the
 *                   declared type AT THE SOURCE -- {@code to_json(%s)} for a nested value -- or
 *                   null when the stored value already is one; a source that cannot convert
 *                   (a read-only table) must not declare the column
 */
public record CatalogType(String declared, @com.legend.base.Nullable String conversion) {
}
