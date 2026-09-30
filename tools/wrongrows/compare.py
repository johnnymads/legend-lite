#!/usr/bin/env python3
"""Compare two directories of per-test row dumps (rebuild D23: legend-engine's rows against
legend-lite's, on the seed data or on damaged data).

    compare.py <engine-rows-dir> <lite-rows-dir> [--report out.tsv]

Each file is <suite>___<test>.rows.json holding the test's computed answer as JSON. Rows are
compared as MULTISETS (D6: order is not part of the answer unless a test asks for it) after
normalising scalar spellings the two engines are known to spell differently; a difference that
vanishes under normalisation is reported as SPELLING, not as a row difference. Classes:

    EQUAL      same rows
    SPELLING   same rows once numbers and date/time spellings are normalised (registered, not a defect)
    COUNT      different number of rows
    VALUES     same number of rows, different values (the wrong-rows candidates)
    SHAPE      one side is not a row list (an error payload, a scalar, a graph)
    ENGINE-ONLY / LITE-ONLY   the test ran on one side only
"""
import json, os, re, sys
from collections import Counter

TS = re.compile(r'^(\d{4}-\d{2}-\d{2})T00:00:00(\.0+)?(\+0000|Z)?$')

def norm_scalar(v):
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        f = float(v)
        return int(f) if f == int(f) and abs(f) < 1e15 else round(f, 9)
    if isinstance(v, str):
        m = TS.match(v)
        if m:
            return m.group(1)          # a midnight timestamp is the date it spells
        try:
            f = float(v)
            if re.fullmatch(r'-?\d+(\.\d+)?', v):
                return norm_scalar(f)
        except ValueError:
            pass
        return v
    return json.dumps(v, sort_keys=True)

def rows_of(payload):
    if isinstance(payload, list) and all(isinstance(r, dict) for r in payload):
        return payload
    if isinstance(payload, dict):
        for k in ('rows', 'values', 'result'):
            if k in payload and isinstance(payload[k], list):
                return rows_of(payload[k])
    return None

def key(row, normalise):
    items = sorted((k, norm_scalar(v) if normalise else (v if not isinstance(v, (dict, list)) else json.dumps(v, sort_keys=True))) for k, v in row.items())
    return json.dumps(items, sort_keys=True, default=str)

def load(d):
    out = {}
    for f in sorted(os.listdir(d)):
        if f.endswith('.rows.json'):
            with open(os.path.join(d, f)) as h:
                txt = h.read().strip()
            try:
                out[f[:-len('.rows.json')]] = json.loads(txt) if txt and txt != 'null' else None
            except json.JSONDecodeError:
                out[f[:-len('.rows.json')]] = {'__unparsed__': txt[:200]}
    return out

def classify(e, l):
    er, lr = rows_of(e), rows_of(l)
    if er is None or lr is None:
        return 'SHAPE', ''
    if len(er) != len(lr):
        return 'COUNT', f'engine {len(er)} rows, lite {len(lr)}'
    if Counter(key(r, False) for r in er) == Counter(key(r, False) for r in lr):
        return 'EQUAL', ''
    ce, cl = Counter(key(r, True) for r in er), Counter(key(r, True) for r in lr)
    if ce == cl:
        return 'SPELLING', ''
    only_e = list((ce - cl).elements())[:2]
    only_l = list((cl - ce).elements())[:2]
    return 'VALUES', f'engine has {only_e}; lite has {only_l}'

def main():
    args = sys.argv[1:]
    report = None
    if '--report' in args:
        i = args.index('--report'); report = args[i + 1]; del args[i:i + 2]
    eng, lite = load(args[0]), load(args[1])
    lines = []
    tally = Counter()
    for t in sorted(set(eng) | set(lite)):
        if t not in eng:
            cls, why = 'LITE-ONLY', ''
        elif t not in lite:
            cls, why = 'ENGINE-ONLY', ''
        else:
            cls, why = classify(eng[t], lite[t])
        tally[cls] += 1
        lines.append(f'{cls}\t{t}\t{why}')
    for cls in ('EQUAL', 'SPELLING', 'COUNT', 'VALUES', 'SHAPE', 'ENGINE-ONLY', 'LITE-ONLY'):
        print(f'{tally[cls]:6d}  {cls}')
    if report:
        with open(report, 'w') as h:
            h.write('class\ttest\tdetail\n' + '\n'.join(lines) + '\n')
        print('report:', report)
    else:
        for ln in lines:
            if not ln.startswith('EQUAL'):
                print(ln)

if __name__ == '__main__':
    main()
