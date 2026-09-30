// HTML and Excel export, from the export model. The workbook is unzipped and every part parsed
// as XML: the file this replaced was not a real workbook and could be malformed (2026-09-29).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strFromU8, unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';

import { escapeXml, toHtml } from '../src/export-rich.ts';
import { exportTable, REDACTED, type ExportTable } from '../src/export-model.ts';
import { columnLetters, formatCode, sheetName, toXlsx } from '../src/export-xlsx.ts';
import { buildColumnModel } from '../src/grid/columns.ts';
import type { ResultTable } from '../src/result.ts';

const rt: ResultTable = {
  columns: [
    { name: 'region', type: 'String', values: ['EMEA', 'A&B <x>'] },
    { name: 'notional', type: 'Float', values: [1234.5, -20] },
    { name: 'qty', type: 'Integer', values: [3, null] },
    { name: 'day', type: 'StrictDate', values: ['2024-02-29', null] },
    { name: 'at', type: 'DateTime', values: ['2024-02-29T13:14:15', null] },
    { name: 'ok', type: 'Boolean', values: [true, false] },
    { name: 'big', type: 'Integer', values: [9007199254740993n, 1n] },
    { name: 'secret', type: 'Float', values: [42, 7] },
  ],
  rowCount: 2,
  epoch: 1,
  elapsedMs: 0,
};
const table = (title = 'Profit and loss by region, Q1 & Q2 [draft]'): ExportTable => exportTable({
  title, rows: rt, model: buildColumnModel(rt, [], ['notional'], { blurred: ['secret'] }),
  treeRows: [], groupLabels: [], truncated: false,
});

const xml = (text: string): Document => {
  const doc = new new JSDOM('').window.DOMParser().parseFromString(text, 'application/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length, 0, `not well-formed:\n${text.slice(0, 300)}`);
  return doc;
};

describe('escapeXml', () => {
  it('escapes everything that can break a document, the ampersand first', () => {
    assert.equal(escapeXml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    assert.equal(escapeXml('&lt;'), '&amp;lt;');
  });
});

describe('HTML', () => {
  it('is a standalone page of the grid as shown, blurred columns redacted and said so', () => {
    const html = toHtml(table());
    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes('A&amp;B &lt;x&gt;'), 'data escaped');
    assert.ok(!html.includes('>42<'), 'the blurred value is not in the page');
    assert.ok(html.includes(REDACTED));
    assert.match(html, /Blurred on screen/);
  });
  it('carries a pivot\'s header levels with their spans', () => {
    const pivoted: ResultTable = {
      columns: [
        { name: 'region', type: 'String', values: ['EMEA'] },
        { name: '2021__|__notional', type: 'Float', values: [1] },
        { name: '2021__|__pnl', type: 'Float', values: [2] },
      ],
      rowCount: 1, epoch: 1, elapsedMs: 0,
    };
    const t = exportTable({ title: 'p', rows: pivoted, model: buildColumnModel(pivoted, [], ['notional', 'pnl'], {}, 1),
      treeRows: [], groupLabels: [], truncated: false });
    assert.match(toHtml(t), /<th scope="col" colspan="2">2021<\/th>/);
  });
});

describe('Excel: a real .xlsx', () => {
  const files = unzipSync(toXlsx(table(), { formats: { notional: { kind: 'currency', currency: 'USD', decimals: 0, negativeParens: true } } }));
  const part = (name: string): string => {
    const f = files[name];
    assert.ok(f, `the workbook has ${name}`);
    return strFromU8(f!);
  };

  it('has the OOXML parts, each well-formed XML', () => {
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
      'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) xml(part(name));
  });
  it('names the sheet as Excel allows: no [ ] : * ? / \\, at most 31 characters, cut before escaping', () => {
    const sheet = xml(part('xl/workbook.xml')).getElementsByTagName('sheet')[0]!.getAttribute('name')!;
    assert.ok(sheet.length <= 31 && !/[[\]:*?/\\]/.test(sheet), sheet);
    assert.equal(sheetName('a'.repeat(28) + ' & b'), `${'a'.repeat(28)} &`);
    assert.equal(sheetName('[]'), 'Sheet1');
  });
  it('types its cells: numbers, a date serial, a boolean, text; an unsafe big integer as text', () => {
    const sheet = part('xl/worksheets/sheet1.xml');
    assert.match(sheet, /<c r="B2"[^>]*><v>1234\.5<\/v><\/c>/, 'a number is a number');
    assert.match(sheet, /<c r="D2" s="\d+"><v>45351<\/v><\/c>/, '2024-02-29 is serial 45351');
    assert.match(sheet, /<c r="E2" s="\d+"><v>45351\.55156/, 'with its time of day');
    assert.match(sheet, /<c r="F2"[^>]* t="b"><v>1<\/v><\/c>/);
    assert.match(sheet, /<c r="G2"[^>]* t="inlineStr"><is><t xml:space="preserve">9007199254740993<\/t>/, 'kept exact, as text');
  });
  it('carries the column\'s format as an Excel format code', () => {
    assert.match(part('xl/styles.xml'), /formatCode="&quot;\$&quot;#,##0;\(&quot;\$&quot;#,##0\)"/);
    assert.equal(formatCode({ kind: 'number', decimals: 2, numberScale: 'millions' }, 'Float'), '#,##0.00,,"m"');
    assert.equal(formatCode({ kind: 'number', displayCommas: false }, 'Integer'), '0');
    assert.equal(formatCode(undefined, 'Float'), null);
  });
  it('redacts a blurred column, and the About sheet says why', () => {
    const sheet = part('xl/worksheets/sheet1.xml');
    assert.ok(!/<v>42<\/v>/.test(sheet));
    assert.ok(sheet.includes(REDACTED));
    assert.match(part('xl/worksheets/sheet2.xml'), /Blurred on screen/);
  });
  it('outlines a tree and freezes the header', () => {
    const t = table();
    const tree: ExportTable = { ...t, grouped: true, columns: [{ ...t.columns[0]!, tree: true }, ...t.columns.slice(1)],
      rows: [{ ...t.rows[0]!, depth: 1, kind: 'group' }, { ...t.rows[1]!, depth: 2, kind: 'row' }] };
    const sheet = strFromU8(unzipSync(toXlsx(tree))['xl/worksheets/sheet1.xml']!);
    assert.match(sheet, /<row r="3" outlineLevel="1">/);
    assert.match(sheet, /state="frozen"/);
  });
  it('names its columns A..Z, AA..', () => {
    assert.deepEqual([0, 25, 26, 701, 702].map(columnLetters), ['A', 'Z', 'AA', 'ZZ', 'AAA']);
  });
});
