// Value editors, by the type of what they compare with (census §5.4): text, numbers, a boolean
// toggle, an enumeration's values, dates with the relative choices (today, now, N days ago,
// first day of this month...), lists (Enter or comma adds, pasted CSV splits), or a parameter.

import { assignable, isNumericFamily, primitiveFamily, simpleName, standardPrimitive, type ModelGraph } from '../model/graph.ts';
import type { DateFunction, QueryVariable, Value } from '../builder/state.ts';
import { h, mount, showMenu, type Child } from './dom.ts';

/** A value's short text, as a chip shows it. */
export function valueLabel(v: Value | undefined): string {
  if (v === undefined) return '(no value)';
  switch (v.kind) {
    case 'string': return `'${v.value}'`;
    case 'boolean': return String(v.value);
    case 'integer': case 'float': case 'decimal': return v.value;
    case 'strictDate': return v.value;
    case 'dateTime': return v.value.replace('T', ' ');
    case 'enum': return v.value;
    case 'dateFunction': return dateFunctionLabel(v.function);
    case 'list': return v.values.map(valueLabel).join(', ');
    case 'variable': return `$${v.name}`;
  }
}

export function dateFunctionLabel(d: DateFunction): string {
  switch (d.kind) {
    case 'today': return 'Today';
    case 'now': return 'Now';
    case 'firstDayOfThis': return `First day of this ${d.unit.toLowerCase()}`;
    case 'adjust': {
      const n = Math.abs(d.amount);
      const unit = d.unit.toLowerCase().replace(/s$/, '');
      return d.amount === 0 ? (d.from === 'today' ? 'Today' : 'Now') : `${n} ${unit}${n === 1 ? '' : 's'} ${d.amount < 0 ? 'ago' : 'from now'}`;
    }
  }
}

/** A default value for a type: what a new condition or parameter starts with. */
export function defaultValue(graph: ModelGraph, type: string, many: boolean): Value {
  if (many) return { kind: 'list', values: [] };
  const e = graph.enumerations.get(type);
  if (e) return { kind: 'enum', enumeration: type, value: e.values[0]?.value ?? '' };
  switch (standardPrimitive(type)) {
    case 'Boolean': return { kind: 'boolean', value: true };
    case 'Integer': return { kind: 'integer', value: '0' };
    case 'Float': case 'Number': return { kind: 'float', value: '0' };
    case 'Decimal': return { kind: 'decimal', value: '0' };
    case 'StrictDate': case 'Date': return { kind: 'dateFunction', function: { kind: 'today' } };
    case 'DateTime': return { kind: 'dateFunction', function: { kind: 'now' } };
    default: return { kind: 'string', value: '' };
  }
}

/** A single typed literal from text, or undefined when the text is not one. */
export function literalFromText(graph: ModelGraph, type: string, text: string): Value | undefined {
  const t = text.trim();
  const e = graph.enumerations.get(type);
  if (e) return e.values.some((v) => v.value === t) ? { kind: 'enum', enumeration: type, value: t } : undefined;
  switch (standardPrimitive(type)) {
    case 'Boolean': return t === 'true' || t === 'false' ? { kind: 'boolean', value: t === 'true' } : undefined;
    case 'Integer': return /^-?\d+$/.test(t) ? { kind: 'integer', value: t } : undefined;
    case 'Float': case 'Number': return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t) ? { kind: 'float', value: t } : undefined;
    case 'Decimal': return /^-?\d+(\.\d+)?$/.test(t) ? { kind: 'decimal', value: t } : undefined;
    case 'StrictDate': case 'Date': return /^\d{4}-\d{2}-\d{2}$/.test(t) ? { kind: 'strictDate', value: t } : undefined;
    case 'DateTime': return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t) ? { kind: 'dateTime', value: t.length === 16 ? `${t}:00` : t } : undefined;
    default: return { kind: 'string', value: text };
  }
}

export interface ValueEditorOptions {
  readonly graph: ModelGraph;
  /** The type the value must have: a primitive's name or an enumeration's path. */
  readonly type: string;
  readonly many: boolean;
  readonly value: Value | undefined;
  /** Parameters and constants; those whose type fits are offered as values. */
  readonly variables: readonly QueryVariable[];
  readonly onChange: (v: Value) => void;
  /** Values that start with what was typed (a string property's typeahead); none when absent. */
  readonly suggest?: (prefix: string) => Promise<string[]>;
  /** Whether relative dates (today(), adjust(...)) are offered; not where Pure's grammar takes only a value (a class's milestoning date). */
  readonly relativeDates?: boolean;
}

let listIds = 0;

/** Suggestions under an input as it is typed: at least 2 characters, 300 ms after the last key. */
function withTypeahead(input: HTMLInputElement, suggest: ((prefix: string) => Promise<string[]>) | undefined): Child {
  if (!suggest) return null;
  const id = `q-suggest-${++listIds}`;
  const list = h('datalist', { id });
  input.setAttribute('list', id);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const prefix = input.value;
    if (prefix.length < 2) return;
    timer = setTimeout(() => {
      abort?.abort();
      abort = new AbortController();
      suggest(prefix).then((values) => {
        mount(list, values.map((v) => h('option', { value: v })));
      }, () => undefined);
    }, 300);
  });
  return list;
}

/** An editor for one value (or a list): the control, and a menu of parameters and relative dates. */
export function valueEditor(o: ValueEditorOptions): HTMLElement {
  const wrap = h('span', { style: 'display:inline-flex; gap:4px; align-items:center; flex-wrap:wrap' });
  const draw = (): void => { mount(wrap, editorParts(o)); };
  draw();
  return wrap;
}

function editorParts(o: ValueEditorOptions): Child[] {
  const v = o.value;
  const fitting = o.variables.filter((p) => p.type === undefined || p.type === o.type || assignable(p.type, o.type));
  const family = o.graph.enumerations.has(o.type) ? 'enum' : primitiveFamily(o.type);
  const extras = (): void => {
    const b = extrasButton.getBoundingClientRect();
    const items = [
      ...fitting.map((p) => ({ label: `Use ${p.kind} $${p.name}`, action: () => o.onChange({ kind: 'variable', name: p.name }) })),
      ...(family === 'date' && !o.many && o.relativeDates !== false ? DATE_CHOICES.map((d) => ({ label: dateFunctionLabel(d), action: () => o.onChange({ kind: 'dateFunction', function: d }) })) : []),
      ...(v?.kind === 'variable' || v?.kind === 'dateFunction' ? [{ label: 'Enter a value', action: () => o.onChange(defaultLiteral(o)) }] : []),
    ];
    if (items.length > 0) showMenu(b.left, b.bottom + 4, items);
  };
  const extrasButton = h('button', { class: 'q-icon-btn', title: 'Parameters and relative values', onclick: extras }, '⋯');
  const showExtras = fitting.length > 0 || (family === 'date' && o.relativeDates !== false) || v?.kind === 'variable';

  if (v?.kind === 'variable') return [h('span', { class: 'q-chip accent' }, `$${v.name}`), extrasButton];
  if (v?.kind === 'dateFunction') {
    return [h('span', { class: 'q-chip accent' }, dateFunctionLabel(v.function)), customDate(v.function, o), extrasButton];
  }
  if (o.many) return [listEditor(o), showExtras ? extrasButton : null];
  return [single(o, family), showExtras ? extrasButton : null];
}

const DATE_CHOICES: readonly DateFunction[] = [
  { kind: 'today' }, { kind: 'now' },
  { kind: 'adjust', from: 'today', amount: -1, unit: 'DAYS' },
  { kind: 'adjust', from: 'today', amount: -7, unit: 'DAYS' },
  { kind: 'adjust', from: 'today', amount: -1, unit: 'MONTHS' },
  { kind: 'adjust', from: 'today', amount: -1, unit: 'YEARS' },
  { kind: 'firstDayOfThis', unit: 'Week' }, { kind: 'firstDayOfThis', unit: 'Month' },
  { kind: 'firstDayOfThis', unit: 'Quarter' }, { kind: 'firstDayOfThis', unit: 'Year' },
];

function defaultLiteral(o: ValueEditorOptions): Value {
  return defaultValue(o.graph, o.type, o.many).kind === 'dateFunction'
    ? { kind: standardPrimitive(o.type) === 'DateTime' ? 'dateTime' : 'strictDate', value: standardPrimitive(o.type) === 'DateTime' ? new Date().toISOString().slice(0, 19) : new Date().toISOString().slice(0, 10) }
    : defaultValue(o.graph, o.type, o.many);
}

/** `adjust(today(), -N, DAYS)`: its amount and unit, editable in place. */
function customDate(d: DateFunction, o: ValueEditorOptions): Child {
  if (d.kind !== 'adjust') return null;
  const amount = h('input', {
    class: 'q-input', type: 'number', value: String(Math.abs(d.amount)), style: 'width:60px', 'aria-label': 'Amount',
    onchange: () => o.onChange({ kind: 'dateFunction', function: { ...d, amount: (d.amount > 0 ? 1 : -1) * Math.abs(Number(amount.value) || 0) } }),
  });
  const unit = h('select', {
    class: 'q-select', 'aria-label': 'Unit',
    onchange: () => o.onChange({ kind: 'dateFunction', function: { ...d, unit: unit.value as 'DAYS' } }),
  }, ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'].map((u) => h('option', { value: u, selected: u === d.unit }, u.toLowerCase())));
  return [amount, unit];
}

function single(o: ValueEditorOptions, family: string): Child {
  const v = o.value;
  if (family === 'enum') {
    const e = o.graph.enumerations.get(o.type)!;
    const current = v?.kind === 'enum' ? v.value : undefined;
    const s = h('select', {
      class: 'q-select', 'aria-label': simpleName(o.type),
      onchange: () => o.onChange({ kind: 'enum', enumeration: o.type, value: s.value }),
    }, e.values.map((ev) => h('option', { value: ev.value, selected: ev.value === current }, ev.value)));
    return s;
  }
  if (family === 'boolean') {
    const s = h('select', {
      class: 'q-select', onchange: () => o.onChange({ kind: 'boolean', value: s.value === 'true' }),
    }, h('option', { value: 'true', selected: v?.kind === 'boolean' && v.value }, 'true'),
    h('option', { value: 'false', selected: v?.kind === 'boolean' && !v.value }, 'false'));
    return s;
  }
  const text = v && 'value' in v && typeof v.value !== 'boolean' ? String(v.value) : '';
  const input: HTMLInputElement = h('input', {
    class: 'q-input',
    type: family === 'date' ? (standardPrimitive(o.type) === 'DateTime' ? 'datetime-local' : 'date') : 'text',
    inputmode: isNumericFamily(primitiveFamily(o.type)) ? 'decimal' : undefined,
    value: family === 'date' && text ? text.slice(0, standardPrimitive(o.type) === 'DateTime' ? 19 : 10) : text,
    placeholder: isNumericFamily(primitiveFamily(o.type)) ? '0' : '(empty)',
    style: 'width:150px',
    'aria-label': 'Value',
    onchange: () => {
      const parsed = literalFromText(o.graph, o.type, input.value);
      input.classList.toggle('q-error', parsed === undefined);
      input.title = parsed === undefined ? `Not a ${simpleName(o.type)}` : '';
      if (parsed) o.onChange(parsed);
    },
  });
  return [input, family === 'string' ? withTypeahead(input, o.suggest) : null];
}

/** A list: chips, an input that adds on Enter or comma, and pasted CSV split into values. */
function listEditor(o: ValueEditorOptions): Child {
  const values = o.value?.kind === 'list' ? o.value.values : [];
  const set = (vs: readonly Value[]): void => o.onChange({ kind: 'list', values: vs });
  const add = (texts: readonly string[]): void => {
    const parsed = texts.map((t) => t.trim()).filter((t) => t.length > 0).map((t) => literalFromText(o.graph, o.type, t));
    if (parsed.some((p) => p === undefined)) {
      input.classList.add('q-error');
      input.title = `Every value must be a ${simpleName(o.type)}`;
      return;
    }
    set([...values, ...(parsed as Value[])]);
  };
  const input: HTMLInputElement = h('input', {
    class: 'q-input', placeholder: o.graph.enumerations.has(o.type) ? 'Add a value…' : 'Add values (Enter, comma or paste)', style: 'width:180px',
    list: o.graph.enumerations.has(o.type) ? `enum-${o.type}` : undefined,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add([input.value]); }
      else if (e.key === 'Backspace' && input.value === '' && values.length > 0) set(values.slice(0, -1));
    },
    onpaste: (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (/[,\n\t]/.test(text)) { e.preventDefault(); add(text.split(/[,\n\t]/)); }
    },
  });
  const enumList = o.graph.enumerations.get(o.type);
  const typeahead = !enumList && primitiveFamily(o.type) === 'string' ? withTypeahead(input, o.suggest) : null;
  return [
    typeahead,
    values.map((v, i) => h('span', { class: 'q-chip' }, valueLabel(v),
      h('button', { class: 'q-icon-btn', style: 'padding:0 2px', title: 'Remove', onclick: () => set(values.filter((_, j) => j !== i)) }, '×'))),
    input,
    enumList ? h('datalist', { id: `enum-${o.type}` }, enumList.values.map((ev) => h('option', { value: ev.value }))) : null,
    values.length > 0 ? h('button', { class: 'q-icon-btn', title: 'Copy values', onclick: () => void navigator.clipboard?.writeText(values.map(valueLabel).join(',')) }, '⧉') : null,
  ];
}
