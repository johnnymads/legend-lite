// Typed literals, validated where they are made: a value that is not what its type says is
// refused HERE, naming it, never sent to fail somewhere further away.
//
// A negative number is `minus(5)`, not `-5`: the shape the grammar gives `-5` (lite's parser and
// upstream's alike), so a literal built here and the same literal parsed are the same JSON.

import { ExactNumber, ProtocolError } from './exact.ts';
import type {
  AppliedFunction, CBoolean, CDateTime, CDecimal, CFloat, CInteger, CLatestDate, CStrictDate,
  CStrictTime, CString, ValueSpecification,
} from './wire.ts';

const DAY = /^(-?\d{4,})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?$/;

function negate(v: ValueSpecification): AppliedFunction {
  return { _type: 'func', function: 'minus', parameters: [v] };
}

/** A real calendar day: month 1-12, the day within its month (leap years counted). */
function checkDay(text: string, what: string): void {
  const m = DAY.exec(text);
  if (!m) throw new ProtocolError(`${what} '${text}' is not YYYY-MM-DD`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (days === undefined || d < 1 || d > days) throw new ProtocolError(`${what} '${text}' is not a calendar day`);
}

function checkTime(text: string, what: string): void {
  const m = TIME.exec(text);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3]) > 59) {
    throw new ProtocolError(`${what} '${text}' is not HH:MM:SS[.ffffff]`);
  }
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

  /** A float: a finite number (or its exact digits). */
  float(value: number | string): CFloat | AppliedFunction {
    const exact = typeof value === 'string' ? ExactNumber.of(value) : null;
    const n = exact ? Number(exact.text) : value as number;
    if (!Number.isFinite(n)) throw new ProtocolError(`a float must be finite, got ${value}`);
    const negative = exact ? exact.isNegative : n < 0 || Object.is(n, -0);
    const magnitude: number | ExactNumber = exact ? exact.abs() : Math.abs(n);
    const node: CFloat = { _type: 'float', value: magnitude };
    return negative ? negate(node) : node;
  },

  /** A decimal as its exact digits, `'12.30'`: never through a double. */
  decimal(value: string | bigint): CDecimal | AppliedFunction {
    const exact = typeof value === 'bigint' ? ExactNumber.ofInteger(value) : ExactNumber.of(value);
    if (!exact.isPlain) throw new ProtocolError(`a decimal is written as plain digits, got '${value}'`);
    const node: CDecimal = { _type: 'decimal', value: exact.abs() };
    return exact.isNegative ? negate(node) : node;
  },

  /** A calendar day, `'2024-01-02'`. */
  strictDate(value: string): CStrictDate {
    checkDay(value, 'a StrictDate');
    return { _type: 'strictDate', value };
  },

  /** A timestamp, `'2024-01-02T03:04:05[.ffffff]'` (a space for the `T` is accepted). */
  dateTime(value: string): CDateTime {
    const text = value.replace(' ', 'T');
    const t = text.indexOf('T');
    if (t < 0) throw new ProtocolError(`a DateTime '${value}' has no time; a day alone is a StrictDate`);
    checkDay(text.slice(0, t), 'a DateTime');
    checkTime(text.slice(t + 1), 'a DateTime');
    return { _type: 'dateTime', value: text };
  },

  /** A time of day, `'10:11:12[.ffffff]'`. */
  strictTime(value: string): CStrictTime {
    checkTime(value, 'a StrictTime');
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
