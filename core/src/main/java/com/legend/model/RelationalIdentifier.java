package com.legend.model;

/**
 * A relational identifier as the protocol spells it ({@code "total pnl"},
 * {@code "a\"b"}, {@code plain}) and as the model keeps it: the BARE name, and
 * whether the declaration quoted it. The quotes are a spelling, not part of the
 * name — the engine's relation space is bare too (a table's columns become
 * relation columns through {@code _Column.getColumnInstance}:
 * {@code StringEscape.unescape(removeQuotes(name))}). Whether a name was quoted
 * still matters, as a RENDERING fact: a case-folding database (H2, Postgres)
 * reads {@code "firstName"} and {@code firstName} as different columns.
 */
public final class RelationalIdentifier {

    private RelationalIdentifier() {
    }

    /** Whether {@code raw} is a double-quoted identifier. */
    public static boolean isQuoted(String raw) {
        return raw.length() >= 2 && raw.charAt(0) == '"' && raw.charAt(raw.length() - 1) == '"';
    }

    /**
     * A dotted spelling's parts, as written: split on each {@code .} OUTSIDE a quoted identifier
     * ({@code "my s"."a.b"} is {@code "my s"} and {@code "a.b"}), the lexer's backslash escape
     * honoured inside one. Each part is then {@link #bare}d by its reader.
     */
    public static java.util.List<String> parts(String dotted) {
        java.util.List<String> out = new java.util.ArrayList<>();
        StringBuilder part = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < dotted.length(); i++) {
            char c = dotted.charAt(i);
            if (quoted && c == '\\' && i + 1 < dotted.length()) {
                part.append(c).append(dotted.charAt(++i));
                continue;
            }
            if (c == '"') {
                quoted = !quoted;
            } else if (c == '.' && !quoted) {
                out.add(part.toString());
                part.setLength(0);
                continue;
            }
            part.append(c);
        }
        out.add(part.toString());
        return out;
    }

    /** The name {@code raw} denotes: quotes off, the lexer's backslash escape
     *  decoded ({@code "a\"b"} names {@code a"b}); an unquoted identifier is
     *  itself. */
    public static String bare(String raw) {
        if (!isQuoted(raw)) {
            return raw;
        }
        String inner = raw.substring(1, raw.length() - 1);
        if (inner.indexOf('\\') < 0) {
            return inner;
        }
        StringBuilder out = new StringBuilder(inner.length());
        for (int i = 0; i < inner.length(); i++) {
            char c = inner.charAt(i);
            if (c == '\\' && i + 1 < inner.length()) {
                c = inner.charAt(++i);
            }
            out.append(c);
        }
        return out.toString();
    }
}
