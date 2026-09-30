// Plain text and PDF, from the export model (export-model.ts): the grid as shown.
//
// PLAIN TEXT is a fixed-width table, not another delimited file. CSV covers "a machine reads
// it next"; plain text is for pasting a result into a message or a ticket, where what matters
// is that the columns line up in a monospaced font. It pads to the widest cell, right-aligns
// numbers, indents the tree by depth and draws one rule under the header.
//
// PDF is written by hand, and it is BYTES. A PDF's `/Length` and its xref table are byte
// counts into the file; the first version measured JavaScript characters and wrote UTF-8, so
// any é or £ made every offset after it wrong and a strict reader refused the file (the
// 2026-09-29 audit). The text is encoded as WinAnsi (Windows-1252), the encoding the base-14
// fonts carry, so € — … and every Latin-1 letter draw as themselves; a character outside it
// cannot be drawn by a base-14 font at all, and is named in a note on the page rather than
// silently becoming "?". (Embedding a Unicode font is the plan's next step for this format.)
//
// Layout: A4, portrait when the table fits and landscape when it does not; the font scales
// down to a floor, and past it the columns continue on further pages with the first column
// repeated, so nothing overlaps. The header repeats on every page; the title and the notes
// head the first.

import type { ColumnFormat, FormatterCache } from './format.ts';
import { flatHeader, type ExportTable } from './export-model.ts';
import type { Scalar } from './result.ts';
import { isNumeric } from './types.ts';

export interface DocExportOptions {
  readonly formatters?: FormatterCache;
  readonly formats?: Readonly<Record<string, ColumnFormat>>;
  /** Cap on a rendered cell before it is truncated. */
  readonly maxCellWidth?: number;
}

interface Cell {
  readonly text: string;
  readonly numeric: boolean;
  readonly bold: boolean;
}

/** The table as text, once, so the PDF and the plain text can never disagree about a cell. */
function grid(table: ExportTable, options: DocExportOptions): { header: Cell[]; rows: Cell[][] } {
  const cap = options.maxCellWidth ?? 60;
  const clip = (s: string): string => (s.length <= cap ? s : `${s.slice(0, Math.max(1, cap - 1))}…`);
  const text = (v: Scalar, name: string, type: string | undefined): string =>
    options.formatters ? options.formatters.format(v, options.formats?.[name], type)
      : v === null ? '' : String(v);

  const header: Cell[] = table.columns.map((c) => ({ text: clip(flatHeader(c)), numeric: false, bold: true }));
  const rows = table.rows.map((row) => table.columns.map((c, i): Cell => {
    const v = row.cells[i] ?? null;
    const shown = c.redacted ? String(v) : text(v, c.name, c.type);
    // the tree reads as a tree: two spaces a level
    const indented = c.tree ? `${'  '.repeat(Math.max(0, row.depth - 1))}${shown}` : shown;
    return {
      text: clip(indented),
      numeric: !c.redacted && !c.tree && v !== null && isNumeric(c.type),
      bold: row.kind === 'total' || (row.kind === 'group' && c.tree),
    };
  }));
  return { header, rows };
}

function widths(header: Cell[], rows: Cell[][]): number[] {
  const w = header.map((h) => [...h.text].length);
  for (const row of rows) row.forEach((cell, i) => { w[i] = Math.max(w[i] ?? 0, [...cell.text].length); });
  return w;
}

/**
 * A fixed-width text table: numbers right-aligned on their last digit, text left, the tree
 * indented, the title and any notes above it.
 */
export function toPlainText(table: ExportTable, options: DocExportOptions = {}): string {
  const { header, rows } = grid(table, options);
  if (header.length === 0) return '';
  const w = widths(header, rows);
  const pad = (cell: Cell, width: number): string => {
    const fill = ' '.repeat(Math.max(0, width - [...cell.text].length));
    return cell.numeric ? fill + cell.text : cell.text + fill;
  };
  const line = (cells: Cell[]): string =>
    cells.map((cell, i) => pad(cell, w[i] ?? 0)).join('  ')
      // trailing spaces survive a paste and look like corruption
      .replace(/\s+$/, '');
  const out: string[] = [];
  if (table.title) out.push(table.title, '');
  for (const note of table.notes) out.push(note);
  if (table.notes.length > 0) out.push('');
  out.push(line(header));
  out.push(w.map((n) => '-'.repeat(n)).join('  '));
  for (const row of rows) out.push(line(row));
  return `${out.join('\n')}\n`;
}

// -- PDF ---------------------------------------------------------------------------------

/** Points: A4. */
const A4_SHORT = 595;
const A4_LONG = 842;
const MARGIN = 36;
const FONT_MAX = 9;
const FONT_MIN = 6;
const TITLE_SIZE = 14;
const GAP = 8;

/** Windows-1252's 0x80-0x9F: the characters WinAnsi places where Latin-1 has controls. */
const CP1252_HIGH: Readonly<Record<string, number>> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

/** The WinAnsi byte for a character, or undefined when a base-14 font has no glyph for it. */
export function winAnsiByte(ch: string): number | undefined {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return CP1252_HIGH[ch];
}

/** A PDF literal string's body, as bytes: escaped, WinAnsi-encoded; `missing` collects what cannot be drawn. */
function pdfString(s: string, missing: Set<string>): number[] {
  const out: number[] = [];
  for (const ch of s.replace(/[\r\n\t]/g, ' ')) {
    if (ch === '\\' || ch === '(' || ch === ')') {
      out.push(0x5c, ch.charCodeAt(0));
      continue;
    }
    const b = winAnsiByte(ch);
    if (b === undefined) {
      missing.add(ch);
      out.push(0x3f); // '?', and the note says which characters
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Helvetica's average advance at size 1: enough to place table columns without overlap. */
function textWidth(chars: number, size: number): number {
  return chars * size * 0.55;
}

/** A content stream built as bytes. */
class Stream {
  readonly #bytes: number[] = [];
  text(s: string): void {
    for (let i = 0; i < s.length; i++) this.#bytes.push(s.charCodeAt(i) & 0xff);
  }
  string(s: string, missing: Set<string>): void {
    this.#bytes.push(0x28, ...pdfString(s, missing), 0x29);
  }
  get bytes(): number[] {
    return this.#bytes;
  }
}

/**
 * The grid as a PDF file, as bytes.
 *
 * Columns that fit the page at the font floor share a page; past it they continue on the next
 * page set, the first column repeated so every page is readable on its own.
 */
export function toPdf(table: ExportTable, options: DocExportOptions = {}): Uint8Array {
  const { header, rows } = grid(table, options);
  const w = widths(header, rows);
  const need = (cols: number[], size: number): number =>
    cols.reduce((sum, i) => sum + textWidth(w[i] ?? 0, size), 0) + GAP * Math.max(0, cols.length - 1);
  const all = w.map((_, i) => i);

  // Portrait if it fits at full size; else landscape, scaled to fit down to the floor.
  const portraitRoom = A4_SHORT - MARGIN * 2;
  const landscape = need(all, FONT_MAX) > portraitRoom;
  const pageWidth = landscape ? A4_LONG : A4_SHORT;
  const pageHeight = landscape ? A4_SHORT : A4_LONG;
  const room = pageWidth - MARGIN * 2;
  const natural = need(all, FONT_MAX);
  const size = Math.max(FONT_MIN, Math.min(FONT_MAX, natural > room ? FONT_MAX * room / natural : FONT_MAX));

  // Column groups that fit at `size`; the first column repeats on every group after the first.
  const groups: number[][] = [];
  let current: number[] = [];
  for (const i of all) {
    const trial = [...current, i];
    if (current.length > 0 && need(trial, size) > room) {
      groups.push(current);
      current = all.length > 1 ? [0, i] : [i];
    } else {
      current = trial;
    }
  }
  if (current.length > 0) groups.push(current);

  const lineHeight = size * 1.45;
  const missing = new Set<string>();
  const pages: number[][] = [];
  const notes = [...table.notes];
  for (let g = 0; g < groups.length; g++) {
    const cols = groups[g]!;
    const xs: number[] = [];
    let x = MARGIN;
    for (const i of cols) {
      xs.push(x);
      x += textWidth(w[i] ?? 0, size) + GAP;
    }
    const firstPageTop = pageHeight - MARGIN - (g === 0 && table.title ? TITLE_SIZE * 1.6 : 0)
      - (g === 0 ? notes.length * lineHeight : 0);
    const perFirst = Math.max(1, Math.floor((firstPageTop - MARGIN - lineHeight * 2) / lineHeight));
    const perPage = Math.max(1, Math.floor((pageHeight - MARGIN * 2 - lineHeight * 2) / lineHeight));
    let start = 0;
    let firstOfGroup = true;
    do {
      const take = g === 0 && firstOfGroup ? perFirst : perPage;
      const s = new Stream();
      let y = pageHeight - MARGIN;
      if (g === 0 && firstOfGroup) {
        if (table.title) {
          s.text(`BT /F2 ${TITLE_SIZE} Tf 1 0 0 1 ${MARGIN} ${(y - TITLE_SIZE).toFixed(2)} Tm `);
          s.string(table.title, missing);
          s.text(' Tj ET\n');
          y -= TITLE_SIZE * 1.6;
        }
        for (const note of notes) {
          s.text(`BT /F1 ${size.toFixed(2)} Tf 1 0 0 1 ${MARGIN} ${(y - size).toFixed(2)} Tm `);
          s.string(note, missing);
          s.text(' Tj ET\n');
          y -= lineHeight;
        }
      }
      const put = (cell: Cell, col: number, at: number): void => {
        const width = textWidth(w[cols[col]!] ?? 0, size);
        const offset = cell.numeric ? Math.max(0, width - textWidth([...cell.text].length, size)) : 0;
        s.text(`BT /${cell.bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf 1 0 0 1 ${(xs[col]! + offset).toFixed(2)} ${at.toFixed(2)} Tm `);
        s.string(cell.text, missing);
        s.text(' Tj ET\n');
      };
      y -= size;
      cols.forEach((i, col) => put(header[i]!, col, y));
      s.text(`0.5 w ${MARGIN} ${(y - 4).toFixed(2)} m ${(pageWidth - MARGIN).toFixed(2)} ${(y - 4).toFixed(2)} l S\n`);
      y -= lineHeight + 2;
      for (const row of rows.slice(start, start + take)) {
        cols.forEach((i, col) => put(row[i]!, col, y));
        y -= lineHeight;
      }
      pages.push(s.bytes);
      start += take;
      firstOfGroup = false;
    } while (start < rows.length);
  }
  if (missing.size > 0) {
    // said on the page, not swallowed: which characters this font could not draw
    const s = new Stream();
    s.text(`BT /F1 ${size.toFixed(2)} Tf 1 0 0 1 ${MARGIN} ${(pageHeight - MARGIN - size).toFixed(2)} Tm `);
    s.string(`Some characters cannot be drawn in this PDF's font and show as "?": ${[...missing].join(' ')}`
      .replace(/[^\x20-\x7e]/g, (ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`), new Set());
    s.text(' Tj ET\n');
    pages.push(s.bytes);
  }
  return assemble(pages, pageWidth, pageHeight);
}

/** Wrap content streams into a PDF file, measuring bytes as it goes: the xref is byte offsets. */
function assemble(pages: readonly number[][], width: number, height: number): Uint8Array {
  const streams = pages.length > 0 ? pages : [[]];
  const kids = streams.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  const out: number[] = [];
  const ascii = (s: string): void => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); };
  const offsets: number[] = [];
  const object = (body: () => void): void => {
    offsets.push(out.length);
    ascii(`${offsets.length} 0 obj\n`);
    body();
    ascii('\nendobj\n');
  };
  // a binary comment line: tells transfer tools this file is not 7-bit text
  ascii('%PDF-1.4\n%');
  out.push(0xe2, 0xe3, 0xcf, 0xd3);
  ascii('\n');
  object(() => ascii('<< /Type /Catalog /Pages 2 0 R >>'));
  object(() => ascii(`<< /Type /Pages /Count ${streams.length} /Kids [${kids}] >>`));
  object(() => ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  object(() => ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  streams.forEach((content, i) => {
    object(() => ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]`
      + ` /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`));
    object(() => {
      ascii(`<< /Length ${content.length} >>\nstream\n`);
      for (const b of content) out.push(b);
      ascii('\nendstream');
    });
  });
  const xref = out.length;
  ascii(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) ascii(`${String(off).padStart(10, '0')} 00000 n \n`);
  ascii(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Uint8Array.from(out);
}
