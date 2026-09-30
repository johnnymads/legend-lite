// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.compiler.spec.typed;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Capture-avoiding substitution over the typed tree (rebuild W0.6 push 1):
 * {@code body[name := term]} for every entry of an environment.
 *
 * <p>Passing under a binder {@code b} (the binders are {@link FreeVars}'):
 * <ul>
 *   <li>{@code b} SHADOWS an entry of the same name: that entry stops;</li>
 *   <li>{@code b} would CAPTURE when it is free in the term of an entry
 *       its scope reads: the binder is renamed to {@code b_<k>}, the
 *       smallest {@code k} whose name is free in no term of the
 *       environment, is not read by the scope and is no binder inside
 *       it. No counter and no state: the same input gives the same
 *       names (binder names reach SQL lambda text).</li>
 * </ul>
 * A binder is renamed only on a real hazard, so a tree with no capture
 * comes back with its own names. A substituted term is spliced verbatim;
 * a renamed occurrence keeps its own {@code info}.
 */
public final class TypedSubst {

    private TypedSubst() {
    }

    /** The body with every free read of an {@code env} name replaced by
     * its term. */
    public static TypedSpec apply(TypedSpec body, Map<String, TypedSpec> env) {
        if (env.isEmpty()) {
            return body;
        }
        Map<String, Set<String>> free = new LinkedHashMap<>();
        Set<String> mentioned = new LinkedHashSet<>();
        env.forEach((name, term) -> {
            Set<String> f = FreeVars.of(term);
            free.put(name, f);
            mentioned.addAll(f);
        });
        return new Scope(env, free, Map.of(), mentioned, Set.of(), Set.of()).walk(body);
    }

    /** The term with every binder spelled like a reserved name renamed to
     * {@code b_<k>}, its reads following; nothing else changes. A lambda
     * or match parameter is renamed when spelled like a name in
     * {@code reserved}; a let inside a lambda when spelled like a name in
     * {@code reservedForLets}. The lowerer and the store resolver reserve
     * the names of their query-level lets and plan parameters for both,
     * and the names of every nested let for the parameters only (rebuild
     * W0.6 push 2): their let environments are one flat map read ahead of
     * every binder, so a binder spelled like an entry would be read from
     * the map, and a nested let spelled like a query-level one would
     * overwrite it. */
    public static TypedSpec renameBinders(TypedSpec term, Set<String> reserved,
            Set<String> reservedForLets) {
        if (reserved.isEmpty() && reservedForLets.isEmpty()) {
            return term;
        }
        return new Scope(Map.of(), Map.of(), Map.of(), Set.of(), reserved, reservedForLets).walk(term);
    }

    /** One position of the walk: the entries still live (not shadowed),
     * the free variables of each entry's term, and the binders renamed
     * above. */
    private record Scope(Map<String, TypedSpec> env, Map<String, Set<String>> free,
            Map<String, String> renames, Set<String> mentioned, Set<String> reserved,
            Set<String> reservedForLets) {

        /** Whether a binder named {@code b} can capture at all: only a
         * name some term mentions free, a name given to a binder above,
         * or a reserved name. Every other binder passes with no further
         * reading. */
        private boolean mayCapture(String b, Set<String> reservedHere) {
            return mentioned.contains(b) || renames.containsValue(b) || reservedHere.contains(b);
        }

        private Scope shadowed(String b) {
            if (!env.containsKey(b) && !renames.containsKey(b)) {
                return this;
            }
            Map<String, TypedSpec> e = new LinkedHashMap<>(env);
            e.remove(b);
            Map<String, String> r = new LinkedHashMap<>(renames);
            r.remove(b);
            return new Scope(e, free, r, mentioned, reserved, reservedForLets);
        }

        TypedSpec walk(TypedSpec n) {
            if (env.isEmpty() && renames.isEmpty() && reserved.isEmpty()
                    && reservedForLets.isEmpty()) {
                return n;
            }
            return switch (n) {
                case TypedVariable v -> {
                    String renamed = renames.get(v.name());
                    if (renamed != null) {
                        yield new TypedVariable(renamed, v.info());
                    }
                    TypedSpec term = env.get(v.name());
                    yield term == null ? v : term;
                }
                case TypedLambda l -> {
                    Scope s = this;
                    List<String> params = new ArrayList<>(l.parameters().size());
                    for (String p : l.parameters()) {
                        Bound b = s.bind(p, () -> FreeVars.of(l), () -> FreeVars.binders(l));
                        params.add(b.name());
                        s = b.scope();
                    }
                    List<TypedSpec> body = s.statements(l.body());
                    yield params.equals(l.parameters()) && sameRefs(body, l.body()) ? l
                            : new TypedLambda(params, body, l.info(), l.quoted());
                }
                case TypedMatch m -> match(m);
                case TypedMatchRuntime mr -> matchRuntime(mr);
                default -> n.mapChildren(this::walk);
            };
        }

        /** A statement sequence: a let binds its name for the statements
         * after it. */
        private List<TypedSpec> statements(List<TypedSpec> body) {
            List<TypedSpec> out = new ArrayList<>(body.size());
            Scope s = this;
            for (int i = 0; i < body.size(); i++) {
                TypedSpec st = body.get(i);
                if (!(st instanceof TypedLet let)) {
                    out.add(s.walk(st));
                    continue;
                }
                TypedSpec value = s.walk(let.value());
                List<TypedSpec> rest = body.subList(i + 1, body.size());
                Bound b = s.bindLet(let.name(), () -> {
                    Set<String> reads = new LinkedHashSet<>(FreeVars.ofBody(rest));
                    // the let's own reads below it are its scope, not the environment's
                    reads.remove(let.name());
                    return reads;
                }, () -> {
                    Set<String> inside = new LinkedHashSet<>();
                    rest.forEach(r -> inside.addAll(FreeVars.binders(r)));
                    return inside;
                });
                out.add(b.name().equals(let.name()) && value == let.value() ? let
                        : new TypedLet(b.name(), value, let.info()));
                s = b.scope();
            }
            return out;
        }

        private TypedSpec match(TypedMatch m) {
            TypedSpec input = walk(m.input());
            Optional<TypedSpec> extra = m.extra().map(this::walk);
            java.util.function.Supplier<Set<String>> reads = () -> FreeVars.of(m.body());
            java.util.function.Supplier<Set<String>> inside = () -> FreeVars.binders(m.body());
            Bound p = bind(m.param(), reads, inside);
            Scope s = p.scope();
            Optional<String> extraParam = m.extraParam();
            if (extraParam.isPresent()) {
                Bound x = s.bind(extraParam.get(), reads, inside);
                extraParam = Optional.of(x.name());
                s = x.scope();
            }
            TypedSpec body = s.walk(m.body());
            if (p.name().equals(m.param()) && extraParam.equals(m.extraParam())) {
                List<TypedSpec> kids = new ArrayList<>(3);
                kids.add(input);
                extra.ifPresent(kids::add);
                kids.add(body);
                return sameRefs(kids, m.children()) ? m : m.withChildren(kids);
            }
            return new TypedMatch(input, p.name(), body, extraParam, extra,
                    m.info(), m.declaredInfo());
        }

        private TypedSpec matchRuntime(TypedMatchRuntime mr) {
            TypedSpec input = walk(mr.input());
            Optional<TypedSpec> extra = mr.extra().map(this::walk);
            Optional<TypedSpec> dynamic = mr.dynamicArms().map(this::walk);
            java.util.function.Supplier<Set<String>> reads = () -> {
                Set<String> out = new LinkedHashSet<>();
                mr.arms().forEach(a -> out.addAll(FreeVars.of(a.body())));
                return out;
            };
            java.util.function.Supplier<Set<String>> inside = () -> {
                Set<String> out = new LinkedHashSet<>();
                for (TypedMatchRuntime.Arm a : mr.arms()) {
                    out.addAll(FreeVars.binders(a.body()));
                    out.add(a.param());
                }
                return out;
            };
            Scope shared = this;
            Optional<String> extraParam = mr.extraParam();
            if (extraParam.isPresent()) {
                Bound x = bind(extraParam.get(), reads, inside);
                extraParam = Optional.of(x.name());
                shared = x.scope();
            }
            boolean renamed = !extraParam.equals(mr.extraParam());
            List<TypedMatchRuntime.Arm> arms = new ArrayList<>(mr.arms().size());
            for (TypedMatchRuntime.Arm a : mr.arms()) {
                Bound p = shared.bind(a.param(), () -> FreeVars.of(a.body()), inside);
                renamed |= !p.name().equals(a.param());
                arms.add(new TypedMatchRuntime.Arm(a.typeFqn(), p.name(), p.scope().walk(a.body())));
            }
            TypedMatchRuntime out =
                    new TypedMatchRuntime(input, arms, extraParam, extra, dynamic, mr.info());
            return !renamed && sameRefs(out.children(), mr.children()) ? mr : out;
        }

        /** Pass under binder {@code b}, whose scope reads {@code reads}
         * free and holds the binders {@code inside} (both read only when
         * the binder can capture at all). */
        private Bound bind(String b, java.util.function.Supplier<Set<String>> reads,
                java.util.function.Supplier<Set<String>> inside) {
            return bind(b, reads, inside, reserved);
        }

        /** A let inside a lambda: a binder over the statements after it. */
        private Bound bindLet(String b, java.util.function.Supplier<Set<String>> reads,
                java.util.function.Supplier<Set<String>> inside) {
            return bind(b, reads, inside, reservedForLets);
        }

        private Bound bind(String b, java.util.function.Supplier<Set<String>> reads,
                java.util.function.Supplier<Set<String>> inside, Set<String> reservedHere) {
            Scope below = shadowed(b);
            if (!mayCapture(b, reservedHere)) {
                return new Bound(b, below);
            }
            Set<String> read = reads.get();
            if (!reservedHere.contains(b) && !below.captures(b, read)) {
                return new Bound(b, below);
            }
            String fresh = fresh(b, read, inside.get());
            Map<String, String> r = new LinkedHashMap<>(below.renames);
            r.put(b, fresh);
            return new Bound(fresh, new Scope(below.env, free, r, mentioned, reserved, reservedForLets));
        }

        private boolean captures(String b, Set<String> reads) {
            for (String name : env.keySet()) {
                if (reads.contains(name) && free.getOrDefault(name, Set.of()).contains(b)) {
                    return true;
                }
            }
            for (Map.Entry<String, String> e : renames.entrySet()) {
                if (reads.contains(e.getKey()) && e.getValue().equals(b)) {
                    return true;
                }
            }
            return false;
        }

        private String fresh(String b, Set<String> reads, Set<String> inside) {
            for (int k = 1;; k++) {
                String candidate = b + "_" + k;
                if (reads.contains(candidate) || inside.contains(candidate)
                        || renames.containsValue(candidate) || reserved.contains(candidate)
                        || reservedForLets.contains(candidate)) {
                    continue;
                }
                if (!mentioned.contains(candidate)) {
                    return candidate;
                }
            }
        }
    }

    /** A binder after the pass: its name (renamed or not) and the scope
     * beneath it. */
    private record Bound(String name, Scope scope) {
    }

    private static boolean sameRefs(List<TypedSpec> a, List<TypedSpec> b) {
        for (int i = 0; i < a.size(); i++) {
            if (a.get(i) != b.get(i)) {
                return false;
            }
        }
        return a.size() == b.size();
    }
}
