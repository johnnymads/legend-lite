// The fields of a JSON column, for the Add Column screen.
//
// Reads the column through the cube's own query path -- a sample of its
// first rows, or on request EVERY row in one streamed pass (each chunk
// observed and let go) -- infers the shape of its documents
// (`json-shape.ts`), and lists every field with
// what can be made of it -- the value itself; a nested object or array
// as a JSON column of its own; for an array its count, its values as
// text, whether it contains a value; for an array of objects each
// field's values, first value and total. Picking one hands the column
// editor a name, a kind and the Pure, which it compiles like anything
// typed there: this writes Pure for you, it is not a second language.

import {
  fieldsOf,
  ShapeReader,
  type Extraction,
  type Field,
  type Sample,
} from '../json-shape.ts';

/** A JSON column's cells, read through the cube's own queries (so every plane). */
export interface JsonColumnReader {
  /** The first rows' cells, and how many rows the column has. */
  sample(signal?: AbortSignal): Promise<{ readonly cells: readonly unknown[]; readonly total: number }>;
  /**
   * Every row, in one streamed pass: each chunk's cells as they arrive. Resolves after the
   * last chunk; rejects when `signal` aborts.
   */
  all(onChunk: (cells: readonly unknown[]) => void, signal?: AbortSignal): Promise<void>;
}

export interface JsonFieldsOptions {
  readonly column: string;
  /** How the column's cells are read. */
  readonly reader: JsonColumnReader;
  /** A field's extraction was chosen. */
  readonly onPick: (extraction: Extraction) => void;
}

/** A free name: `base`, else `base_2`, `base_3`... */
export function freeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
  }
}

export function buildJsonFields(host: HTMLElement, options: JsonFieldsOptions): void {
  const doc = host.ownerDocument;
  host.classList.add('dc-jsonfields');
  const note = doc.createElement('div');
  note.className = 'dc-jsonfields-note';
  note.setAttribute('role', 'status');
  const text = doc.createElement('span');
  text.textContent = `Sampling ${options.column}…`;
  // Read every row: the shape of the whole column, not a sample -- Cancel while reading.
  const whole = doc.createElement('button');
  whole.type = 'button';
  whole.className = 'dc-jsonfields-all';
  whole.hidden = true;
  note.append(text, whole);
  const tree = doc.createElement('div');
  tree.className = 'dc-jsonfields-tree';
  tree.setAttribute('role', 'tree');
  host.append(note, tree);

  const say = (message: string, bad = false): void => {
    text.textContent = message;
    note.classList.toggle('dc-jsonfields-bad', bad);
  };
  const fmt = (n: number): string => n.toLocaleString();

  /** The fields of what was read, and what the reading covers. */
  const show = (sample: Sample, total: number): void => {
    tree.replaceChildren();
    const read = sample.rows - sample.unreadable;
    const unread = sample.unreadable > 0 ? ` (${fmt(sample.unreadable)} not JSON)` : '';
    whole.hidden = sample.complete;
    whole.textContent = 'Read every row';
    if (read === 0 || sample.shape.present === sample.shape.nulls) {
      say(`No JSON values in the ${fmt(sample.rows)} ${sample.complete ? '' : 'sampled '}rows.`, true);
      return;
    }
    say(sample.complete
      ? `All ${fmt(sample.rows)} rows read${unread}: every field, type and share below covers the whole `
        + 'column. Pick a field; the expression below is compiled as usual.'
      : `${fmt(sample.rows)} of ${fmt(total)} rows sampled${unread}. Pick a field: types and shares are `
        + 'from the sample, and the expression below is compiled as usual.');
    for (const f of fieldsOf(options.column, sample)) tree.append(fieldRow(f));
  };

  let shown: { readonly sample: Sample; readonly total: number } | undefined;
  let reading: AbortController | undefined;

  whole.addEventListener('click', () => {
    if (reading) {
      reading.abort();
      return;
    }
    const total = shown?.total ?? 0;
    const controller = new AbortController();
    reading = controller;
    whole.textContent = 'Cancel';
    const reader = new ShapeReader();
    let rows = 0;
    say(`Reading every row of ${options.column}…`);
    void options.reader.all((cells) => {
      for (const cell of cells) reader.add(cell);
      rows += cells.length;
      say(`Reading every row of ${options.column}… ${fmt(rows)} of ${fmt(total)}`);
    }, controller.signal).then(() => {
      reading = undefined;
      shown = { sample: reader.result(true), total: rows };
      show(shown.sample, shown.total);
    }, (e: unknown) => {
      reading = undefined;
      if (shown) show(shown.sample, shown.total);
      if (controller.signal.aborted) {
        say(`Stopped reading every row; showing the sample. ${text.textContent ?? ''}`);
      } else {
        say(`Could not read every row of ${options.column}: `
          + (e instanceof Error ? e.message : String(e)), true);
      }
    });
  });

  void (async () => {
    try {
      const { cells, total } = await options.reader.sample();
      const reader = new ShapeReader();
      for (const cell of cells) reader.add(cell);
      // a sample holding every row IS the whole column
      shown = { sample: reader.result(cells.length >= total), total };
      show(shown.sample, shown.total);
    } catch (e) {
      say(`Could not sample ${options.column}: `
        + (e instanceof Error ? e.message : String(e)), true);
    }
  })();

  function fieldRow(field: Field): HTMLElement {
    const row = doc.createElement('div');
    row.className = 'dc-jsonfields-field';
    row.setAttribute('role', 'treeitem');

    const head = doc.createElement('div');
    head.className = 'dc-jsonfields-head';
    const name = doc.createElement('span');
    name.className = 'dc-jsonfields-name';
    name.textContent = field.path.length === 0
      ? options.column : field.path[field.path.length - 1]!;
    const what = doc.createElement('span');
    what.className = 'dc-jsonfields-what';
    const pct = Math.round(field.presence * 100);
    what.textContent = field.description + (pct < 100 ? ` · in ${pct}%` : '');
    head.append(name, what);
    row.append(head);

    if (field.extractions.length > 0) {
      const list = doc.createElement('div');
      list.className = 'dc-jsonfields-actions';
      for (const e of field.extractions) list.append(actionButton(e));
      row.append(list);
    }
    if (field.children.length > 0) {
      const kids = doc.createElement('div');
      kids.setAttribute('role', 'group');
      for (const c of field.children) kids.append(fieldRow(c));
      row.append(kids);
    }
    return row;
  }

  function actionButton(e: Extraction): HTMLElement {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'dc-jsonfields-add';
    b.textContent = e.label;
    // The Pure it writes, on hover: nothing hidden about what it does.
    b.title = `${e.name}: ${e.type}`;
    b.addEventListener('click', () => {
      for (const other of tree.querySelectorAll('.dc-jsonfields-picked')) {
        other.classList.remove('dc-jsonfields-picked');
      }
      b.classList.add('dc-jsonfields-picked');
      options.onPick(e);
    });
    return b;
  }
}
