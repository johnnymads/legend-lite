package com.legend.compiler.spec.typed;

import com.legend.compiler.element.type.ExprType;

import java.util.List;

/**
 * A type-checked {@code filter} (engine {@code TypedFilter}) &mdash; one node for
 * both overloads, {@code filter<T>(Relation<T>[1], {T[1]->Boolean[1]}):Relation<T>[1]}
 * and the collection {@code filter<T>(T[*], {T[1]->Boolean[1]}):T[*]}; lowering
 * disambiguates by the source's type. Filter only removes rows/elements, so
 * {@link #info()} is the source type unchanged (checked generically against the
 * registered signature; this node is <em>emission</em>, not a bespoke rule).
 *
 * @param source    the relation or collection being filtered
 * @param predicate the boolean row/element predicate
 * @param info      the result type &mdash; the source's, from the signature's {@code Relation<T>}/{@code T[*]} return
 * @param stamp     the RESOLVER-GENERATED provenance of this filter &mdash;
 *                  drives the engine's WHERE conjunct order
 *                  ({@code [user][correlation][temporal]}: buildExistsPredicate
 *                  seeds the subselect with the user predicate, the join
 *                  correlation appends, applyMilestoningTypeFilters appends
 *                  LAST). {@link Stamp#NONE} for every user-written filter.
 */
public record TypedFilter(TypedSpec source, TypedLambda predicate, ExprType info,
        Stamp stamp) implements TypedRelationOp {

    /** Resolver provenance classes, in engine WHERE order. */
    public enum Stamp { NONE, CORRELATION, TEMPORAL }

    /** This filter over other children or another type, its stamp KEPT: a
     * rebuild never chooses provenance (rebuild W0.6 push 3: a rebuilt
     * EXISTS filter lost CORRELATION and lowered null-safe). A NEW filter
     * writes its stamp explicitly, with the reason beside it. */
    public TypedFilter rebuilt(TypedSpec source, TypedLambda predicate, ExprType info) {
        return new TypedFilter(source, predicate, info, stamp);
    }

    @Override
    public List<TypedSpec> children() {
        return List.of(source, predicate);
    }

    @Override
    public TypedSpec withChildren(java.util.List<TypedSpec> kids) {
        TypedSpec.expectChildren(kids, 2, "TypedFilter");
        // the stamp is NODE metadata, not a child — it must survive every
        // walker rebuild or the ordering provenance silently erases
        return new TypedFilter(kids.get(0), (TypedLambda) kids.get(1), info,
                stamp);
    }
    @Override
    public TypedSpec withInfo(ExprType info) {
        return new TypedFilter(source, predicate, info, stamp);
    }
}
