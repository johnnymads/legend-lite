package com.legend.protocol.spec;

import java.util.List;
import java.util.Objects;

/**
 * A graph-fetch literal {@code #{Root {a, k {b}}}#} — like {@link PathLiteral}, the parse
 * product keeps BOTH representations: the wire tree (class name + property nodes with their
 * REAL token spans — graph-fetch spans are absolute, not island-shifted) for
 * {@code ProtocolEmitter}, and the desugared {@link ColSpecArray} legend-lite's compiler
 * consumes. {@code NameResolver} dissolves the node into {@link #desugared()} on first
 * touch.
 *
 * <p>Wire shape (ProbeWireShapes "typed new and gft", "alias dated tref2 gft2" d):
 * {@code classInstance} of type {@code rootGraphFetchTree}; the OUTER span and the value's
 * span are both the CLASS-NAME token span; each property node spans its name token.
 * Aliases, parameters, and subtype trees are carried as an unsupported flag and wall.
 */
public record GraphFetchLiteral(
        String className,
        List<Node> subTrees,
        List<SubTypeNode> subTypeTrees,
        ValueSpecification desugared,
        boolean unsupported,
        @com.legend.base.Nullable com.legend.protocol.SourceInfo pos) implements ValueSpecification {

    public GraphFetchLiteral {
        Objects.requireNonNull(className, "className");
        Objects.requireNonNull(subTrees, "subTrees");
        Objects.requireNonNull(subTypeTrees, "subTypeTrees");
        Objects.requireNonNull(desugared, "desugared");
        subTrees = List.copyOf(subTrees);
        subTypeTrees = List.copyOf(subTypeTrees);
    }

    /** No-subtype convenience constructor. */
    public GraphFetchLiteral(String className, List<Node> subTrees,
            ValueSpecification desugared, boolean unsupported,
            @com.legend.base.Nullable com.legend.protocol.SourceInfo pos) {
        this(className, subTrees, List.of(), desugared, unsupported, pos);
    }

    /** A {@code ->subType(@X) { ... }} ENTRY — the level's subTypeTrees on the wire;
     *  {@code pos} is the class-name span WITHOUT the {@code @}. */
    public record SubTypeNode(String subTypeClass,
                              @com.legend.base.Nullable com.legend.protocol.SourceInfo pos,
                              List<Node> subTrees) {
        public SubTypeNode {
            subTrees = List.copyOf(subTrees);
        }
    }

    /**
     * One property node: name, its token span, call arguments, optional alias
     * ({@code 'nick' : prop}), optional subtype view ({@code prop->subType(@X)}), nested
     * subtrees. Arguments are protocol value specs whose spans the island scan bakes in
     * (var = name only, no {@code $}; string/date/enum = full literal).
     */
    public record Node(String property,
                       @com.legend.base.Nullable com.legend.protocol.SourceInfo pos,
                       List<ValueSpecification> parameters,
                       @com.legend.base.Nullable String alias,
                       @com.legend.base.Nullable String subType,
                       List<Node> subTrees,
                       List<SubTypeNode> subTypeTrees) {
        public Node {
            parameters = List.copyOf(parameters);
            subTrees = List.copyOf(subTrees);
            subTypeTrees = List.copyOf(subTypeTrees);
        }

        /** No-subtype-entries convenience constructor. */
        public Node(String property, @com.legend.base.Nullable com.legend.protocol.SourceInfo pos,
                    List<ValueSpecification> parameters, @com.legend.base.Nullable String alias,
                    @com.legend.base.Nullable String subType, List<Node> subTrees) {
            this(property, pos, parameters, alias, subType, subTrees, List.of());
        }
    }

    /**
     * A tree of property nodes (the wire's shape) as the {@link ColSpecArray} the compiler
     * consumes -- the desugaring {@code SpecParser.parseGraphDefinition} performs on text, built
     * from the tree, so a graph-fetch tree read from protocol JSON ({@code ProtocolReader}) is the
     * same literal the grammar gives. Each property is {@code ~prop: _gfN|$_gfN.prop} (N the
     * depth), its subtree a zero-parameter lambda of the nested array; a subtype view is the
     * {@code ->subType} entry carrying its class as a type annotation. A level's subtype entries
     * follow its properties (the wire keeps them in two lists).
     */
    public static ColSpecArray desugar(List<Node> subTrees, List<SubTypeNode> subTypeTrees) {
        return desugar(subTrees, subTypeTrees, 0);
    }

    private static ColSpecArray desugar(List<Node> subTrees, List<SubTypeNode> subTypeTrees, int depth) {
        List<ColSpec> specs = new java.util.ArrayList<>();
        for (Node n : subTrees) {
            Variable param = new Variable("_gf" + depth);
            LambdaFunction fn1 = new LambdaFunction(List.of(param), List.of(new AppliedProperty(param, n.property())));
            boolean qualified = !n.parameters().isEmpty();
            ColSpecArray body = desugar(n.subTrees(), n.subTypeTrees(), depth + 1);
            LambdaFunction fn2;
            if (n.subType() != null) {
                // prop->subType(@Sub) { ... }: sugar for prop { ->subType(@Sub) { ... } }
                fn2 = new LambdaFunction(List.of(), List.of(new ColSpecArray(List.of(subTypeEntry(n.subType(), body)))));
            } else {
                fn2 = n.subTrees().isEmpty() && n.subTypeTrees().isEmpty() ? null : new LambdaFunction(List.of(), List.of(body));
            }
            specs.add(new ColSpec(n.property(), fn1, fn2, n.alias(), n.parameters(), qualified));
        }
        for (SubTypeNode st : subTypeTrees) {
            specs.add(subTypeEntry(st.subTypeClass(), desugar(st.subTrees(), List.of(), depth + 1)));
        }
        return new ColSpecArray(specs);
    }

    /** {@code ->subType(@X) { body }}: the entry named {@code ->subType}, its class as a type annotation. */
    private static ColSpec subTypeEntry(String subTypeClass, ColSpecArray body) {
        return new ColSpec("->subType", null, new LambdaFunction(List.of(), List.of(body)), null,
                List.of(new TypeAnnotation.Named(new com.legend.protocol.TypeExpression.NameRef(subTypeClass))));
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof GraphFetchLiteral other
                && className.equals(other.className())
                && desugared.equals(other.desugared())
                && unsupported == other.unsupported();
    }

    @Override
    public int hashCode() {
        return Objects.hash(className, desugared, unsupported);
    }
}
