// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.generators;

import com.legend.testing.Repo;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Our side of the reference differential as a file ({@link OurResolutions}), for a module named by
 * {@code -Dour.resolutions=<module>}; writes {@code our-resolutions-<module>.txt}. The gated form of the
 * differential is {@code //spec:reference_lane} ({@link ReferenceLaneTest}); this opt-in dump stays for ad-hoc
 * joins ({@code tools/reference/join.py}).
 */
public class OurResolutionsTest {

    @Test
    void dump() throws IOException {
        String target = System.getProperty("our.resolutions");
        Assumptions.assumeTrue(target != null && !target.isEmpty(), "-Dour.resolutions=<module> not set");
        Files.createDirectories(Repo.outDir());
        try (PrintWriter w = new PrintWriter(Files.newBufferedWriter(
                Repo.out("our-resolutions-" + target + ".txt"), StandardCharsets.UTF_8))) {
            OurResolutions.Result r = OurResolutions.dump(target, w);
            System.out.println("[our-resolutions] " + target + ": functions=" + r.functions()
                    + " failed=" + r.failedFunctions().size() + " dropped=" + r.droppedSources().size()
                    + " rows=" + r.rows());
        }
    }
}
