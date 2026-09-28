// A number as its exact digits.
//
// The protocol carries a decimal and a large integer as a JSON NUMBER TOKEN with every digit
// (`12.30`, `9007199254740993`); a JavaScript number keeps neither (12.30 is 12.3, and 2^53 + 1 is
// 2^53). So a number that must stay exact is held as its text, and `json.ts` writes that text as
// the token. What a number MEANS is its node's `_type`; this only keeps it exact.

/** A JSON number token: sign, digits, fraction, exponent. */
const JSON_NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
/** Plain decimal digits: no exponent. */
const PLAIN = /^-?\d+(\.\d+)?$/;

/** A number held as its exact decimal text, written to JSON as a bare number token. */
export class ExactNumber {
  readonly text: string;

  private constructor(text: string) {
    this.text = text;
  }

  /** A JSON number token's exact text (sign, digits, fraction, exponent). Refused otherwise. */
  static of(text: string): ExactNumber {
    if (!JSON_NUMBER.test(text)) {
      throw new ProtocolError(`not a number: '${text}'`);
    }
    return new ExactNumber(text);
  }

  /** Plain decimal digits, no exponent: what a decimal literal is written as. */
  get isPlain(): boolean {
    return PLAIN.test(this.text);
  }

  /** Whether the text is an integer: digits only. */
  get isInteger(): boolean {
    return /^-?\d+$/.test(this.text);
  }

  /** An integer exactly, however large. */
  static ofInteger(value: bigint | number): ExactNumber {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new ProtocolError(`${value} is not an exactly representable integer: pass a bigint or its text`);
    }
    return new ExactNumber(BigInt(value).toString());
  }

  get isNegative(): boolean {
    return this.text.startsWith('-');
  }

  /** The same magnitude, not negative. */
  abs(): ExactNumber {
    return this.isNegative ? new ExactNumber(this.text.slice(1)) : this;
  }

  toString(): string {
    return this.text;
  }

  /** `JSON.stringify` would lose it; `json.ts` writes the token. Refuse the lossy path loudly. */
  toJSON(): never {
    throw new ProtocolError('an ExactNumber must be written with toJson (json.ts), not JSON.stringify');
  }
}

/** A malformed protocol value: the message names what and why. */
export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}
