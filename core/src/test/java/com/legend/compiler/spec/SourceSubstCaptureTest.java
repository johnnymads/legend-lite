// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.compiler.spec;

import com.legend.protocol.spec.AppliedFunction;
import com.legend.protocol.spec.CInteger;
import com.legend.protocol.spec.CString;
import com.legend.protocol.spec.LambdaFunction;
import com.legend.protocol.spec.ValueSpecification;
import com.legend.protocol.spec.Variable;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

/**
 * Rebuild W0.6 push 1: the source-level substitution is capture-avoiding.
 * A lambda parameter or a lambda-body let that is free in a substituted
 * value read beneath it is renamed; nothing else is.
 */
class SourceSubstCaptureTest {

    private static AppliedFunction let(String name, ValueSpecification v) {
        return new AppliedFunction("letFunction", List.of(new CString(name), v));
    }

    private static AppliedFunction plus(ValueSpecification a, ValueSpecification b) {
        return new AppliedFunction("plus", List.of(a, b));
    }

    private static Variable v(String name) {
        return new Variable(name);
    }

    private static LambdaFunction lam(String param, ValueSpecification... body) {
        return new LambdaFunction(List.of(v(param)), List.of(body));
    }

    @Test
    void freeVariablesRespectEveryBinder() {
        assertEquals(Set.of("y"), SourceSubst.freeVars(lam("x", plus(v("x"), v("y")))));
        // a let binds the statements after it, never its own value
        assertEquals(Set.of("a", "b"), SourceSubst.freeVars(
                lam("x", let("a", v("a")), plus(v("a"), v("b")))));
        assertEquals(Set.of("b"), SourceSubst.freeVarsOfBody(List.of(
                let("a", new CInteger(1L)), plus(v("a"), v("b")))));
    }

    @Test
    void theTyperSideLetCapture() {
        // x | let c = $x; [..]->map(x | $c + $x)   =>   the inner binder is renamed
        LambdaFunction folded = SourceSubst.inlineLets(new LambdaFunction(List.of(v("x")),
                List.of(let("c", v("x")), lam("x", plus(v("c"), v("x"))))));
        assertEquals(new LambdaFunction(List.of(v("x")),
                List.of(lam("x_1", plus(v("x"), v("x_1"))))), folded);
    }

    @Test
    void aShadowingBinderStopsTheSubstitution() {
        LambdaFunction l = lam("c", v("c"));
        assertSame(l, SourceSubst.substitute(l, Map.of("c", v("x"))));
    }

    @Test
    void aBinderIsKeptWhenItsScopeNeverReadsTheEntry() {
        LambdaFunction l = lam("x", plus(v("x"), new CInteger(1L)));
        assertEquals(l, SourceSubst.substitute(l, Map.of("c", v("x"))));
    }

    @Test
    void theNewNameAvoidsEveryNameInSight() {
        // x_1 is read by the body; x_2 is a binder inside; x_3 is free in the value
        LambdaFunction l = lam("x", plus(plus(v("c"), v("x")),
                plus(v("x_1"), lam("x_2", v("x_2")))));
        ValueSpecification value = plus(v("x"), v("x_3"));
        assertEquals(lam("x_4", plus(plus(value, v("x_4")),
                        plus(v("x_1"), lam("x_2", v("x_2"))))),
                SourceSubst.substitute(l, Map.of("c", value)));
    }

    @Test
    void aLambdaBodyLetIsRenamedOnCapture() {
        // {| let x = 1; $c + $x}[c := $x]  =>  {| let x_1 = 1; $x + $x_1}
        LambdaFunction l = new LambdaFunction(List.of(),
                List.of(let("x", new CInteger(1L)), plus(v("c"), v("x"))));
        assertEquals(new LambdaFunction(List.of(),
                        List.of(let("x_1", new CInteger(1L)), plus(v("x"), v("x_1")))),
                SourceSubst.substitute(l, Map.of("c", v("x"))));
    }

    @Test
    void nestedBindersEachGetTheirOwnName() {
        // {x | {x | $c + $x}}[c := $x]: only the inner binder's scope reads c, but the
        // outer binder would capture it too
        LambdaFunction l = lam("x", lam("x", plus(v("c"), v("x"))));
        assertEquals(lam("x_1", lam("x_2", plus(v("x"), v("x_2")))),
                SourceSubst.substitute(l, Map.of("c", v("x"))));
    }
}
