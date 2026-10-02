// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package org.finos.legend.lite.pct;

import junit.framework.Test;
import org.eclipse.collections.api.factory.Lists;
import org.eclipse.collections.api.list.MutableList;
import org.finos.legend.pure.code.core.RelationCodeRepositoryProvider;
import org.finos.legend.pure.m3.pct.reports.config.PCTReportConfiguration;
import org.finos.legend.pure.m3.pct.reports.config.exclusion.ExclusionSpecification;
import org.finos.legend.pure.m3.pct.reports.model.Adapter;
import org.finos.legend.pure.m3.pct.shared.model.ReportScope;
import org.finos.legend.pure.runtime.java.interpreted.testHelper.PureTestBuilderInterpreted;
import static org.finos.legend.engine.test.shared.framework.PureTestHelperFramework.wrapSuite;

/**
 * The relation PCT suite on Postgres 16 (leg P2, docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md Q5): the
 * SAME tests as {@link Test_LegendLite_RelationFunctions_PCT}, through the same adapter, on this JVM's
 * embedded Postgres ({@code LEGENDLITE_PCT_BACKEND=postgres}, pct/BUILD.bazel), with Postgres's OWN
 * expected failures -- legend-engine's shape, as {@link Test_LegendLite_H2_RelationFunctions_PCT}: every
 * expected failure named and pinned by the text it fails with, and a pinned test that starts passing fails
 * the run, so a fix is recorded by deleting its row.
 *
 * <p>First measured 2026-10-02 on Postgres 16.15 (45 rows): the rows are grouped by why -- wrong answers
 * (dialect defects, fixed first), Postgres's own errors, the collections and Variant of leg P4, and
 * constructs the dialect refuses by name.
 */
public class Test_LegendLite_Postgres_RelationFunctions_PCT extends PCTReportConfiguration {

    private static final ReportScope reportScope = RelationCodeRepositoryProvider.relationFunctions;
    private static final Adapter adapter = LegendLitePCTReportProvider.LegendLiteAdapter;
    private static final String platform = "interpreted";

    // Pinned by a STABLE part of the message (the runner matches by containment): no per-run id.
    private static final MutableList<ExclusionSpecification> expectedFailures = Lists.mutable.with(
            // collections and Variant over the jsonb carrier: leg P4
            one("meta::pure::functions::relation::tests::composition::testCoalesceInPreFilter_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::relation::tests::composition::testFilterPostProject_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::relation::tests::composition::testVariantArrayColumn_joinStrings_Function_1__Boolean_1_", "collection reduction 'STRING_AGG' reached a dialect without a list encoding"),
            one("meta::pure::functions::relation::tests::composition::testVariantArrayColumn_reverse_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantArrayColumn_sort_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_contains_Function_1__Boolean_1_", "collection membership reached a dialect without a list encoding [collection: Cast]"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_distinct_removeDuplicates_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_extend_indexExtraction_filter_Function_1__Boolean_1_", "VARIANT_GET reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_filterOnIsEmptyOfModelConversion_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_filterOnIsNotEmptyOfModelConversion_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_functionComposition_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_indexOf_Function_1__Boolean_1_", "LIST_POSITION reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_isEmpty_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_isNotEmpty_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_projectModelProperty_Function_1__Boolean_1_", "VARIANT_GET reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantColumn_slice_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::composition::testVariantMapColumn_keys_LateralFlatten_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::composition::testVariantMapColumn_values_LateralFlatten_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::composition::testVariant_if_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_filter_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_fold_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_indexExtraction_Function_1__Boolean_1_", "VARIANT_GET reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_keyExtraction_Function_1__Boolean_1_", "VARIANT_GET reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::extend::testVariantColumn_map_Function_1__Boolean_1_", "TO_VARIANT reached Postgres: variant over jsonb is leg P4"),
            one("meta::pure::functions::relation::tests::filter::testVariantColumn_filterOnIndexExtractionValue_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::filter::testVariantColumn_filterOnIsEmptyOfKeyExtraction_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::filter::testVariantColumn_filterOnIsNotEmptyOfKeyExtraction_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::filter::testVariantColumn_filterOnKeyExtractionValue_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::filter::testVariantColumn_filterOutputFromLambda_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::tests::project::testSimpleProjectList_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::relation::tests::project::testSimpleProjectWithEmpty_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::relation::tests::project::testSimpleProject_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::relation::variant::tests::flatten::testFlatten_LateralJoin_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::variant::tests::flatten::testFlatten_LateralJoin_Nested_Extend_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::relation::variant::tests::flatten::testFlatten_LateralJoin_Nested_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::variant::tests::flatten::testFlatten_Variant_Array_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)"),
            one("meta::pure::functions::relation::variant::tests::flatten::testFlatten_Variant_Map_Function_1__Boolean_1_", "a cast to JSON reached Postgres before the jsonb carrier (leg P4)")
    );

    public static Test suite() {
        return PctCensusGate.wrap("Relation", wrapSuite(
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
