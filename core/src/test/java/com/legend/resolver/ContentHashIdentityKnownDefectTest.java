// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.resolver;

import com.legend.compiler.element.type.ExprType;
import com.legend.compiler.element.type.Type;
import com.legend.compiler.spec.typed.TypedCString;
import com.legend.compiler.spec.typed.TypedLambda;
import com.legend.testing.KnownDefect;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * Three ids in the resolver and plan path are a 32-bit hash of a node's text plus its length: two nodes that differ
 * only by a same-position substitution with equal hash ({@code 'Aa'} / {@code 'BB'}) get one id, and the second is
 * served the first's rows. Found by W0.6 homework 3 beside the service-test provisioning defect (fixed in push 8);
 * not reproduced from a user query, so pinned (E7) for the owner: {@code FunctionBodyRows.scopeId} (this test),
 * {@code ConstructedInstances.rowId} ({@code "q:" + hex(hash) + ":" + length}) and {@code PlanRows.scopeId}'s
 * spanless fallback ({@code "plan:" + hex(hash) + ":" + length}). The fix is the whole text, or a value-keyed table
 * with ordinal ids where the id need not be rebuild-stable.
 */
class ContentHashIdentityKnownDefectTest {

    private static TypedLambda constant(String s) {
        ExprType str = ExprType.one(Type.Primitive.STRING);
        return new TypedLambda(List.of(), List.of(new TypedCString(s, str)), str);
    }

    @Test
    @KnownDefect(owner = "W6.4", reason = "FunctionBodyRows.scopeId is a 32-bit hash of the lambda's text plus its"
            + " length, so two lambdas differing only by 'Aa'/'BB' share one scope id and one row set")
    void lambdasWithCollidingTextHashesGetDistinctScopeIds() {
        TypedLambda a = constant("Aa");
        TypedLambda b = constant("BB");
        if (a.toString().hashCode() != b.toString().hashCode() || a.toString().equals(b.toString())) {
            throw new IllegalStateException("the probe needs two different texts with one hashCode");
        }
        assertNotEquals(FunctionBodyRows.scopeId(a), FunctionBodyRows.scopeId(b));
    }
}
