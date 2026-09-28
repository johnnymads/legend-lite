// The protocol's value specifications, as the wire carries them: legend-engine's V1 lambda JSON,
// which legend-lite reads (`ProtocolReader`) and prints (`PureComposer`, E4). A discriminated union
// on `_type`, field for field; every node here is one lite's reader accepts.
//
// This file is the SHAPE only. Build nodes with `build.ts`, `literal.ts` and `relation.ts` (the
// Relation API: queries are built with nothing else); read unknown JSON with `validate.ts`; write
// it with `json.ts`, which keeps exact numbers exact.

import type { ExactNumber } from './exact.ts';

/** `[lower..upper]`; no `upperBound` is `*`. */
export interface Multiplicity {
  readonly lowerBound: number;
  readonly upperBound?: number;
}

/** A type: `String`, `Relation<(a:String)>`, `Result<Any|1..*>`. */
export interface GenericType {
  readonly rawType: PackageableType | RelationType;
  readonly typeArguments: readonly GenericType[];
  readonly multiplicityArguments: readonly Multiplicity[];
  readonly typeVariableValues: readonly ValueSpecification[];
}

export interface PackageableType {
  readonly _type: 'packageableType';
  readonly fullPath: string;
}

/** A relation's column list, `(a:String, n:Integer[1])`. */
export interface RelationType {
  readonly _type: 'relationType';
  readonly columns: readonly RelationColumn[];
}

export interface RelationColumn {
  readonly name: string;
  readonly genericType: GenericType;
  readonly multiplicity: Multiplicity;
}

// ---- the nodes ----

export interface Lambda {
  readonly _type: 'lambda';
  readonly parameters: readonly Variable[];
  readonly body: readonly ValueSpecification[];
}

/** A variable: a lambda's parameter (typed or not), or a reference `$x`. */
export interface Variable {
  readonly _type: 'var';
  readonly name: string;
  readonly genericType?: GenericType;
  readonly multiplicity?: Multiplicity;
}

/** A function applied: `f(a, b)` and `a->f(b)` are the same node. */
export interface AppliedFunction {
  readonly _type: 'func';
  readonly function: string;
  readonly parameters: readonly ValueSpecification[];
}

/**
 * `$x.name`. With one `packageableElementPtr` parameter it is an ENUM VALUE
 * (`JoinKind.LEFT`); with more than one, a `receiver.name(args)` call.
 */
export interface AppliedProperty {
  readonly _type: 'property';
  readonly property: string;
  readonly parameters: readonly ValueSpecification[];
}

export interface Collection {
  readonly _type: 'collection';
  readonly multiplicity: Multiplicity;
  readonly values: readonly ValueSpecification[];
}

export interface PackageableElementPtr {
  readonly _type: 'packageableElementPtr';
  readonly fullPath: string;
}

export interface GenericTypeInstance {
  readonly _type: 'genericTypeInstance';
  readonly genericType: GenericType;
}

/** An embedded DSL: `#>{db.s.t}#`, `~name`, `~[a, b]`. */
export type ClassInstance = RelationStoreAccessor | ColSpecInstance | ColSpecArrayInstance;

export interface RelationStoreAccessor {
  readonly _type: 'classInstance';
  readonly type: '>';
  readonly value: { readonly path: readonly string[] };
}

export interface ColSpecInstance {
  readonly _type: 'classInstance';
  readonly type: 'colSpec';
  readonly value: ColSpec;
}

export interface ColSpecArrayInstance {
  readonly _type: 'classInstance';
  readonly type: 'colSpecArray';
  readonly value: { readonly colSpecs: readonly ColSpec[] };
}

/** `name`, `name: x|...` (a map), `name: x|...: y|...` (a map and a reduce), `name:Type`. */
export interface ColSpec {
  readonly name: string;
  readonly function1?: Lambda;
  readonly function2?: Lambda;
  readonly genericType?: GenericType;
  readonly multiplicity?: Multiplicity;
}

// ---- literals: each value exactly as the wire carries it ----

export interface CString {
  readonly _type: 'string';
  readonly value: string;
}

export interface CBoolean {
  readonly _type: 'boolean';
  readonly value: boolean;
}

/** An integer: a number while it is a safe one, its exact digits beyond. */
export interface CInteger {
  readonly _type: 'integer';
  readonly value: number | ExactNumber;
}

export interface CFloat {
  readonly _type: 'float';
  readonly value: number | ExactNumber;
}

/** A decimal: always its exact digits (`12.30` is not `12.3`). */
export interface CDecimal {
  readonly _type: 'decimal';
  readonly value: ExactNumber;
}

/** `YYYY-MM-DD`. */
export interface CStrictDate {
  readonly _type: 'strictDate';
  readonly value: string;
}

/** `YYYY-MM-DDTHH:MM:SS[.ffffff]`. */
export interface CDateTime {
  readonly _type: 'dateTime';
  readonly value: string;
}

/** `HH:MM:SS[.ffffff]`. */
export interface CStrictTime {
  readonly _type: 'strictTime';
  readonly value: string;
}

export interface CLatestDate {
  readonly _type: 'latestDate';
}

export type Literal = CString | CBoolean | CInteger | CFloat | CDecimal | CStrictDate | CDateTime
  | CStrictTime | CLatestDate;

/** The older enum spelling, `{_type:'enumValue', fullPath, value}` (the grammar writes a property). */
export interface EnumValue {
  readonly _type: 'enumValue';
  readonly fullPath: string;
  readonly value: string;
}

/**
 * Every other node upstream's protocol defines -- the TDS-era shapes, graph fetch trees, paths,
 * the legacy wrapper tags: READ and written back verbatim, for backwards compatibility (the user,
 * 2026-09-27), never built here. Its fields are whatever the wire carried.
 */
export interface OpaqueNode {
  readonly _type: OpaqueType;
  readonly [field: string]: unknown;
}

export const OPAQUE_TYPES = [
  'keyExpression', 'unitInstance', 'byteArray', 'qualifiedProperty', 'whatever', 'unknownFunc',
  'mappingInstance', 'primitiveType', 'unitType', 'class', 'enum', 'hackedClass', 'hackedUnit',
  'path', 'rootGraphFetchTree', 'listInstance', 'pair', 'aggregateValue', 'tdsAggregateValue',
  'tdsColumnInformation', 'tdsSortInformation', 'tdsOlapRank', 'tdsOlapAggregation',
  'runtimeInstance', 'executionContextInstance', 'alloySerializationConfig',
] as const;
export type OpaqueType = typeof OPAQUE_TYPES[number];

/** A class instance of any other embedded DSL (a graph fetch tree, a path, a TDS value). */
export interface OpaqueClassInstance {
  readonly _type: 'classInstance';
  readonly type: string;
  readonly value: unknown;
}

export type ValueSpecification =
  | Lambda
  | Variable
  | AppliedFunction
  | AppliedProperty
  | Collection
  | PackageableElementPtr
  | GenericTypeInstance
  | ClassInstance
  | EnumValue
  | Literal
  | OpaqueNode
  | OpaqueClassInstance;
