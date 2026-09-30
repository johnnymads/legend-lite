// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.compiler;

import com.legend.Compiler;
import com.legend.model.ClassMapping;
import com.legend.model.LegacyMappingDefinition;
import com.legend.model.ParsedModel;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A Pure class mapping without {@code ~src} is legal ({@code ClassMapping.Pure.sourceClass} is nullable; the engine's
 * grammar has {@code (mappingSrc | mappingFilter)*} and M3 declares {@code srcClass: Type[0..1]}). Stage reading A04
 * defect 5, fixed by rebuild W0.6 push 7: the resolver's rebuild of the mapping required the source class and threw
 * {@code NullPointerException("resolver passthrough")} whenever anything in the mapping resolved to a new spelling.
 */
class SourcelessPureMappingTest {

    private static ClassMapping.Pure firstPure(String model) {
        ParsedModel resolved = NameResolver.resolve(Compiler.parseModel(model));
        LegacyMappingDefinition md = resolved.elements().stream()
                .filter(LegacyMappingDefinition.class::isInstance).map(LegacyMappingDefinition.class::cast)
                .findFirst().orElseThrow(() -> new IllegalStateException("no mapping parsed"));
        return (ClassMapping.Pure) md.classMappings().get(0);
    }

    @Test
    void aBareClassNameResolvesWithNoSourceClass() {
        // was NullPointerException("resolver passthrough")
        ClassMapping.Pure pcm = firstPure("Class my::Person { name: String[1]; }\n"
                + "###Mapping\n"
                + "import my::*;\n"
                + "Mapping my::M ( Person: Pure { name: 'x' } )\n");
        assertEquals("my::Person", pcm.className(), "the bare class name resolves through the section's import");
        assertNull(pcm.sourceClass(), "no ~src was written, so none is recorded");
    }

    @Test
    void aFullyQualifiedClassWithABareEnumInABindingResolvesWithNoSourceClass() {
        // only the binding changes spelling; was the same NullPointerException
        ClassMapping.Pure pcm = firstPure("Class my::Person { name: String[1]; c: my::Color[1]; }\n"
                + "Enum my::Color { RED, BLUE }\n"
                + "###Mapping\n"
                + "import my::*;\n"
                + "Mapping my::M ( my::Person: Pure { name: 'x', c: Color.RED } )\n");
        assertEquals("my::Person", pcm.className());
        assertNull(pcm.sourceClass());
    }

    @Test
    void aBareSourceClassStillResolves() {
        ClassMapping.Pure pcm = firstPure("Class my::Person { name: String[1]; }\n"
                + "Class my::Src { n: String[1]; }\n"
                + "###Mapping\n"
                + "import my::*;\n"
                + "Mapping my::M ( Person: Pure { ~src Src name: $src.n } )\n");
        assertEquals("my::Person", pcm.className());
        assertEquals("my::Src", pcm.sourceClass());
    }

    @Test
    void theModelBuildRefusesItLoudlyNamingSrc() {
        // the engine compiles such a mapping and fails at execution; lite refuses at model build with a NORMALIZE
        // error that names ~src (register row S21, owner W4.1a). What this pins: no NullPointerException anywhere.
        String model = "Class my::Person { name: String[1]; }\n"
                + "###Mapping\n"
                + "import my::*;\n"
                + "Mapping my::M ( Person: Pure { name: 'x' } )\n";
        try {
            Compiler.compileModel(model);
            throw new AssertionError("lite refuses a sourceless Pure mapping at model build today (S21)");
        } catch (NullPointerException npe) {
            throw new AssertionError("the sourceless mapping must not NPE", npe);
        } catch (com.legend.error.ModelException expected) {
            assertTrue(String.valueOf(expected.getMessage()).contains("~src"), expected.getMessage());
        }
    }
}
