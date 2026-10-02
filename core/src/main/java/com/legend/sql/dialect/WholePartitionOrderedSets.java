// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

import com.legend.sql.SqlAgg;
import com.legend.sql.SqlExpr;
import com.legend.sql.SqlFn;
import com.legend.sql.SqlQuery;
import com.legend.sql.SqlRewriter;
import com.legend.sql.SqlSelect;
import com.legend.sql.SqlSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * A median, mode or quantile over a WHOLE partition, for a database whose ordered-set aggregates are not
 * window functions (Postgres: percentile_cont / mode take no OVER clause). Over a window with no order and
 * no frame the value is the aggregate of the partition's rows, so it is the same aggregate over a fresh copy
 * of the select's source, under the select's own filter, of the rows whose partition keys are not distinct
 * from the current row's -- a correlated subquery (the carrier strategies' correlated-copy pattern). Any
 * other window (ordered, framed), or a select over a join, is left as it is: the dialect refuses it by name.
 * Found by the Postgres PCT lane (2026-10-02: median, mode, percentile over over(~key)).
 */
final class WholePartitionOrderedSets extends SqlRewriter {

    private static final Set<SqlAgg.Fn> ORDERED_SETS =
            Set.of(SqlAgg.Fn.MEDIAN, SqlAgg.Fn.MODE, SqlAgg.Fn.QUANTILE_CONT, SqlAgg.Fn.QUANTILE_DISC);

    @Override
    protected SqlQuery select(SqlSelect s) {
        if (!s.groupBy().isEmpty() || s.from() instanceof SqlSource.Join
                || s.projections().stream().noneMatch(p -> rewritable(p.expr()))) {
            return s;
        }
        List<SqlSelect.Projection> ps = new ArrayList<>();
        boolean changed = false;
        for (int i = 0; i < s.projections().size(); i++) {
            SqlSelect.Projection p = s.projections().get(i);
            SqlExpr e = replace(p.expr(), s, s.from().alias() + "_ops" + i);
            changed |= e != p.expr();
            ps.add(e == p.expr() ? p : new SqlSelect.Projection(e, p.alias(), p.out()));
        }
        return changed ? s.withProjections(ps) : s;
    }

    private static boolean rewritable(SqlExpr e) {
        if (e instanceof SqlExpr.WindowCall w && w.fn() instanceof SqlAgg.Reducer r && ORDERED_SETS.contains(r.fn())
                && w.orderBy().isEmpty() && w.frame() == null) {
            return true;
        }
        return e.children().stream().anyMatch(WholePartitionOrderedSets::rewritable);
    }

    /** {@code alias}: the copy's -- unique in the statement, as the select's own source alias is, by the
     *  projection's position (a nested ordered set is a second copy one level down). */
    private SqlExpr replace(SqlExpr e, SqlSelect s, String alias) {
        if (e instanceof SqlExpr.WindowCall w && w.fn() instanceof SqlAgg.Reducer r && ORDERED_SETS.contains(r.fn())
                && w.orderBy().isEmpty() && w.frame() == null) {
            SqlExpr over = partitionAggregate(r, w.partitionBy(), s, alias);
            return over == null ? e : over;
        }
        List<SqlExpr> kids = e.children();
        if (kids.isEmpty()) {
            return e;
        }
        List<SqlExpr> mapped = new ArrayList<>(kids.size());
        boolean changed = false;
        for (int i = 0; i < kids.size(); i++) {
            SqlExpr k = kids.get(i);
            SqlExpr m = replace(k, s, alias + "_" + i);
            changed |= m != k;
            mapped.add(m);
        }
        return changed ? e.withChildren(mapped) : e;
    }

    /** {@code (SELECT r(args') FROM copy WHERE where' AND p1' IS NOT DISTINCT FROM p1 ...)}, or null when the
     *  select's source cannot be copied. */
    private static @com.legend.base.Nullable SqlExpr partitionAggregate(SqlAgg.Reducer r, List<SqlExpr> partition,
            SqlSelect s, String alias) {
        String from = s.from().alias();
        SqlSource copy = CarrierStrategies.copyWithAlias(s.from(), alias);
        if (copy == null) {
            return null;
        }
        List<SqlExpr> args = new ArrayList<>();
        for (SqlExpr a : r.args()) {
            args.add(CarrierStrategies.remapAlias(a, from, alias));
        }
        List<SqlExpr> conds = new ArrayList<>();
        if (s.where() != null) {
            conds.add(CarrierStrategies.remapAlias(s.where(), from, alias));
        }
        for (SqlExpr p : partition) {
            conds.add(SqlExpr.Call.of(SqlFn.NOT, SqlExpr.Call.of(SqlFn.IS_DISTINCT_FROM,
                    CarrierStrategies.remapAlias(p, from, alias), p)));
        }
        SqlExpr where = null;
        for (SqlExpr c : conds) {
            where = where == null ? c : SqlExpr.Call.of(SqlFn.AND, where, c);
        }
        SqlAgg.Reducer agg = new SqlAgg.Reducer(r.fn(), args, r.distinct(), r.orderBy());
        return new SqlExpr.ScalarSubquery(new SqlSelect(List.of(new SqlSelect.Projection(agg, null, null)), false, copy,
                where, List.of(), null, null, List.of(), null, null, List.of()));
    }
}
