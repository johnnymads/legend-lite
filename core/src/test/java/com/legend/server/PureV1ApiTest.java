package com.legend.server;

import com.legend.json.Json;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * legend-lite's {@code pure/v1} answers against legend-engine 4.145.0's OWN answers to the
 * same requests, committed under {@code upstream-api/}
 * (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md, U3).
 *
 * <p>E1 is byte-exact. E5 and E9 are compared as whole JSON trees after the RECORDED
 * differences are applied to the engine's side, each named once, below; anything else that
 * differs fails. The SQL text is not compared (two compilers spell SQL two ways): both
 * queries run on H2 over the model's own setup data and must return the same rows.
 */
class PureV1ApiTest {

    /**
     * RECORDED DIFFERENCE 1, the type vocabulary: legend-engine types a relation's
     * columns with precise primitives; legend-lite's typer has none (the untangle's
     * compiler work). The engine's names map to lite's; a Varchar's size goes with it.
     */
    private static final Map<String, String> VOCABULARY = Map.of(
            "meta::pure::precisePrimitives::Varchar", "String",
            "meta::pure::precisePrimitives::Int", "Integer",
            "meta::pure::precisePrimitives::BigInt", "Integer",
            "meta::pure::precisePrimitives::Double", "Float",
            "meta::pure::precisePrimitives::Numeric", "Decimal",
            "meta::pure::precisePrimitives::Timestamp", "DateTime");

    private final String model = resource("upstream-api/trades-h2.pure");
    private final String query = resource("upstream-api/e1-groupby-sort.pure");
    private final String lambda = resource("upstream-api/e1-groupby-sort.json");

    PureV1ApiTest() throws IOException {
    }

    @Test
    void e1_grammarToJsonLambda_isByteExact() {
        PureV1Api.Answer a = PureV1Api.grammarToJsonLambda(query, true);
        assertEquals(200, a.status(), a.json());
        assertEquals(Json.toCompact(Json.parse(lambda)), Json.toCompact(Json.parse(a.json())));
    }

    @Test
    void e1_textThatIsNotALambda_isWrappedAsTheEngineWrapsIt() throws IOException {
        // the wrapper spans the TOKENS: a trailing comment and blank line do not extend it
        PureV1Api.Answer a = PureV1Api.grammarToJsonLambda(
                rawResource("upstream-api/e1-unprefixed-trailing-comment.pure"), true);
        assertEquals(200, a.status(), a.json());
        assertEquals(Json.toCompact(Json.parse(resource("upstream-api/e1-unprefixed-trailing-comment.json"))),
                Json.toCompact(Json.parse(a.json())));
    }

    @Test
    void e1_withoutSourceInformation_carriesNone() {
        PureV1Api.Answer a = PureV1Api.grammarToJsonLambda(query, false);
        assertFalse(a.json().contains("sourceInformation"), a.json());
    }

    @Test
    void e1_aParseErrorIsTheEnginesErrorShape() {
        PureV1Api.Answer a = PureV1Api.grammarToJsonLambda("1 +", true);
        assertEquals(400, a.status());
        Json.Obj o = Json.parseObject(a.json());
        assertEquals("error", o.getString("status"));
        assertEquals("PARSER", o.getString("errorType"));
    }

    @Test
    void aMalformedRequestIsTheCallersError_notABug() {
        PureV1Api.Answer a = PureV1Api.generatePlan("{\"function\": 1}");
        assertEquals(400, a.status(), a.json());
        assertEquals("error", Json.parseObject(a.json()).getString("status"));
    }

    @Test
    void e5_lambdaRelationType_isTheEnginesAnswer() throws IOException {
        String request = "{\"model\":" + textModel() + ",\"lambda\":" + lambda + "}";
        PureV1Api.Answer a = PureV1Api.lambdaRelationType(request);
        assertEquals(200, a.status(), a.json());
        Object engine = inLitesVocabulary(Json.parse(resource("upstream-api/e5-groupby-sort.json")));
        assertEquals(Json.toCompact(engine), Json.toCompact(Json.parse(a.json())));
    }

    @Test
    void e9_generatePlan_isTheEnginesPlan_andItsSqlGivesTheEnginesRows() throws Exception {
        String request = "{\"clientVersion\":\"vX_X_X\",\"function\":" + lambda
                + ",\"model\":" + textModel()
                + ",\"context\":{\"_type\":\"BaseExecutionContext\"}}";
        PureV1Api.Answer a = PureV1Api.generatePlan(request);
        assertEquals(200, a.status(), a.json());
        Json.Obj lite = Json.parseObject(a.json());
        Json.Obj engine = Json.parseObject(resource("upstream-api/e9-groupby-sort.json"));

        // the SQL: the same rows, on H2, over the model's own setup data
        Json.Obj liteSql = sqlNode(lite);
        Json.Obj engineSql = sqlNode(engine);
        List<String> setup = engineSql.getObj("connection").getObj("datasourceSpecification")
                .getStringArray("testDataSetupSqls");
        assertEquals(rows(setup, engineSql.getString("sqlQuery")),
                rows(setup, liteSql.getString("sqlQuery")));

        // everything else: the whole plan, the recorded differences applied
        assertEquals(Json.toCompact(comparable(engine)), Json.toCompact(comparable(lite)));
    }

    // ---------------------------------------------------------------------

    private String textModel() {
        return Json.toCompact(Map.of("_type", "text", "code", model));
    }

    private static Json.Obj sqlNode(Json.Obj plan) {
        return (Json.Obj) plan.getObj("rootExecutionNode").getArr("executionNodes").items().get(0);
    }

    /** A plan with its SQL text blanked and the recorded differences applied. */
    private static Object comparable(Json.Obj plan) {
        return rewrite(plan, null);
    }

    private static Object inLitesVocabulary(Json.Node n) {
        return rewrite(n, null);
    }

    /**
     * The recorded differences, applied structurally: the vocabulary (difference 1);
     * RECORDED DIFFERENCE 2, a plan's {@code resultColumns} carry no physical type in
     * lite (its typer has no physical provenance); the SQL text (compared by rows).
     */
    private static Object rewrite(Json.Node n, String key) {
        if (n instanceof Json.Obj o) {
            Map<String, Object> out = new LinkedHashMap<>();
            // a Varchar's size rides its generic type's typeVariableValues; lite's String
            // has none (a Numeric's precision and scale stay: lite's Decimal carries them)
            boolean sizedVarchar = o.getObjOr("rawType", null) instanceof Json.Obj raw
                    && "meta::pure::precisePrimitives::Varchar".equals(raw.getStringOr("fullPath", ""));
            for (Map.Entry<String, Json.Node> e : o.fields().entrySet()) {
                String k = e.getKey();
                Json.Node v = e.getValue();
                if (k.equals("sqlQuery")) {
                    out.put(k, "<compared by rows>");
                } else if (k.equals("dataType") && "resultColumns".equals(key)) {
                    out.put(k, "");
                } else if ((k.equals("fullPath") || k.equals("type")) && v instanceof Json.Str s
                        && VOCABULARY.containsKey(s.value())) {
                    out.put(k, VOCABULARY.get(s.value()));
                } else if (k.equals("typeVariableValues") && sizedVarchar) {
                    out.put(k, List.of());
                } else {
                    out.put(k, rewrite(v, k));
                }
            }
            return out;
        }
        if (n instanceof Json.Arr a) {
            List<Object> out = new ArrayList<>();
            for (Json.Node x : a.items()) {
                out.add(rewrite(x, key));
            }
            return out;
        }
        return n;
    }

    private static List<List<Object>> rows(List<String> setup, String sql) throws SQLException {
        // legend-engine's own H2 settings (its NON_KEYWORDS list, MODE=LEGACY): the setup
        // data names a `year` column, reserved in a bare H2 2.x
        try (Connection c = DriverManager.getConnection(
                "jdbc:h2:mem:" + com.legend.exec.H2Settings.SETTINGS);
                Statement st = c.createStatement()) {
            for (String s : setup) {
                st.execute(s);
            }
            List<List<Object>> out = new ArrayList<>();
            try (ResultSet rs = st.executeQuery(sql)) {
                int n = rs.getMetaData().getColumnCount();
                while (rs.next()) {
                    List<Object> row = new ArrayList<>();
                    for (int i = 1; i <= n; i++) {
                        Object v = rs.getObject(i);
                        row.add(v instanceof Number num ? num.doubleValue() : v);
                    }
                    out.add(row);
                }
            }
            return out;
        }
    }

    private static String resource(String name) throws IOException {
        return rawResource(name).strip();
    }

    private static String rawResource(String name) throws IOException {
        try (InputStream in = PureV1ApiTest.class.getClassLoader().getResourceAsStream(name)) {
            if (in == null) {
                throw new IOException("missing test resource " + name);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
