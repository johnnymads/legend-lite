// What an export carries: the grid AS SHOWN, once, for every format.
//
// Every exporter used to take `view.rows` -- every column the query returned -- so a hidden
// column was exported, a BLURRED column went out in the clear, the grouping columns the tree
// hides came back, the user's order was lost and headers were internal names (`__tree`,
// `2021__|__total`). A file that says something the screen does not is the one kind of export
// bug nobody catches by looking (2026-09-29 audit, docs/BI_AND_ETL_PLAN_2026_09_29.md §1.1).
//
// So the table is built HERE from the grid's own column model -- the leaves it draws, in its
// order, with its labels and its header rows -- and the view's tree rows, and every format
// renders this and nothing else. Redaction happens here too, once: a blurred column's cells
// become REDACTED before any format sees a value, so no renderer can forget it.

import type { ColumnModel, HeaderCell, LeafColumn } from './grid/columns.ts';
import type { ResultTable, Scalar } from './result.ts';
import type { TreeRow } from './tree.ts';
import { TREE_COLUMN } from './treeview.ts';

/** What a blurred cell becomes in every export: plainly not data, and the same everywhere. */
export const REDACTED = '[REDACTED]';

export interface ExportColumn {
  /** The column's identity (a format is looked up by it). */
  readonly name: string;
  /** The header as the grid shows it, one segment per header level (a pivot's year, then its measure). */
  readonly path: readonly string[];
  /** The compiler's type; a redacted column is text, whatever it was. */
  readonly type: string | undefined;
  /** Blurred on screen: every cell is REDACTED. */
  readonly redacted: boolean;
  /** The tree column: its cells are group labels, indented by the row's depth. */
  readonly tree: boolean;
}

/** What a row is, which a flat file must say in words and a workbook as an outline level. */
export type ExportRowKind = 'row' | 'group' | 'total' | 'detail';

export interface ExportRow {
  readonly cells: readonly Scalar[];
  /** 1-based presentation depth in the tree; 1 for a flat cube. */
  readonly depth: number;
  readonly kind: ExportRowKind;
}

export interface ExportTable {
  readonly title: string;
  readonly columns: readonly ExportColumn[];
  /** The header as the grid draws it: one row per level, spans included (HTML, the workbook). */
  readonly headerRows: readonly (readonly HeaderCell[])[];
  readonly rows: readonly ExportRow[];
  /** Whether the tree column is present (a grouped cube). */
  readonly grouped: boolean;
  /** What a reader must be told about this file, in words: truncation, redaction. */
  readonly notes: readonly string[];
}

export interface ExportSource {
  readonly title: string;
  /** The rows the grid holds (the view's). */
  readonly rows: ResultTable;
  /** The column model the grid DRAWS: visible leaves, in order, with labels and header rows. */
  readonly model: ColumnModel;
  /** Tree metadata, parallel to `rows`; empty for a flat cube. */
  readonly treeRows: readonly TreeRow[];
  /** The row dimensions' labels, for the tree column's header ("region / desk"). */
  readonly groupLabels: readonly string[];
  /** Levels cut at the row limit, when any. */
  readonly truncated: boolean;
  /** The row limit, for the note. */
  readonly maxRows?: number;
}

/** The label the grid shows over one leaf, per header level (from the header cells that cover it). */
function leafPath(model: ColumnModel, at: number, leaf: LeafColumn): string[] {
  const out: string[] = [];
  for (const row of model.headerRows) {
    const cell = row.find((c) => at >= c.colStart && at < c.colStart + c.colSpan);
    if (cell && out[out.length - 1] !== cell.label) out.push(cell.label);
  }
  if (out.length === 0) out.push(leaf.label ?? leaf.name);
  return out;
}

export function exportTable(source: ExportSource): ExportTable {
  const { rows, model, treeRows } = source;
  const index = new Map(rows.columns.map((c, i) => [c.name, i]));
  const grouped = model.leaves.some((l) => l.name === TREE_COLUMN);
  const treeHeader = source.groupLabels.join(' / ') || 'Group';

  const columns: ExportColumn[] = model.leaves.map((leaf, i) => {
    const tree = leaf.name === TREE_COLUMN;
    const redacted = leaf.blurred === true && !tree;
    const path = tree ? [treeHeader] : leafPath(model, i, leaf).filter((s) => s !== '');
    return {
      name: leaf.name,
      path: path.length > 0 ? path : [leaf.label ?? leaf.name],
      type: redacted ? 'String' : leaf.type,
      redacted,
      tree,
    };
  });

  const headerRows = model.headerRows.map((row) => row.map((cell) =>
    (cell.leafIndex !== undefined && model.leaves[cell.leafIndex]?.name === TREE_COLUMN)
      || (cell.colStart === 0 && grouped && cell.label === '')
      ? { ...cell, label: treeHeader }
      : cell));

  const out: ExportRow[] = [];
  for (let r = 0; r < rows.rowCount; r++) {
    const meta = treeRows[r];
    const kind: ExportRowKind = !meta ? 'row'
      : meta.isTotal ? 'total'
        : meta.isDetail ? 'detail'
          : meta.isGroup ? 'group' : 'row';
    const cells = columns.map((c): Scalar => {
      if (c.redacted) return REDACTED;
      const at = index.get(c.name);
      const v = at === undefined ? null : (rows.columns[at]?.values[r] ?? null);
      if (c.tree && kind === 'total' && meta?.level === 0 && (v === null || v === '')) return 'Total';
      return v;
    });
    out.push({ cells, depth: meta?.depth ?? 1, kind });
  }

  const notes: string[] = [];
  const hidden = columns.filter((c) => c.redacted).map((c) => c.path.join(' '));
  if (hidden.length > 0) {
    notes.push(`Blurred on screen, so ${REDACTED} here: ${hidden.join(', ')}.`);
  }
  if (source.truncated) {
    notes.push(source.maxRows !== undefined
      ? `Truncated: showing the first ${source.maxRows.toLocaleString()} rows of a level, as the grid does.`
      : 'Truncated at the row limit, as the grid is.');
  }
  return { title: source.title, columns, headerRows, rows: out, grouped, notes };
}

/** One header line for a format with a single header row: the levels joined ("2021 notional"). */
export function flatHeader(column: ExportColumn): string {
  return column.path.join(' ');
}
