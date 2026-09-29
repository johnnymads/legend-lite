// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.integration;

import com.legend.Compiler;
import com.legend.model.ConnectionDefinition;
import com.legend.model.ServiceDefinition;
import com.legend.test.ServiceTestRunner;
import com.legend.testing.KnownDefect;
import com.legend.testing.Own;
import org.junit.jupiter.api.Test;

import java.sql.DriverManager;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Review #15: ServiceTestRunner keys a provisioned CSV by its 32-bit String.hashCode, so two services whose
 * test data differ but collide ("Aa" vs "BB") share one test runtime and the second runs on the first's rows.
 */
class ServiceTestProvisionKeyTest {

    private static final String CSV_A = "ID,NAME\n1,Aa\n";
    private static final String CSV_B = "ID,NAME\n1,BB\n";

    private static String service(String name, String pattern, String suite, String test, String value) {
        return """
                Service local::%s
                {
                  pattern: '%s';
                  documentation: '';
                  execution: Single
                  {
                    query: |local::P.all()->project(~[name: x | $x.name]);
                    mapping: local::M;
                    runtime: local::RT;
                  }
                  testSuites:
                  [
                    %s:
                    {
                      data:
                      [
                        connections:
                        [
                          c1:
                            Relational
                            #{
                              default.T:
                                'ID,NAME\\n1,%s\\n';
                            }#
                        ]
                      ]
                      tests:
                      [
                        %s:
                        {
                          serializationFormat: PURE_TDSOBJECT;
                          asserts:
                          [
                            rows:
                              EqualToJson
                              #{
                                expected:
                                  ExternalFormat
                                  #{
                                    contentType: 'application/json';
                                    data: '[{"name":"%s"}]';
                                  }#;
                              }#
                          ]
                        }
                      ]
                    }
                  ]
                }
                """.formatted(name, pattern, suite, value, test, value);
    }

    private static final String MODEL = """
            ###Pure
            Class local::P { name: String[1]; }
            ###Relational
            Database local::DB ( Table T (ID INTEGER PRIMARY KEY, NAME VARCHAR(32)) )
            ###Mapping
            Mapping local::M ( *local::P: Relational { ~mainTable [local::DB] T
                name: [local::DB] T.NAME } )
            ###Connection
            RelationalDatabaseConnection local::Conn
            { type: DuckDB; specification: DuckDB { }; auth: Test; }
            ###Runtime
            Runtime local::RT
            { mappings: [ local::M ]; connections: [ local::DB: [ c1: local::Conn ] ]; }
            ###Service
            """ + service("ServiceA", "/a", "suiteA", "readsA", "Aa")
            + service("ServiceB", "/b", "suiteB", "readsB", "BB");

    private static ServiceTestRunner runner(com.legend.compiler.element.ModelContext ctx) {
        return new ServiceTestRunner(ctx, () -> DriverManager.getConnection("jdbc:duckdb:"),
                ServiceTestRunner.Sessions.FRESH_PER_TEST, ConnectionDefinition.DatabaseType.DuckDB);
    }

    private static ServiceDefinition service(String fqn) {
        return Own.model(MODEL).elements().stream()
                .filter(e -> e instanceof ServiceDefinition s && s.qualifiedName().equals(fqn))
                .map(e -> (ServiceDefinition) e)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("no service " + fqn));
    }

    private static ServiceTestRunner.Result only(List<ServiceTestRunner.Result> results) {
        if (results.size() != 1) {
            throw new IllegalStateException("expected one test result, got " + results);
        }
        return results.get(0);
    }

    @Test
    @KnownDefect(owner = "W6.4", reason = "ServiceTestRunner keys provisioned CSV by String.hashCode: two suites"
            + " whose CSVs collide share one test runtime and the second runs on the first's data")
    void collidingCsvHashesDoNotShareATestRuntime() {
        if (CSV_A.equals(CSV_B) || CSV_A.hashCode() != CSV_B.hashCode()) {
            throw new IllegalStateException("the probe needs two different CSVs with one hashCode");
        }
        var ctx = Compiler.compileModel(MODEL);
        ServiceDefinition a = service("local::ServiceA");
        ServiceDefinition b = service("local::ServiceB");
        // control: B's suite passes on a runner that has provisioned nothing else
        try (ServiceTestRunner solo = runner(ctx)) {
            ServiceTestRunner.Result alone = only(solo.run(b));
            if (!alone.pass()) {
                throw new IllegalStateException("control: B alone failed: " + alone.reason());
            }
        }
        try (ServiceTestRunner shared = runner(ctx)) {
            ServiceTestRunner.Result ra = only(shared.run(a));
            if (!ra.pass()) {
                throw new IllegalStateException("control: A failed: " + ra.reason());
            }
            ServiceTestRunner.Result rb = only(shared.run(b));
            assertEquals(ServiceTestRunner.Status.PASS, rb.status(), rb.reason());
        }
    }
}
