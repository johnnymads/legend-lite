// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

import com.legend.sql.SqlExpr;
import com.legend.sql.SqlQuery;
import com.legend.sql.SqlRewriter;
import com.legend.sql.SqlSelect;
import com.legend.sql.SqlSource;

import java.util.ArrayList;
import java.util.List;

/**
 * A star exclusion ({@code t.* EXCLUDE (a, b)}, DuckDB's) spelled as the columns it stands for, for a
 * database that has none (Postgres): the source's declared outputs, less the excluded names, in order. The
 * lowering builds one where a pivot over several columns folds them into one key (the Postgres PCT lane,
 * 2026-10-02: every multi-column pivot).
 */
final class StarExceptToColumns extends SqlRewriter {

    @Override
    protected SqlQuery select(SqlSelect s) {
        if (s.projections().stream().noneMatch(p -> p.expr() instanceof SqlExpr.StarExcept)) {
            return s;
        }
        List<SqlSource> leaves = Stars.sources(s.from());
        List<SqlSelect.Projection> ps = new ArrayList<>();
        for (SqlSelect.Projection p : s.projections()) {
            if (p.expr() instanceof SqlExpr.StarExcept se) {
                ps.addAll(Stars.columns(leaves, se.table(), se.except(), c -> c));
            } else {
                ps.add(p);
            }
        }
        return s.withProjections(ps);
    }
}
