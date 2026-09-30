// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.protocol;

import com.legend.json.Json;
import com.legend.protocol.spec.AppliedFunction;
import com.legend.protocol.spec.AppliedProperty;
import com.legend.protocol.spec.CBoolean;
import com.legend.protocol.spec.CDate;
import com.legend.protocol.spec.CDecimal;
import com.legend.protocol.spec.CFloat;
import com.legend.protocol.spec.CInteger;
import com.legend.protocol.spec.CLatestDate;
import com.legend.protocol.spec.CString;
import com.legend.protocol.spec.CTime;
import com.legend.protocol.spec.ColSpec;
import com.legend.protocol.spec.ColSpecArray;
import com.legend.protocol.spec.EnumValue;
import com.legend.protocol.spec.GraphFetchLiteral;
import com.legend.protocol.spec.LambdaFunction;
import com.legend.protocol.spec.PackageableElementPtr;
import com.legend.protocol.spec.PureCollection;
import com.legend.protocol.spec.TypeAnnotation;
import com.legend.protocol.spec.ValueSpecification;
import com.legend.protocol.spec.Variable;
import com.legend.values.PureDateLiteral;
import com.legend.values.PureTimeLiteral;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;

/**
 * Engine lambda protocol JSON &rarr; the protocol records the parser produces &mdash;
 * the MIRROR of {@link ProtocolEmitter}'s value-specification rules, so an upstream
 * {@code pure/v1} request (a {@code function} or {@code lambda} field) compiles exactly
 * as the same query written in text (docs/UPSTREAM_ENDPOINTS_DESIGN_2026_09_27.md, U1).
 *
 * <p>Every wire quirk the emitter reproduces is undone here, rule for rule: an enum
 * value arrives as a {@code property} on a {@code packageableElementPtr}; a
 * {@code receiver.name(args)} call as a {@code property} with its arguments after the
 * receiver; {@code #>{db.schema.T}#} as a {@code classInstance} of type {@code ">"}
 * with a path; the root package as a literal {@code null}. A {@code _type} (or
 * {@code classInstance} type) with no rule here is REFUSED, naming it &mdash; never
 * skipped, never guessed. Positions come from {@code sourceInformation} when the
 * request carries it, and are absent otherwise.
 */
public final class ProtocolReader {

    private ProtocolReader() {
    }

    /** A {@code {"_type":"lambda",...}} object, as text. */
    public static LambdaFunction lambda(String json) {
        return lambda(Json.parseObject(json));
    }

    /**
     * A {@code {"_type":"lambda",...}} object. Older protocol shapes are brought current first,
     * as upstream reads them ({@link ProtocolUpgrade}).
     */
    public static LambdaFunction lambda(Json.Obj o) {
        return readLambda(ProtocolUpgrade.upgrade(o));
    }

    private static LambdaFunction readLambda(Json.Obj o) {
        String type = o.getStringOr("_type", "");
        if (!"lambda".equals(type)) {
            throw refused("expected a lambda, got _type '" + type + "'");
        }
        List<Variable> params = new ArrayList<>();
        for (Json.Node p : arrOrEmpty(o, "parameters")) {
            params.add(variable(asObj(p, "lambda parameter")));
        }
        List<ValueSpecification> body = new ArrayList<>();
        for (Json.Node n : arrOrEmpty(o, "body")) {
            body.add(valueSpec(n));
        }
        return new LambdaFunction(params, body, pos(o));
    }

    /** One value specification node. */
    public static ValueSpecification valueSpec(Json.Node node) {
        if (node instanceof Json.Null) {
            // the ROOT PACKAGE spelled '::' is a literal null on the wire
            return new PackageableElementPtr("::");
        }
        Json.Obj o = asObj(node, "value specification");
        String type = o.getStringOr("_type", null);
        if (type == null) {
            throw refused("a value specification has no _type");
        }
        @com.legend.base.Nullable SourceInfo pos = pos(o);
        return switch (type) {
            case "lambda" -> readLambda(o);
            case "var" -> variable(o);
            case "func" -> func(o, pos);
            case "property" -> property(o, pos);
            case "collection" -> new PureCollection(values(o, "values"), pos);
            case "string" -> new CString(o.getString("value"), pos,
                    o.getBoolOr("multiLine", false));
            case "boolean" -> new CBoolean(o.getBool("value"), pos);
            case "integer" -> integer(o, pos);
            case "float" -> floating(o, pos);
            case "decimal" -> new CDecimal(exact(o, "value"), null, pos);
            case "strictDate", "dateTime" -> date(o.getString("value"), pos);
            case "latestDate" -> new CLatestDate(pos);
            case "strictTime" -> {
                String written = o.getString("value");
                yield new CTime(PureTimeLiteral.parse(written), written, pos);
            }
            case "packageableElementPtr", "unitType" ->
                    new PackageableElementPtr(o.getString("fullPath"), pos);
            case "enumValue" -> new EnumValue(o.getString("fullPath"), o.getString("value"),
                    null, pos);
            case "classInstance" -> classInstance(o, pos);
            case "genericTypeInstance" -> new TypeAnnotation.Named(
                    genericType(o.getObj("genericType")), pos);
            default -> throw refused("no reader rule for value specification _type '"
                    + type + "' -- add the rule, do not drop it");
        };
    }

    // ---------------------------------------------------------------------
    // Nodes
    // ---------------------------------------------------------------------

    private static Variable variable(Json.Obj o) {
        if (!"var".equals(o.getStringOr("_type", ""))) {
            throw refused("expected a var, got _type '" + o.getStringOr("_type", "") + "'");
        }
        Json.Obj gt = o.getObjOr("genericType", null);
        if (gt == null) {
            return new Variable(o.getString("name"), null, null, pos(o));
        }
        Json.Obj m = o.getObjOr("multiplicity", null);
        if (m == null) {
            throw refused("a typed lambda parameter has no multiplicity: " + o.getString("name"));
        }
        return new Variable(o.getString("name"), genericType(gt), multiplicity(m), pos(o));
    }

    private static ValueSpecification func(Json.Obj o, @com.legend.base.Nullable SourceInfo pos) {
        return new AppliedFunction(o.getString("function"), values(o, "parameters"),
                List.of(), pos);
    }

    /**
     * A {@code property} node is one of three things on the wire (the emitter's
     * rules): an ENUM value (one parameter, a {@code packageableElementPtr}), a
     * {@code receiver.name(args)} call (arguments after the receiver), or a plain
     * property access.
     */
    private static ValueSpecification property(Json.Obj o, @com.legend.base.Nullable SourceInfo pos) {
        List<ValueSpecification> params = values(o, "parameters");
        String name = o.getString("property");
        if (params.isEmpty()) {
            throw refused("a property node has no receiver: " + name);
        }
        if (params.size() == 1 && params.get(0) instanceof PackageableElementPtr ptr) {
            return new EnumValue(ptr.fullPath(), name, ptr.pos(), pos);
        }
        if (params.size() > 1) {
            return new AppliedFunction(name, params, List.of(), pos, true, false);
        }
        return new AppliedProperty(params.get(0), name, pos);
    }

    /** The reader rule for each classInstance {@code type} on the wire. */
    private static final Map<String, BiFunction<Json.Obj, SourceInfo, ValueSpecification>> CLASS_INSTANCES = Map.of(
            ">", ProtocolReader::tableReference,
            "rootGraphFetchTree", ProtocolReader::graphFetchTree,
            "colSpec", (value, pos) -> colSpec(value),
            "colSpecArray", ProtocolReader::colSpecArray);

    private static ValueSpecification classInstance(Json.Obj o, @com.legend.base.Nullable SourceInfo pos) {
        String type = o.getString("type");
        BiFunction<Json.Obj, SourceInfo, ValueSpecification> rule = CLASS_INSTANCES.get(type);
        if (rule == null) {
            throw refused("no reader rule for classInstance type '" + type
                    + "' -- add the rule, do not drop it");
        }
        return rule.apply(o.getObj("value"), pos);
    }

    /**
     * {@code #>{db.schema.T}#}: the database, then the rest of the path as the pos-less
     * table-name string the island parse synthesises (the emitter's discriminator).
     */
    private static ValueSpecification tableReference(Json.Obj value, @com.legend.base.Nullable SourceInfo pos) {
        List<String> path = value.getStringArray("path");
        if (path.isEmpty()) {
            throw refused("a table reference with an empty path");
        }
        return AppliedFunction.tableReference(path.get(0), path.size() == 1 ? null
                : String.join(".", path.subList(1, path.size())), pos);
    }

    private static ValueSpecification colSpecArray(Json.Obj value, @com.legend.base.Nullable SourceInfo pos) {
        List<ColSpec> specs = new ArrayList<>();
        for (Json.Node n : arrOrEmpty(value, "colSpecs")) {
            specs.add(colSpec(asObj(n, "colSpec")));
        }
        return new ColSpecArray(specs, pos);
    }

    /**
     * {@code #{Class{a, b{c}}}#} on the wire: the tree of {@code propertyGraphFetchTree} and
     * {@code subTypeGraphFetchTree} nodes, read into the same {@link GraphFetchLiteral} the
     * grammar gives. The wire cannot tell {@code prop()} from {@code prop} (both carry no
     * parameters), so a node is parenthesized exactly when it has arguments.
     */
    private static ValueSpecification graphFetchTree(Json.Obj root, @com.legend.base.Nullable SourceInfo pos) {
        return new GraphFetchLiteral(root.getString("class"), graphNodes(arrOrEmpty(root, "subTrees")),
                graphSubTypes(arrOrEmpty(root, "subTypeTrees")), pos);
    }

    private static List<GraphFetchLiteral.Node> graphNodes(List<Json.Node> trees) {
        List<GraphFetchLiteral.Node> out = new ArrayList<>();
        for (Json.Node t : trees) {
            Json.Obj n = asObj(t, "graph fetch tree");
            String type = n.getStringOr("_type", "");
            if (!"propertyGraphFetchTree".equals(type)) {
                throw refused("no reader rule for a graph fetch subtree of _type '" + type + "' -- add the rule, do not drop it");
            }
            if (!arrOrEmpty(n, "subTypeTrees").isEmpty()) {
                // the engine's grammar refuses ->subType below the root; so does lite's
                throw refused("a ->subType() below the root -- supported only at root level");
            }
            List<ValueSpecification> args = new ArrayList<>();
            for (Json.Node a : arrOrEmpty(n, "parameters")) {
                args.add(graphArg(valueSpec(a)));
            }
            out.add(new GraphFetchLiteral.Node(n.getString("property"), pos(n), args, !args.isEmpty(),
                    n.getStringOr("alias", null), n.getStringOr("subType", null),
                    graphNodes(arrOrEmpty(n, "subTrees"))));
        }
        return out;
    }

    /**
     * A graph node's call argument, back to the expression the grammar parses: read as any
     * value, then the graph-position spans undone -- the mirror of the emitter's
     * {@code gftParam} (an enum spans its whole dotted path, a variable its name without the
     * dollar; a date's {@code %} the date reader already strips).
     */
    private static ValueSpecification graphArg(ValueSpecification v) {
        return switch (v) {
            case EnumValue e when e.pos() != null && e.enumerationPos() == null -> {
                SourceInfo at = e.pos();
                yield new EnumValue(e.fullPath(), e.value(),
                        new SourceInfo(at.sourceId(), at.startLine(), at.startColumn(),
                                at.startLine(), at.startColumn() + e.fullPath().length() - 1),
                        new SourceInfo(at.sourceId(), at.endLine(),
                                at.endColumn() - e.value().length() + 1, at.endLine(), at.endColumn()));
            }
            case Variable var when var.pos() != null -> new Variable(var.name(), var.type(), var.multiplicity(),
                    new SourceInfo(var.pos().sourceId(), var.pos().startLine(), var.pos().startColumn() - 1,
                            var.pos().endLine(), var.pos().endColumn()));
            case PureCollection c -> new PureCollection(
                    c.values().stream().map(ProtocolReader::graphArg).toList(), c.pos());
            default -> v;
        };
    }

    /** A level's {@code ->subType(@X){...}} entries. */
    private static List<GraphFetchLiteral.SubTypeNode> graphSubTypes(List<Json.Node> trees) {
        List<GraphFetchLiteral.SubTypeNode> out = new ArrayList<>();
        for (Json.Node t : trees) {
            Json.Obj n = asObj(t, "graph fetch subtype tree");
            String type = n.getStringOr("_type", "");
            if (!"subTypeGraphFetchTree".equals(type)) {
                throw refused("no reader rule for a graph fetch subtype tree of _type '" + type + "' -- add the rule, do not drop it");
            }
            if (!arrOrEmpty(n, "subTypeTrees").isEmpty()) {
                throw refused("a ->subType() below the root -- supported only at root level");
            }
            out.add(new GraphFetchLiteral.SubTypeNode(n.getString("subTypeClass"), pos(n),
                    graphNodes(arrOrEmpty(n, "subTrees"))));
        }
        return out;
    }

    private static ColSpec colSpec(Json.Obj v) {
        LambdaFunction f1 = v.has("function1") ? readLambda(v.getObj("function1")) : null;
        LambdaFunction f2 = v.has("function2") ? readLambda(v.getObj("function2")) : null;
        TypeExpression colType = v.has("genericType") ? genericType(v.getObj("genericType")) : null;
        Multiplicity colMult = v.has("multiplicity") ? multiplicity(v.getObj("multiplicity")) : null;
        if (v.has("stereotypes") || v.has("taggedValues")) {
            throw refused("no reader rule for column-spec stereotypes or tagged values: "
                    + v.getString("name"));
        }
        return new ColSpec(v.getString("name"), f1, f2, null, List.of(), false, pos(v),
                colType, colMult);
    }

    // ---------------------------------------------------------------------
    // Literals
    // ---------------------------------------------------------------------

    private static CInteger integer(Json.Obj o, @com.legend.base.Nullable SourceInfo pos) {
        Json.Node v = o.get("value");
        if (!(v instanceof Json.Num n) || !isIntegral(n)) {
            throw refused("an integer literal whose value is not an integer: " + v);
        }
        return n.decimalValue() != null
                ? new CInteger(n.decimalValue().toBigIntegerExact(), pos)
                : new CInteger(n.longValue(), pos);
    }

    private static CFloat floating(Json.Obj o, @com.legend.base.Nullable SourceInfo pos) {
        BigDecimal exact = exact(o, "value");
        return new CFloat(exact.doubleValue(), exact, pos);
    }

    /** A number's exact value: the decimal token when the parser kept one. */
    private static BigDecimal exact(Json.Obj o, String key) {
        Json.Node v = o.get(key);
        if (!(v instanceof Json.Num n)) {
            throw refused("a numeric literal whose value is not a number: " + v);
        }
        if (n.decimalValue() != null) {
            return n.decimalValue();
        }
        return n.isInteger() ? BigDecimal.valueOf(n.longValue())
                : new BigDecimal(Double.toString(n.doubleValue()));
    }

    private static boolean isIntegral(Json.Num n) {
        if (n.isInteger()) {
            return true;
        }
        BigDecimal d = n.decimalValue();
        return d != null && d.stripTrailingZeros().scale() <= 0;
    }

    /**
     * A date literal. The wire carries the source spelling verbatim; a MONTH-precision
     * value keeps a leading {@code %} (the emitter's quirk), undone here.
     */
    private static CDate date(String written, @com.legend.base.Nullable SourceInfo pos) {
        String body = written.startsWith("%") ? written.substring(1) : written;
        return new CDate(PureDateLiteral.parse(body), body, pos);
    }

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    private static TypeExpression genericType(Json.Obj gt) {
        Json.Obj raw = gt.getObj("rawType");
        String rawType = raw.getStringOr("_type", "");
        if (!"packageableType".equals(rawType)) {
            throw refused("no reader rule for a generic type whose rawType is '" + rawType
                    + "' -- add the rule, do not drop it");
        }
        String path = raw.getString("fullPath");
        List<TypeExpression> args = new ArrayList<>();
        for (Json.Node a : arrOrEmpty(gt, "typeArguments")) {
            args.add(genericType(asObj(a, "type argument")));
        }
        List<ValueSpecification> typeVariableValues = values(gt, "typeVariableValues");
        if (!arrOrEmpty(gt, "multiplicityArguments").isEmpty()) {
            throw refused("no reader rule for multiplicity arguments on type " + path);
        }
        SourceInfo pos = pos(raw);
        return args.isEmpty() && typeVariableValues.isEmpty()
                ? new TypeExpression.NameRef(path, pos)
                : new TypeExpression.Generic(path, args, List.of(), typeVariableValues, pos);
    }

    private static Multiplicity multiplicity(Json.Obj m) {
        Json.Node upper = m.getOr("upperBound", null);
        return new Multiplicity.Concrete(m.getIntOr("lowerBound", 0),
                upper instanceof Json.Num n ? Integer.valueOf((int) n.longValue()) : null);
    }

    // ---------------------------------------------------------------------
    // Plumbing
    // ---------------------------------------------------------------------

    private static List<ValueSpecification> values(Json.Obj o, String key) {
        List<ValueSpecification> out = new ArrayList<>();
        for (Json.Node n : arrOrEmpty(o, key)) {
            out.add(valueSpec(n));
        }
        return out;
    }

    private static List<Json.Node> arrOrEmpty(Json.Obj o, String key) {
        Json.Arr a = o.getArrOr(key, null);
        return a == null ? List.of() : a.items();
    }

    private static Json.Obj asObj(Json.Node n, String what) {
        if (n instanceof Json.Obj o) {
            return o;
        }
        throw refused(what + " is not a JSON object: " + n);
    }

    private static @com.legend.base.Nullable SourceInfo pos(Json.Obj o) {
        Json.Obj s = o.getObjOr("sourceInformation", null);
        if (s == null) {
            return null;
        }
        String sourceId = s.getStringOr("sourceId", "");
        return new SourceInfo(sourceId == null ? "" : sourceId, s.getInt("startLine"),
                s.getInt("startColumn"), s.getInt("endLine"), s.getInt("endColumn"));
    }

    private static IllegalArgumentException refused(String why) {
        return new IllegalArgumentException("lambda JSON: " + why);
    }
}
