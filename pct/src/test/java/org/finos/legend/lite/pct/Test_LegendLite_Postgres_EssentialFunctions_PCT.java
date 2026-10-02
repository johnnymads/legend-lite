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
 * The essential PCT suite on Postgres 16 (leg P2, docs/POSTGRES_DIALECT_HOMEWORK_2026_10_01.md Q5): the
 * SAME tests as {@link Test_LegendLite_EssentialFunctions_PCT}, through the same adapter, on this JVM's
 * embedded Postgres ({@code LEGENDLITE_PCT_BACKEND=postgres}, pct/BUILD.bazel), with Postgres's OWN
 * expected failures -- legend-engine's shape, as {@link Test_LegendLite_H2_RelationFunctions_PCT}: every
 * expected failure named and pinned by the text it fails with, and a pinned test that starts passing fails
 * the run, so a fix is recorded by deleting its row.
 *
 * <p>First measured 2026-10-02 on Postgres 16.15 (103 rows): the rows are grouped by why -- wrong answers
 * (dialect defects, fixed first), Postgres's own errors, the collections and Variant of leg P4, and
 * constructs the dialect refuses by name.
 */
public class Test_LegendLite_Postgres_EssentialFunctions_PCT extends PCTReportConfiguration {

    private static final ReportScope reportScope = PlatformCodeRepositoryProvider.essentialFunctions;
    private static final Adapter adapter = LegendLitePCTReportProvider.LegendLiteAdapter;
    private static final String platform = "interpreted";

    // Pinned by a STABLE part of the message (the runner matches by containment): no per-run id.
    private static final MutableList<ExclusionSpecification> expectedFailures = Lists.mutable.with(
            // WRONG ANSWERS: a result Pure does not give -- a dialect defect, fixed before P4 closes
            one("meta::pure::functions::collection::tests::indexof::testIndexOfOneElement_Function_1__Boolean_1_", "expected: 0\nactual:   1"),
            one("meta::pure::functions::math::tests::abs::testBigFloatAbs_Function_1__Boolean_1_", "expected: 123456789123456789.99\nactual:   123456789123456780.0"),
            one("meta::pure::functions::string::tests::indexOf::testFromIndex_Function_1__Boolean_1_", "expected: 1\nactual:   2"),
            one("meta::pure::functions::string::tests::indexOf::testSimple_Function_1__Boolean_1_", "expected: 4\nactual:   5"),
            // Postgres raises differently (its own error, or a different position or wording)
            one("meta::pure::functions::collection::tests::at::testAtError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::slice::testSliceError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::date::tests::testAdjustByDaysBigNumber_Function_1__Boolean_1_", "ERROR: interval out of range"),
            one("meta::pure::functions::date::tests::testAdjustByHoursBigNumber_Function_1__Boolean_1_", "ERROR: interval out of range"),
            one("meta::pure::functions::date::tests::testAdjustByMinutesBigNumber_Function_1__Boolean_1_", "ERROR: timestamp out of range"),
            one("meta::pure::functions::date::tests::testAdjustByMonthsBigNumber_Function_1__Boolean_1_", "ERROR: interval out of range"),
            one("meta::pure::functions::date::tests::testAdjustByWeeksBigNumber_Function_1__Boolean_1_", "ERROR: interval out of range"),
            one("meta::pure::functions::date::tests::testDayOfMonthError_Function_1__Boolean_1_", "Execution error column mismatch. Actual: 23 where expected: 36"),
            one("meta::pure::functions::date::tests::testHourError_Function_1__Boolean_1_", "Execution error column mismatch. Actual: 23 where expected: 36"),
            one("meta::pure::functions::date::tests::testMinuteError_Function_1__Boolean_1_", "Execution error column mismatch. Actual: 23 where expected: 36"),
            one("meta::pure::functions::date::tests::testNewDateError_Function_1__Boolean_1_", "Execution error column mismatch. Actual: 23 where expected: 29"),
            one("meta::pure::functions::date::tests::testSecondError_Function_1__Boolean_1_", "Execution error column mismatch. Actual: 23 where expected: 36"),
            one("meta::pure::functions::math::tests::testSquareRootError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"Unable to compute sqrt of -1"),
            one("meta::pure::functions::math::tests::trigonometry::testArcCosineError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"Infinite or NaN"),
            one("meta::pure::functions::math::tests::trigonometry::testArcSineError_Function_1__Boolean_1_", "Execution error message mismatch.\nThe actual message was \"Infinite or NaN"),
            // collections and Variant over the jsonb carrier: leg P4
            one("meta::pure::functions::collection::tests::removeDuplicates::testRemoveDuplicatesPrimitiveStandardFunctionExplicit_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::add::testAddWithOffset_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::add::testAdd_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::at::testAtOtherScenario_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::concatenate::testConcatenateTypeInference_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::contains::testContainsNonPrimitive_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::contains::testContainsWithFunction_Function_1__Boolean_1_", "LIST_LENGTH reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::drop::testDropInList_Function_1__Boolean_1_", "an array literal reached a dialect without array support"),
            one("meta::pure::functions::collection::tests::drop::testDropNegativeOnEmptyList_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::drop::testDropNegativeOnNonEmptyList_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::exists::testExistsInSelect_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::exists::testExists_Function_1__Boolean_1_", "LIST_EXISTS reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::find::testFindInstance_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::find::testFindLiteralFromVar_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::find::testFindLiteral_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::find::testFindUsingVarForFunction_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::fold::testFoldCollectionAccumulator_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::fold::testFoldEmptyListAndEmptyIdentity_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::fold::testFoldEmptyListAndNonEmptyIdentity_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            one("meta::pure::functions::collection::tests::fold::testFoldMixedAccumulatorTypes_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            one("meta::pure::functions::collection::tests::fold::testIntegerSum_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            one("meta::pure::functions::collection::tests::fold::testStringSum_Function_1__Boolean_1_", "fold reached a dialect without a fold encoding"),
            one("meta::pure::functions::collection::tests::forall::testforAllOnEmptySet_Function_1__Boolean_1_", "LIST_FOR_ALL reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::forall::testforAllOnNonEmptySetIsFalse_Function_1__Boolean_1_", "LIST_FOR_ALL reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::forall::testforAllOnNonEmptySetIsTrue_Function_1__Boolean_1_", "LIST_FOR_ALL reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::get::testGet_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::head::testHeadComplex_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::head::testHeadOnEmptySet_Function_1__Boolean_1_", "LIST_GET reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::indexof::testIndexOf_Function_1__Boolean_1_", "LIST_POSITION reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::keys::testKeys_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::put::testPut_addsEntry_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::put::testPut_emptyMap_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::put::testPut_overridesEntry_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::putAll::testPutAll_emptyInputMap_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::putAll::testPutAll_emptyPutEntries_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::putAll::testPutAll_overridesExistingAndAddNew_Function_1__Boolean_1_", "MAP_CONCAT reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::removeDuplicates::testRemoveDuplicatesEmptyListExplicit_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::removeDuplicates::testRemoveDuplicatesPrimitiveNonStandardFunction_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::reverse::testReverse_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::slice::testSliceInList_Function_1__Boolean_1_", "an array literal reached a dialect without array support"),
            one("meta::pure::functions::collection::tests::slice::testSliceOutOfBounds_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testMixedSortNoComparator_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testSimpleSortNoComparator_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testSimpleSortReversed_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testSimpleSortWithFunctionVariables_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testSimpleSortWithKey_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::sort::testSimpleSort_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::take::testTakeInList_Function_1__Boolean_1_", "an array literal reached a dialect without array support"),
            one("meta::pure::functions::collection::tests::take::testTakeNegativeOnEmptyList_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::take::testTakeNegativeOnNonEmptyList_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::values::testValues_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::collection::tests::zip::testZipBothListsAreOfPairs_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::zip::testZipBothListsSameLength_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::zip::testZipFirstListLonger_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::zip::testZipFirstListsIsOfPairs_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::zip::testZipSecondListLonger_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::collection::tests::zip::testZipSecondListsIsOfPairs_Function_1__Boolean_1_", "a struct literal reached a dialect without struct support"),
            one("meta::pure::functions::string::tests::joinStrings::testJoinStringsNoStrings_Function_1__Boolean_1_", "collection reduction 'STRING_AGG' reached a dialect without a list encoding"),
            one("meta::pure::functions::string::tests::split::testSplitWithNoSplit_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::string::tests::split::testSplit_Function_1__Boolean_1_", "UNNEST reached Postgres: collections over the jsonb carrier are leg P4"),
            one("meta::pure::functions::string::tests::toString::testComplexClassToString_Function_1__Boolean_1_", "a struct extraction reached a dialect without struct support"),
            one("meta::pure::functions::string::tests::toString::testPairCollectionToString_Function_1__Boolean_1_", "collection reduction 'STRING_AGG' reached a dialect without a list encoding"),
            // refused by name: a construct the Postgres dialect does not spell yet
            one("meta::pure::functions::collection::tests::fold::testFoldFiltering_Function_1__Boolean_1_", "'otherNames' is not a known class, mapping, runtime, connection, or database — user elements in a query need a fully qualified name"),
            one("meta::pure::functions::collection::tests::fold::testFoldToMany_Function_1__Boolean_1_", "'otherNames' is not a known class, mapping, runtime, connection, or database — user elements in a query need a fully qualified name"),
            one("meta::pure::functions::collection::tests::fold::testFold_Function_1__Boolean_1_", "'lastName' is not a known class, mapping, runtime, connection, or database — user elements in a query need a fully qualified name"),
            one("meta::pure::functions::lang::tests::match::testMatchWithMixedReturnType_Function_1__Boolean_1_", "scalar lowering not yet implemented for TypedDeactivate"),
            one("meta::pure::functions::string::tests::format::testFormatBoolean_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatDate_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatFloatWithRounding_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatFloatWithTruncation_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatFloatWithZeroPadding_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatFloat_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatIntegerWithZeroPadding_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatInteger_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatList_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatPair_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatRepr_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testFormatString_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f"),
            one("meta::pure::functions::string::tests::format::testSimpleFormatDate_Function_1__Boolean_1_", "FORMAT reached Postgres: Postgres' format() has no %d/%f")
    );

    public static Test suite() {
        return PctCensusGate.wrap("Essential", wrapSuite(
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
