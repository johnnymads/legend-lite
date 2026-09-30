// Copyright 2026 Legend Contributors
// SPDX-License-Identifier: Apache-2.0

package com.legend.parser;

/**
 * The CHARACTER-LEVEL island scanner: THE ONE scalar reader for island
 * argument text (audit §2.1), used by path-literal dated segments.
 * Extracted from {@code SpecParser} at the 4.138.2 re-pin (the file-size
 * guardrail's named seam). Graph-fetch trees are NOT scanned here: the
 * expression parser's grammar reads them (one parser, 2026-09-30).
 */
final class IslandScan {

    /** Error anchor for bad escapes inside island strings. */
    private final TokenStreamCursor errorContext;

    IslandScan(TokenStreamCursor errorContext) {
        this.errorContext = errorContext;
    }

    /** What {@link #scanScalar} read. {@code a}/{@code b} carry the kind's
     *  strings (STRING: unescaped body; DATE: body sans {@code %} / written
     *  with it; ENUM: type / value; VAR: name); spans are {@code s..e}
     *  inclusive; {@code next} is where the caller resumes. */
    record Scalar(ScalarKind kind, String a, String b, long intValue,
            int s, int e, int next) {
        static Scalar of(ScalarKind k, String a, String b, long v, int s, int e, int n) {
            return new Scalar(k, a, b, v, s, e, n);
        }
    }

    enum ScalarKind { SKIP, LATEST, DATE, INT, NUMERICISH, STRING, BOOL, VAR, ENUM, OTHER }

    /**
     * THE ONE scalar reader for island argument text (audit §2.1): path-literal
     * dated-segment args and graph-fetch property args read the same lexeme the
     * SAME way. Each caller maps the kinds whose wire shapes it has probed and
     * WALLS the rest — an unprobed position refuses loudly instead of reading
     * wrong (a float no longer truncates to its fraction digits; strings
     * unescape on both paths). Structural syntax (collections, commas,
     * closers) stays with the caller.
     */
    Scalar scanScalar(String src, int i, int limit) {
        char c = src.charAt(i);
        if (c == '/' && i + 1 < limit && src.charAt(i + 1) == '/') {
            int k = i;
            while (k < limit && src.charAt(k) != '\n') {
                k++;
            }
            return Scalar.of(ScalarKind.SKIP, "", "", 0, i, k, k);
        }
        if (c == '%') {
            int k = i + 1;
            while (k < limit && (Character.isLetterOrDigit(src.charAt(k))
                    || "-T:.Z+".indexOf(src.charAt(k)) >= 0)) {
                k++;
            }
            String body = src.substring(i + 1, k);
            if (body.isEmpty()) {
                return Scalar.of(ScalarKind.OTHER, "", "", 0, i, i, i + 1);
            }
            return Scalar.of(body.equals("latest") ? ScalarKind.LATEST : ScalarKind.DATE,
                    body, src.substring(i, k), 0, i, k - 1, k);
        }
        if (Character.isDigit(c)) {
            int k = i;
            while (k < limit && Character.isDigit(src.charAt(k))) {
                k++;
            }
            if (k < limit && (src.charAt(k) == '.' || isGraphIdentChar(src.charAt(k)))) {
                // float/decimal/suffixed — one LEXEME, wire unprobed: consume it
                // whole so it cannot re-read as its fraction digits
                while (k < limit && (src.charAt(k) == '.' || isGraphIdentChar(src.charAt(k)))) {
                    k++;
                }
                return Scalar.of(ScalarKind.NUMERICISH, src.substring(i, k), "", 0, i, k - 1, k);
            }
            long intVal;
            try {
                intVal = Long.parseLong(src.substring(i, k));
            } catch (NumberFormatException overflow) {
                throw errorContext.error("integer literal out of range: '"
                        + src.substring(i, k) + "'");
            }
            return Scalar.of(ScalarKind.INT, "", "", intVal, i, k - 1, k);
        }
        if (c == '\'') {
            // ESCAPE-AWARE close scan: 'it\'s' is one literal (adversarial
            // audit F26 — indexOf landed on the escaped quote and refused
            // engine-legal input)
            int close = closingQuote(src, i + 1, limit);
            if (close < 0) {
                return Scalar.of(ScalarKind.OTHER, "", "", 0, i, limit - 1, limit);
            }
            return Scalar.of(ScalarKind.STRING,
                    TokenStreamCursor.unescapeBody(
                            src.substring(i + 1, close), "string literal",
                            errorContext), "", 0, i, close, close + 1);
        }
        if (c == '$') {
            int k = i + 1;
            while (k < limit && isGraphIdentChar(src.charAt(k))) {
                k++;
            }
            if (k == i + 1) {
                return Scalar.of(ScalarKind.OTHER, "", "", 0, i, i, i + 1);
            }
            return Scalar.of(ScalarKind.VAR, src.substring(i + 1, k), "", 0, i + 1, k - 1, k);
        }
        if (Character.isLetter(c) || c == '_') {
            int k = i;
            while (k < limit && (isGraphIdentChar(src.charAt(k)) || src.charAt(k) == ':')) {
                k++;
            }
            String word = src.substring(i, k);
            if (word.equals("true") || word.equals("false")) {
                return Scalar.of(ScalarKind.BOOL, word, "", word.equals("true") ? 1 : 0,
                        i, k - 1, k);
            }
            if (k < limit && src.charAt(k) == '.') {
                int vs = k + 1;
                int ve = vs;
                while (ve < limit && isGraphIdentChar(src.charAt(ve))) {
                    ve++;
                }
                if (ve > vs) {
                    return Scalar.of(ScalarKind.ENUM, word, src.substring(vs, ve), 0,
                            i, ve - 1, ve);
                }
            }
            return Scalar.of(ScalarKind.OTHER, word, "", 0, i, k - 1, k);
        }
        return Scalar.of(ScalarKind.OTHER, "", "", 0, i, i, i + 1);
    }


    private static boolean isGraphIdentChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_';
    }

    /** Index of the closing quote from {@code from}, honouring backslash
     *  escapes; {@code -1} when none before {@code limit}. THE quote scan
     *  for this char-level scanner — every site must use it, never a raw
     *  {@code indexOf} (adversarial audit F26/F27). */
    private static int closingQuote(String src, int from, int limit) {
        for (int k = from; k < limit; k++) {
            char qc = src.charAt(k);
            if (qc == '\\') {
                k++;
            } else if (qc == '\'') {
                return k;
            }
        }
        return -1;
    }
}
