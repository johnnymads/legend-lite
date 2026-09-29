// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.compiler.spec;

import com.legend.Compiler;
import com.legend.exec.ExecutionResult;
import com.legend.testing.KnownDefect;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Review #9: the inliner's match-arm substitution pushes no capture set, so UserCallInliner.bind keeps an
 * inner binder's source name and the substituted arm input ($x) is captured by it.
 */
class InlinerMatchCaptureTest {

    private static List<String> values(String query) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:duckdb:")) {
            ExecutionResult r = Compiler.execute("", query, c);
            if (!(r instanceof ExecutionResult.Collection col)) {
                throw new IllegalStateException("expected a collection frame for " + query + ", got " + r);
            }
            return col.values().stream().map(String::valueOf).toList();
        }
    }

    @Test
    @KnownDefect(owner = "W4.2", reason = "a statically dispatched match arm substitutes its input under a"
            + " same-named inner lambda binder without renaming it (no capture set outside call frames)")
    void matchArmInputIsNotCapturedByAnInnerBinder() throws Exception {
        // control: the outer binder spelled differently cannot be captured -- (y+10)+(y+20)
        List<String> control = values(
                "|[1, 2, 3]->map(y | $y->match([i: Integer[1] | [10, 20]->map(x | $i + $x)->sum()]));");
        if (!List.of("32", "34", "36").equals(control)) {
            throw new IllegalStateException("control gave " + control);
        }
        assertEquals(List.of("32", "34", "36"), values(
                "|[1, 2, 3]->map(x | $x->match([i: Integer[1] | [10, 20]->map(x | $i + $x)->sum()]));"));
    }
}
