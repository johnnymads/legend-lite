// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

import com.legend.sql.OutputCol;
import com.legend.sql.SqlExpr;
import com.legend.sql.SqlSelect;
import com.legend.sql.SqlSource;

import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * A star spelled out: the columns {@code *}, {@code t.*} or {@code t.* EXCLUDE (...)} stand for, from the
 * sources a select's FROM names directly -- each one's declared outputs, in FROM order. For a pass that must
 * name what a star carries: a column read by its stored type ({@link StoredReads}), a database with no star
 * exclusion ({@link StarExceptToColumns}).
 */
final class Stars {

    private Stars() {
    }

    /** The sources a select's FROM names directly, in order: through joins, not into them. */
    static List<SqlSource> sources(SqlSource from) {
        List<SqlSource> out = new ArrayList<>();
        collect(from, out);
        return out;
    }

    private static void collect(SqlSource s, List<SqlSource> out) {
        if (s instanceof SqlSource.Join j) {
            collect(j.left(), out);
            collect(j.right(), out);
        } else {
            out.add(s);
        }
    }

    /** The columns {@code *} (table null) or {@code table.*} stands for, less {@code except}, each through
     *  {@code reference} (the identity, or a read). */
    static List<SqlSelect.Projection> columns(List<SqlSource> leaves, @com.legend.base.Nullable String table,
            List<String> except, UnaryOperator<SqlExpr> reference) {
        List<SqlSelect.Projection> out = new ArrayList<>();
        for (SqlSource l : leaves) {
            // a FROM-less select has no columns to spell
            if (l instanceof SqlSource.Dual || table != null && !table.equals(l.alias())) {
                continue;
            }
            for (OutputCol oc : l.outputs()) {
                if (!except.contains(oc.name())) {
                    out.add(new SqlSelect.Projection(reference.apply(SqlExpr.Column.of(l.alias(), oc)), null, null));
                }
            }
        }
        return out;
    }
}
