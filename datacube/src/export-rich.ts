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
import type { ExportTable } from './export-model.ts';
import type { Scalar } from './result.ts';
import { isNumeric } from './types.ts';

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

/** The grid as a standalone HTML document. */
export function toHtml(table: ExportTable, options: RichExportOptions = {}): string {
  const fmt = (v: Scalar, name: string, type: string | undefined): string =>
    options.formatters ? options.formatters.format(v, options.formats?.[name], type)
      : v === null ? '' : String(v);

  const head = table.headerRows.length > 0
    ? table.headerRows.map((row) => `<tr>${row.map((cell) => {
      const span = (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '')
        + (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
      return `<th scope="col"${span}>${escapeXml(cell.label)}</th>`;
    }).join('')}</tr>`).join('\n')
    : `<tr>${table.columns.map((c) => `<th scope="col">${escapeXml(c.path.join(' '))}</th>`).join('')}</tr>`;

  const body = table.rows.map((row) => {
    const cls = row.kind === 'total' ? ' class="total"' : row.kind === 'group' ? ' class="group"' : '';
    const cells = table.columns.map((c, i) => {
      const v = row.cells[i] ?? null;
      const text = c.redacted ? String(v) : fmt(v, c.name, c.type);
      const classes = [
        v !== null && !c.redacted && !c.tree && isNumeric(c.type) ? 'n' : '',
        c.redacted ? 'r' : '',
      ].filter(Boolean).join(' ');
      const style = c.tree && row.depth > 1 ? ` style="padding-left:${8 + (row.depth - 1) * 16}px"` : '';
      return `<td${classes ? ` class="${classes}"` : ''}${style}>${escapeXml(text)}</td>`;
    }).join('');
    return `<tr${cls}>${cells}</tr>`;
  });

  const notes = table.notes.map((n) => `<p class="note">${escapeXml(n)}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeXml(table.title)}</title>
<style>
  body { font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; margin: 24px; }
  table { border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
  th { background: #f4f4f4; font-weight: 600; text-align: center; }
  td.n { text-align: right; }
  td.r { color: #888; font-style: italic; }
  tr.total td, tr.group td:first-child { font-weight: 600; }
  tr.total td { background: #fafafa; }
  p.note { color: #555; margin: 4px 0; }
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
