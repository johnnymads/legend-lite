// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.server;

import com.legend.json.Json;
import com.legend.parser.PmcdParser;
import com.legend.parser.SpecParser;
import com.legend.plan.PlanSupportFunctions;
import com.legend.plan.QueryPlan;
import com.legend.plan.UpstreamRelationType;
import com.legend.protocol.ProtocolEmitter;
import com.legend.protocol.ProtocolReader;
import com.legend.protocol.PureComposer;
import com.legend.protocol.spec.LambdaFunction;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * legend-engine's {@code pure/v1} API, served by legend-lite EXACTLY
 * (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md; the user's ruling of 2026-09-27: lite's
 * client surface is upstream's APIs and nothing of its own). Each call is a pure function
 * of its request -- text in, a status and JSON out -- so it is tested without HTTP;
 * {@link LegendHttpServer} only carries it.
 *
 * <ul>
 *   <li>E1 {@code grammar/grammarToJson/lambda}: Pure text to lambda JSON (the parser's
 *       records through {@link ProtocolEmitter}, byte-exact).</li>
 *   <li>E2 {@code grammar/grammarToJson/model}: model text to PMCD JSON
 *       ({@link PmcdParser}, byte-exact).</li>
 *   <li>E4 {@code grammar/jsonToGrammar/lambda} (and {@code /batch}): lambda JSON to Pure
 *       text ({@link PureComposer}, byte parity with upstream's printer).</li>
 *   <li>E5 {@code compilation/lambdaRelationType}: a query's result columns as the
 *       compiler types them ({@link UpstreamRelationType}).</li>
 *   <li>E9 {@code execution/generatePlan}: the relational TDS execution plan.</li>
 * </ul>
 *
 * <p>The model travels as {@code PureModelContextText}; any other model context is refused
 * in upstream's error shape until the PMCD reader exists (recorded). Recorded differences
 * from legend-engine, each named in the parity test: lite's type names (no precise
 * primitives), and a plan's {@code resultColumns} carry no physical type.
 */
public final class PureV1Api {

    private PureV1Api() {
    }

    /** An answer: HTTP status, a body, and its media type ({@code application/json} unless said). */
    public record Answer(int status, String json, String contentType) {
        public Answer(int status, String json) {
            this(status, json, "application/json");
        }
    }

    /**
     * A request body's JSON. A query built as protocol JSON nests a few levels per chained
     * function, so the default limit (64, sized for configuration files) would refuse a long
     * cube query; 1024 still bounds a hostile body.
     */
    static final Json.Config REQUEST = new Json.Config(1024);

    private static Json.Obj request(String body) {
        Json.Node n = Json.parse(body, REQUEST);
        if (n instanceof Json.Obj o) {
            return o;
        }
        throw new IllegalArgumentException("the request body is not a JSON object");
    }

    // ---------------------------------------------------------------------
    // E1 / E2: grammar to JSON
    // ---------------------------------------------------------------------

    /** E1: a lambda's text to its protocol JSON. Text without a leading {@code |} is
     *  wrapped in a parameterless lambda spanning the whole text, as the engine does. */
    public static Answer grammarToJsonLambda(String text, boolean returnSourceInformation) {
        return answer(400, "PARSER", () -> {
            String json = ProtocolEmitter.emitLambda(SpecParser.parseLambda(text));
            return returnSourceInformation ? json : withoutSourceInformation(json);
        });
    }

    /** E2: a model's text to its PMCD JSON. */
    public static Answer grammarToJsonModel(String text, boolean returnSourceInformation) {
        return answer(400, "PARSER", () -> {
            String json = PmcdParser.parseDocument(text);
            return returnSourceInformation ? json : withoutSourceInformation(json);
        });
    }

    // ---------------------------------------------------------------------
    // E4: JSON to grammar
    // ---------------------------------------------------------------------

    /**
     * E4 {@code grammar/jsonToGrammar/lambda}: a lambda's protocol JSON to its Pure text, as
     * upstream prints it ({@link PureComposer}; byte parity pinned by ComposerParityTest).
     * {@code text/plain}; {@code renderStyle} is {@code PRETTY} (upstream's default) or
     * {@code STANDARD}.
     */
    public static Answer jsonToGrammarLambda(String body, @com.legend.base.Nullable String renderStyle) {
        Answer a = answer(500, null, () -> PureComposer.lambda(request(body), style(renderStyle)));
        return a.status() == 200 ? new Answer(200, a.json(), "text/plain") : a;
    }

    /** E4 {@code grammar/jsonToGrammar/lambda/batch}: {@code {key: lambda}} to {@code {key: text}}. */
    public static Answer jsonToGrammarLambdaBatch(String body, @com.legend.base.Nullable String renderStyle) {
        return answer(500, null, () -> {
            PureComposer.Style style = style(renderStyle);
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Json.Node> e : request(body).fields().entrySet()) {
                if (!(e.getValue() instanceof Json.Obj lambda)) {
                    throw new IllegalArgumentException("the batch entry '" + e.getKey() + "' is not a lambda");
                }
                out.put(e.getKey(), PureComposer.lambda(lambda, style));
            }
            return Json.toCompact(out);
        });
    }

    private static PureComposer.Style style(@com.legend.base.Nullable String renderStyle) {
        if (renderStyle == null || renderStyle.isEmpty() || "PRETTY".equals(renderStyle)) {
            return PureComposer.Style.PRETTY;
        }
        if ("STANDARD".equals(renderStyle)) {
            return PureComposer.Style.STANDARD;
        }
        throw new IllegalArgumentException("renderStyle '" + renderStyle
                + "' is not served by legend-lite (PRETTY or STANDARD)");
    }

    // ---------------------------------------------------------------------
    // E5: relation type
    // ---------------------------------------------------------------------

    /** E5: {@code {model, lambda}} to the query's {@code RelationType}. */
    public static Answer lambdaRelationType(String body) {
        return answer(400, "COMPILATION", () -> {
            Json.Obj request = request(body);
            String model = modelText(request.getObj("model"));
            LambdaFunction lambda = ProtocolReader.lambda(request.getObj("lambda"));
            return Json.toCompact(UpstreamRelationType.of(
                    com.legend.Compiler.resultType(model, lambda)));
        });
    }

    // ---------------------------------------------------------------------
    // E9: generatePlan
    // ---------------------------------------------------------------------

    /** E9: an {@code ExecuteInput} to the relational TDS {@code SingleExecutionPlan}. */
    public static Answer generatePlan(String body) {
        // the engine answers generatePlan's and execute's compile errors 500 (measured)
        return answer(500, "COMPILATION", () -> {
            Json.Obj request = request(body);
            String model = modelText(request.getObj("model"));
            LambdaFunction lambda = ProtocolReader.lambda(request.getObj("function"));
            com.legend.Compiler.Target target = com.legend.Compiler.target(model, lambda);
            String runtime = runtimeOf(request, target);
            QueryPlan plan = com.legend.Compiler.plan(model, lambda, runtime);
            return Json.toCompact(executionPlan(plan,
                    connectionOf(model, runtime, target.store())));
        });
    }

    // ---------------------------------------------------------------------
    // E8: execute
    // ---------------------------------------------------------------------

    /**
     * E8: an {@code ExecuteInput} run on its runtime's connection -- established first, as
     * legend-engine does on acquisition -- answered in the engine's TDS result shape. The
     * database renders every value; Java arranges the rows into {@code {"values": [...]}}.
     */
    public static Answer execute(String body) {
        return answer(500, "COMPILATION", () -> {
            Json.Obj request = request(body);
            String model = modelText(request.getObj("model"));
            LambdaFunction lambda = ProtocolReader.lambda(request.getObj("function"));
            String runtime = runtimeOf(request, com.legend.Compiler.target(model, lambda));
            java.io.StringWriter rows = new java.io.StringWriter();
            QueryPlan plan = new QueryService().executeUpstream(model, lambda, runtime, rows);
            return tdsResult(plan, rows.toString());
        });
    }

    /**
     * The engine's TDS result, byte for byte in its layout (its streaming serializer's
     * separators): {@code builder} (each column's Pure type and relational spelling),
     * the {@code relational} activity carrying the SQL, then the columns and rows.
     */
    static String tdsResult(QueryPlan plan, String wireRows) {
        List<com.legend.compiler.element.type.Type.Column> cols = UpstreamRelationType.columns(plan.rootType());
        List<Map<String, Object>> builderCols = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (var c : cols) {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("name", c.name());
            col.put("type", UpstreamRelationType.typePath(c.type()));
            col.put("relationalType", UpstreamRelationType.relationalSpelling(c.type()));
            builderCols.add(col);
            names.add(c.name());
        }
        Map<String, Object> builder = new LinkedHashMap<>();
        builder.put("_type", "tdsBuilder");
        builder.put("columns", builderCols);
        Map<String, Object> activity = new LinkedHashMap<>();
        activity.put("_type", "relational");
        activity.put("comment", "-- \"executionTraceID\" : \"" + java.util.UUID.randomUUID() + "\"");
        activity.put("sql", plan.sql());
        StringBuilder out = new StringBuilder();
        out.append("{\"builder\": ").append(Json.toCompact(builder))
                .append(", \"activities\": ").append(Json.toCompact(List.of(activity)))
                .append(", \"result\" : {\"columns\" : ").append(Json.toCompact(names))
                .append(", \"rows\" : [");
        Json.Node wire = wireRows.isEmpty() ? new Json.Arr(List.of()) : Json.parse(wireRows);
        boolean first = true;
        for (Json.Node row : ((Json.Arr) wire).items()) {
            Json.Obj r = (Json.Obj) row;
            List<Object> values = new ArrayList<>();
            for (String n : names) {
                values.add(r.fields().get(n));
            }
            out.append(first ? "" : ",").append("{\"values\": ").append(Json.toCompact(values)).append('}');
            first = false;
        }
        return out.append("]}}").toString();
    }

    /**
     * The plan legend-engine generates for a relational TDS query: a
     * {@code relationalTdsInstantiation} root over one {@code sql} node. Key order is the
     * engine's ({@code _type} first, then alphabetical).
     */
    static Map<String, Object> executionPlan(QueryPlan plan, Map<String, Object> connection) {
        List<Map<String, Object>> tdsColumns = new ArrayList<>();
        List<Map<String, Object>> resultColumns = new ArrayList<>();
        for (var c : UpstreamRelationType.columns(plan.rootType())) {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("enumMapping", Map.of());
            col.put("name", c.name());
            col.put("relationalType", UpstreamRelationType.relationalSpelling(c.type()));
            col.put("type", UpstreamRelationType.typePath(c.type()));
            tdsColumns.add(col);
            Map<String, Object> rc = new LinkedHashMap<>();
            // the engine spells a PASS-THROUGH column's physical type here, a computed
            // one's as "" -- lite's typer has no physical provenance (recorded)
            rc.put("dataType", "");
            rc.put("label", "\"" + c.name() + "\"");
            resultColumns.add(rc);
        }
        Map<String, Object> anyType = new LinkedHashMap<>();
        anyType.put("_type", "dataType");
        anyType.put("dataType", "meta::pure::metamodel::type::Any");
        Map<String, Object> sql = new LinkedHashMap<>();
        sql.put("_type", "sql");
        sql.put("authDependent", false);
        sql.put("connection", connection);
        sql.put("executionNodes", List.of());
        sql.put("isMutationSQL", false);
        sql.put("resultColumns", resultColumns);
        sql.put("resultType", anyType);
        sql.put("sqlComment", "-- \"executionTraceID\" : \"${execID}\"");
        sql.put("sqlQuery", plan.sql());
        Map<String, Object> tds = new LinkedHashMap<>();
        tds.put("_type", "tds");
        tds.put("tdsColumns", tdsColumns);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("_type", "relationalTdsInstantiation");
        root.put("authDependent", false);
        root.put("executionNodes", List.of(sql));
        root.put("resultType", tds);
        Map<String, Object> serializer = new LinkedHashMap<>();
        serializer.put("name", "pure");
        serializer.put("version", "vX_X_X");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("_type", "simple");
        out.put("authDependent", false);
        out.put("rootExecutionNode", root);
        out.put("serializer", serializer);
        out.put("templateFunctions", PlanSupportFunctions.relationalPlanSupportFunctions(null));
        return out;
    }

    /**
     * The runtime's connection for {@code store}, as a plan carries it: the model's own
     * {@code connectionValue} (lite's byte-exact PMCD) without {@code databaseType} and
     * the source spans, with {@code postProcessors} and an EMPTY {@code element} --
     * legend-engine's plan shape, measured against 4.145.0 on 2026-09-27.
     */
    /** The connection fields a plan does not carry (measured, 4.145.0). */
    private static final java.util.Set<String> NOT_IN_A_PLAN =
            java.util.Set.of("databaseType", "sourceInformation", "elementSourceInformation");

    static Map<String, Object> connectionOf(String model, String runtime,
            @com.legend.base.Nullable String store) {
        Json.Arr elements = Json.parseObject(PmcdParser.parseDocument(model)).getArr("elements");
        Json.Obj rt = element(elements, "runtime", runtime);
        String pointer = null;
        List<Json.Node> connections = rt.getObj("runtimeValue").getArr("connections").items();
        if (store == null && connections.size() != 1) {
            throw new com.legend.error.NotImplementedException("generatePlan: a class query's "
                    + "store is chosen by its mapping, and a runtime of " + connections.size()
                    + " connections is unprobed");
        }
        for (Json.Node c : connections) {
            Json.Obj sc = (Json.Obj) c;
            if (store != null && !store.equals(sc.getObj("store").getString("path"))) {
                continue;
            }
            for (Json.Node n : sc.getArr("storeConnections").items()) {
                Json.Obj conn = ((Json.Obj) n).getObj("connection");
                if (!"connectionPointer".equals(conn.getString("_type"))) {
                    throw new com.legend.error.NotImplementedException(
                            "generatePlan: an embedded runtime connection is unprobed");
                }
                pointer = conn.getString("connection");
                break;
            }
        }
        if (pointer == null) {
            throw new IllegalArgumentException("runtime " + runtime + " has no connection"
                    + (store == null ? "" : " for " + store));
        }
        Json.Obj value = element(elements, "connection", pointer).getObj("connectionValue");
        Map<String, Object> out = new java.util.TreeMap<>();
        for (Map.Entry<String, Json.Node> e : value.fields().entrySet()) {
            if (!NOT_IN_A_PLAN.contains(e.getKey())) {
                out.put(e.getKey(), withoutSourceInformation(e.getValue()));
            }
        }
        out.putIfAbsent("postProcessors", List.of());
        out.put("element", "");
        Map<String, Object> ordered = new LinkedHashMap<>();
        Object type = out.remove("_type");
        ordered.put("_type", type);
        ordered.putAll(out);
        return ordered;
    }

    private static Json.Obj element(Json.Arr elements, String type, String path) {
        for (Json.Node n : elements.items()) {
            Json.Obj e = (Json.Obj) n;
            if (type.equals(e.getStringOr("_type", ""))
                    && path.equals(e.getStringOr("package", "") + "::" + e.getStringOr("name", ""))) {
                return e;
            }
        }
        throw new IllegalArgumentException("the model has no " + type + " " + path);
    }

    /** The runtime: the request's own, else the one the query's {@code ->from} binds. */
    private static String runtimeOf(Json.Obj request, com.legend.Compiler.Target target) {
        Json.Obj rt = request.getObjOr("runtime", null);
        if (rt != null && rt.has("runtime")) {
            return rt.getString("runtime");
        }
        if (target.runtime() == null) {
            throw new IllegalArgumentException(
                    "no runtime: the request names none and the query has no ->from(runtime)");
        }
        return target.runtime();
    }

    // ---------------------------------------------------------------------
    // Plumbing
    // ---------------------------------------------------------------------

    /** A {@code PureModelContextText}'s code; any other model context is refused. */
    private static String modelText(Json.Obj model) {
        String type = model.getStringOr("_type", "");
        if (!"text".equals(type)) {
            throw new IllegalArgumentException("a model of _type '" + type + "': legend-lite reads "
                    + "PureModelContextText ({\"_type\":\"text\",\"code\":...}); the PMCD reader is not built");
        }
        return model.getString("code");
    }

    private static String withoutSourceInformation(String json) {
        return com.legend.protocol.SourceInformation.strip(json);
    }

    private static Object withoutSourceInformation(Json.Node n) {
        return com.legend.protocol.SourceInformation.strip(n);
    }

    /**
     * A call's JSON, or its failure in the engine's error shape, with the engine's status
     * for each kind (measured against 4.145.0, 2026-09-27):
     * <ul>
     *   <li>the text does not parse or compile, or the construct is not implemented:
     *       {@code status} with {@code errorType} (grammar and lambdaRelationType answer
     *       400, generatePlan and execute 500);</li>
     *   <li>a malformed request, or the database refusing: 500, no {@code errorType}, the
     *       message naming the exception;</li>
     *   <li>anything else is a BUG: logged whole, answered 500 the same way -- never a
     *       dropped connection.</li>
     * </ul>
     */
    private static Answer answer(int status, @com.legend.base.Nullable String errorType, Supplier<String> call) {
        try {
            return new Answer(200, call.get());
        } catch (com.legend.error.LegendCompileException
                | com.legend.error.NotImplementedException
                | com.legend.sql.dialect.DialectCapability e) {
            return error(status, errorType, String.valueOf(e.getMessage()));
        } catch (IllegalArgumentException | com.legend.error.DataError e) {
            Throwable named = e instanceof com.legend.error.DataError && e.getCause() != null ? e.getCause() : e;
            return error(500, null, named.getClass().getSimpleName() + ": " + named.getMessage());
        } catch (RuntimeException | StackOverflowError e) {
            e.printStackTrace();
            return error(500, null, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    private static Answer error(int status, @com.legend.base.Nullable String errorType, String message) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", -1);
        if (errorType != null) {
            out.put("errorType", errorType);
        }
        out.put("message", message);
        out.put("status", "error");
        return new Answer(status, Json.toCompact(out));
    }
}
