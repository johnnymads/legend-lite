// Typed literals. A number is checked where it is made, because it must be a JSON number to be
// written at all; a date, a timestamp or a time of day is CARRIED AS GIVEN, and the compiler's
// reader refuses one that is not (the user, 2026-09-28: the compiler owns a literal's rules --
// every query is compiled before it runs, so nothing malformed reaches a database).
//
// A negative number is `minus(5)`, not `-5`: the shape the grammar gives `-5` (lite's parser and
// upstream's alike), so a literal built here and the same literal parsed are the same JSON.

import { ExactNumber, ProtocolError } from './exact.ts';
import { javaBigDecimal, javaDouble } from './spelling.ts';
import type {
  AppliedFunction, CBoolean, CDateTime, CDecimal, CFloat, CInteger, CLatestDate, CStrictDate,
  CStrictTime, CString, ValueSpecification,
} from './wire.ts';

function negate(v: ValueSpecification): AppliedFunction {
  return { _type: 'func', function: 'minus', parameters: [v] };
}

export const lit = {
  string(value: string): CString {
    return { _type: 'string', value };
  },

  boolean(value: boolean): CBoolean {
    return { _type: 'boolean', value };
  },

  /** Any integer exactly: a number while safe, a bigint or its digits beyond. */
  integer(value: number | bigint | string): CInteger | AppliedFunction {
    const exact = typeof value === 'string' ? ExactNumber.of(value) : ExactNumber.ofInteger(value);
    if (!exact.isInteger) throw new ProtocolError(`'${value}' is not an integer`);
    const magnitude = exact.abs();
    const asNumber = Number(magnitude.text);
    const node: CInteger = {
      _type: 'integer',
      value: Number.isSafeInteger(asNumber) ? asNumber : magnitude,
    };
    return exact.isNegative ? negate(node) : node;
  },

  /**
   * A float: a finite number, or its digits. A Float IS a double, so its value is the double's,
   * written as the wire writes a double (spelling.ts: `5000` is `5000.0`, `1e7` is `1.0E7`).
   */
  float(value: number | string): CFloat | AppliedFunction {
    const exact = typeof value === 'string' ? ExactNumber.of(value) : null;
    const n = exact ? Number(exact.text) : value as number;
    if (!Number.isFinite(n)) throw new ProtocolError(`a float must be finite, got ${value}`);
    const negative = exact ? exact.isNegative : n < 0 || Object.is(n, -0);
    const node: CFloat = { _type: 'float', value: ExactNumber.of(javaDouble(Math.abs(n))) };
    return negative ? negate(node) : node;
  },

  /**
   * A decimal as its exact digits, `'12.30'`: never through a double. Written as the wire writes a
   * BigDecimal of that value and scale (spelling.ts: `0.0000001` is `1E-7`).
   */
  decimal(value: string | bigint): CDecimal | AppliedFunction {
    const exact = typeof value === 'bigint' ? ExactNumber.ofInteger(value) : ExactNumber.of(value);
    if (!exact.isPlain) throw new ProtocolError(`a decimal is written as plain digits, got '${value}'`);
    const node: CDecimal = { _type: 'decimal', value: ExactNumber.of(javaBigDecimal(exact.abs().text)) };
    return exact.isNegative ? negate(node) : node;
  },

  /** A calendar day, `'2024-01-02'`, as given: the compiler refuses one that is not. */
  strictDate(value: string): CStrictDate {
    return { _type: 'strictDate', value };
  },

  /** A timestamp, `'2024-01-02T03:04:05[.ffffff]'`, as given: the compiler refuses one that is not. */
  dateTime(value: string): CDateTime {
    return { _type: 'dateTime', value };
  },

  /** A time of day, `'10:11:12[.ffffff]'`, as given: the compiler refuses one that is not. */
  strictTime(value: string): CStrictTime {
    return { _type: 'strictTime', value };
  },

  latestDate(): CLatestDate {
    return { _type: 'latestDate' };
  },

  /**
   * A value of a column's COMPILER type as its literal: the bridge from a typed cell to the
   * wire. `value` is the cell's exact form (a day's text, a timestamp's text, a decimal's
   * digits, an integer as a number or bigint). A type with no literal form is refused.
   */
  of(type: string, value: string | number | bigint | boolean): ValueSpecification {
    switch (shortName(type)) {
      case 'String': case 'Varchar': case 'Char':
        return lit.string(String(value));
      case 'Boolean':
        if (typeof value !== 'boolean') throw new ProtocolError(`a Boolean value must be a boolean, got ${value}`);
        return lit.boolean(value);
      case 'Integer': case 'Int': case 'BigInt': case 'SmallInt': case 'TinyInt':
        return lit.integer(typeof value === 'boolean' ? Number(value) : value as number | bigint | string);
      case 'Float': case 'Double': case 'Real':
        return lit.float(typeof value === 'bigint' ? value.toString() : value as number | string);
      case 'Decimal': case 'Numeric': case 'Number':
        return lit.decimal(typeof value === 'number' ? numberText(value) : String(value));
      case 'StrictDate':
        return lit.strictDate(String(value));
      case 'DateTime': case 'Timestamp':
        return lit.dateTime(String(value));
      case 'Date':
        return String(value).length > 10 ? lit.dateTime(String(value)) : lit.strictDate(String(value));
      case 'StrictTime':
        return lit.strictTime(String(value));
      default:
        throw new ProtocolError(`no literal for a value of type '${type}'`);
    }
  },
};

/** `meta::pure::precisePrimitives::Varchar` is `Varchar`. */
function shortName(type: string): string {
  const i = type.lastIndexOf('::');
  return i < 0 ? type : type.slice(i + 2);
}

/** A double's plain digits (no exponent), for a Decimal handed a number. */
function numberText(n: number): string {
  if (!Number.isFinite(n)) throw new ProtocolError(`a decimal must be finite, got ${n}`);
  const s = String(n);
  return /e/i.test(s) ? n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') : s;
}
