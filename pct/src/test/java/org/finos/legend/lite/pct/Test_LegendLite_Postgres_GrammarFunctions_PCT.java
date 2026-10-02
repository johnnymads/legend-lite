// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package org.finos.legend.lite.pct;

import junit.framework.Test;
import org.eclipse.collections.api.factory.Lists;
import org.eclipse.collections.api.list.MutableList;
import org.finos.legend.pure.m3.PlatformCodeRepositoryProvider;
import org.finos.legend.pure.m3.pct.reports.config.PCTReportConfiguration;
import org.finos.legend.pure.m3.pct.reports.config.exclusion.ExclusionSpecification;
import org.finos.legend.pure.m3.pct.reports.model.Adapter;
import org.finos.legend.pure.m3.pct.shared.model.ReportScope;
import org.finos.legend.pure.runtime.java.interpreted.testHelper.PureTestBuilderInterpreted;
import static org.finos.legend.engine.test.shared.framework.PureTestHelperFramework.wrapSuite;

/**
 * The grammar PCT suite on Postgres 16 (leg P2, docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md Q5): the
 * SAME tests as {@link Test_LegendLite_GrammarFunctions_PCT}, through the same adapter, on this JVM's
 * embedded Postgres ({@code LEGENDLITE_PCT_BACKEND=postgres}, pct/BUILD.bazel), with Postgres's OWN
 * expected failures -- legend-engine's shape, as {@link Test_LegendLite_H2_RelationFunctions_PCT}: every
 * expected failure named and pinned by the text it fails with, and a pinned test that starts passing fails
 * the run, so a fix is recorded by deleting its row.
 *
 * <p>First measured 2026-10-02 on Postgres 16.15 (24 rows): the rows are grouped by why -- wrong answers
 * (dialect defects, fixed first), Postgres's own errors, the collections and Variant of leg P4, and
 * constructs the dialect refuses by name.
 */
public class Test_LegendLite_Postgres_GrammarFunctions_PCT extends PCTReportConfiguration {

    private static final ReportScope reportScope = PlatformCodeRepositoryProvider.grammarFunctions;
    private static final Adapter adapter = LegendLitePCTReportProvider.LegendLiteAdapter;
    private static final String platform = "interpreted";

    // Pinned by a STABLE part of the message (the runner matches by containment): no per-run id.
    private static final MutableList<ExclusionSpecification> expectedFailures = Lists.mutable.with(
            // Postgres raises differently (its own error, or a different position or wording)
            one("meta::pure::functions::collection::tests::range::testRangeStepError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            // collections and Variant over the jsonb carrier: leg P4
            one("meta::pure::functions::boolean::tests::equality::eq::testEqNonPrimitive_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::boolean::tests::equality::eq::testEqVarIdentity_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::boolean::tests::equality::equal::testEqualNonPrimitive_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::boolean::tests::equality::equal::testEqualVarIdentity_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::filter::testFilterInstance_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::first::testFirstComplex_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::map::testMapInstance_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::map::testMapRelationshipFromManyToMany_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::map::testMapRelationshipFromManyToOne_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::range::testRangeWithStartStopEqual_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testRangeWithStep_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testRangeWithVariables_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testRange_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testReverseRangeWithPositiveStep_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testReverseRangeWithStep_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::range::testReverseRange_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::lang::tests::letFn::testAssignNewInstance_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::string::tests::plus::testPlusInCollect_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::string::tests::plus::testPlusInIterate_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            // refused by name: a construct the Postgres dialect does not spell yet
            one("meta::pure::functions::boolean::tests::equality::eq::testEqPrimitiveExtension_Function_1__Boolean_1_", "unknown type 'meta::pure::functions::boolean::tests::equalitymodel::ExtendedInteger' in @meta::pure::functions::boolean::tests::equalitymodel::ExtendedInteger"),
            one("meta::pure::functions::boolean::tests::equality::equal::testEqualPrimitiveExtension_Function_1__Boolean_1_", "unknown type 'meta::pure::functions::boolean::tests::equalitymodel::ExtendedInteger' in @meta::pure::functions::boolean::tests::equalitymodel::ExtendedInteger"),
            one("meta::pure::functions::collection::tests::getAll::testBasic_Function_1__Boolean_1_", "system database: no in-memory engine for a 'PostgreSQL' session"),
            one("meta::pure::functions::collection::tests::map::testMapRelationshipFromOneToOne_Function_1__Boolean_1_", "unbound variable '$address'")
    );

    public static Test suite() {
        return PctCensusGate.wrap("Grammar", wrapSuite(
                () -> true,
                () -> PureTestBuilderInterpreted.buildPCTTestSuite(reportScope, expectedFailures, adapter),
                () -> false,
                Lists.mutable.empty()));
    }

    @Override
    public MutableList<ExclusionSpecification> expectedFailures() {
        return expectedFailures;
    }

    @Override
    public ReportScope getReportScope() {
        return reportScope;
    }

    @Override
    public Adapter getAdapter() {
        return adapter;
    }

    @Override
    public String getPlatform() {
        return platform;
    }
}
