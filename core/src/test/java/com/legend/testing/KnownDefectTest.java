// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.testing;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The three outcomes of a {@link KnownDefect} pin, and the pin working end to end on a real method. */
class KnownDefectTest {

    @Test
    void aStandingDefectPasses() {
        assertDoesNotThrow(() -> KnownDefect.Extension.judge("W2.5", "r", AssertionError.class,
                new AssertionError("still wrong")));
    }

    @Test
    void aFixedDefectFailsAndNamesItsOwner() {
        AssertionError e = assertThrows(AssertionError.class,
                () -> KnownDefect.Extension.judge("W4.3", "r", AssertionError.class, null));
        assertTrue(e.getMessage().contains("KNOWN DEFECT FIXED (owner W4.3)"), e.getMessage());
    }

    @Test
    void anUnexpectedThrowablePropagates() {
        IllegalStateException crash = new IllegalStateException("crash");
        assertSame(crash, assertThrows(IllegalStateException.class,
                () -> KnownDefect.Extension.judge("W2.5", "r", AssertionError.class, crash)));
    }

    @Test
    void anOwnerMustBeAPlanItem() {
        assertThrows(AssertionError.class, () -> KnownDefect.Extension.judge("later", "r",
                AssertionError.class, new AssertionError()));
    }

    /** End to end: this body fails, the pin inverts it, the test passes. */
    @Test
    @KnownDefect(owner = "W0.0", reason = "the pin's own end-to-end check")
    void thePinInvertsARealFailure() {
        throw new AssertionError("a defect that stands");
    }
}
