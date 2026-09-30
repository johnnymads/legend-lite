// Excel export: a real OOXML workbook (.xlsx), from the export model (export-model.ts).
//
// The file this replaces was SpreadsheetML 2003 named .xls: desktop Excel warns that its format
// and extension disagree, Excel Online and Google Sheets refuse it, and a title with an `&`
// near its 31st character produced an XML parse error (the 2026-09-29 audit). An .xlsx is a zip
// of a few XML parts; `fflate`, already the page's dependency, writes the zip.
//
// What a workbook carries that the other formats cannot:
// - numbers as numbers, dates and times as dates (serial days), booleans as booleans, so the
//   sheet can compute on them; a number Excel cannot hold exactly (a BIGINT past 2^53, a
//   decimal of more than 15 significant digits) goes in as text rather than silently changing;
// - each column's own format as an Excel format code (currency, fixed places, commas,
//   negatives in parentheses, k/m/b scales, a unit), so it reads as the grid does;
// - the grid's header rows, merged where the grid spans them, and frozen;
// - the tree as Excel's outline levels (groups collapse in Excel), totals in bold;
// - an "About" sheet with the title, the moment and the notes (truncation, redaction).

import { strToU8, zipSync } from 'fflate';

import type { ColumnFormat } from './format.ts';
import type { ExportColumn, ExportTable } from './export-model.ts';
import type { Scalar } from './result.ts';
import { isNumeric, isTemporal, isTimeOfDay } from './types.ts';

export interface XlsxOptions {
  readonly formats?: Readonly<Record<string, ColumnFormat>>;
  /** When the file was made, for the About sheet. */
  readonly at?: Date;
}

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // characters XML 1.0 cannot carry at all
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');

/** Column letters: 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetters(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A sheet name Excel accepts: no `[]:*?/\`, not blank, at most 31 characters (cut BEFORE escaping). */
export function sheetName(title: string): string {
  const clean = [...title.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, 31).join('').trim();
  return clean.replace(/^'+|'+$/g, '') || 'Sheet1';
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', CHF: 'CHF ' };
const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** An Excel number format code for a column's format, or null for Excel's General. */
export function formatCode(format: ColumnFormat | undefined, type: string | undefined): string | null {
  if (!format || !isNumeric(type)) return null;
  const min = format.decimals ?? format.minimumFractionDigits ?? 0;
  const max = Math.max(min, format.decimals ?? format.maximumFractionDigits ?? min);
  const fraction = max > 0 ? `.${'0'.repeat(min)}${'#'.repeat(max - min)}` : '';
  let body = `${format.displayCommas === false ? '0' : '#,##0'}${fraction}`;
  const scale = format.numberScale;
  if (scale === 'thousands') body += ',"k"';
  else if (scale === 'millions') body += ',,"m"';
  else if (scale === 'billions') body += ',,,"b"';
  else if (scale === 'trillions') body += ',,,,"t"';
  if (format.kind === 'percent') body += '%';
  if (format.kind === 'currency' && format.currency) {
    body = `${quote(CURRENCY_SYMBOLS[format.currency] ?? `${format.currency} `)}${body}`;
  }
  if (format.unit) {
    body = format.unit.startsWith('_') ? `${quote(format.unit.slice(1))}${body}` : `${body}${quote(format.unit)}`;
  }
  return format.negativeParens ? `${body};(${body})` : body;
}

/** Excel's serial day for a calendar date and time as written (no zone moved): day 0 is 1899-12-30. */
function serial(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, frac = 0): number {
  const days = (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return days + (h * 3600 + mi * 60 + s + frac) / 86_400;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?/;
const TIME = /^(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/;

/** Whether a number's text is one Excel's double holds exactly (15 significant digits). */
function exactInExcel(text: string): boolean {
  const digits = text.replace(/^[+-]/, '').replace(/e.*$/i, '').replace('.', '').replace(/^0+/, '');
  return digits.replace(/0+$/, '').length <= 15;
}

/** Styles, registered as cells need them: a number format, bold, an indent, a header fill. */
class Styles {
  readonly #fmts = new Map<string, number>();
  readonly #xfs = new Map<string, number>();
  readonly #xfList: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];

  /** A number format's id: 0 for General, else a custom format (ids from 164, Excel's first free one). */
  fmt(code: string | null): number {
    if (code === null) return 0;
    let id = this.#fmts.get(code);
    if (id === undefined) {
      id = 164 + this.#fmts.size;
      this.#fmts.set(code, id);
    }
    return id;
  }
  xf(numFmtId: number, bold: boolean, indent: number, header = false): number {
    const key = `${numFmtId}|${bold}|${indent}|${header}`;
    let id = this.#xfs.get(key);
    if (id === undefined) {
      id = this.#xfList.length;
      this.#xfs.set(key, id);
      const align = indent > 0 ? `<alignment indent="${indent}"/>` : header ? '<alignment horizontal="center"/>' : '';
      this.#xfList.push(`<xf numFmtId="${numFmtId}" fontId="${bold ? 1 : 0}" fillId="${header ? 2 : 0}" borderId="0" xfId="0"`
        + `${numFmtId ? ' applyNumberFormat="1"' : ''}${bold ? ' applyFont="1"' : ''}${header ? ' applyFill="1"' : ''}`
        + `${align ? ` applyAlignment="1">${align}</xf>` : '/>'}`);
    }
    return id;
  }
  xml(): string {
    const fmts = [...this.#fmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (fmts ? `<numFmts count="${this.#fmts.size}">${fmts}</numFmts>` : '')
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F4F4"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.#xfList.length}">${this.#xfList.join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

/** One cell's XML; `style` is its xf id. */
function cellXml(ref: string, v: Scalar, column: ExportColumn, style: number, dateStyle: () => number,
  dateTimeStyle: () => number, timeStyle: () => number, bold: boolean, indent: number, styles: Styles): string {
  const s = (id: number): string => (id ? ` s="${id}"` : '');
  const text = (t: string, id = style): string => `<c r="${ref}"${s(id)} t="inlineStr"><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
  if (v === null) return style ? `<c r="${ref}"${s(style)}/>` : '';
  if (column.redacted || column.tree) return text(String(v));
  if (typeof v === 'boolean') return `<c r="${ref}"${s(style)} t="b"><v>${v ? 1 : 0}</v></c>`;
  const type = column.type;
  if (isNumeric(type)) {
    const t = String(v);
    const n = Number(t);
    if (!Number.isFinite(n) || !exactInExcel(t)) return text(t, styles.xf(0, bold, indent));
    return `<c r="${ref}"${s(style)}><v>${t}</v></c>`;
  }
  if (isTemporal(type) && typeof v === 'string') {
    if (isTimeOfDay(type)) {
      const m = TIME.exec(v);
      if (m) {
        const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0);
        return `<c r="${ref}" s="${timeStyle()}"><v>${secs / 86_400}</v></c>`;
      }
    } else {
      const m = DATE.exec(v);
      if (m) {
        const hasTime = m[4] !== undefined;
        const n = serial(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0),
          Number(m[6] ?? 0), Number(m[7] ?? 0));
        return `<c r="${ref}" s="${hasTime ? dateTimeStyle() : dateStyle()}"><v>${n}</v></c>`;
      }
    }
  }
  return text(String(v));
}

/** The grid as an .xlsx file. */
export function toXlsx(table: ExportTable, options: XlsxOptions = {}): Uint8Array {
  const styles = new Styles();
  const headerStyle = styles.xf(0, true, 0, true);
  const dateStyle = (): number => styles.xf(styles.fmt('yyyy-mm-dd'), false, 0);
  const dateTimeStyle = (): number => styles.xf(styles.fmt('yyyy-mm-dd hh:mm:ss'), false, 0);
  const timeStyle = (): number => styles.xf(styles.fmt('hh:mm:ss'), false, 0);
  const codes = table.columns.map((c) => (c.redacted || c.tree ? null : formatCode(options.formats?.[c.name], c.type)));

  const rows: string[] = [];
  const merges: string[] = [];
  const headerRows = table.headerRows.length > 0 ? table.headerRows : [table.columns.map((c, i) => ({
    label: c.path.join(' '), colStart: i, colSpan: 1, rowSpan: 1,
  }))];
  headerRows.forEach((row, r) => {
    const cells = row.map((cell) => {
      const ref = `${columnLetters(cell.colStart)}${r + 1}`;
      if (cell.colSpan > 1 || cell.rowSpan > 1) {
        merges.push(`${ref}:${columnLetters(cell.colStart + cell.colSpan - 1)}${r + cell.rowSpan}`);
      }
      return `<c r="${ref}" s="${headerStyle}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.label)}</t></is></c>`;
    });
    rows.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  const top = headerRows.length;
  table.rows.forEach((row, r) => {
    const at = top + r + 1;
    const bold = row.kind === 'total';
    const cells = table.columns.map((c, i) => {
      const indent = c.tree ? Math.max(0, row.depth - 1) : 0;
      const style = styles.xf(styles.fmt(codes[i] ?? null), bold || (c.tree && row.kind === 'group'), indent);
      return cellXml(`${columnLetters(i)}${at}`, row.cells[i] ?? null, c, style, dateStyle, dateTimeStyle, timeStyle,
        bold, indent, styles);
    }).join('');
    const outline = row.depth > 1 ? ` outlineLevel="${Math.min(7, row.depth - 1)}"` : '';
    rows.push(`<row r="${at}"${outline}>${cells}</row>`);
  });

  const widths = table.columns.map((c, i) => {
    let w = c.path.join(' ').length;
    for (const row of table.rows.slice(0, 200)) w = Math.max(w, String(row.cells[i] ?? '').length + (c.tree ? row.depth * 2 : 0));
    return Math.min(60, Math.max(8, w + 2));
  });
  const last = `${columnLetters(Math.max(0, table.columns.length - 1))}${top + table.rows.length}`;
  const freeze = table.grouped ? `xSplit="1" ySplit="${top}" topLeftCell="B${top + 1}"` : `ySplit="${top}" topLeftCell="A${top + 1}"`;
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetPr><outlinePr summaryBelow="0"/></sheetPr>'
    + `<dimension ref="A1:${last}"/>`
    + `<sheetViews><sheetView workbookViewId="0"><pane ${freeze} activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${rows.join('')}</sheetData>`
    + (merges.length > 0 ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '</worksheet>';

  const at = options.at ?? new Date();
  const about = [['Title', table.title], ['Exported', at.toISOString()], ['Rows', String(table.rows.length)],
    ...table.notes.map((n) => ['Note', n])];
  const aboutSheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="100" customWidth="1"/></cols><sheetData>'
    + about.map(([k, v], r) => `<row r="${r + 1}"><c r="A${r + 1}" s="${headerStyle}" t="inlineStr"><is><t>${esc(k ?? '')}</t></is></c>`
      + `<c r="B${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v ?? '')}</t></is></c></row>`).join('')
    + '</sheetData></worksheet>';

  const name = sheetName(table.title);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/><sheet name="${name === 'About' ? 'About this export' : 'About'}" sheetId="2" r:id="rId2"/></sheets>`
      + '</workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
    'xl/worksheets/sheet2.xml': strToU8(aboutSheet),
    // written last: cells registered their styles while the sheets were built
    'xl/styles.xml': strToU8(styles.xml()),
  };
  return zipSync(files, { level: 6, mtime: at });
}

/** The .xlsx MIME type. */
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
