// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.ladder;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.legend.Compiler;
import com.legend.compiler.element.ModelContext;
import com.legend.test.PureTestRunner;
import com.legend.test.PureTests;
import com.legend.test.TestObserver;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * A column the store declared QUOTED keeps its spelling when a class extent is read through a
 * planned frame (rung 12, docs/STORE_TYPES_HOMEWORK_2026_10_02.md section 6). The frame's CTE reads
 * the table's columns by their declared spelling, and a reader of the CTE must address them the
 * same way: on a case-folding database ({@code "name"} is not {@code name} on H2) a bare reference
 * folds to {@code NAME} and finds no column.
 */
class FrameQuotedColumnTest {

    private static final String MODEL = """
            ###Pure
            Class l::Thing
            {
              id: Integer[1];
              name: String[1];
            }
            function <<test.Test>> l::classLetManyReaders(): Boolean[1]
            {
              let r = execute(|l::Thing.all(), l::M, l::RT.runtimeValue, []);
              assertSize($r.values, 3);
              assertSameElements(['a', 'b', 'c'], $r.values.name);
              assertEquals(2, $r.values->filter(t | $t.name != 'a')->size());
            }
            ###Relational
            Database l::DB (
              Table T (ID INTEGER PRIMARY KEY, "name" VARCHAR(50))
            )
            ###Mapping
            Mapping l::M (
              *l::Thing : Relational { ~mainTable [l::DB] T
                id: T.ID,
                name: T."name" }
            )
            ###Connection
            RelationalDatabaseConnection l::Conn { store: l::DB; type: H2;
              specification: LocalH2 { }; auth: DefaultH2; }
            ###Runtime
            Runtime l::RT { mappings: [l::M]; connections: [ l::DB: [ c1: l::Conn ] ]; }
            """;

    @Test
    void aQuotedColumnReadThroughAPlannedClassFrameKeepsItsSpelling() throws Exception {
        Compiler.ParsedModule parsed = Compiler.parseSources(
                List.of(new Compiler.ModelSource("frame.pure", MODEL)));
        ModelContext ctx = Compiler.buildModule(parsed.model()).context();
        PureTests.Discovery found = PureTests.discover(parsed.model(), Set.of());
        PureTests.TestCase test = found.tests().stream()
                .filter(t -> t.fqn().equals("l::classLetManyReaders")).findFirst().orElseThrow();
        try (PureTestRunner runner = new PureTestRunner(ctx, "l::RT", FrameQuotedColumnTest::freshH2,
                List.of(), found.setupsByPackage(), TestObserver.NONE,
                com.legend.ExecuteOptions.JudgeMode.DATABASE)) {
            PureTestRunner.Result r = runner.run(test);
            assertEquals(PureTestRunner.Status.PASS, r.status(), r.reason());
        }
    }

    private static Connection freshH2() {
        try {
            Connection c = DriverManager.getConnection("jdbc:h2:mem:frame" + System.nanoTime());
            try (Statement st = c.createStatement()) {
                st.execute("CREATE TABLE T (ID INTEGER PRIMARY KEY, \"name\" VARCHAR(50))");
                st.execute("INSERT INTO T VALUES (1, 'a'), (2, 'b'), (3, 'c')");
            }
            return c;
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }
}
