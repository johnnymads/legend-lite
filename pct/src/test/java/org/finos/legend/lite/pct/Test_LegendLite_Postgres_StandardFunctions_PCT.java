// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package org.finos.legend.lite.pct;

import junit.framework.Test;
import org.eclipse.collections.api.factory.Lists;
import org.eclipse.collections.api.list.MutableList;
import org.finos.legend.pure.code.core.CoreStandardFunctionsCodeRepositoryProvider;
import org.finos.legend.pure.m3.pct.reports.config.PCTReportConfiguration;
import org.finos.legend.pure.m3.pct.reports.config.exclusion.ExclusionSpecification;
import org.finos.legend.pure.m3.pct.reports.model.Adapter;
import org.finos.legend.pure.m3.pct.shared.model.ReportScope;
import org.finos.legend.pure.runtime.java.interpreted.testHelper.PureTestBuilderInterpreted;
import static org.finos.legend.engine.test.shared.framework.PureTestHelperFramework.wrapSuite;

/**
 * The standard PCT suite on Postgres 16 (leg P2, docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md Q5): the
 * SAME tests as {@link Test_LegendLite_StandardFunctions_PCT}, through the same adapter, on this JVM's
 * embedded Postgres ({@code LEGENDLITE_PCT_BACKEND=postgres}, pct/BUILD.bazel), with Postgres's OWN
 * expected failures -- legend-engine's shape, as {@link Test_LegendLite_H2_RelationFunctions_PCT}: every
 * expected failure named and pinned by the text it fails with, and a pinned test that starts passing fails
 * the run, so a fix is recorded by deleting its row.
 *
 * <p>First measured 2026-10-02 on Postgres 16.15 (76 rows): the rows are grouped by why -- wrong answers
 * (dialect defects, fixed first), Postgres's own errors, the collections and Variant of leg P4, and
 * constructs the dialect refuses by name.
 */
public class Test_LegendLite_Postgres_StandardFunctions_PCT extends PCTReportConfiguration {

    private static final ReportScope reportScope = CoreStandardFunctionsCodeRepositoryProvider.standardFunctions;
    private static final Adapter adapter = LegendLitePCTReportProvider.LegendLiteAdapter;
    private static final String platform = "interpreted";

    // Pinned by a STABLE part of the message (the runner matches by containment): no per-run id.
    private static final MutableList<ExclusionSpecification> expectedFailures = Lists.mutable.with(
            // collections and Variant over the jsonb carrier: leg P4
            one("meta::pure::functions::collection::tests::greatest::testGreatest_Boolean_Function_1__Boolean_1_", "ERROR: function max(boolean) does not exist"),
            one("meta::pure::functions::collection::tests::greatest::testGreatest_Empty_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::collection::tests::in::testInNonPrimitive_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::least::testLeast_Boolean_Function_1__Boolean_1_", "ERROR: function min(boolean) does not exist"),
            one("meta::pure::functions::collection::tests::least::testLeast_Empty_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::max::testMax_DateArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::max::testMax_DateTimeArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::max::testMax_StrictDateArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::min::testMin_DateArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::min::testMin_DateTimeArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::date::tests::min::testMin_StrictDateArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::max::testMax_FloatsArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::max::testMax_IntegersArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::max::testMax_NumbersArray_Function_1__Boolean_1_", "LIST_MAX over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::maxBy::testMaxBy_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::math::tests::min::testMin_FloatsArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::min::testMin_IntegersArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::min::testMin_NumbersArray_Function_1__Boolean_1_", "LIST_MIN over a list of Bottom[] reached Postgres: a nested list, a struct or a mixed list is the jsonb carrier (leg P4)"),
            one("meta::pure::functions::math::tests::minBy::testMinBy_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::math::tests::stdDev::testFloatStdDev_Function_1__Boolean_1_", "expected: 1.0\nactual:   1.00000000000000000000D"),
            one("meta::pure::functions::math::tests::stdDev::testIntStdDev_Function_1__Boolean_1_", "expected: 1.0\nactual:   1.00000000000000000000D"),
            one("meta::pure::functions::math::tests::stdDev::testMixedStdDev_Function_1__Boolean_1_", "expected: 1.0\nactual:   1.00000000000000000000D"),
            one("meta::pure::functions::math::tests::stdDev::testNegativeNumberStdDev_Function_1__Boolean_1_", "expected: 2.0\nactual:   2.0000000000000000D"),
            one("meta::pure::functions::math::tests::stdDev::testPopulationStandardDeviation_Function_1__Boolean_1_", "expected: 0.5\nactual:   0.50000000000000000000D"),
            one("meta::pure::functions::math::tests::variance::testVariancePopulation_Function_1__Boolean_1_", "expected: 0.25\nactual:   0.25000000000000000000D"),
            one("meta::pure::functions::math::tests::variance::testVarianceSample_Function_1__Boolean_1_", "expected: 1.0\nactual:   1.00000000000000000000D"),
            one("meta::pure::functions::math::tests::variance::testVariance_Population_Function_1__Boolean_1_", "expected: 0.25\nactual:   0.25000000000000000000D"),
            one("meta::pure::functions::math::tests::variance::testVariance_Sample_Function_1__Boolean_1_", "expected: 1.0\nactual:   1.00000000000000000000D"),
            // refused by name: a construct the Postgres dialect does not spell yet
            one("meta::pure::functions::hashCode::tests::testHashCode_Function_1__Boolean_1_", "signed 64-bit hashCode reached a dialect without a spelling"),
            one("meta::pure::functions::math::hashCode::tests::testHashCodeAggregate_Function_1__Boolean_1_", "signed 64-bit hashCode reached a dialect without a spelling")
    );

    public static Test suite() {
        return PctCensusGate.wrap("Standard", wrapSuite(
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
