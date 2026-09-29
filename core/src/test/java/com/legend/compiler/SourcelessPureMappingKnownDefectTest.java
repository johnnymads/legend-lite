// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.compiler;

import com.legend.Compiler;
import com.legend.model.ClassMapping;
import com.legend.model.LegacyMappingDefinition;
import com.legend.model.ParsedModel;
import com.legend.testing.KnownDefect;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Stage reading A04 defect 5: a Pure class mapping without ~src (legal: ClassMapping.Pure.sourceClass is nullable)
 *  whose class name resolves to a different spelling hits nn(sourceClass) at NameResolver.java:1147 and throws
 *  NullPointerException("resolver passthrough"). */
class SourcelessPureMappingKnownDefectTest {

    @Test
    @KnownDefect(owner = "W2.3a", reason = "resolving a Pure class mapping with no ~src whose class name is"
            + " rewritten throws NullPointerException from NameResolver's nn(sourceClass)",
            expected = NullPointerException.class)
    void pureMappingWithoutSrcResolvesItsClassName() {
        ParsedModel parsed = Compiler.parseModel("Class my::Person { name: String[1]; }\n"
                + "###Mapping\n"
                + "import my::*;\n"
                + "Mapping my::M ( Person: Pure { name: 'x' } )\n");
        ParsedModel resolved = NameResolver.resolve(parsed);
        LegacyMappingDefinition md = resolved.elements().stream()
                .filter(LegacyMappingDefinition.class::isInstance).map(LegacyMappingDefinition.class::cast)
                .findFirst().orElseThrow(() -> new IllegalStateException("no mapping parsed"));
        ClassMapping.Pure pcm = (ClassMapping.Pure) md.classMappings().get(0);
        assertEquals("my::Person", pcm.className(), "the bare class name resolves through the section's import");
        assertNull(pcm.sourceClass(), "no ~src was written, so none is recorded");
    }
}
