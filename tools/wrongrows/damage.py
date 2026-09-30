#!/usr/bin/env python3
"""Damaged data from the stress corpus's seeds (rebuild D23): a ###Data file whose elements replace the
seeds of the same name at load time, on both engines. The seeds are never edited; this output is
deterministic and regenerable, never written by hand.

    damage.py [--out <file.pure>] [--only stress::TestData] [--kinds DUP,NULLS,ORPHAN,EXTREME]

For every table of every Relational ###Data element, after its seed rows:
  DUP     a copy of the first row (a fresh primary key where the table declares one; an exact duplicate
          where it does not): duplicate business keys.
  NULLS   a row with a fresh primary key and every other column empty: NULL in every nullable column.
  ORPHAN  for every Join this table takes part in, a row whose join column holds a value no row on the
          other side has (the other columns copied from the first row): a missing match on every join.
  EXTREME a row with the extremes of each type (the longest allowed string, a non-BMP string, the largest
          integer, a far date): the values the fixtures never hold.
Milestoning versions and ties on sort keys are the next slice.
The schemas come from the Table and Join definitions in the corpus and its linked projects.
"""
import csv, io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STRESS = os.path.join(ROOT, 'core/src/test/resources/stress')
PROJECTS = os.path.join(ROOT, 'projects')

def sources():
    out = []
    for proj in sorted(os.listdir(PROJECTS)) if os.path.isdir(PROJECTS) else []:
        for f in ('model.pure', 'store.pure', 'mapping.pure'):
            p = os.path.join(PROJECTS, proj, f)
            if os.path.exists(p):
                out.append(p)
    for f in sorted(os.listdir(STRESS)):
        if f.endswith('.pure'):
            out.append(os.path.join(STRESS, f))
    return out

TABLE = re.compile(r'\bTable\s+([A-Za-z_][A-Za-z_0-9]*)\s*\n?\s*\((.*?)\)\s*(?=\n\s*(?:Table|View|Join|Filter|Schema|MultiGrainFilter|//|\)|$))', re.S)
JOIN = re.compile(r'\bJoin\s+[A-Za-z_0-9]+\s*\(\s*(?:\[[^\]]*\]\s*)?([A-Za-z_0-9]+)\.([A-Za-z_0-9]+)\s*=\s*(?:\[[^\]]*\]\s*)?([A-Za-z_0-9]+)\.([A-Za-z_0-9]+)\s*\)')
COL = re.compile(r'^\s*([A-Za-z_][A-Za-z_0-9]*)\s+([A-Za-z]+(?:\([^)]*\))?)\s*(PRIMARY KEY|NOT NULL)?', re.I)

def schemas(paths):
    tables, joins = {}, []
    for p in paths:
        s = open(p).read()
        for m in TABLE.finditer(s):
            name, body = m.group(1), re.sub(r'//[^\n]*', '', m.group(2))
            cols = []
            for part in re.split(r',(?![^(]*\))', body):
                c = COL.match(part.strip())
                if c:
                    flag = (c.group(3) or '').upper()
                    # (name, type, primary key, not null)
                    cols.append((c.group(1), c.group(2).upper(), flag == 'PRIMARY KEY', flag != ''))
            if cols:
                tables.setdefault(name, cols)
        for m in JOIN.finditer(s):
            joins.append((m.group(1), m.group(2), m.group(3), m.group(4)))
    return tables, joins

DATA = re.compile(r'^Data\s+([A-Za-z_:][A-Za-z_0-9:]*)\s*\n\{\s*\n\s*Relational\s*\n\s*#\{(.*?)\n\s*\}#\s*\n\}', re.M | re.S)
TABLE_CSV = re.compile(r'([A-Za-z_][A-Za-z_0-9]*)\.([A-Za-z_][A-Za-z_0-9]*):\s*((?:\s*\'(?:[^\'\\]|\\.)*\'\s*\+?)+);', re.S)

def seeds(paths):
    out = {}
    for p in paths:
        for m in DATA.finditer(open(p).read()):
            name, body = m.group(1), m.group(2)
            tables = []
            for t in TABLE_CSV.finditer(body):
                text = ''.join(re.findall(r"'((?:[^'\\]|\\.)*)'", t.group(3)))
                text = text.replace('\\n', '\n').replace("\\'", "'")
                rows = list(csv.reader(io.StringIO(text)))
                rows = [r for r in rows if r]
                tables.append((t.group(1), t.group(2), rows))
            out[name] = tables
    return out

def fresh(kind, n):
    k = kind.split('(')[0]
    if k in ('INTEGER', 'INT', 'BIGINT'):
        return str(9000000 + n)
    if k == 'SMALLINT':
        return str(30000 + n % 2000)
    if k == 'TINYINT':
        return str(100 + n % 27)
    if k in ('DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC', 'REAL'):
        return str(9000000 + n) + '.5'
    if k == 'DATE':
        return '2099-12-%02d' % (1 + n % 28)
    if k in ('TIMESTAMP', 'DATETIME'):
        return '2099-12-%02d 23:59:59' % (1 + n % 28)
    if k in ('BIT', 'BOOLEAN'):
        return 'true'
    m = re.search(r'\((\d+)', kind)
    width = int(m.group(1)) if m else 40
    v = 'ZZ-ORPHAN-%d' % n
    if len(v) > width:
        # a declared width is a contract (H2 enforces it): a base-36 tag that fits
        tag = ''
        x = n
        while x:
            tag = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[x % 36] + tag
            x //= 36
        v = ('Z' + tag)[-width:] if width > 0 else tag
    return v

def extreme(kind):
    k = kind.split('(')[0]
    m = re.search(r'\((\d+)', kind)
    if k in ('INTEGER', 'INT'):
        return '2147483647'
    if k in ('BIGINT',):
        return '9223372036854775807'
    if k in ('SMALLINT', 'TINYINT'):
        return '32767'
    if k in ('DOUBLE', 'FLOAT', 'REAL'):
        return '1e15'
    if k in ('DECIMAL', 'NUMERIC'):
        return '0.000001'
    if k == 'DATE':
        return '1900-01-01'
    if k in ('TIMESTAMP', 'DATETIME'):
        return '1900-01-01 00:00:00'
    if k in ('BIT', 'BOOLEAN'):
        return 'false'
    if k in ('BINARY', 'VARBINARY', 'BLOB', 'BIT VARYING'):
        return ''
    # the width is in UTF-16 units for H2 (the engine's session): the non-BMP
    # character counts two, so the string is cut by units, not code points
    width = int(m.group(1)) if m else 8
    s = '\U0001F600' + 'Ω' + 'x' * width
    out, units = '', 0
    for ch in s:
        u = 2 if ord(ch) > 0xFFFF else 1
        if units + u > max(1, width):
            break
        out += ch
        units += u
    return out or 'x'

KINDS = {'DUP', 'NULLS', 'ORPHAN', 'EXTREME'}
TABLES = None   # a regex over table names; None = every table

def damage(name, tables, schema, joins, counter):
    out = []
    for schema_name, table, rows in tables:
        cols = schema.get(table)
        header, body = rows[0], rows[1:]
        if not body or cols is None or (TABLES is not None and not re.search(TABLES, table)):
            out.append((schema_name, table, rows, []))
            continue
        kinds = {c: k for c, k, _, _ in cols}
        pks = [c for c, _, pk, _ in cols if pk]
        required = {c for c, _, _, nn in cols if nn}
        idx = {c: i for i, c in enumerate(header)}
        added = []
        def row(base, over):
            r = list(base)
            for c, v in over.items():
                if c in idx:
                    r[idx[c]] = v
            return r
        first = body[0]
        n = counter[0]; counter[0] += 1
        added.append(('DUP', row(first, {pk: fresh(kinds[pk], n) for pk in pks})))
        n = counter[0]; counter[0] += 1
        keep = {c: first[idx[c]] for c in required if c in idx}
        keep.update({pk: fresh(kinds[pk], n) for pk in pks})
        added.append(('NULLS', row([''] * len(first), keep)))
        for a, ac, b, bc in joins:
            for side, col in ((a, ac), (b, bc)):
                if side == table and col in idx:
                    n = counter[0]; counter[0] += 1
                    over = {pk: fresh(kinds[pk], n) for pk in pks}
                    over[col] = fresh(kinds.get(col, 'VARCHAR'), n)
                    added.append(('ORPHAN', row(first, over)))
        n = counter[0]; counter[0] += 1
        ext = {c: extreme(kinds[c]) for c in header if c in kinds and c not in pks}
        ext.update({pk: fresh(kinds[pk], n) for pk in pks})
        added.append(('EXTREME', row(first, ext)))
        out.append((schema_name, table, rows, [a for a in added if a[0] in KINDS]))
    return out

def render(name, damaged):
    lines = ['Data %s' % name, '{', '  Relational', '  #{']
    for schema_name, table, rows, added in damaged:
        lines.append('    %s.%s:' % (schema_name, table))
        all_rows = rows + [r for _, r in added]
        for i, r in enumerate(all_rows):
            buf = io.StringIO()
            csv.writer(buf, lineterminator='').writerow(r)
            cell = buf.getvalue().replace('\\', '\\\\').replace("'", "\\'")
            lines.append("      '%s\\n'%s" % (cell, ' +' if i < len(all_rows) - 1 else ';'))
    lines.append('  }#')
    lines.append('}')
    return '\n'.join(lines)

def main():
    args = sys.argv[1:]
    out = None; only = None
    if '--out' in args:
        i = args.index('--out'); out = args[i + 1]; del args[i:i + 2]
    if '--only' in args:
        i = args.index('--only'); only = args[i + 1]; del args[i:i + 2]
    global TABLES
    if '--tables' in args:
        i = args.index('--tables'); TABLES = args[i + 1]; del args[i:i + 2]
    if '--kinds' in args:
        i = args.index('--kinds'); KINDS.clear(); KINDS.update(args[i + 1].split(',')); del args[i:i + 2]
    paths = sources()
    schema, joins = schemas(paths)
    seed = seeds(paths)
    counter = [1]
    parts = ['###Data']
    report = []
    for name, tables in seed.items():
        if only and name != only:
            continue
        d = damage(name, tables, schema, joins, counter)
        parts.append(render(name, d))
        for schema_name, table, rows, added in d:
            report.append('%s\t%s.%s\t%d seed rows\t%s' % (name, schema_name, table, len(rows) - 1,
                          ', '.join('%s×%d' % (k, sum(1 for kk, _ in added if kk == k)) for k in ('DUP', 'NULLS', 'ORPHAN', 'EXTREME'))))
    text = '\n\n'.join(parts) + '\n'
    if out:
        with open(out, 'w') as h:
            h.write(text)
        print('wrote', out, '(%d data elements, %d tables, %d joins known)' % (len(seed), len(schema), len(joins)))
        for line in report[:12]:
            print(' ', line)
        print('  ...' if len(report) > 12 else '')
    else:
        sys.stdout.write(text)

if __name__ == '__main__':
    main()
