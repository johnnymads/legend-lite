// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.lowering;

import com.legend.Compiler;
import com.legend.exec.ExecutionResult;
import com.legend.testing.KnownDefect;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Review #8: the lowerer's let bindings are one flat map consulted BEFORE lambda parameters, and every
 * query-level let is re-seeded into it (SeedableLets), so a lambda parameter spelled like an earlier let
 * reads the let's value.
 */
class LowererLetScopeTest {

    private static List<String> values(String query) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:duckdb:")) {
            ExecutionResult r = Compiler.execute("", query, c);
            if (!(r instanceof ExecutionResult.Collection col)) {
                throw new IllegalStateException("expected a collection frame for " + query + ", got " + r);
            }
            return col.values().stream().map(String::valueOf).toList();
        }
    }

    /** A precondition of the probe: a failure here is a harness fault, never the defect. */
    private static void control(List<String> expected, String query) throws Exception {
        List<String> got = values(query);
        if (!expected.equals(got)) {
            throw new IllegalStateException("control " + query + " gave " + got + ", expected " + expected);
        }
    }

    @Test
    @KnownDefect(owner = "W2.5", reason = "a query-level let shadows a same-named map lambda parameter in the"
            + " lowerer (letBindings read before the lambda resolver)")
    void mapParameterIsNotTheQueryLet() throws Exception {
        control(List.of("2", "3", "4"), "|[1, 2, 3]->map(x | $x + 1);");
        control(List.of("2", "3", "4"), "|let y = 10; [1, 2, 3]->map(x | $x + 1);");
        assertEquals(List.of("2", "3", "4"), values("|let x = 10; [1, 2, 3]->map(x | $x + 1);"));
    }

    @Test
    @KnownDefect(owner = "W2.5", reason = "a query-level let shadows a same-named filter lambda parameter in the"
            + " lowerer (letBindings read before the lambda resolver)")
    void filterParameterIsNotTheQueryLet() throws Exception {
        control(List.of("2", "3"), "|[1, 2, 3]->filter(x | $x > 1);");
        assertEquals(List.of("2", "3"), values("|let x = 10; [1, 2, 3]->filter(x | $x > 1);"));
    }
}
