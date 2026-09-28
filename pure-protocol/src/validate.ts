// Protocol JSON read into the typed model -- the mirror of legend-lite's `ProtocolReader`: each
// node checked for the fields its `_type` needs, each number typed by its node (an integer a
// number while safe, a decimal always its exact digits). A `_type` no protocol defines is
// REFUSED, naming it -- never skipped, never guessed; the older shapes upstream still defines are
// kept verbatim (`OpaqueNode`), for backwards compatibility.

import { ExactNumber, ProtocolError } from './exact.ts';
import { fromJson } from './json.ts';
import {
  OPAQUE_TYPES,
  type ColSpec, type GenericType, type Lambda, type Multiplicity, type RelationColumn,
  type ValueSpecification, type Variable,
} from './wire.ts';

type Json = Record<string, unknown>;

/** A lambda from JSON text (numbers exact) or from an already parsed value. */
export function readLambda(input: string | unknown): Lambda {
  const node = valueSpecification(typeof input === 'string' ? fromJson(input) : input, '$');
  if (node._type !== 'lambda') throw new ProtocolError(`expected a lambda, got _type '${node._type}'`);
  return node;
}

/** Any value specification from JSON text or a parsed value. */
export function readValueSpecification(input: string | unknown): ValueSpecification {
  return valueSpecification(typeof input === 'string' ? fromJson(input) : input, '$');
}

const OPAQUE = new Set<string>(OPAQUE_TYPES);

function valueSpecification(v: unknown, at: string): ValueSpecification {
  if (v === null) {
    // the ROOT PACKAGE, '::', is a literal null on the wire
    return { _type: 'packageableElementPtr', fullPath: '::' };
  }
  const o = obj(v, at);
  const type = o['_type'];
  if (typeof type !== 'string') throw new ProtocolError(`${at}: a value specification has no _type`);
  switch (type) {
    case 'lambda': return lambda(o, at);
    case 'var': return variable(o, at);
    case 'func':
      return { _type: 'func', function: str(o, 'function', at), parameters: list(o, 'parameters', at) };
    case 'property':
      return { _type: 'property', property: str(o, 'property', at), parameters: list(o, 'parameters', at) };
    case 'collection':
      return {
        _type: 'collection',
        multiplicity: o['multiplicity'] === undefined ? sizeOf(o, at) : multiplicity(o['multiplicity'], `${at}.multiplicity`),
        values: list(o, 'values', at),
      };
    case 'string': return { _type: 'string', value: str(o, 'value', at) };
    case 'boolean': {
      const b = o['value'];
      if (typeof b !== 'boolean') throw new ProtocolError(`${at}: a boolean literal whose value is ${String(b)}`);
      return { _type: 'boolean', value: b };
    }
    case 'integer': {
      const n = exact(o['value'], at);
      if (!n.isInteger) throw new ProtocolError(`${at}: an integer literal whose value is ${n.text}`);
      const asNumber = Number(n.text);
      return { _type: 'integer', value: Number.isSafeInteger(asNumber) ? asNumber : n };
    }
    case 'float': {
      const n = exact(o['value'], at);
      const asNumber = Number(n.text);
      return { _type: 'float', value: String(asNumber) === n.text ? asNumber : n };
    }
    case 'decimal': return { _type: 'decimal', value: exact(o['value'], at) };
    case 'strictDate': return { _type: 'strictDate', value: str(o, 'value', at) };
    case 'dateTime': return { _type: 'dateTime', value: str(o, 'value', at) };
    case 'strictTime': return { _type: 'strictTime', value: str(o, 'value', at) };
    case 'latestDate': return { _type: 'latestDate' };
    case 'packageableElementPtr': return { _type: 'packageableElementPtr', fullPath: str(o, 'fullPath', at) };
    case 'enumValue': return { _type: 'enumValue', fullPath: str(o, 'fullPath', at), value: str(o, 'value', at) };
    case 'genericTypeInstance':
      return { _type: 'genericTypeInstance', genericType: genericType(o['genericType'], `${at}.genericType`) };
    case 'classInstance': return classInstance(o, at);
    default:
      if (OPAQUE.has(type)) return o as unknown as ValueSpecification;
      throw new ProtocolError(`${at}: no protocol node has _type '${type}'`);
  }
}

function lambda(o: Json, at: string): Lambda {
  return {
    _type: 'lambda',
    parameters: arr(o, 'parameters', at).map((p, i) => {
      const v = valueSpecification(p, `${at}.parameters[${i}]`);
      if (v._type !== 'var') throw new ProtocolError(`${at}.parameters[${i}]: a lambda parameter is a var`);
      return v;
    }),
    body: list(o, 'body', at),
  };
}

function variable(o: Json, at: string): Variable {
  const name = str(o, 'name', at);
  if (o['genericType'] === undefined) return { _type: 'var', name };
  return {
    _type: 'var',
    name,
    genericType: genericType(o['genericType'], `${at}.genericType`),
    multiplicity: multiplicity(o['multiplicity'], `${at}.multiplicity`),
  };
}

function classInstance(o: Json, at: string): ValueSpecification {
  const kind = o['type'];
  const value = o['value'];
  switch (kind) {
    case '>': {
      const path = arr(obj(value, `${at}.value`), 'path', `${at}.value`);
      if (path.length === 0 || !path.every((p) => typeof p === 'string')) {
        throw new ProtocolError(`${at}: a relation accessor's path is a list of names`);
      }
      return { _type: 'classInstance', type: '>', value: { path: path as string[] } };
    }
    case 'colSpec':
      return { _type: 'classInstance', type: 'colSpec', value: colSpec(value, `${at}.value`) };
    case 'colSpecArray': {
      const specs = arr(obj(value, `${at}.value`), 'colSpecs', `${at}.value`);
      return {
        _type: 'classInstance',
        type: 'colSpecArray',
        value: { colSpecs: specs.map((s, i) => colSpec(s, `${at}.value.colSpecs[${i}]`)) },
      };
    }
    default:
      if (typeof kind !== 'string') throw new ProtocolError(`${at}: a classInstance has no type`);
      // a graph fetch tree, a path, a TDS value: kept verbatim
      return { _type: 'classInstance', type: kind, value };
  }
}

function colSpec(v: unknown, at: string): ColSpec {
  const o = obj(v, at);
  const out: { -readonly [K in keyof ColSpec]: ColSpec[K] } = { name: str(o, 'name', at) };
  if (o['function1'] !== undefined) out.function1 = lambda(obj(o['function1'], `${at}.function1`), `${at}.function1`);
  if (o['function2'] !== undefined) out.function2 = lambda(obj(o['function2'], `${at}.function2`), `${at}.function2`);
  if (o['genericType'] !== undefined) out.genericType = genericType(o['genericType'], `${at}.genericType`);
  if (o['multiplicity'] !== undefined) out.multiplicity = multiplicity(o['multiplicity'], `${at}.multiplicity`);
  return out;
}

function genericType(v: unknown, at: string): GenericType {
  const o = obj(v, at);
  const raw = obj(o['rawType'], `${at}.rawType`);
  let rawType: GenericType['rawType'];
  if (raw['_type'] === 'packageableType') {
    rawType = { _type: 'packageableType', fullPath: str(raw, 'fullPath', `${at}.rawType`) };
  } else if (raw['_type'] === 'relationType') {
    rawType = {
      _type: 'relationType',
      columns: arr(raw, 'columns', `${at}.rawType`).map((c, i): RelationColumn => {
        const co = obj(c, `${at}.rawType.columns[${i}]`);
        return {
          name: str(co, 'name', `${at}.rawType.columns[${i}]`),
          genericType: genericType(co['genericType'], `${at}.rawType.columns[${i}].genericType`),
          multiplicity: co['multiplicity'] === undefined
            ? { lowerBound: 0, upperBound: 1 }
            : multiplicity(co['multiplicity'], `${at}.rawType.columns[${i}].multiplicity`),
        };
      }),
    };
  } else {
    throw new ProtocolError(`${at}.rawType: no type has _type '${String(raw['_type'])}'`);
  }
  return {
    rawType,
    typeArguments: arrOr(o, 'typeArguments').map((t, i) => genericType(t, `${at}.typeArguments[${i}]`)),
    multiplicityArguments: arrOr(o, 'multiplicityArguments').map((m, i) => multiplicity(m, `${at}.multiplicityArguments[${i}]`)),
    typeVariableValues: arrOr(o, 'typeVariableValues').map((t, i) => valueSpecification(t, `${at}.typeVariableValues[${i}]`)),
  };
}

function multiplicity(v: unknown, at: string): Multiplicity {
  const o = obj(v, at);
  const lower = o['lowerBound'] === undefined ? 0 : Number(exact(o['lowerBound'], `${at}.lowerBound`).text);
  const upperRaw = o['upperBound'];
  if (upperRaw === undefined || upperRaw === null) return { lowerBound: lower };
  return { lowerBound: lower, upperBound: Number(exact(upperRaw, `${at}.upperBound`).text) };
}

function sizeOf(o: Json, at: string): Multiplicity {
  const n = arr(o, 'values', at).length;
  return { lowerBound: n, upperBound: n };
}

// ---- plumbing ----

function list(o: Json, key: string, at: string): ValueSpecification[] {
  return arr(o, key, at).map((x, i) => valueSpecification(x, `${at}.${key}[${i}]`));
}

function obj(v: unknown, at: string): Json {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || v instanceof ExactNumber) {
    throw new ProtocolError(`${at}: expected a JSON object`);
  }
  return v as Json;
}

function arr(o: Json, key: string, at: string): unknown[] {
  const a = o[key];
  if (a === undefined) return [];
  if (!Array.isArray(a)) throw new ProtocolError(`${at}.${key}: expected a list`);
  return a;
}

function arrOr(o: Json, key: string): unknown[] {
  const a = o[key];
  return Array.isArray(a) ? a : [];
}

function str(o: Json, key: string, at: string): string {
  const s = o[key];
  if (typeof s !== 'string') throw new ProtocolError(`${at}.${key}: expected text`);
  return s;
}

/** A number as its exact digits, whether parsed exactly (`fromJson`) or by `JSON.parse`. */
function exact(v: unknown, at: string): ExactNumber {
  if (v instanceof ExactNumber) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return ExactNumber.of(String(v));
  if (typeof v === 'string') return ExactNumber.of(v);
  if (typeof v === 'bigint') return ExactNumber.ofInteger(v);
  throw new ProtocolError(`${at}: expected a number, got ${String(v)}`);
}
