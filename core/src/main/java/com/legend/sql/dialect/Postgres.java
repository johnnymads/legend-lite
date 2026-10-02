// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.sql.dialect;

import com.legend.sql.SqlAgg;
import com.legend.sql.SqlExpr;
import com.legend.sql.SqlFn;
import com.legend.sql.SqlType;

import java.util.List;
import java.util.stream.Collectors;

/**
 * The PostgreSQL EXECUTION dialect, version 16 and later (2026-10-01 W5.5/P1 Postgres
 * dialect; docs/POSTGRES_BACKEND.md is the probe study). A sibling of {@link H2} and
 * {@link DuckDb} over {@link AnsiSqlRenderer}: it overrides the base's DuckDB-isms and
 * changes nothing the other dialects render.
 *
 * <p>Product contract: {@code render(SqlQuery)} is ONE SELECT with no trailing
 * {@code ;} — the warehouse splices it into {@code COPY (SELECT cols FROM (<sql>) sub)
 * TO STDOUT} — and every projection is labelled, so output names are what the plan
 * declares. Postgres folds an unquoted identifier to lowercase, so EVERY identifier is
 * quoted: a Database must declare its tables and columns in their physical case.
 *
 * <p>Every {@link SqlFn} and {@link SqlAgg.Fn} is decided HERE by an exhaustive switch:
 * a portable base arm, a Postgres arm, or a {@link DialectCapability} wall. A wall is
 * honest; a guessed spelling is a silent wrong answer. Collections, structs, lambdas,
 * folds and variant navigation are walls until the jsonb carrier lands (leg P4;
 * POSTGRES_BACKEND.md §5: never Postgres' native ARRAY).
 */
public final class Postgres extends AnsiSqlRenderer {

    public Postgres() {
        super(Lexicon.POSTGRES, TypeNames.POSTGRES, Spellings.POSTGRES);
    }

    // ==================================================================
    // Session and scripts (the JVM lane; the product path pins the zone in
    // the attach DSN — a planner has no connection)
    // ==================================================================

    /** The platform's naive-UTC temporal contract (POSTGRES_BACKEND.md §6: the
     * session zone is necessary, not sufficient — the JVM pins TZ=UTC too). */
    @Override
    public List<String> sessionSetup() {
        return List.of("SET TimeZone='UTC'");
    }

    /** Postgres DDL is transactional: an effect segment is one transaction, so a
     * failing statement applies nothing (DuckDB's form). */
    @Override
    public String script(List<String> statements) {
        return "BEGIN TRANSACTION;\n" + String.join(";\n", statements) + ";\nCOMMIT;";
    }

    @Override
    public String scriptAbort() {
        return "ROLLBACK";
    }

    /** No native PIVOT: static pivots are emulated by the carrier pass; a dynamic
     * pivot needs a key-discovery round trip the browser planner cannot make. */
    @Override
    public boolean needsStaticPivot() {
        return true;
    }

    // ==================================================================
    // Passes and structure
    // ==================================================================

    /** The portable carrier strategies (static pivot, as-of emulation; FULL OUTER
     * stays native), the substring start clamp (Postgres counts empties before 1,
     * like DuckDB), averages delivered as DOUBLE ({@code avg(int)} is numeric here),
     * QUALIFY as a wrapping subselect (Postgres has no QUALIFY), and a constant GROUP BY or
     * ORDER BY key as a typed expression (Postgres reads a bare one as a position, or refuses
     * it). */
    @Override
    protected List<com.legend.sql.SqlRewriter> passes() {
        return List.of(new CarrierStrategies(CarrierStrategies.Caps.POSTGRES),
                new SubstringClamp(), new H2AvgDelivers(), new QualifyToSubselect(true),
                new ConstantKeysAsExpressions());
    }

    /** Postgres 12+ evaluates a {@code MATERIALIZED} CTE once. */
    @Override
    protected String cteAs(com.legend.sql.SqlWith.Cte c) {
        return c.materialized() ? " AS MATERIALIZED (" : " AS (";
    }

    /** Postgres also reads a nested value as {@code jsonb}, the one nested type it can group,
     *  compare and navigate alike: a {@code json} column has no equality operator ({@code GROUP BY}
     *  refuses it), and an array or a composite is not JSON at all (measured on Postgres 17,
     *  docs/STORE_TYPES_HOMEWORK_2026_10_02.md, section 3). */
    @Override
    protected boolean readsStored(com.legend.sql.SqlDdl.ColumnType t) {
        return readsAsText(t) || jsonbRead(t) != JsonbRead.NONE;
    }

    @Override
    protected String storedRead(com.legend.sql.SqlExpr.StoredRead r) {
        String ref = columnRef(r.column());
        return switch (jsonbRead(r.stored())) {
            case CAST -> "CAST(" + ref + " AS JSONB)";
            case CONVERT -> "to_jsonb(" + ref + ")";
            case NONE -> super.storedRead(r);
        };
    }

    /** How a stored type reads as {@code jsonb}: {@code json} is cast; an array or a composite
     *  cannot be cast, and is converted ({@code to_jsonb}); any other type is not nested. */
    private enum JsonbRead { CAST, CONVERT, NONE }

    private static JsonbRead jsonbRead(com.legend.sql.SqlDdl.ColumnType t) {
        return switch (t) {
            case com.legend.sql.SqlDdl.ColumnType.Plain p -> switch (p.kind()) {
                case JSON -> JsonbRead.CAST;
                case ARRAY, OBJECT -> JsonbRead.CONVERT;
                case BIGINT, SMALLINT, TINYINT, INTEGER, FLOAT, DOUBLE, REAL, BIT, TIMESTAMP, DATE,
                        VARCHAR, OTHER, DISTINCT -> JsonbRead.NONE;
            };
            case com.legend.sql.SqlDdl.ColumnType.Sized ignored -> JsonbRead.NONE;
            case com.legend.sql.SqlDdl.ColumnType.Scaled ignored -> JsonbRead.NONE;
        };
    }

    /** Alias-less projections label EXPLICITLY from the declared output: Postgres
     * labels an expression {@code ?column?}, and the product wrapper selects
     * columns by name. */
    @Override
    protected @com.legend.base.Nullable String implicitLabel(com.legend.sql.SqlSelect.Projection p) {
        return p.out() != null ? aliasIdent(p.out().name()) : super.implicitLabel(p);
    }

    /** Every identifier quoted (Postgres folds a bare one to lowercase); a
     * quote-bearing declaration ({@code "date"}) is already its own spelling. */
    @Override
    protected String ident(String name) {
        if (name.length() > 1 && name.charAt(0) == '"' && name.endsWith("\"")
                && !name.substring(1, name.length() - 1).replace("\"\"", "").contains("\"")) {
            return name;
        }
        return delimited(name);
    }

    @Override
    protected String rowOrderColumn() {
        throw new DialectCapability("row order reached Postgres, which has no stable"
                + " row-order column (ctid moves on update)");
    }

    @Override
    protected String starExceptKeyword() {
        throw new DialectCapability("SELECT * EXCLUDE reached Postgres, which has no"
                + " star exclusion; the column list must be expanded upstream");
    }

    @Override
    protected String expr(SqlExpr e, int parentPrec) {
        if (e instanceof SqlExpr.OrderedListAgg) {
            throw new DialectCapability("an ordered list aggregate reached Postgres before"
                    + " the jsonb collection carrier (leg P4)");
        }
        return super.expr(e, parentPrec);
    }

    /** Postgres keeps microseconds and ROUNDS finer digits (59.9999999 becomes the next
     * minute; the 9999-12-31 23:59:59.999999999 sentinel would become year 10000):
     * finer digits are TRUNCATED, as DuckDB's TIMESTAMP does. */
    @Override
    protected String timestampLit(String iso) {
        int dot = iso.lastIndexOf('.');
        if (dot >= 0) {
            int end = dot + 1;
            while (end < iso.length() && Character.isDigit(iso.charAt(end))) {
                end++;
            }
            if (end - dot - 1 > 6) {
                iso = iso.substring(0, dot + 7) + iso.substring(end);
            }
        }
        return super.timestampLit(iso);
    }

    /** Postgres text cannot hold NUL ({@code chr(0)} raises). */
    @Override
    protected String stringLit(String value) {
        if (value.indexOf(0) >= 0) {   // NUL, by code point
            throw new DialectCapability("a string holding NUL reached Postgres, whose text"
                    + " type cannot hold it");
        }
        return super.stringLit(value);
    }

    /** Composite casts other than DECIMAL are the collection carrier's (leg P4). */
    @Override
    protected String variantAwareCast(SqlExpr.Cast c) {
        if (c.target() instanceof SqlType.Array || c.target() instanceof SqlType.Map
                || c.target() == SqlType.Scalar.JSON) {
            throw new DialectCapability("a cast to " + c.target() + " reached Postgres before"
                    + " the jsonb carrier (leg P4)");
        }
        return super.variantAwareCast(c);
    }

    // ==================================================================
    // Scalar functions — every SqlFn decided here
    // ==================================================================

    @Override
    protected String call(SqlExpr.Call c, int parentPrec) {
        List<SqlExpr> a = c.args();
        return switch (c.fn()) {
            // ---- portable: the base arm (or a Spellings.POSTGRES row) is Postgres SQL
            case AND, OR, NOT, EQUAL, NOT_EQUAL, LESS, LESS_EQUAL, GREATER, GREATER_EQUAL,
                 PLUS, MINUS, TIMES, NEGATE, IS_NULL, IS_NOT_NULL, IN, IS_DISTINCT_FROM,
                 NULL_SAFE_EQUAL, NULL_SAFE_NOT_EQUAL, XOR, CONCAT, CONCAT_JOIN, PARSE_INT,
                 PARSE_DATE, PI, CEILING, FLOOR, SIGN, LPAD, RPAD, UC_FIRST, LC_FIRST, TODAY,
                 DATE_TRUNC_DAY, BOOL_TO_TEXT, CURRENT_USER_FN,
                 // bit operators and rounding ride the base's hooks (overridden below);
                 // HASH's hook walls: Postgres has no signed 64-bit hash of the reference
                 BIT_AND, BIT_OR, BIT_XOR, BIT_SHIFT_LEFT, BIT_SHIFT_RIGHT, ROUND, HASH,
                 // Spellings.POSTGRES rows
                 ABS, ASCII_CODE, ATAN, ATAN2, CBRT, CHR, COALESCE, COS, COSH, COT, DEGREES,
                 EXP, FLOOR_RAW, GREATEST, LEAST, LEFT, LN, LOG10, LOWER, LTRIM, MD5, POW,
                 RADIANS, REGEXP_REPLACE, REPEAT_STR, REPLACE, REVERSE_STRING, RIGHT, RTRIM,
                 SIN, SINH, SPLIT_PART, SQRT, STARTS_WITH, STRPOS, SUBSTRING, TAN, TANH,
                 TIMEZONE, TRIM, UPPER -> super.call(c, parentPrec);

            // ---- arithmetic
            // Pure's divide is a Float division: both operands DOUBLE PRECISION
            case DIVIDE -> "(CAST(" + expr(a.get(0), 0) + " AS DOUBLE PRECISION) / CAST("
                    + expr(a.get(1), 0) + " AS DOUBLE PRECISION))";
            // Postgres has no % or mod() over double precision; integers and
            // decimals take the base's MOD forms
            case MOD, REM -> {
                if (a.stream().anyMatch(Postgres::isDouble)) {
                    throw new DialectCapability(c.fn() + " over a Float reached Postgres,"
                            + " which has no double-precision remainder");
                }
                yield super.call(c, parentPrec);
            }
            // DuckDB's // truncates toward zero; so does div() (numeric), and a
            // double operand is refused by Postgres itself (no implicit cast)
            // ~x on BIGINT (the base's xor() is DuckDB's)
            case BIT_NOT -> "(~ CAST(" + expr(a.get(0), 0) + " AS BIGINT))";
            case INT_DIVIDE -> "CAST(div(" + expr(a.get(0), 0) + ", " + expr(a.get(1), 0)
                    + ") AS BIGINT)";
            // Pure's divide-with-scale is HALF_UP; Postgres rounds double precision
            // half-EVEN and numeric half away from zero (POSTGRES_BACKEND.md §4.3),
            // and has no round(double, int) at all
            case ROUND_HALF_UP -> {
                String r = "round(CAST(" + expr(a.get(0), 0) + " AS NUMERIC)"
                        + (a.size() > 1 ? ", CAST(" + expr(a.get(1), 0) + " AS INTEGER)" : "")
                        + ")";
                yield isDouble(a.get(0)) ? "CAST(" + r + " AS DOUBLE PRECISION)" : r;
            }
            // the engine's out-of-domain answer is NaN; Postgres raises
            case ACOS, ASIN -> {
                String x = expr(a.get(0), 0);
                String f = c.fn() == SqlFn.ACOS ? "acos" : "asin";
                yield "(CASE WHEN (" + x + ") BETWEEN -1 AND 1 THEN " + f + "(" + x
                        + ") ELSE CAST('NaN' AS DOUBLE PRECISION) END)";
            }

            // ---- strings
            // the engine coerces a non-text argument (DuckDb's arm)
            case LENGTH -> a.get(0) instanceof SqlExpr.StringLit
                    ? fn("length", a) : "length(CAST(" + expr(a.get(0), 0) + " AS VARCHAR))";
            case ENDS_WITH -> "(right(" + expr(a.get(0), 0) + ", length(" + expr(a.get(1), 0)
                    + ")) = " + expr(a.get(1), 0) + ")";
            // MATCHES is the PARTIAL test, Postgres' ~ (never regexp_matches: set-
            // returning, it deletes rows in a projection, POSTGRES_BACKEND.md §4.1)
            case MATCHES -> "(" + expr(a.get(0), 7) + " ~ " + expr(a.get(1), 7) + ")";
            // full match: ~ is partial on Postgres (§4.2), so the pattern anchors
            case REGEXP_FULL_MATCH -> "(" + expr(a.get(0), 7) + " ~ "
                    + (a.get(1) instanceof SqlExpr.StringLit p
                            ? stringLit("^(?:" + p.value() + ")$")
                            : "('^(?:' || " + expr(a.get(1), 0) + " || ')$')") + ")";
            // regexp_extract(s, p[, g]) is '' on a miss; regexp_substr is NULL
            case REGEXP_EXTRACT -> "coalesce(regexp_substr(" + expr(a.get(0), 0) + ", "
                    + expr(a.get(1), 0) + ", 1, 1, '', "
                    + (a.size() > 2 ? expr(a.get(2), 0) : "0") + "), '')";
            // Postgres' base64 wraps lines at 76 characters
            case ENCODE_BASE64 -> "replace(encode(convert_to(" + expr(a.get(0), 0)
                    + ", 'UTF8'), 'base64'), chr(10), '')";
            case DECODE_BASE64 -> "convert_from(decode(" + expr(a.get(0), 0)
                    + ", 'base64'), 'UTF8')";
            // sha256 is bytea here; the reference is lowercase hex text
            case SHA256 -> "encode(sha256(convert_to(" + expr(a.get(0), 0)
                    + ", 'UTF8')), 'hex')";
            case GUID -> "CAST(gen_random_uuid() AS VARCHAR)";

            // ---- temporal
            case NOW -> "(now() AT TIME ZONE 'UTC')";
            case STRFTIME -> {
                if (!(a.get(1) instanceof SqlExpr.FormatLit)) {
                    throw new DialectCapability("a date format that is not a format literal"
                            + " reached Postgres: its codes are DuckDB's");
                }
                yield "to_char(" + naive(a.get(0)) + ", " + expr(a.get(1), 0) + ")";
            }
            case DAYNAME -> "to_char(" + naive(a.get(0)) + ", 'FMDay')";
            case MONTHNAME -> "to_char(" + naive(a.get(0)) + ", 'FMMonth')";
            // DuckDB's date_part is an integer (seconds truncated); extract is numeric
            case EXTRACT -> {
                String part = literal(a.get(0), "EXTRACT");
                if (!List.of("year", "quarter", "month", "week", "day", "doy", "dow",
                        "isodow", "hour", "minute", "second").contains(part)) {
                    throw new DialectCapability("date part '" + part
                            + "' has no probed Postgres spelling");
                }
                yield "CAST(floor(extract(" + part + " FROM " + expr(a.get(1), 0)
                        + ")) AS BIGINT)";
            }
            case DATE_TRUNC -> dateTrunc(a);
            // Postgres' make_date/make_timestamp take INTEGER, never BIGINT
            case MAKE_DATE -> "make_date(" + a.stream()
                    .map(x -> "CAST(" + expr(x, 0) + " AS INTEGER)")
                    .collect(Collectors.joining(", ")) + ")";
            case MAKE_TIMESTAMP -> {
                if (a.size() != 6) {
                    throw new DialectCapability("make_timestamp of " + a.size()
                            + " arguments has no Postgres spelling");
                }
                yield "make_timestamp(" + a.subList(0, 5).stream()
                        .map(x -> "CAST(" + expr(x, 0) + " AS INTEGER)")
                        .collect(Collectors.joining(", "))
                        + ", CAST(" + expr(a.get(5), 0) + " AS DOUBLE PRECISION))";
            }
            // (unitFn, amount, date): amount × a one-unit interval — exact for every
            // unit and any BIGINT amount (make_interval takes INTEGER)
            case ADD_INTERVAL, ADD_INTERVAL_TEMPORAL -> opSpelling(expr(a.get(2), 5) + " + "
                    + expr(a.get(1), 6) + " * INTERVAL '1 "
                    + intervalUnit(literal(a.get(0), c.fn().name())) + "'", parentPrec);
            case DATE_DIFF -> dateDiff(a);
            // date_bin cannot bin months or years; the origins are the base's
            // (weeks align to the Monday 1969-12-29, everything else to 1970)
            case TIME_BUCKET -> {
                String unit = intervalUnit(literal(a.get(0), "TIME_BUCKET"));
                String origin = BUCKET_ORIGINS.get(unit);
                if (origin == null) {
                    throw new DialectCapability("a " + unit + " time bucket reached Postgres,"
                            + " whose date_bin bins fixed-length intervals only");
                }
                yield "date_bin(" + expr(a.get(1), 6) + " * INTERVAL '1 " + unit + "', "
                        + naive(a.get(2)) + ", " + origin + ")";
            }
            // DuckDB's epoch(ts) is DOUBLE seconds; epoch_ms truncates toward zero
            case EPOCH_SECONDS -> "CAST(extract(epoch FROM " + expr(a.get(0), 0)
                    + ") AS DOUBLE PRECISION)";
            case EPOCH_MS -> "CAST(trunc(extract(epoch FROM " + expr(a.get(0), 0)
                    + ") * 1000) AS BIGINT)";
            // epoch arithmetic on a naive timestamp: no session zone involved
            case FROM_EPOCH_SECONDS -> opSpelling("TIMESTAMP '1970-01-01 00:00:00' + "
                    + expr(a.get(0), 6) + " * INTERVAL '1 second'", parentPrec);
            case FROM_EPOCH_MS -> opSpelling("TIMESTAMP '1970-01-01 00:00:00' + CAST("
                    + expr(a.get(0), 0) + " AS BIGINT) * INTERVAL '1 millisecond'", parentPrec);

            // error() outside a CASE branch: the raise as text (see raise)
            case ERROR -> raise(a, null);

            // ---- walls
            case STRPTIME -> throw wall(c.fn(), "to_timestamp(text, fmt) is lenient and"
                    + " zone-bound; not yet probed against the reference");
            case FORMAT -> throw wall(c.fn(), "Postgres' format() has no %d/%f");
            case SHA1, LEVENSHTEIN, JARO_WINKLER ->
                    throw wall(c.fn(), "an extension function (pgcrypto/fuzzystrmatch)");
            case JSON_MERGE_PATCH, JSON_TYPE, JSON_ARRAY_LENGTH, JSON_PRETTY, TO_VARIANT,
                 VARIANT_ELEMENTS, VARIANT_GET ->
                    throw wall(c.fn(), "variant over jsonb is leg P4");
            case LIST_FILTER, LIST_TRANSFORM, LIST_CONCAT, LIST_GET, LIST_POSITION,
                 LIST_EXISTS, LIST_FOR_ALL, STRUCT_INSERT, UNNEST, LIST_FLATTEN,
                 REGEXP_EXTRACT_ALL, MAP_FROM_LISTS, MAP_FROM_ENTRIES, MAP_EMPTY, MAP_EXTRACT,
                 MAP_KEYS, MAP_VALUES, MAP_CONCAT, SPLIT, PURE_SPLIT_PART, LIST_LENGTH,
                 LIST_ZIP, LIST_DISTINCT, LIST_APPEND, LIST_SUM, LIST_MIN, LIST_MAX, LIST_AVG,
                 LIST_MEDIAN, LIST_MODE, LIST_SORT, LIST_SORT_DESC, LIST_TAIL, LIST_INIT,
                 RANGE_FN, LIST_PRODUCT, LIST_REDUCE, LIST_SLICE, REPEAT_VALUE,
                 LIST_BOOL_AND, LIST_BOOL_OR, ALL_DISTINCT, LIST_REVERSE, TYPEOF ->
                    throw wall(c.fn(), "collections over the jsonb carrier are leg P4");
        };
    }

    /**
     * error(msg[, 'line:col']) without a UDF (the route H2_BACKEND.md bans) and without
     * a raise function (Postgres has none in SQL): the sentinel-wrapped message CAST to
     * TIMESTAMPTZ, which cannot parse it ({@code invalid input syntax for type timestamp
     * with time zone: "␟msg␟"} — RaisedErrors reads between the U+001F sentinels, the
     * B7 envelope). TIMESTAMPTZ input is STABLE, so the planner never folds the raise
     * of a constant message (an immutable cast would raise at PLAN time inside a CASE
     * arm never taken); the CASE stays lazy per row. Then text, then the slot's own
     * type where a CASE branch IS the raise, so the branches unify. Probed on 17:
     * constant-false and row guards do not fire, a taken guard raises the message.
     */
    private String raise(List<SqlExpr> a, @com.legend.base.Nullable SqlType slot) {
        String position = a.size() > 1 ? expr(a.get(1), 0) + " || chr(30) || " : "";
        String text = "CAST(CAST(chr(31) || " + position + "(" + expr(a.get(0), 0)
                + ") || chr(31) AS TIMESTAMPTZ) AS VARCHAR)";
        return slot instanceof SqlType.Scalar || slot instanceof SqlType.Decimal
                ? "CAST(" + text + " AS " + castTypeName(slot) + ")" : text;
    }

    /** The base CASE, with a branch that IS error() raised in the CASE's own type. */
    @Override
    protected String caseExpr(SqlExpr.Case c) {
        SqlType slot = c.type() instanceof com.legend.sql.TypeFact.Typed t ? t.type() : null;
        StringBuilder sb = new StringBuilder("CASE");
        for (SqlExpr.Case.When w : c.whens()) {
            sb.append(" WHEN ").append(expr(w.condition(), 0))
                    .append(" THEN ").append(branch(w.then(), slot));
        }
        if (c.otherwise() != null) {
            sb.append(" ELSE ").append(branch(c.otherwise(), slot));
        }
        return sb.append(" END").toString();
    }

    private String branch(SqlExpr value, @com.legend.base.Nullable SqlType slot) {
        return value instanceof SqlExpr.Call call && call.fn() == SqlFn.ERROR
                ? raise(call.args(), slot) : expr(value, 0);
    }

    private static DialectCapability wall(SqlFn fn, String why) {
        return new DialectCapability(fn + " reached Postgres: " + why);
    }

    private static boolean isDouble(SqlExpr e) {
        return e.type() instanceof com.legend.sql.TypeFact.Typed t
                && t.type() == SqlType.Scalar.DOUBLE;
    }

    private static String literal(SqlExpr e, String what) {
        if (e instanceof SqlExpr.StringLit s) {
            return s.value();
        }
        throw new DialectCapability(what + " with a non-literal part reached Postgres");
    }

    /** A temporal operand as a NAIVE timestamp: a DATE implicitly casts to
     * timestamptz in Postgres' function resolution (date_trunc, to_char, date_bin),
     * which the session zone would then shift; a declared TIMESTAMPTZ stays one. */
    private String naive(SqlExpr e) {
        if (e.type() instanceof com.legend.sql.TypeFact.Typed t
                && (t.type() == SqlType.Scalar.TIMESTAMP || t.type() == SqlType.Scalar.TIMESTAMPTZ)) {
            return expr(e, 0);
        }
        return "CAST(" + expr(e, 0) + " AS TIMESTAMP)";
    }

    /** The base's contract: Date-grained parts (year/quarter/month/week) deliver a
     * DATE, finer parts a TIMESTAMP (DuckDb casts 'day' back to one). */
    private String dateTrunc(List<SqlExpr> a) {
        String part = literal(a.get(0), "DATE_TRUNC");
        String trunc = "date_trunc(" + stringLit(part) + ", " + naive(a.get(1)) + ")";
        if (DATE_GRAINED.contains(part)) {
            return "CAST(" + trunc + " AS DATE)";
        }
        if (TIME_GRAINED.contains(part)) {
            return trunc;
        }
        // century/millennium/decade: Postgres counts from year 1 (2001), DuckDB from
        // 2000 (POSTGRES_BACKEND.md §4.4)
        throw new DialectCapability("date_trunc part '" + part + "' has no probed Postgres spelling");
    }

    private static final java.util.Set<String> DATE_GRAINED = java.util.Set.of("year", "quarter", "month", "week");
    private static final java.util.Set<String> TIME_GRAINED = java.util.Set.of("day", "hour", "minute", "second");

    /** DuckDB's date_diff counts BOUNDARIES crossed, never elapsed time — and never
     * {@code age()}, wrong on 9 of 15 edge cases (POSTGRES_BACKEND.md §7). Probed
     * against DuckDB 1.5: day over timestamps (23:00 → 01:00 is 1), month
     * (01-31 → 02-01 is 1), year backwards (-1), quarter. */
    private String dateDiff(List<SqlExpr> a) {
        String part = literal(a.get(0), "DATE_DIFF");
        String from = expr(a.get(1), 0);
        String to = expr(a.get(2), 0);
        String y = "(extract(year FROM " + to + ") - extract(year FROM " + from + "))";
        Integer perYear = PARTS_PER_YEAR.get(part);
        String scale = EPOCH_SCALE.get(part);
        String body;
        if (perYear != null) {
            // year/quarter/month: whole years in the unit, plus the in-year part's step
            body = perYear == 1 ? y : y + " * " + perYear + " + (extract(" + part + " FROM " + to
                    + ") - extract(" + part + " FROM " + from + "))";
        } else if (scale != null) {
            body = epochBoundaries(from, to, scale);
        } else if (DAY_PART.equals(part)) {
            body = "CAST(" + to + " AS DATE) - CAST(" + from + " AS DATE)";
        } else {
            // week is DuckDB's plain day count / 7 (Saturday -> Monday is 0), not a
            // boundary count: unprobed beyond that, so it walls
            throw new DialectCapability("date_diff part '" + part + "' has no probed Postgres spelling");
        }
        return "CAST(" + body + " AS BIGINT)";
    }

    private static final String DAY_PART = "day";
    private static final java.util.Map<String, Integer> PARTS_PER_YEAR =
            java.util.Map.of("year", 1, "quarter", 4, "month", 12);
    private static final java.util.Map<String, String> EPOCH_SCALE = java.util.Map.of(
            "hour", " / 3600", "minute", " / 60", "second", "",
            "millisecond", " * 1000", "microsecond", " * 1000000");

    /** Sub-day parts FLOOR the epoch in their unit, before 1970 too (probed on DuckDB
     * 1.5: 1969-12-31 23:59:59.9995 -> 00:00 is 1 millisecond, 22:30 -> 23:10 in 1969
     * is 1 hour); Postgres' extract(epoch) is exact numeric. */
    private static String epochBoundaries(String from, String to, String scale) {
        return "floor(extract(epoch FROM " + to + ")" + scale + ") - floor(extract(epoch FROM "
                + from + ")" + scale + ")";
    }

    /** DuckDB's interval-function name ({@code to_days}) → a Postgres interval unit. */
    private static String intervalUnit(String unitFn) {
        String unit = INTERVAL_UNITS.get(unitFn);
        if (unit == null) {
            throw new DialectCapability("interval unit '" + unitFn + "' has no Postgres spelling");
        }
        return unit;
    }

    private static final java.util.Map<String, String> INTERVAL_UNITS = java.util.Map.of(
            "to_years", "year", "to_months", "month", "to_weeks", "week", "to_days", "day",
            "to_hours", "hour", "to_minutes", "minute", "to_seconds", "second",
            "to_milliseconds", "millisecond", "to_microseconds", "microsecond");

    /** date_bin's fixed-length units and their origins (month and year are absent). */
    private static final java.util.Map<String, String> BUCKET_ORIGINS = bucketOrigins();

    private static java.util.Map<String, String> bucketOrigins() {
        java.util.Map<String, String> m = new java.util.HashMap<>();
        for (String u : List.of("day", "hour", "minute", "second", "millisecond", "microsecond")) {
            m.put(u, "TIMESTAMP '1970-01-01 00:00:00'");
        }
        m.put("week", "TIMESTAMP '1969-12-29 00:00:00'");
        return java.util.Map.copyOf(m);
    }

    /** Pure round is half-EVEN: Postgres' round(double precision) is rint (probed:
     * 2.5 → 2, 3.5 → 4, -2.5 → -2). There is no round(double, int); a scaled
     * half-even round is unprobed, so it walls. */
    @Override
    protected String roundHalfEven(List<SqlExpr> a) {
        if (a.size() != 1) {
            throw new DialectCapability("a half-even round to a scale reached Postgres,"
                    + " which has no round(double precision, int)");
        }
        return "round(CAST(" + expr(a.get(0), 0) + " AS DOUBLE PRECISION))";
    }

    /** BIGINT bit operators: an INTEGER shift is masked to 32 bits ({@code 1 << 40}
     * is 256 — POSTGRES_BACKEND.md §4.4), so operands widen first; xor is {@code #}. */
    @Override
    protected String bitOp(SqlFn fnName, List<SqlExpr> a) {
        String x = "CAST(" + expr(a.get(0), 0) + " AS BIGINT)";
        String y = expr(a.get(1), 0);
        return switch (fnName) {
            case BIT_AND -> "(" + x + " & CAST(" + y + " AS BIGINT))";
            case BIT_OR -> "(" + x + " | CAST(" + y + " AS BIGINT))";
            case BIT_XOR -> "(" + x + " # CAST(" + y + " AS BIGINT))";
            case BIT_SHIFT_LEFT -> "(" + x + " << CAST(" + y + " AS INTEGER))";
            case BIT_SHIFT_RIGHT -> "(" + x + " >> CAST(" + y + " AS INTEGER))";
            default -> throw new IllegalStateException("not a bit op: " + fnName);
        };
    }

    // ==================================================================
    // Aggregates and windows
    // ==================================================================

    @Override
    protected String reducer(SqlAgg.Reducer r) {
        // Postgres has no max/min over BOOLEAN (measured: "function max(boolean) does not exist");
        // over false < true they ARE bool_or/bool_and. DataCube's "the group's one value" columns
        // (CASE WHEN COUNT(DISTINCT b) = 1 THEN MAX(b) END) reach this on every boolean column.
        if ((r.fn() == SqlAgg.Fn.MAX || r.fn() == SqlAgg.Fn.MIN) && r.args().size() == 1
                && r.orderBy().isEmpty() && isBoolean(r.args().get(0))) {
            return (r.fn() == SqlAgg.Fn.MAX ? "bool_or(" : "bool_and(") + expr(r.args().get(0), 0) + ")";
        }
        return switch (r.fn()) {
            // ANY_VALUE is Postgres 16+; ordered aggregates keep the base's spelling —
            // Postgres' default null placement (ASC last, DESC first) IS the
            // reference's NULL-largest
            case SUM, COUNT, AVG, MIN, MAX, ANY_VALUE, STDDEV_SAMP, STDDEV_POP, VAR_SAMP,
                 VAR_POP, STRING_AGG, CORR, COVAR_SAMP, COVAR_POP, BOOL_AND, BOOL_OR,
                 VARIANCE, STDDEV, ROW_NUMBER, RANK, DENSE_RANK, PERCENT_RANK, CUME_DIST,
                 NTILE, LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTH_VALUE -> super.reducer(r);
            // DuckDB's median interpolates numbers; a median of anything else walls
            case MEDIAN -> {
                if (r.args().size() != 1 || r.distinct() || !r.orderBy().isEmpty()
                        || !isNumeric(r.args().get(0))) {
                    throw new DialectCapability("median of a non-number reached Postgres,"
                            + " whose percentile_cont interpolates numbers only");
                }
                yield "percentile_cont(0.5) WITHIN GROUP (ORDER BY "
                        + expr(r.args().get(0), 0) + ")";
            }
            case MODE -> {
                if (r.args().size() != 1 || r.distinct() || !r.orderBy().isEmpty()) {
                    throw new DialectCapability("a distinct or ordered mode reached Postgres");
                }
                yield "mode() WITHIN GROUP (ORDER BY " + expr(r.args().get(0), 0) + ")";
            }
            // the reducer's single order key IS the within-group order (H2's arm)
            case QUANTILE_CONT, QUANTILE_DISC -> {
                if (r.args().size() != 2 || r.distinct() || r.orderBy().size() > 1) {
                    throw new DialectCapability(r.fn() + " of this shape reached Postgres");
                }
                boolean desc = !r.orderBy().isEmpty() && !r.orderBy().get(0).ascending();
                yield (r.fn() == SqlAgg.Fn.QUANTILE_CONT ? "percentile_cont(" : "percentile_disc(")
                        + expr(r.args().get(1), 0) + ") WITHIN GROUP (ORDER BY "
                        + expr(r.args().get(0), 0) + (desc ? " DESC" : "") + ")";
            }
            case LIST -> throw new DialectCapability("a LIST aggregate reached Postgres before"
                    + " the jsonb collection carrier (leg P4)");
            case ARG_MAX, ARG_MIN -> throw new DialectCapability(r.fn() + " reached Postgres,"
                    + " which has no arg_max/arg_min (an ordered-pick rewrite is unbuilt)");
            case WAVG, HASH_LIST, IS_DISTINCT_MARK, UNIQUE_VALUE_ONLY ->
                    throw new IllegalStateException("lowering marker " + r.fn()
                            + " reached the renderer");
        };
    }

    private static boolean isBoolean(SqlExpr e) {
        return e.type() instanceof com.legend.sql.TypeFact.Typed t && t.type() == SqlType.Scalar.BOOLEAN;
    }

    private static boolean isNumeric(SqlExpr e) {
        return e.type() instanceof com.legend.sql.TypeFact.Typed t
                && (t.type() == SqlType.Scalar.INTEGER || t.type() == SqlType.Scalar.BIGINT
                        || t.type() == SqlType.Scalar.HUGEINT || t.type() == SqlType.Scalar.DOUBLE
                        || t.type() instanceof SqlType.Decimal);
    }

    /** Ordered-set aggregates (percentile_*, mode) are not window functions here. */
    @Override
    protected String windowCall(SqlExpr.WindowCall w) {
        if (w.fn() instanceof SqlAgg.Reducer r && java.util.EnumSet.of(SqlAgg.Fn.MEDIAN,
                SqlAgg.Fn.MODE, SqlAgg.Fn.QUANTILE_CONT, SqlAgg.Fn.QUANTILE_DISC).contains(r.fn())) {
            throw new DialectCapability(r.fn() + " over a window reached Postgres, where"
                    + " ordered-set aggregates take no OVER clause");
        }
        // a windowed avg is numeric here too, and the avg pass sees only grouped ones
        return w.fn() instanceof SqlAgg.Reducer r && r.fn() == SqlAgg.Fn.AVG
                ? "CAST(" + super.windowCall(w) + " AS DOUBLE PRECISION)" : super.windowCall(w);
    }

    /** Interval frame offsets in the SQL-standard quoted SINGULAR form
     * ({@code INTERVAL '3' DAY}; {@code '3' DAYS} and {@code 3 DAY} are syntax errors,
     * POSTGRES_BACKEND.md §7). Weeks have no standard qualifier: 7-day multiples. */
    @Override
    protected String bound(SqlExpr.WindowCall.Frame.Bound b) {
        return switch (b) {
            case SqlExpr.WindowCall.Frame.Bound.UnboundedPreceding u -> super.bound(b);
            case SqlExpr.WindowCall.Frame.Bound.Preceding p -> super.bound(b);
            case SqlExpr.WindowCall.Frame.Bound.CurrentRow cr -> super.bound(b);
            case SqlExpr.WindowCall.Frame.Bound.Following f -> super.bound(b);
            case SqlExpr.WindowCall.Frame.Bound.UnboundedFollowing u -> super.bound(b);
            case SqlExpr.WindowCall.Frame.Bound.IntervalPreceding p ->
                    frameInterval(p.n(), p.unit()) + " PRECEDING";
            case SqlExpr.WindowCall.Frame.Bound.IntervalFollowing f ->
                    frameInterval(f.n(), f.unit()) + " FOLLOWING";
        };
    }

    private static String frameInterval(long n, String unit) {
        String u = unit.toUpperCase(java.util.Locale.ROOT);
        String qualifier = FRAME_QUALIFIERS.get(u);
        if (qualifier == null) {
            throw new DialectCapability("a " + unit
                    + " window frame offset has no Postgres interval qualifier");
        }
        return "INTERVAL '" + Math.multiplyExact(n, FRAME_DAYS_PER.getOrDefault(u, 1)) + "' "
                + qualifier;
    }

    /** DurationUnit name → SQL-standard interval qualifier; a week is 7 days. */
    private static final java.util.Map<String, String> FRAME_QUALIFIERS = java.util.Map.of(
            "YEARS", "YEAR", "MONTHS", "MONTH", "WEEKS", "DAY", "DAYS", "DAY",
            "HOURS", "HOUR", "MINUTES", "MINUTE", "SECONDS", "SECOND");
    private static final java.util.Map<String, Integer> FRAME_DAYS_PER = java.util.Map.of("WEEKS", 7);

    // ==================================================================
    // JSON constructors (json, not jsonb: json keeps key order)
    // ==================================================================

    @Override
    protected String jsonObject(SqlExpr.JsonObject j) {
        return "json_build_object(" + list(j.kv()) + ")";
    }

    @Override
    protected String jsonArray(SqlExpr.JsonArray j) {
        return "json_build_array(" + list(j.elements()) + ")";
    }

    /** json_agg keeps NULL elements (DuckDB's json_group_array does too); zero rows
     * aggregate to NULL, so the empty array is coalesced in. */
    @Override
    protected String jsonArrayAgg(SqlExpr.JsonArrayAgg j) {
        return "coalesce(json_agg(" + expr(j.value(), 0)
                + (j.orderKeys().isEmpty() ? "" : " ORDER BY " + j.orderKeys().stream()
                        .map(k -> expr(k.expr(), 0) + (k.desc() ? " DESC" : " ASC") + " NULLS LAST")
                        .collect(Collectors.joining(", ")))
                + "), '[]')";
    }

    // ==================================================================
    // Date format codes (to_char)
    // ==================================================================

    /** to_char codes; literal text is always double-quoted (a bare letter would
     * read as a code). DuckDB's %n (nine digits) is the microseconds and three
     * zeros: a Postgres timestamp holds microseconds. */
    @Override
    protected String formatText(SqlExpr.FormatLit fl) {
        StringBuilder out = new StringBuilder();
        for (com.legend.sql.DateFmt p : fl.parts()) {
            out.append(switch (p) {
                case com.legend.sql.DateFmt.Text t ->
                        "\"" + t.s().replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
                case com.legend.sql.DateFmt.Part part -> switch (part) {
                    case YEAR4 -> "YYYY";
                    case MONTH2 -> "MM";
                    case DAY2 -> "DD";
                    case HOUR2 -> "HH24";
                    case MIN2 -> "MI";
                    case SEC2 -> "SS";
                    case SUBSEC_MICRO -> "US";
                    case SUBSEC_NANO -> "US\"000\"";
                    case SUBSEC_MIN -> throw new DialectCapability("a minimal-fraction date"
                            + " format reached Postgres, whose to_char has no trim-zeros code");
                    case MONTH_ABBREV -> "Mon";
                    case MONTH_NAME -> "FMMonth";
                    case WEEKDAY_NAME -> "FMDay";
                    case HOUR12 -> "HH12";
                    case HOUR12_NOPAD -> "FMHH12";
                    case AMPM -> "AM";
                };
            });
        }
        return out.toString();
    }

    // ==================================================================
    // DDL (the JVM lane: test fixtures; never on the product path)
    // ==================================================================

    /** Postgres has no TINYINT, BIT or bare DOUBLE; FLOAT is DOUBLE PRECISION as on H2. */
    @Override
    protected String ddlType(com.legend.sql.SqlDdl.ColumnType t) {
        if (t instanceof com.legend.sql.SqlDdl.ColumnType.Plain p) {
            return switch (p.kind()) {
                case TINYINT -> "SMALLINT";
                case FLOAT, DOUBLE -> "DOUBLE PRECISION";
                case BIT -> "BOOLEAN";
                case JSON -> "JSONB";
                case BIGINT, SMALLINT, INTEGER, REAL, TIMESTAMP, DATE, VARCHAR, OTHER, DISTINCT,
                     ARRAY, OBJECT -> super.ddlType(t);
            };
        }
        return super.ddlType(t);
    }

    /** Table names quote like the query's table references. */
    @Override
    protected String ddlQualified(@com.legend.base.Nullable String schema, String table) {
        return schema == null || schema.isEmpty() || "default".equals(schema)
                ? ident(table) : ident(schema) + "." + ident(table);
    }

    /** Schema names quote like the query's schema-qualified references. */
    @Override
    public String render(com.legend.sql.SqlDdl ddl) {
        if (ddl instanceof com.legend.sql.SqlDdl.CreateSchema cs) {
            return "Create Schema if not exists " + ident(cs.schema()) + ";";
        }
        if (ddl instanceof com.legend.sql.SqlDdl.DropSchema ds) {
            return "Drop schema if exists " + ident(ds.schema()) + " cascade;";
        }
        return super.render(ddl);
    }
}
