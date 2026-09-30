// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.server;

import com.legend.error.LegendCompileException;
import com.legend.error.ModelException;
import com.legend.error.NotImplementedException;
import com.legend.json.Json;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code POST pure/v1/analytics/mapping/modelCoverage} against legend-engine 4.145.0's own
 * answers. Each {@code upstream-api/coverage/<case>.pure} was POSTed to the running engine
 * (2026-09-30) with {@code returnMappedEntityInfo} and {@code returnMappedPropertyInfo} both
 * false ({@code <case>.json}) and both true ({@code <case>.info.json}); lite's answer must be
 * the same JSON, key and array order included (the engine's order is deterministic: repeated
 * requests answer byte-identically).
 *
 * <p>{@code trading.pure} is a copy of {@code query/demo/models/trading.pure}; the
 * {@code relational-inheritance} and {@code m2m} cases are adapted from legend-engine's
 * {@code core_analytics_mapping/modelCoverage/analyticsTest.pure}.
 */
class ModelCoverageTest {

    @ParameterizedTest
    @CsvSource({
            "trading, demo::trading::TradingMapping",
            "relational-inheritance, test::coverage::sampleRelationalMapping",
            "relational-embedded, test::coverage::EmbeddedMapping",
            "relational-inline-otherwise, test::coverage::InlineMapping",
            "relational-multi, test::coverage::MultiMapping",
            "m2m, test::coverage::sampleModelToModelMapping",
            "includes, test::coverage::MainMapping",
    })
    void answersAsTheEngine(String fixture, String mapping) throws IOException {
        String model = resource(fixture + ".pure");
        assertEquals(canonical(resource(fixture + ".json")),
                canonical(ModelCoverage.analyze(model, mapping, false, false)), fixture);
        assertEquals(canonical(resource(fixture + ".info.json")),
                canonical(ModelCoverage.analyze(model, mapping, true, true)), fixture + " (with info)");
    }

    @Test
    void theRequestCarriesTheModelAndTheFlagsAreQueryParameters() throws IOException {
        String body = request("demo::trading::TradingMapping", resource("trading.pure"));
        assertEquals(canonical(resource("trading.info.json")),
                canonical(ModelCoverage.analyze(body, "true", "TRUE", null)));
        assertEquals(canonical(resource("trading.json")), canonical(ModelCoverage.analyze(body)));
    }

    @Test
    void anUnknownMappingIsTheEnginesCompilationError() throws IOException {
        String body = request("demo::trading::Nope", resource("trading.pure"));
        ModelException e = assertThrows(ModelException.class, () -> ModelCoverage.analyze(body));
        // the engine: 500 COMPILATION "Can't find mapping 'demo::trading::Nope'"
        assertEquals("Can't find mapping 'demo::trading::Nope'", e.getMessage());
    }

    @Test
    void aFlagInTheBodyIsRefusedAsTheEngineRefusesIt() throws IOException {
        String body = Json.toCompact(Map.of("clientVersion", "vX_X_X", "mapping", "demo::trading::TradingMapping",
                "returnMappedEntityInfo", true,
                "model", Map.of("_type", "text", "code", resource("trading.pure"))));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> ModelCoverage.analyze(body));
        assertTrue(e.getMessage().contains("Unrecognized field \"returnMappedEntityInfo\""), e.getMessage());
    }

    @Test
    void theLightGraphIsRefused() throws IOException {
        String body = request("demo::trading::TradingMapping", resource("trading.pure"));
        NotImplementedException e = assertThrows(NotImplementedException.class,
                () -> ModelCoverage.analyze(body, null, null, "true"));
        assertTrue(e.getMessage().contains("returnLightGraph"), e.getMessage());
    }

    /** The engine (milestoned.json) adds the generated {@code <set>_milestoning} embedded entity. */
    @Test
    void aMilestonedClassIsRefused() throws IOException {
        NotImplementedException e = assertThrows(NotImplementedException.class, () -> ModelCoverage.analyze(
                resource("milestoned.pure"), "test::coverage::MilestonedMapping", true, true));
        assertTrue(e.getMessage().contains("milestoned class 'test::coverage::Product'"), e.getMessage());
    }

    /**
     * The engine (m2m-automapped.json) passes a class-typed M2M property whose class has no set
     * through the source graph ({@code <target>_<src>_autoMapped_<property>} entities); lite's
     * compiler refuses such a mapping outright, so the analysis never runs.
     */
    @Test
    void anAutoMappedM2MPropertyIsRefusedByTheCompiler() throws IOException {
        LegendCompileException e = assertThrows(LegendCompileException.class, () -> ModelCoverage.analyze(
                resource("m2m-automapped.pure"), "test::coverage::autoMappedMapping", true, true));
        assertTrue(e.getMessage().contains("targets unmapped class 'test::coverage::Shared'"), e.getMessage());
    }

    private static String request(String mapping, String code) {
        return Json.toCompact(Map.of("clientVersion", "vX_X_X", "mapping", mapping,
                "model", Map.of("_type", "text", "code", code)));
    }

    private static String canonical(String json) {
        return Json.toCompact(Json.parse(json.strip()));
    }

    private static String resource(String name) throws IOException {
        String path = "upstream-api/coverage/" + name;
        try (InputStream in = ModelCoverageTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new IOException("missing test resource " + path);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
