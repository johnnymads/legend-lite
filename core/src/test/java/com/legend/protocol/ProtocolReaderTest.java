package com.legend.protocol;

import com.legend.json.Json;
import com.legend.parser.SpecParser;
import com.legend.protocol.spec.LambdaFunction;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The lambda protocol-JSON READER is the emitter's mirror
 * (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md, U1): whatever the emitter writes,
 * reading it and writing it again gives back the same bytes, and what the REAL
 * engine writes (a committed E1 answer from legend-engine 4.145.0) reads back to
 * exactly the engine's bytes.
 */
class ProtocolReaderTest {

    private static LambdaFunction parse(String text) {
        return SpecParser.parseLambda(text);
    }

    /** Emit, read, emit: the reader must not lose or add anything the wire carries. */
    private static void roundTrips(String text) {
        String once = ProtocolEmitter.emitLambda(parse(text));
        String twice = ProtocolEmitter.emitLambda(ProtocolReader.lambda(once));
        assertEquals(once, twice, text);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        // the cube's shapes: source accessor, groupBy with a lambda pair, sort, runtime
        "|#>{trades::DB.TRADES}#->groupBy(~[region], ~[total:x|$x.notional:y|$y->sum()])"
                + "->sort([~region->ascending()])->from(trades::RT)",
        "|#>{trades::DB}#->select(~[a, b])->distinct()->limit(501)",
        "|#>{trades::DB.S.T}#->filter(x|($x.region == 'EMEA') && !($x.qty > 10 || $x.book->isEmpty()))",
        "|#>{trades::DB.T}#->filter(x|$x.region->in(['EMEA', 'APAC']))",
        "|#>{trades::DB.T}#->extend(~[double_qty:x|$x.qty * 2 + 1])",
        "|#>{trades::DB.T}#->groupBy(~[region], ~['2021__|__n':x|if($x.year == 2021, |$x.notional, |[]):y|$y->average()])",
        "|#>{trades::DB.T}#->filter(x|$x.day == %2024-01-02 && $x.at < %2024-01-02T03:04:05.123)",
        "|#>{trades::DB.T}#->filter(x|$x.amount > 1.5d && $x.price <= -2.25 && $x.flag == true)",
        "|#>{trades::DB.T}#->filter(x|$x.region->toOne()->toLower()->startsWith('em'))",
        "|#>{trades::DB.T}#->filter(x|$x.kind == my::Kind.GOLD)",
        "|#>{trades::DB.T}#->extend(~[sku:x|$x.payload->get('sku')->to(@String)])",
        "|#>{trades::DB.T}#->slice(10, 20)->sort([~region->descending(), ~year->ascending()])",
        "|#>{trades::DB.T}#->extend(over(~region, [~year->ascending()]), ~[run:{p,w,r|$r.notional}:y|$y->plus()])",
        "|{a: Integer[1]|$a + 1}",
        "|let x = 2; $x * 3;",
    })
    void roundTrips_everyQueryShapeTheCubeSends(String text) {
        roundTrips(text);
    }

    /** A graph-fetch tree read from the wire is the literal the grammar gives: same wire, same desugaring. */
    @ParameterizedTest
    @ValueSource(strings = {
        "|my::Firm.all()->graphFetch(#{my::Firm {legalName}}#)->serialize(#{my::Firm {legalName}}#)",
        "|my::Firm.all()->graphFetch(#{my::Firm {legalName, employees {name, age}, address {city}}}#)",
        "|my::Firm.all()->graphFetch(#{my::Firm {'nick': legalName, employees {name}}}#)",
        "|my::Firm.all()->graphFetch(#{my::Firm {employeesOn(%2024-01-01) {name}, ranked('a', 2)}}#)",
        "|my::Firm.all()->graphFetch(#{my::Firm {legalName, owner->subType(@my::Person) {name}}}#)",
        "|my::Firm.all()->graphFetch(#{my::Firm {legalName, ->subType(@my::Bank) {swift}}}#)",
        // graph-position argument spellings: enum spans its whole path, a variable its name only
        "{d: Date[1]|my::Firm.all()->graphFetch(#{my::Firm {employeesOn($d) {name}, bySide(my::Side.BUY)}}#)}",
        "|my::Firm.all()->graphFetch(#{my::Firm {\n  ranked(['a', 'b'], true) {name},\n  'n': legalName}}#)",
    })
    void readsGraphFetchTrees_asTheGrammarDoes(String text) {
        roundTrips(text);
        LambdaFunction parsed = parse(text);
        LambdaFunction read = ProtocolReader.lambda(ProtocolEmitter.emitLambda(parsed));
        var expected = graphFetch(parsed.body().get(0));
        assertTrue(expected != null, text);
        assertEquals(expected, graphFetch(read.body().get(0)), text);
    }

    private static com.legend.protocol.spec.GraphFetchLiteral graphFetch(
            com.legend.protocol.spec.ValueSpecification v) {
        if (v instanceof com.legend.protocol.spec.GraphFetchLiteral g) return g;
        if (v instanceof com.legend.protocol.spec.AppliedFunction f) {
            for (var p : f.parameters()) {
                var g = graphFetch(p);
                if (g != null) return g;
            }
        }
        return null;
    }

    @Test
    void readsWhatTheRealEngineWrites() throws IOException {
        // legend-engine 4.145.0's own grammarToJson/lambda answer, committed: reading
        // it and writing it again gives the engine's bytes, and so does parsing the
        // same text -- lite's E1 is byte-exact on it
        String engine = resource("upstream-api/e1-groupby-sort.json");
        String text = resource("upstream-api/e1-groupby-sort.pure");
        String canonical = Json.toCompact(Json.parse(engine));
        assertEquals(canonical,
                Json.toCompact(Json.parse(ProtocolEmitter.emitLambda(ProtocolReader.lambda(engine)))));
        assertEquals(canonical,
                Json.toCompact(Json.parse(ProtocolEmitter.emitLambda(parse(text)))));
    }

    @Test
    void refusesWhatItHasNoRuleFor_namingIt() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> ProtocolReader.lambda(
                        "{\"_type\":\"lambda\",\"body\":[{\"_type\":\"somethingNew\"}],\"parameters\":[]}"));
        assertTrue(e.getMessage().contains("somethingNew"), e.getMessage());
    }

    private static String resource(String name) throws IOException {
        try (InputStream in = ProtocolReaderTest.class.getClassLoader().getResourceAsStream(name)) {
            if (in == null) {
                throw new IOException("missing test resource " + name);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        }
    }
}
