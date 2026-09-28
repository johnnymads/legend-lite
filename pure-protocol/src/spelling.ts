// How the protocol wire SPELLS a number -- so a query built here and the same query written by the
// compiler are one byte string (the user, 2026-09-28: one query, one representation).
//
// This is not Pure's grammar (the compiler alone prints and parses text); it is the reference
// writer's JSON number layout. Upstream serializes a Float's double with Java's `Double.toString`
// and a Decimal's BigDecimal with `BigDecimal.toString`; legend-lite's protocol emitter does the
// same. JavaScript already finds a double's shortest digits (as Java does); what differs is only
// where the point and exponent go. Pinned by test/twins.test.ts: thousands of values, these bytes
// against lite's own parse.

/**
 * A finite, non-negative double as Java's `Double.toString` (as specified since JDK 19): the
 * shortest digits -- at least two -- that read back to it, the closest to it when there is a choice,
 * laid out plain (`5000.0`, `0.001`) when 1e-3 <= v < 1e7, else as `d.ddddE<exp>` (`1.0E7`,
 * `1.5E-4`).
 */
export function javaDouble(v: number): string {
  if (!Number.isFinite(v) || v < 0) throw new Error(`javaDouble takes a finite, non-negative number, got ${v}`);
  if (v === 0) return '0.0';
  let [mantissa, exponent] = v.toExponential().split('e') as [string, string];
  const plain = v >= 1e-3 && v < 1e7;
  // In the exponent layout Java writes at least two digits, the CLOSEST two that still read back
  // to v: for almost every double that is the one digit and a 0, but a subnormal's range is wide
  // (Double.MIN_VALUE is `4.9E-324`, not `5.0E-324`)
  if (!plain && !mantissa.includes('.')) {
    const two = v.toExponential(1);
    if (Number(two) === v) [mantissa, exponent] = two.split('e') as [string, string];
  }
  const digits = mantissa.replace('.', '');
  const exp = Number(exponent);
  if (plain) {
    if (exp < 0) return `0.${'0'.repeat(-exp - 1)}${digits}`;
    const whole = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
    return `${whole}.${digits.slice(exp + 1) || '0'}`;
  }
  return `${digits[0]}.${digits.slice(1) || '0'}E${exp}`;
}

/**
 * A non-negative decimal's exact text (a JSON number token: digits, fraction, exponent) as Java's
 * `BigDecimal.toString` writes the same value and scale: plain (`12.30`, `0.000001`) when its scale
 * is not negative and its adjusted exponent is at least -6, else `d.dddE+n` / `d.dddE-n`
 * (`1E-7`, `1.5E+3`).
 */
export function javaBigDecimal(text: string): string {
  const e = text.search(/[eE]/);
  const mantissa = e < 0 ? text : text.slice(0, e);
  const exponent = e < 0 ? 0 : Number(text.slice(e + 1));
  const point = mantissa.indexOf('.');
  const fraction = point < 0 ? '' : mantissa.slice(point + 1);
  const unscaled = (mantissa.replace('.', '').replace(/^0+(?=\d)/, '')) || '0';
  const scale = fraction.length - exponent;
  if (scale === 0) return unscaled;
  const adjusted = -scale + (unscaled.length - 1);
  if (scale > 0 && adjusted >= -6) {
    const padded = unscaled.padStart(scale + 1, '0');
    return `${padded.slice(0, padded.length - scale)}.${padded.slice(padded.length - scale)}`;
  }
  const coefficient = unscaled.length > 1 ? `${unscaled[0]}.${unscaled.slice(1)}` : unscaled;
  return `${coefficient}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
}
