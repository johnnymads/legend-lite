// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.server;

import com.legend.base.Nullable;
import com.legend.error.LegendCompileException;
import com.legend.error.ModelException;
import com.legend.error.NotImplementedException;
import com.legend.json.Json;
import com.legend.model.AssociationDefinition;
import com.legend.model.AssociationMapping;
import com.legend.model.AssociationPropertyMapping;
import com.legend.model.ClassDefinition;
import com.legend.model.ClassMapping;
import com.legend.model.LegacyMappingDefinition;
import com.legend.model.MappingInclude;
import com.legend.model.PropertyMapping;
import com.legend.model.SetId;
import com.legend.model.StereotypeApplication;
import com.legend.protocol.DerivedPropertyDefinition;
import com.legend.protocol.Multiplicity;
import com.legend.protocol.ParameterDefinition;
import com.legend.protocol.TypeExpression;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * legend-engine's {@code POST pure/v1/analytics/mapping/modelCoverage}: which classes and
 * properties a mapping covers, as the entities and properties the upstream Query explorer
 * draws. A port of {@code core_analytics_mapping/modelCoverage} (analytics.pure,
 * mappedEntityBuilder.pure, analyticsHelper.pure; legend-engine 4.145.0) -- the engine's
 * Pure is the spec, measured against the running engine (fixtures under
 * {@code upstream-api/coverage}).
 *
 * <p><b>Where the mapping comes from.</b> The engine walks its compiled metamodel
 * ({@code SetImplementation}s with {@code PropertyMapping}s, embedded sets, set ids,
 * {@code targetSetImplementationId}s). lite's compiled mapping is a binding table of lifted
 * functions (docs/CLEAN_SHEET_INVERSION.md) that no longer carries property mappings, so
 * this reads the LEGACY mapping surface the model context archives
 * ({@code ModelContext.findLegacyMapping}) and rebuilds from it exactly the facts the engine's
 * compiler gives the analysis -- set ids ({@code <class path with _>} by default; embedded
 * {@code <parent id>_<property>}), the root rule (a class with one set in a mapping is its
 * root), the order the engine's compiler lists class mappings in (every relational set's
 * embedded sets, post-order, BEFORE the top-level sets: they are added to the mapping while
 * the sets are built), and each property mapping's target set id (explicit, else the
 * property type's default id for a class-typed property). Classes, properties and qualified
 * properties come from the model context's class definitions.
 *
 * <p><b>Refused</b> (NotImplementedException, naming the construct) rather than guessed:
 * milestoned (temporal) classes (the engine's generated milestoning properties and edge
 * points), aggregation-aware and Relation-function class mappings, cross-store and
 * model-join association mappings, embedded association property mappings, an M2M
 * class-typed property whose target set does not exist (the engine may auto-map it through
 * the source graph), measures/units, class hierarchies without a C3 linearization, and
 * {@code returnLightGraph=true}.
 */
public final class ModelCoverage {

    private ModelCoverage() {
    }

    /** The request with no query parameters: neither entity nor property info. */
    public static String analyze(String requestBody) {
        return analyze(requestBody, null, null, null);
    }

    /**
     * The engine's answer to {@code {clientVersion, mapping, model}}. The three flags are the
     * engine's QUERY parameters ({@code @QueryParam ... @DefaultValue("false") boolean}); the
     * engine refuses them as body fields (Jackson: unrecognized field, measured 4.145.0).
     * A value is true exactly when it spells {@code true} in any case, as JAX-RS parses a
     * {@code boolean} parameter.
     */
    public static String analyze(String requestBody, @Nullable String returnMappedEntityInfo,
            @Nullable String returnMappedPropertyInfo, @Nullable String returnLightGraph) {
        Json.Node n = Json.parse(requestBody, PureV1Api.REQUEST);
        if (!(n instanceof Json.Obj request)) {
            throw new IllegalArgumentException("the request body is not a JSON object");
        }
        for (String field : request.fields().keySet()) {
            if (!field.equals("clientVersion") && !field.equals("mapping") && !field.equals("model")) {
                throw new IllegalArgumentException("Unrecognized field \"" + field
                        + "\" (class MappingModelCoverageAnalysisInput), not marked as ignorable"
                        + " (3 known properties: \"model\", \"clientVersion\", \"mapping\"])");
            }
        }
        if (Boolean.parseBoolean(returnLightGraph)) {
            throw new NotImplementedException("modelCoverage: returnLightGraph=true (the covered"
                    + " classes/enumerations/associations/profiles as a PureModelContextData) is not"
                    + " implemented by legend-lite");
        }
        Json.Obj model = request.getObjOr("model", null);
        if (model == null) {
            throw new IllegalArgumentException("the request carries no model");
        }
        String type = model.getStringOr("_type", "");
        if (!"text".equals(type)) {
            throw new IllegalArgumentException("a model of _type '" + type + "': legend-lite reads "
                    + "PureModelContextText ({\"_type\":\"text\",\"code\":...}); the PMCD reader is not built");
        }
        String mapping = request.getStringOr("mapping", null);
        if (mapping == null) {
            throw new IllegalArgumentException("the request names no mapping");
        }
        return analyze(model.getString("code"), mapping, Boolean.parseBoolean(returnMappedEntityInfo),
                Boolean.parseBoolean(returnMappedPropertyInfo));
    }

    /** The analysis of {@code mappingPath} in {@code modelText}, as the engine's JSON. */
    static String analyze(String modelText, String mappingPath, boolean entityInfo, boolean propertyInfo) {
        var ctx = com.legend.Compiler.compileModel(modelText);
        LegacyMappingDefinition legacy = ctx.findLegacyMapping(mappingPath).orElse(null);
        if (legacy == null) {
            if (ctx.findMapping(mappingPath).isPresent()) {
                throw new NotImplementedException("modelCoverage: mapping '" + mappingPath
                        + "' is not written in the legacy mapping DSL; legend-lite analyses only that form");
            }
            throw new ModelException(LegendCompileException.Phase.MAPPING,
                    "Can't find mapping '" + mappingPath + "'");
        }
        Lookups lookups = new Lookups(ctx::findClassDefinition, t -> ctx.findEnum(t).isPresent(),
                ctx::findLegacyMapping, ctx::subtree, ctx::findAssociationOf, ctx::findAssociationEnd,
                ctx::elementFqns);
        Analysis a = new Analysis(new Model(lookups), entityInfo, propertyInfo);
        return Json.toCompact(Map.of("mappedEntities", a.run(a.mapping(mappingPath)).stream()
                .map(a::json).toList()));
    }

    // =====================================================================
    // The model: classes, properties, qualified properties (the engine's metamodel reads)
    // =====================================================================

    /** OTHER: neither a primitive, an enumeration nor a class (a measure, a unit, Any...). */
    private enum Kind { PRIMITIVE, ENUMERATION, CLASS, OTHER }

    /**
     * A property or qualified property as the analysis reads it. {@code owner} is the
     * declaring class or association (identity with {@code name}, and the parameter types for
     * a qualified property); {@code holder} is {@code ownerClass()}.
     */
    private record Prop(String owner, String name, String type, Kind kind, int lower,
            @Nullable Integer upper, boolean qualified, List<String> parameterTypes, String holder) {
    }

    /** The compiled model context's lookups the analysis reads. */
    private record Lookups(
            java.util.function.Function<String, java.util.Optional<ClassDefinition>> findClassDefinition,
            java.util.function.Predicate<String> isEnumeration,
            java.util.function.Function<String, java.util.Optional<LegacyMappingDefinition>> findLegacyMapping,
            java.util.function.Function<String, Set<String>> subtree,
            java.util.function.BiFunction<String, String, java.util.Optional<AssociationDefinition>> findAssociationOf,
            java.util.function.BiFunction<String, String,
                    java.util.Optional<AssociationDefinition.AssociationEndDefinition>> findAssociationEnd,
            java.util.function.Supplier<Set<String>> elementFqns) {
    }

    /** The class facts, from lite's model context. */
    private static final class Model {
        private final Lookups ctx;
        private final Map<String, List<String>> linearizations = new HashMap<>();
        private final Map<String, List<String>> specializations = new HashMap<>();

        Model(Lookups ctx) {
            this.ctx = ctx;
        }

        ClassDefinition classDef(String fqn) {
            ClassDefinition cd = ctx.findClassDefinition().apply(fqn).orElseThrow(() -> new IllegalStateException(
                    "modelCoverage: no class '" + fqn + "' in the compiled model"));
            for (StereotypeApplication s : cd.stereotypes()) {
                if ((s.profileName().equals("temporal") || s.profileName().endsWith("::temporal"))
                        && (s.stereotypeName().equals("businesstemporal")
                                || s.stereotypeName().equals("processingtemporal")
                                || s.stereotypeName().equals("bitemporal"))) {
                    throw new NotImplementedException("modelCoverage: milestoned class '" + fqn
                            + "' (<<temporal." + s.stereotypeName() + ">>) is not implemented by legend-lite:"
                            + " the engine's generated milestoning and edge-point properties are not modelled");
                }
            }
            return cd;
        }

        Kind kind(String type) {
            if (com.legend.compiler.element.type.Type.Primitive.findByFqn(type).isPresent()) {
                return Kind.PRIMITIVE;
            }
            if (ctx.isEnumeration().test(type)) {
                return Kind.ENUMERATION;
            }
            if (ctx.findClassDefinition().apply(type).isPresent()) {
                classDef(type);
                return Kind.CLASS;
            }
            return Kind.OTHER;
        }

        boolean isEnumeration(String type) {
            return ctx.isEnumeration().test(type);
        }

        /** {@code generalizations()} without {@code Any}: the C3 resolution order. */
        List<String> linearization(String fqn) {
            List<String> done = linearizations.get(fqn);
            if (done != null) {
                return done;
            }
            List<String> supers = new ArrayList<>();
            for (TypeExpression t : classDef(fqn).superClasses()) {
                String s = typeName(t);
                if (!s.equals("meta::pure::metamodel::type::Any")) {
                    supers.add(s);
                }
            }
            List<List<String>> seqs = new ArrayList<>();
            for (String s : supers) {
                seqs.add(new ArrayList<>(linearization(s)));
            }
            seqs.add(new ArrayList<>(supers));
            List<String> out = new ArrayList<>();
            out.add(fqn);
            while (seqs.stream().anyMatch(q -> !q.isEmpty())) {
                String next = null;
                for (List<String> q : seqs) {
                    if (q.isEmpty()) {
                        continue;
                    }
                    String head = q.get(0);
                    if (seqs.stream().noneMatch(o -> o.indexOf(head) > 0)) {
                        next = head;
                        break;
                    }
                }
                if (next == null) {
                    throw new NotImplementedException("modelCoverage: class '" + fqn
                            + "' has no C3 linearization of its generalizations");
                }
                out.add(next);
                for (List<String> q : seqs) {
                    q.remove(next);
                }
            }
            List<String> result = List.copyOf(out);
            linearizations.put(fqn, result);
            return result;
        }

        /** {@code superTypes()}: every generalization but the class itself and Any. */
        List<String> superTypes(String fqn) {
            List<String> l = linearization(fqn);
            return l.subList(1, l.size());
        }

        /** {@code superTypes(false)}: the direct superclasses. */
        List<String> directSuperTypes(String fqn) {
            List<String> out = new ArrayList<>();
            for (TypeExpression t : classDef(fqn).superClasses()) {
                String s = typeName(t);
                if (!s.equals("meta::pure::metamodel::type::Any") && !s.equals(fqn)) {
                    out.add(s);
                }
            }
            return out;
        }

        /** {@code $class.specializations.specific}: the direct subclasses. */
        List<String> specializations(String fqn) {
            return specializations.computeIfAbsent(fqn, f -> {
                List<String> out = new ArrayList<>();
                for (String sub : ctx.subtree().apply(f)) {
                    if (!sub.equals(f) && ctx.findClassDefinition().apply(sub).isPresent()
                            && directSuperTypes(sub).contains(f)) {
                        out.add(sub);
                    }
                }
                out.sort(Comparator.naturalOrder());
                return out;
            });
        }

        /** The property {@code name} of {@code cls}, as the engine resolves a mapped property. */
        Prop property(String cls, String name) {
            for (String c : linearization(cls)) {
                for (ClassDefinition.PropertyDefinition p : classDef(c).properties()) {
                    if (p.name().equals(name)) {
                        String t = typeName(p.type());
                        return prop(c, name, t, p.multiplicity(), false, List.of(), c);
                    }
                }
                var end = ctx.findAssociationEnd().apply(c, name);
                if (end.isPresent()) {
                    AssociationDefinition assoc = ctx.findAssociationOf().apply(c, name).orElseThrow();
                    return associationProperty(assoc, end.get());
                }
            }
            throw new IllegalStateException("modelCoverage: class '" + cls + "' has no property '" + name + "'");
        }

        Prop associationProperty(AssociationDefinition assoc, AssociationDefinition.AssociationEndDefinition end) {
            String t = end.targetClassFqn();
            String a = assoc.property1().targetClassFqn();
            String b = assoc.property2().targetClassFqn();
            // ownerClass(): the association's one class, else the class that is not the type
            String holder = a.equals(b) ? a : (a.equals(t) ? b : a);
            return prop(assoc.qualifiedName(), end.propertyName(), t, end.multiplicity(), false, List.of(), holder);
        }

        /** The association property {@code name} of {@code assoc}. */
        Prop associationProperty(String assocFqn, String name) {
            for (String c : ctx.elementFqns().get()) {
                var assoc = ctx.findAssociationOf().apply(c, name);
                if (assoc.isPresent() && assoc.get().qualifiedName().equals(assocFqn)) {
                    return associationProperty(assoc.get(), ctx.findAssociationEnd().apply(c, name).orElseThrow());
                }
            }
            throw new IllegalStateException("modelCoverage: association '" + assocFqn + "' has no property '" + name + "'");
        }

        /** {@code qualifiedProperties(class)}: each generalization's, in resolution order. */
        List<Prop> qualifiedProperties(String cls) {
            List<Prop> out = new ArrayList<>();
            for (String c : linearization(cls)) {
                for (DerivedPropertyDefinition d : classDef(c).derivedProperties()) {
                    List<String> params = new ArrayList<>();
                    for (ParameterDefinition p : d.parameters()) {
                        params.add(typeName(p.type()));
                    }
                    out.add(prop(c, d.name(), typeName(d.type()), d.multiplicity(), true, params, c));
                }
            }
            return out;
        }

        /** The class's own (not inherited, not association) properties: {@code $class.properties}. */
        List<Prop> ownProperties(String cls) {
            List<Prop> out = new ArrayList<>();
            for (ClassDefinition.PropertyDefinition p : classDef(cls).properties()) {
                out.add(prop(cls, p.name(), typeName(p.type()), p.multiplicity(), false, List.of(), cls));
            }
            return out;
        }

        private Prop prop(String owner, String name, String type, Multiplicity m, boolean qualified,
                List<String> params, String holder) {
            if (!(m instanceof Multiplicity.Concrete c)) {
                throw new NotImplementedException("modelCoverage: property '" + name + "' of '" + owner
                        + "' has a multiplicity parameter; legend-lite analyses concrete multiplicities");
            }
            return new Prop(owner, name, type, kind(type), c.lowerBound(), c.upperBound(), qualified,
                    List.copyOf(params), holder);
        }

        static String typeName(TypeExpression t) {
            if (t instanceof TypeExpression.NameRef nr) {
                return nr.name();
            }
            if (t instanceof TypeExpression.Generic g) {
                return g.name();
            }
            throw new NotImplementedException("modelCoverage: a property typed by "
                    + t.getClass().getSimpleName() + " is not implemented by legend-lite");
        }
    }

    // =====================================================================
    // The engine's mapping metamodel, rebuilt from the legacy surface
    // =====================================================================

    private enum SetKind { INSTANCE, PURE, EMBEDDED, INLINE, OTHERWISE, UNION, INHERITANCE }

    /** A {@code SetImplementation}; an embedded set is also its owner's property mapping. */
    private static final class SetImpl {
        final String id;
        final String cls;
        final String parent;
        final SetKind kind;
        /** as the engine's compiler leaves it */
        boolean root;
        /** as {@code reRoot} leaves it (the analysis's {@code classMappings}) */
        boolean rroot;
        final List<PM> pms = new ArrayList<>();
        @Nullable String superId;
        List<String> unionIds = List.of();
        @Nullable String srcClass;
        @Nullable String inlineId;
        @Nullable PM otherwise;
        /** the property mapping an embedded set is */
        @Nullable PM asPm;

        SetImpl(String id, String cls, String parent, SetKind kind, boolean root) {
            this.id = id;
            this.cls = cls;
            this.parent = parent;
            this.kind = kind;
            this.root = root;
        }

        boolean embedded() {
            return kind == SetKind.EMBEDDED || kind == SetKind.INLINE || kind == SetKind.OTHERWISE;
        }

        boolean operation() {
            return kind == SetKind.UNION || kind == SetKind.INHERITANCE;
        }
    }

    /** A {@code PropertyMapping}. */
    private static final class PM {
        final Prop property;
        final String target;
        final boolean local;
        /** non-null when this property mapping IS an embedded set */
        final @Nullable SetImpl set;

        PM(Prop property, String target, boolean local, @Nullable SetImpl set) {
            this.property = property;
            this.target = target;
            this.local = local;
            this.set = set;
        }
    }

    /** A compiled mapping: its includes, its class mappings in the engine's order, its association property mappings. */
    private record CMapping(String fqn, List<CMapping> includes, List<SetImpl> classMappings,
            List<AssocPM> associationPms) {
    }

    private record AssocPM(String source, PM pm) {
    }

    // =====================================================================
    // Output
    // =====================================================================

    private enum PType { String, Integer, Boolean, Float, Date, DateTime, Enumeration, Entity, Decimal, Unknown }

    /** A mapped property: plain, enum ({@code enumPath}) or entity ({@code entityPath}). */
    private static final class MProp {
        final String name;
        final @Nullable String enumPath;
        final @Nullable String entityPath;
        final @Nullable String subType;
        final @Nullable PType type;
        final int lower;
        final @Nullable Integer upper;
        /** a MultiInheritance*MappedProperty: {@code subClasses} and {@code inheritanceEntityPath} */
        final @Nullable List<String> subClasses;
        final @Nullable String inheritanceEntityPath;

        MProp(String name, @Nullable String enumPath, @Nullable String entityPath, @Nullable String subType,
                @Nullable PType type, int lower, @Nullable Integer upper, @Nullable List<String> subClasses,
                @Nullable String inheritanceEntityPath) {
            this.name = name;
            this.enumPath = enumPath;
            this.entityPath = entityPath;
            this.subType = subType;
            this.type = type;
            this.lower = lower;
            this.upper = upper;
            this.subClasses = subClasses;
            this.inheritanceEntityPath = inheritanceEntityPath;
        }

        MProp withEntityPath(String path) {
            return new MProp(name, enumPath, path, subType, type, lower, upper, subClasses, inheritanceEntityPath);
        }
    }

    private record Entity(String path, List<MProp> properties, boolean isRoot, String classPath) {
    }

    // =====================================================================
    // The analysis (analytics.pure / mappedEntityBuilder.pure / analyticsHelper.pure)
    // =====================================================================

    private static final class Analysis {
        private final Model m;
        private final boolean entityInfo;
        private final boolean propertyInfo;
        private final Map<String, CMapping> mappings = new HashMap<>();
        private final Set<String> building = new HashSet<>();
        /** every association property mapping of the analysed mapping and its includes, by source id */
        private final Map<String, List<PM>> assocBySource = new LinkedHashMap<>();
        private List<SetImpl> classMappings = List.of();
        private List<SetImpl> rootClassMappings = List.of();
        private List<SetImpl> operations = List.of();
        private final Map<SetImpl, List<SetImpl>> inheritanceMap = new IdentityHashMap<>();
        private final Map<String, List<SetImpl>> mappingClassMappings = new HashMap<>();

        Analysis(Model m, boolean entityInfo, boolean propertyInfo) {
            this.m = m;
            this.entityInfo = entityInfo;
            this.propertyInfo = propertyInfo;
        }

        // ---------------- building the metamodel ----------------

        CMapping mapping(String fqn) {
            CMapping done = mappings.get(fqn);
            if (done != null) {
                return done;
            }
            if (!building.add(fqn)) {
                throw new IllegalStateException("modelCoverage: mapping '" + fqn + "' includes itself");
            }
            LegacyMappingDefinition lm = m.ctx.findLegacyMapping().apply(fqn).orElseThrow(() -> new NotImplementedException(
                    "modelCoverage: included mapping '" + fqn + "' is not written in the legacy mapping DSL"));
            List<CMapping> includes = new ArrayList<>();
            for (MappingInclude inc : lm.includes()) {
                includes.add(mapping(inc.mappingPath()));
            }
            List<SetImpl> embedded = new ArrayList<>();
            List<SetImpl> sets = new ArrayList<>();
            for (ClassMapping cm : lm.classMappings()) {
                sets.add(set(cm, fqn, embedded));
            }
            // the root rule (MappingCompilerExtension): a class with one direct set is its root
            Map<String, List<SetImpl>> byClass = new LinkedHashMap<>();
            for (SetImpl s : sets) {
                byClass.computeIfAbsent(s.cls, k -> new ArrayList<>()).add(s);
            }
            for (List<SetImpl> same : byClass.values()) {
                if (same.size() == 1) {
                    same.get(0).root = true;
                }
            }
            List<AssocPM> assoc = new ArrayList<>();
            for (AssociationMapping am : lm.associationMappings()) {
                if (!(am instanceof AssociationMapping.Relational r)) {
                    throw new NotImplementedException("modelCoverage: " + am.getClass().getSimpleName()
                            + " association mapping of '" + am.associationName() + "' is not implemented by legend-lite");
                }
                for (AssociationPropertyMapping apm : r.propertyMappings()) {
                    assoc.add(associationPm(r.associationName(), apm));
                }
            }
            List<SetImpl> all = new ArrayList<>(embedded);
            all.addAll(sets);
            CMapping out = new CMapping(fqn, includes, all, assoc);
            mappings.put(fqn, out);
            building.remove(fqn);
            return out;
        }

        private SetImpl set(ClassMapping cm, String parent, List<SetImpl> embedded) {
            String id = SetId.of(cm);
            m.classDef(cm.className());
            switch (cm) {
                case ClassMapping.Relational r -> {
                    if (r.aggregation() != null) {
                        throw new NotImplementedException("modelCoverage: aggregation-aware class mapping '"
                                + id + "' is not implemented by legend-lite");
                    }
                    SetImpl s = new SetImpl(id, r.className(), parent, SetKind.INSTANCE, r.root());
                    s.superId = r.extendsSetId();
                    for (PropertyMapping pm : r.propertyMappings()) {
                        PM p = relationalPm(pm, s, parent, embedded);
                        if (p != null) {
                            s.pms.add(p);
                        }
                    }
                    return s;
                }
                case ClassMapping.Pure p -> {
                    SetImpl s = new SetImpl(id, p.className(), parent, SetKind.PURE, p.root());
                    s.superId = p.extendsSetId();
                    s.srcClass = p.sourceClass();
                    for (ClassMapping.Pure.PropertyBinding b : p.propertyBindings()) {
                        if (b.local()) {
                            // a mapping-local property is never covered (localMappingProperty)
                            continue;
                        }
                        Prop prop = m.property(p.className(), b.propertyName());
                        String target = b.targetSetId() != null ? b.targetSetId()
                                : prop.kind() == Kind.CLASS ? SetId.defaultFor(prop.type()) : "";
                        s.pms.add(new PM(prop, target, false, null));
                    }
                    return s;
                }
                case ClassMapping.Union u -> {
                    SetImpl s = new SetImpl(id, u.className(), parent, SetKind.UNION, u.root());
                    s.unionIds = List.copyOf(u.memberSetIds());
                    return s;
                }
                case ClassMapping.Inheritance i -> {
                    return new SetImpl(id, i.className(), parent, SetKind.INHERITANCE, i.root());
                }
                case ClassMapping.RelationFunction rf -> throw new NotImplementedException(
                        "modelCoverage: Relation-function class mapping '" + id + "' is not implemented by legend-lite");
            }
        }

        /** A relational property mapping of {@code owner}; embedded sets join {@code embedded} post-order. */
        private @Nullable PM relationalPm(PropertyMapping pm, SetImpl owner, String parent, List<SetImpl> embedded) {
            if (pm instanceof PropertyMapping.LocalProperty) {
                // a mapping-local property is never covered (localMappingProperty)
                return null;
            }
            Prop prop = m.property(owner.cls, pm.propertyName());
            switch (pm) {
                case PropertyMapping.Embedded e -> {
                    SetImpl s = new SetImpl(owner.id + "_" + e.propertyName(), prop.type(), parent, SetKind.EMBEDDED, false);
                    for (PropertyMapping sub : e.propertyMappings()) {
                        PM p = relationalPm(sub, s, parent, embedded);
                        if (p != null) {
                            s.pms.add(p);
                        }
                    }
                    s.asPm = new PM(prop, s.id, false, s);
                    embedded.add(s);
                    return s.asPm;
                }
                case PropertyMapping.InlineEmbedded i -> {
                    SetImpl s = new SetImpl(owner.id + "_" + i.propertyName(), prop.type(), parent, SetKind.INLINE, false);
                    s.inlineId = i.setId();
                    s.asPm = new PM(prop, s.id, false, s);
                    embedded.add(s);
                    return s.asPm;
                }
                case PropertyMapping.OtherwiseEmbedded o -> {
                    PM otherwise = new PM(prop, o.fallbackSetId(), false, null);
                    SetImpl s = new SetImpl(owner.id + "_" + o.propertyName(), prop.type(), parent, SetKind.OTHERWISE, false);
                    s.otherwise = otherwise;
                    for (PropertyMapping sub : o.embedded()) {
                        PM p = relationalPm(sub, s, parent, embedded);
                        if (p != null) {
                            s.pms.add(p);
                        }
                    }
                    s.asPm = new PM(prop, s.id, false, s);
                    embedded.add(s);
                    return s.asPm;
                }
                case PropertyMapping.Join j -> {
                    return new PM(prop, target(j.targetSetId(), prop), false, null);
                }
                default -> {
                    return new PM(prop, target(null, prop), false, null);
                }
            }
        }

        private static String target(@Nullable String explicit, Prop prop) {
            return explicit != null ? explicit : prop.kind() == Kind.CLASS ? SetId.defaultFor(prop.type()) : "";
        }

        private AssocPM associationPm(String assoc, AssociationPropertyMapping apm) {
            PropertyMapping body = apm.body();
            if (body instanceof PropertyMapping.Embedded || body instanceof PropertyMapping.InlineEmbedded
                    || body instanceof PropertyMapping.OtherwiseEmbedded || body instanceof PropertyMapping.LocalProperty) {
                throw new NotImplementedException("modelCoverage: a " + body.getClass().getSimpleName()
                        + " property mapping in association mapping '" + assoc + "' is not implemented by legend-lite");
            }
            Prop prop = m.associationProperty(assoc, apm.propertyName());
            String source = apm.sourceSetId() != null ? apm.sourceSetId() : SetId.defaultFor(prop.holder());
            String target = apm.targetSetId() != null ? apm.targetSetId() : SetId.defaultFor(prop.type());
            return new AssocPM(source, new PM(prop, target, false, null));
        }

        // ---------------- mapping functions (functions_Mapping.pure) ----------------

        /** {@code _allClassMappingsRecursive()->removeDuplicates()}. */
        private static List<SetImpl> allClassMappings(CMapping cm) {
            LinkedHashSet<SetImpl> out = new LinkedHashSet<>();
            for (CMapping inc : cm.includes()) {
                out.addAll(allClassMappings(inc));
            }
            out.addAll(cm.classMappings());
            return new ArrayList<>(out);
        }

        private static void allAssociationPms(CMapping cm, List<AssocPM> out) {
            for (CMapping inc : cm.includes()) {
                allAssociationPms(inc, out);
            }
            out.addAll(cm.associationPms());
        }

        /** {@code _classMappingByIdRecursive(id)->toOne()}. */
        private @Nullable SetImpl classMappingById(CMapping cm, String id) {
            LinkedHashSet<SetImpl> found = new LinkedHashSet<>();
            byIdRecursive(cm, id, found);
            if (found.size() > 1) {
                throw new IllegalStateException("modelCoverage: set id '" + id + "' names " + found.size() + " class mappings");
            }
            return found.isEmpty() ? null : found.iterator().next();
        }

        private static void byIdRecursive(CMapping cm, String id, Set<SetImpl> out) {
            for (CMapping inc : cm.includes()) {
                byIdRecursive(inc, id, out);
            }
            for (SetImpl s : cm.classMappings()) {
                if (s.id.equals(id)) {
                    out.add(s);
                }
            }
        }

        /** {@code rootClassMappingByClass(class)}: the last root set of the class, includes first. */
        private @Nullable SetImpl rootClassMappingByClass(CMapping cm, String cls) {
            List<SetImpl> all = new ArrayList<>();
            byClass(cm, cls, all);
            SetImpl last = null;
            for (SetImpl s : all) {
                if (s.root) {
                    last = s;
                }
            }
            return last;
        }

        private static void byClass(CMapping cm, String cls, List<SetImpl> out) {
            for (CMapping inc : cm.includes()) {
                byClass(inc, cls, out);
            }
            for (SetImpl s : cm.classMappings()) {
                if (s.cls.equals(cls)) {
                    out.add(s);
                }
            }
        }

        private CMapping mappingOf(SetImpl s) {
            CMapping cm = mappings.get(s.parent);
            if (cm == null) {
                throw new IllegalStateException("modelCoverage: set '" + s.id + "' of unbuilt mapping '" + s.parent + "'");
            }
            return cm;
        }

        /** {@code inheritanceMap->get(op).values}: the operation's instance sets, sorted by id. */
        private List<SetImpl> inheritance(SetImpl op) {
            List<SetImpl> values = inheritanceMap.get(op);
            if (values == null) {
                throw new IllegalStateException("modelCoverage: '" + op.id + "' is not an Operation set");
            }
            return values;
        }

        /** {@code allPropertyMappings()}: own (and the association's), then the super set's not overridden. */
        private List<PM> allPropertyMappings(SetImpl s) {
            List<PM> own = new ArrayList<>(s.pms);
            own.addAll(assocBySource.getOrDefault(s.id, List.of()));
            if (s.superId == null) {
                return own;
            }
            SetImpl sup = classMappingById(mappingOf(s), s.superId);
            if (sup == null) {
                return own;
            }
            Set<String> names = new HashSet<>();
            for (PM p : own) {
                names.add(p.property.name());
            }
            LinkedHashSet<PM> out = new LinkedHashSet<>(own);
            for (PM p : allPropertyMappings(sup)) {
                if (!names.contains(p.property.name())) {
                    out.add(p);
                }
            }
            return new ArrayList<>(out);
        }

        /** {@code resolveOperation}: an operation's instance sets, recursively. */
        private List<SetImpl> resolveOperation(SetImpl s) {
            if (!s.operation()) {
                return List.of(s);
            }
            CMapping cm = mappingOf(s);
            List<SetImpl> members = new ArrayList<>();
            if (s.kind == SetKind.UNION) {
                for (String id : s.unionIds) {
                    SetImpl member = classMappingById(cm, id);
                    if (member == null) {
                        throw new IllegalStateException("modelCoverage: union '" + s.id + "' names no set '" + id + "'");
                    }
                    members.add(member);
                }
            } else {
                LinkedHashSet<SetImpl> leaves = new LinkedHashSet<>();
                for (String spec : m.specializations(s.cls)) {
                    leaves.addAll(mappedLeafTypes(spec, List.of(), cm));
                }
                members.addAll(leaves);
            }
            List<SetImpl> out = new ArrayList<>();
            for (SetImpl member : members) {
                out.addAll(resolveOperation(member));
            }
            return out;
        }

        private List<SetImpl> mappedLeafTypes(String type, List<SetImpl> leafMost, CMapping cm) {
            SetImpl found = rootClassMappingByClass(cm, type);
            List<SetImpl> here = found == null ? leafMost : List.of(found);
            List<String> specs = m.specializations(type);
            if (specs.isEmpty()) {
                return here;
            }
            List<SetImpl> out = new ArrayList<>();
            for (String spec : specs) {
                out.addAll(mappedLeafTypes(spec, here, cm));
            }
            return out;
        }

        // ---------------- analyze (analytics.pure) ----------------

        List<Entity> run(CMapping mapping) {
            List<AssocPM> assoc = new ArrayList<>();
            allAssociationPms(mapping, assoc);
            for (AssocPM a : new LinkedHashSet<>(assoc)) {
                assocBySource.computeIfAbsent(a.source(), k -> new ArrayList<>()).add(a.pm());
            }
            classMappings = reRoot(mapping, allClassMappings(mapping));
            rootClassMappings = classMappings.stream().filter(s -> !s.embedded()).toList();
            operations = classMappings.stream().filter(SetImpl::operation).toList();
            Map<String, Integer> opsByClass = new HashMap<>();
            for (SetImpl o : operations) {
                if (opsByClass.merge(o.cls, 1, Integer::sum) > 1) {
                    // the engine picks from a hash map's key order (keyValues()->filter(...)->last())
                    throw new NotImplementedException("modelCoverage: class '" + o.cls + "' has more than one"
                            + " Operation set; the engine's choice among them is its hash order");
                }
                List<SetImpl> resolved = new ArrayList<>(resolveOperation(o));
                resolved.sort(Comparator.comparing(s -> s.id));
                inheritanceMap.put(o, resolved);
            }
            LinkedHashSet<CMapping> all = new LinkedHashSet<>();
            all.add(mapping);
            includes(mapping, all);
            for (CMapping cm : all) {
                Set<String> ids = new HashSet<>();
                for (SetImpl s : allClassMappingsFlat(cm)) {
                    ids.add(s.id);
                }
                mappingClassMappings.put(cm.fqn(), classMappings.stream().filter(s -> ids.contains(s.id)).toList());
            }

            List<Entity> entities = new ArrayList<>();
            for (SetImpl cm : classMappings) {
                if (cm.operation()) {
                    List<SetImpl> subTypes = new ArrayList<>(inheritance(cm));
                    for (SetImpl op : operations) {
                        if (m.superTypes(op.cls).contains(cm.cls)) {
                            subTypes.add(op);
                        }
                    }
                    entities.addAll(buildInheritanceEntities(cm, cm, List.of(), subTypes, "", p -> true,
                            cm.rroot, true));
                } else {
                    entities.addAll(buildEntity(cm.cls, entityName(cm), cm, propertyMappings(cm), p -> true, cm.rroot));
                }
            }
            entities = distinctBy(entities, Entity::path);

            List<Entity> inheritanceEntities = new ArrayList<>();
            for (Entity e : entities) {
                for (MProp i : e.properties()) {
                    if (i.inheritanceEntityPath == null) {
                        continue;
                    }
                    SetImpl op = null;
                    for (SetImpl o : operations) {
                        if (o.cls.equals(i.inheritanceEntityPath)) {
                            op = o;
                        }
                    }
                    if (op == null) {
                        throw new IllegalStateException("modelCoverage: no Operation set of '" + i.inheritanceEntityPath + "'");
                    }
                    List<String> subClasses = i.subClasses == null ? List.of() : i.subClasses;
                    List<SetImpl> types = new ArrayList<>();
                    for (SetImpl s : inheritance(op)) {
                        if (subClasses.contains(s.cls)) {
                            types.add(s);
                        }
                    }
                    for (SetImpl o : operations) {
                        if (m.superTypes(o.cls).contains(op.cls)) {
                            types.add(o);
                        }
                    }
                    String prefix = i.entityPath == null ? "" : i.entityPath.split("@", -1)[0];
                    inheritanceEntities.addAll(buildInheritanceEntities(op, op, List.of(),
                            distinctBy(types, s -> s.cls), prefix, p -> true, false, false));
                }
            }
            List<Entity> out = new ArrayList<>(entities);
            out.addAll(distinctBy(inheritanceEntities, Entity::path));
            return out;
        }

        private static void includes(CMapping cm, Set<CMapping> out) {
            for (CMapping inc : cm.includes()) {
                out.add(inc);
                includes(inc, out);
            }
        }

        /** {@code $map->classMappings().id}: the mapping's sets with its includes'. */
        private static List<SetImpl> allClassMappingsFlat(CMapping cm) {
            return allClassMappings(cm);
        }

        /** {@code reRoot}: roots grouped by class (sorted by class path), then the rest; distinct by id. */
        private List<SetImpl> reRoot(CMapping top, List<SetImpl> sets) {
            Map<String, List<SetImpl>> roots = new java.util.TreeMap<>();
            List<SetImpl> rest = new ArrayList<>();
            for (SetImpl s : sets) {
                s.rroot = s.root;
                if (s.root) {
                    roots.computeIfAbsent(s.cls, k -> new ArrayList<>()).add(s);
                } else {
                    rest.add(s);
                }
            }
            List<SetImpl> out = new ArrayList<>();
            for (Map.Entry<String, List<SetImpl>> e : roots.entrySet()) {
                for (SetImpl v : e.getValue()) {
                    if (e.getValue().size() > 1) {
                        SetImpl root = rootClassMappingByClass(top, e.getKey());
                        v.rroot = root != null && root.id.equals(v.id);
                    }
                    out.add(v);
                }
            }
            out.addAll(rest);
            return distinctBy(out, s -> s.id);
        }

        private static String entityName(SetImpl s) {
            return s.rroot ? s.cls : s.id;
        }

        /** {@code getPropertyMappings}: an otherwise-embedded set adds its fallback set's others. */
        private List<PM> propertyMappings(SetImpl s) {
            List<PM> own = allPropertyMappings(s);
            if (s.kind != SetKind.OTHERWISE) {
                return own;
            }
            String target = s.otherwise == null ? "" : s.otherwise.target;
            List<SetImpl> targets = classMappings.stream().filter(c -> c.id.equals(target)).toList();
            if (targets.size() != 1) {
                throw new IllegalStateException("modelCoverage: otherwise target '" + target + "' of '" + s.id
                        + "' names " + targets.size() + " sets");
            }
            Set<Prop> props = new HashSet<>();
            for (PM p : own) {
                props.add(p.property);
            }
            List<PM> out = new ArrayList<>(own);
            for (PM p : allPropertyMappings(targets.get(0))) {
                if (!props.contains(p.property)) {
                    out.add(p);
                }
            }
            return out;
        }

        // ---------------- mappedEntityBuilder.pure ----------------

        private String targetType(PM p) {
            if (p.target.isEmpty()) {
                return p.property.type();
            }
            if (p.set != null && p.set.kind == SetKind.INLINE) {
                return rootById(p.set.inlineId).cls;
            }
            if (p.set != null) {
                return p.property.type();
            }
            return rootById(p.target).cls;
        }

        private SetImpl rootById(@Nullable String id) {
            List<SetImpl> found = rootClassMappings.stream().filter(s -> s.id.equals(id)).toList();
            if (found.size() != 1) {
                throw new IllegalStateException("modelCoverage: set id '" + id + "' names " + found.size() + " sets");
            }
            return found.get(0);
        }

        private @Nullable String targetName(PM p) {
            String id = p.set != null && p.set.kind == SetKind.INLINE ? p.set.inlineId : p.target;
            if (p.set != null && p.set.kind != SetKind.INLINE) {
                return p.target;
            }
            List<SetImpl> root = rootClassMappings.stream().filter(s -> s.id.equals(id)).toList();
            return root.size() == 1 && root.get(0).rroot ? root.get(0).cls : id;
        }

        private MProp buildProperty(Prop p, String type, @Nullable String targetName) {
            Kind kind = m.kind(type);
            int lower = p.lower();
            Integer upper = p.upper();
            return switch (kind) {
                case PRIMITIVE -> new MProp(p.name(), null, null, null, propertyInfo ? mapType(type) : null,
                        lower, upper, null, null);
                case ENUMERATION -> new MProp(p.name(), type, null, null, propertyInfo ? PType.Enumeration : null,
                        lower, upper, null, null);
                case OTHER -> throw new NotImplementedException("modelCoverage: property '" + p.name()
                        + "' of type '" + type + "' (neither a primitive, an enumeration nor a class) is not"
                        + " implemented by legend-lite");
                case CLASS -> {
                    if (targetName == null) {
                        throw new IllegalStateException("modelCoverage: property '" + p.name() + "' has no target");
                    }
                    yield new MProp(p.name(), null, targetName, p.type().equals(type) ? null : type,
                            propertyInfo ? PType.Entity : null, lower, upper, null, null);
                }
            };
        }

        private MProp processPropertyMapping(PM p) {
            String type = targetType(p);
            return buildProperty(p.property, type, targetName(p));
        }

        private MProp processMultiPropertyMapping(List<PM> pms) {
            Prop property = pms.get(0).property;
            String type = property.type();
            MProp data = buildProperty(property, type, type);
            SetImpl key = null;
            for (SetImpl o : operations) {
                if (o.cls.equals(type)) {
                    key = o;
                }
            }
            if (key == null) {
                return data;
            }
            List<SetImpl> values = inheritance(key);
            List<String> targets = pms.stream().map(p -> p.target).toList();
            List<String> implementations = new ArrayList<>();
            for (SetImpl v : values) {
                if (targets.contains(v.id)) {
                    implementations.add(v.cls);
                }
            }
            List<String> sortedTargets = new ArrayList<>(targets);
            sortedTargets.sort(Comparator.naturalOrder());
            String entityPath = String.join(",", sortedTargets) + "@" + type;
            List<String> resolvedTargets = pms.stream().map(p -> p.set == null ? p.target
                    : p.set.kind == SetKind.OTHERWISE ? (p.set.otherwise == null ? "" : p.set.otherwise.target)
                    : p.set.kind == SetKind.INLINE ? p.set.inlineId : p.target).toList();
            Set<String> valueIds = new HashSet<>();
            for (SetImpl v : values) {
                valueIds.add(v.id);
            }
            boolean exact = valueIds.containsAll(resolvedTargets) && new HashSet<>(resolvedTargets).containsAll(valueIds);
            if (data.entityPath == null) {
                return data;
            }
            if (exact) {
                return data.withEntityPath(entityName(key));
            }
            return new MProp(data.name, null, entityPath, null, data.type, data.lower, data.upper,
                    implementations, type);
        }

        private List<MProp> processPropertyMappings(List<PM> pms) {
            Map<Prop, List<PM>> grouped = new LinkedHashMap<>();
            for (PM p : pms) {
                grouped.computeIfAbsent(p.property, k -> new ArrayList<>()).add(p);
            }
            List<Map.Entry<Prop, List<PM>>> entries = new ArrayList<>(grouped.entrySet());
            entries.sort(Comparator.comparing(e -> e.getKey().name()));
            List<MProp> out = new ArrayList<>();
            for (Map.Entry<Prop, List<PM>> e : entries) {
                out.add(e.getValue().size() == 1 ? processPropertyMapping(e.getValue().get(0))
                        : processMultiPropertyMapping(e.getValue()));
            }
            return out;
        }

        /** {@code getQualifiedPropertyTarget}: the qualified property's class-typed target name. */
        private @Nullable String qualifiedTarget(Prop qp, SetImpl current, String currentClass, String currentName) {
            if (qp.kind() != Kind.CLASS) {
                return null;
            }
            String type = qp.type();
            if (type.equals(currentClass)) {
                return currentName;
            }
            List<SetImpl> scope = mappingClassMappings.get(current.parent);
            List<SetImpl> potential = scope == null ? List.of()
                    : scope.stream().filter(s -> s.cls.equals(type) && !s.embedded()).toList();
            SetImpl target = potential.stream().filter(s -> s.rroot).findFirst()
                    .orElse(potential.isEmpty() ? null : potential.get(0));
            if (target == null || current.operation() || target.operation()) {
                if (rootClassMappings.stream().noneMatch(s -> s.cls.equals(type))) {
                    throw new IllegalStateException("modelCoverage: no set of '" + type + "'");
                }
                return type;
            }
            return entityName(target);
        }

        private boolean isSupported(Prop qp) {
            for (String t : qp.parameterTypes()) {
                if (!(m.isEnumeration(t) || supportedType(t) != null)) {
                    return false;
                }
            }
            return true;
        }

        private List<Entity> buildEntity(String cls, String target, SetImpl set, List<PM> pms,
                java.util.function.Predicate<Prop> filter, boolean isRoot) {
            Set<String> rootIds = new HashSet<>();
            Set<String> rootClasses = new HashSet<>();
            for (SetImpl s : rootClassMappings) {
                rootIds.add(s.id);
                rootClasses.add(s.cls);
            }
            List<PM> supported = new ArrayList<>();
            for (PM p : pms) {
                if (!p.local && (p.property.kind() != Kind.CLASS || p.set != null || rootIds.contains(p.target))
                        && filter.test(p.property)) {
                    supported.add(p);
                }
            }
            List<MProp> properties = processPropertyMappings(supported);

            List<MProp> qualified = new ArrayList<>();
            for (Prop qp : m.qualifiedProperties(cls)) {
                String rt = qp.type();
                if (isSupported(qp) && (rootClasses.contains(rt) || rt.equals(cls)
                        || qp.kind() == Kind.PRIMITIVE || qp.kind() == Kind.ENUMERATION)
                        && filter.test(qp)) {
                    qualified.add(buildProperty(qp, rt, qualifiedTarget(qp, set, cls, target)));
                }
            }

            // auto-mapped properties: a class-typed M2M property whose target set is missing may be
            // passed through the source graph by the engine -- refused, not guessed
            for (PM p : pms) {
                if (!supported.contains(p) && !p.local && set.kind == SetKind.PURE && p.property.kind() == Kind.CLASS
                        && classMappingById(mappingOf(set), p.target) == null) {
                    throw new NotImplementedException("modelCoverage: M2M property '" + p.property.name() + "' of '"
                            + set.id + "' targets no set; the engine's auto-mapped pass-through is not implemented"
                            + " by legend-lite");
                }
            }
            List<MProp> autoMapped = new ArrayList<>();
            if (set.kind == SetKind.PURE && set.srcClass != null && m.ctx.findClassDefinition().apply(set.srcClass).isPresent()) {
                Set<String> mapped = new HashSet<>();
                for (MProp p : properties) {
                    mapped.add(p.name);
                }
                List<Prop> src = m.ownProperties(set.srcClass);
                for (Prop p : m.ownProperties(cls)) {
                    if (mapped.contains(p.name()) || p.kind() == Kind.CLASS) {
                        continue;
                    }
                    boolean match = src.stream().anyMatch(sp -> sp.name().equals(p.name())
                            && sp.type().equals(p.type()) && sp.lower() == p.lower()
                            && java.util.Objects.equals(sp.upper(), p.upper()));
                    if (match) {
                        autoMapped.add(new MProp(p.name(), null, null, null, propertyInfo ? mapType(p.type()) : null,
                                p.lower(), p.upper(), null, null));
                    }
                }
            }
            List<MProp> all = new ArrayList<>(properties);
            all.addAll(qualified);
            all.addAll(autoMapped);
            List<Entity> out = new ArrayList<>();
            out.add(new Entity(target, distinctBy(all, p -> p.name), isRoot, cls));
            return out;
        }

        private List<Entity> buildInheritanceEntities(SetImpl base, SetImpl set, List<String> seen,
                List<SetImpl> mappingsIn, String prefix, java.util.function.Predicate<Prop> original,
                boolean isRoot, boolean isBase) {
            List<Entity> entities = buildInheritanceEntitiesImpl(base, set, seen, mappingsIn, prefix, original, isRoot, isBase);
            return entities.stream().map(e -> new Entity(e.path(), distinctBy(e.properties(), p -> p.name),
                    e.isRoot(), e.classPath())).toList();
        }

        private List<Entity> buildInheritanceEntitiesImpl(SetImpl base, SetImpl set, List<String> seen,
                List<SetImpl> mappingsIn, String prefix, java.util.function.Predicate<Prop> original,
                boolean isRoot, boolean isBase) {
            String cls = set.cls;
            List<String> specs = m.specializations(cls);

            List<PM> mapped;
            if (set.operation()) {
                List<PM> props = new ArrayList<>();
                for (SetImpl s : mappingsIn) {
                    if (!s.operation()) {
                        props.addAll(allPropertyMappings(s));
                    }
                }
                if (isRoot) {
                    Map<Prop, List<PM>> grouped = new LinkedHashMap<>();
                    for (PM p : props) {
                        grouped.computeIfAbsent(p.property, k -> new ArrayList<>()).add(p);
                    }
                    List<Map.Entry<Prop, List<PM>>> entries = new ArrayList<>(grouped.entrySet());
                    entries.sort(Comparator.comparing(e -> e.getKey().name()));
                    mapped = new ArrayList<>();
                    for (Map.Entry<Prop, List<PM>> e : entries) {
                        if (e.getValue().size() == 1) {
                            mapped.add(e.getValue().get(0));
                            continue;
                        }
                        List<PM> acc = new ArrayList<>();
                        for (PM p : e.getValue()) {
                            boolean present = acc.stream().anyMatch(a -> a.property.equals(p.property));
                            if (p.set != null) {
                                if (!present) {
                                    acc.add(p);
                                }
                            } else {
                                boolean root = rootClassMappings.stream()
                                        .anyMatch(r -> r.rroot && r.cls.equals(p.property.type()));
                                if (root || !present) {
                                    acc.add(p);
                                }
                            }
                        }
                        mapped.addAll(acc);
                    }
                } else {
                    mapped = distinctBy(props, p -> p.property);
                }
            } else {
                mapped = allPropertyMappings(set);
            }

            List<String> supersMinusSeen = new ArrayList<>(m.directSuperTypes(cls));
            supersMinusSeen.removeAll(seen);
            List<String> baseScope = new ArrayList<>(m.superTypes(cls));
            baseScope.add(cls);
            boolean atBase = cls.equals(base.cls);
            java.util.function.Predicate<Prop> filter = a -> (atBase ? baseScope.contains(a.holder())
                    : a.holder().equals(cls) || supersMinusSeen.contains(a.holder())) && original.test(a);

            List<String> inheritanceTypes = new ArrayList<>(seen);
            if (set.operation()) {
                inheritanceTypes.add(set.cls);
            }
            String name = prefix + (isBase ? entityName(set) : "@" + cls);
            List<Entity> entities = buildEntity(cls, name, set, mapped, filter, isRoot);
            Entity rootEntity = entities.get(0);
            List<SetImpl> current = mappingsIn.stream().filter(s -> specs.contains(s.cls)).toList();
            List<Entity> inheritance = new ArrayList<>();
            for (SetImpl c : current) {
                inheritance.addAll(buildInheritanceEntitiesImpl(base, c, inheritanceTypes, mappingsIn, prefix,
                        original, false, false));
            }
            List<MProp> props = new ArrayList<>(rootEntity.properties());
            for (SetImpl c : current) {
                String simple = c.cls.substring(c.cls.lastIndexOf("::") + 2);
                props.add(new MProp(simple.substring(0, 1).toLowerCase(java.util.Locale.ROOT) + simple.substring(1),
                        null, prefix + "@" + c.cls, c.cls, propertyInfo ? PType.Entity : null, 1, 1, null, null));
            }
            List<Entity> out = new ArrayList<>();
            out.add(new Entity(rootEntity.path(), props, rootEntity.isRoot(), rootEntity.classPath()));
            out.addAll(entities.subList(1, entities.size()));
            out.addAll(inheritance);
            return out;
        }

        // ---------------- types ----------------

        /** {@code mapToSupportedType}: an exact-type table (Number is reported as Float). */
        private static @Nullable PType supportedType(String type) {
            return switch (type) {
                case "meta::pure::metamodel::type::Number", "meta::pure::metamodel::type::Float" -> PType.Float;
                case "meta::pure::metamodel::type::Boolean" -> PType.Boolean;
                case "meta::pure::metamodel::type::DateTime", "meta::pure::metamodel::type::Date" -> PType.DateTime;
                case "meta::pure::metamodel::type::StrictDate" -> PType.Date;
                case "meta::pure::metamodel::type::String" -> PType.String;
                case "meta::pure::metamodel::type::Enum" -> PType.Enumeration;
                case "meta::pure::metamodel::type::Integer" -> PType.Integer;
                case "meta::pure::metamodel::type::Decimal" -> PType.Decimal;
                default -> null;
            };
        }

        private static PType mapType(String type) {
            PType t = supportedType(type);
            return t == null ? PType.Unknown : t;
        }

        // ---------------- JSON (the engine's Jackson rendering: sorted keys, nulls omitted) ----------------

        Map<String, Object> json(Entity e) {
            Map<String, Object> out = new LinkedHashMap<>();
            if (entityInfo) {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("classPath", e.classPath());
                info.put("isRootEntity", e.isRoot());
                info.put("subClasses", List.of());
                out.put("info", info);
            }
            out.put("path", e.path());
            out.put("properties", e.properties().stream().map(Analysis::json).toList());
            return out;
        }

        static Map<String, Object> json(MProp p) {
            Map<String, Object> out = new LinkedHashMap<>();
            if (p.enumPath != null) {
                out.put("_type", "enum");
                out.put("enumPath", p.enumPath);
            } else if (p.entityPath != null) {
                out.put("_type", "entity");
                out.put("entityPath", p.entityPath);
            } else {
                out.put("_type", "MappedProperty");
            }
            if (p.type != null) {
                Map<String, Object> mult = new LinkedHashMap<>();
                mult.put("lowerBound", p.lower);
                if (p.upper != null) {
                    mult.put("upperBound", p.upper);
                }
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("multiplicity", mult);
                info.put("propertyType", p.type.name());
                out.put("mappedPropertyInfo", info);
            }
            out.put("name", p.name);
            if (p.entityPath != null && p.subType != null) {
                out.put("subType", p.subType);
            }
            return out;
        }

        private static <T, K> List<T> distinctBy(List<T> in, java.util.function.Function<T, K> key) {
            Set<K> seen = new HashSet<>();
            List<T> out = new ArrayList<>();
            for (T t : in) {
                if (seen.add(key.apply(t))) {
                    out.add(t);
                }
            }
            return out;
        }
    }
}
