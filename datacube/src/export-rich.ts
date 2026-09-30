// HTML export, from the export model (export-model.ts): the grid as shown.
//
// The header is the grid's own: one row per level, with the spans the grid draws, so a pivot's
// years sit over their measures exactly as on screen. The tree reads as a tree (indented by
// depth, totals in bold); a blurred column is REDACTED; the notes (truncation, redaction) head
// the page. Styles are inline: the file is opened from disk or pasted into an email, where no
// stylesheet follows it.
//
// (Excel is export-xlsx.ts: a real OOXML workbook. The SpreadsheetML-2003 file this module
// used to write was named .xls, which Excel warns about and Excel Online and Google Sheets
// will not open -- 2026-09-29 audit.)

import type { ColumnFormat, FormatterCache } from './format.ts';
import { cased, type ExportStyle, type ExportTable } from './export-model.ts';
import type { Scalar } from './result.ts';
import { fontStack } from './style.ts';

export interface RichExportOptions {
  readonly formatters?: FormatterCache;
  readonly formats?: Readonly<Record<string, ColumnFormat>>;
}

/** Escape text for an XML or HTML text node or attribute. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A CSS declaration list for one cell's look. */
export function cssOf(style: ExportStyle): string {
  const out: string[] = [];
  if (style.color) out.push(`color:${style.color}`);
  if (style.background) out.push(`background:${style.background}`);
  if (style.fontFamily) out.push(`font-family:${fontStack(style.fontFamily)}`);
  if (style.fontSize !== undefined) out.push(`font-size:${style.fontSize}px`);
  if (style.bold) out.push('font-weight:600');
  if (style.italic) out.push('font-style:italic');
  const deco = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean);
  if (deco.length) out.push(`text-decoration:${deco.join(' ')}${style.underline && style.underline !== 'solid' ? ` ${style.underline}` : ''}`);
  if (style.align !== 'left') out.push(`text-align:${style.align}`);
  return out.join(';');
}

/**
 * The grid as a standalone HTML document that LOOKS like the grid: each cell's colours, font,
 * alignment and decoration as the grid resolves them (export-model.ts), its grid lines, its
 * banded and total rows, its header levels with their spans (a plain gray header). Styles are
 * inline: the file is opened from disk or pasted into an email, where no stylesheet follows.
 */
export function toHtml(table: ExportTable, options: RichExportOptions = {}): string {
  const fmt = (v: Scalar, name: string, type: string | undefined): string =>
    options.formatters ? options.formatters.format(v, options.formats?.[name], type)
      : v === null ? '' : String(v);
  const look = table.look;
  const line = `1px solid ${look.lineColor}`;

  const head = table.headerRows.length > 0
    ? table.headerRows.map((row) => `<tr>${row.map((cell) => {
      const span = (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '')
        + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
      return `<th scope="col"${span}>${escapeXml(cell.label)}</th>`;
    }).join('')}</tr>`).join('\n')
    : `<tr>${table.columns.map((c) => `<th scope="col">${escapeXml(c.path.join(' '))}</th>`).join('')}</tr>`;

  // ONE CLASS PER LOOK: a cube of a few thousand rows has a handful of distinct looks, and
  // writing each inline made a 5,000-row page 6MB instead of 1.3MB (2026-09-30).
  const classes = new Map<string, string>();
  const classOf = (css: string): string => {
    let name = classes.get(css);
    if (name === undefined) {
      name = `s${classes.size}`;
      classes.set(css, name);
    }
    return name;
  };
  const body = table.rows.map((row) => {
    const cells = table.columns.map((c, i) => {
      const v = row.cells[i] ?? null;
      const style = row.styles[i] ?? { align: 'left' as const };
      const text = cased(c.redacted ? String(v) : fmt(v, c.name, c.type), style.fontCase);
      const indent = c.tree && row.depth > 1 ? `;padding-left:${4 + (row.depth - 1) * 16}px` : '';
      const css = (cssOf(style) + indent).replace(/^;/, '');
      return `<td${css ? ` class="${classOf(css)}"` : ''}>${escapeXml(text)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  });
  const looks = [...classes].map(([css, name]) => `  td.${name} { ${css.replace(/</g, '')}; }`).join('\n');

  const notes = table.notes.map((n) => `<p class="note">${escapeXml(n)}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeXml(table.title)}</title>
<style>
  body { font: 13px/1.4 ${fontStack(look.fontFamily)}; margin: 24px; color: ${look.color}; }
  table { border-collapse: collapse; font-family: ${fontStack(look.fontFamily)}; font-size: ${look.fontSize}px;
    font-variant-numeric: tabular-nums; border: 1px solid #e5e5e5; }
  th { background: ${look.headerBackground}; color: ${look.headerColor}; font-weight: 500; text-align: center;
    padding: 2px 6px; border: 1px solid #e5e5e5; }
  td { padding: 1px 6px; white-space: nowrap;${look.verticalLines ? ` border-right: ${line};` : ''}${look.horizontalLines ? ` border-bottom: ${line};` : ''} }
  p.note { color: #555; margin: 4px 0; }
${looks}
</style>
</head>
<body>
<h1>${escapeXml(table.title)}</h1>
${notes}
<table>
<thead>
${head}
</thead>
<tbody>
${body.join('\n')}
</tbody>
</table>
</body>
</html>
`;
}
