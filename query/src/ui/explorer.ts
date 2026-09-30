// The property explorer (census §5.2): the source class's properties as a tree -- lazily opened,
// derived properties and subclass nodes included, unmapped ones hidden (the engine's coverage),
// to-many and derived marked, documentation on hover. Drag a property to the columns or the
// filter, double-click to add it as a column, right-click for more.

import { addColumn, addCondition, PROPERTY_DRAG, usedPaths } from '../app/actions.ts';
import type { Coverage } from '../app/context.ts';
import type { Session } from '../app/session.ts';
import type { PropertyPath } from '../builder/state.ts';
import {
  humanize, isToMany, multiplicityText, primitiveFamily, simpleName, type ModelGraph, type PropertyInfo,
} from '../model/graph.ts';
import { dialog, h, mount, showMenu, tooltip, type Child } from './dom.ts';
import { preview, probeable } from '../app/probe.ts';
import type { AppContext } from '../app/context.ts';
import { cellText } from './format.ts';

export interface ExplorerOptions {
  humanized: boolean;
  showUnmapped: boolean;
}

const ICONS: Readonly<Record<string, string>> = {
  string: 'Aa', boolean: '✓', integer: '#', float: '#', decimal: '#', number: '#', date: '◷', time: '◷', other: '·',
};

function iconOf(p: PropertyInfo): string {
  if (p.kind === 'class') return 'C';
  if (p.kind === 'enumeration') return 'E';
  return ICONS[primitiveFamily(p.type)] ?? '·';
}

export class Explorer {
  readonly element = h('div', { class: 'q-explorer', role: 'tree' });
  readonly #session: Session;
  readonly #graph: ModelGraph;
  readonly options: ExplorerOptions;
  readonly #open = new Set<string>();
  #coverage: Coverage | Error | undefined;
  #search = '';

  readonly #onPreview: (path: PropertyPath) => void;

  constructor(session: Session, options: ExplorerOptions, onPreview: (path: PropertyPath) => void) {
    this.#onPreview = onPreview;
    this.#session = session;
    this.#graph = session.project.graph;
    this.options = options;
  }

  setCoverage(c: Coverage | Error | undefined): void {
    this.#coverage = c;
    this.render();
  }

  setSearch(term: string): void {
    this.#search = term.trim().toLowerCase();
    this.render();
  }

  collapseAll(): void {
    this.#open.clear();
    this.render();
  }

  render(): void {
    const root = this.#session.query.source.class;
    const used = usedPaths(this.#session.query);
    const rows: Child[] = [];
    if (this.#coverage instanceof Error) {
      rows.push(h('div', { class: 'q-error', style: 'padding:6px 10px; font-size:12px' },
        `Mapping coverage is unavailable (${this.#coverage.message}); every property is shown.`));
    }
    if (this.#search) {
      rows.push(...this.#searchResults(root, used));
    } else {
      rows.push(h('div', { class: 'q-node', style: 'padding-left:6px; font-weight:600' },
        h('span', { class: 'ico' }, 'C'), h('span', { class: 'label', title: root }, simpleName(root))));
      rows.push(...this.#children(root, [], 1, used));
    }
    mount(this.element, rows);
  }

  #mapped(owner: string, p: PropertyInfo): boolean {
    if (!this.#coverage || this.#coverage instanceof Error) return true;
    return this.#coverage.isMapped(owner, p.name);
  }

  #children(owner: string, prefix: PropertyPath, depth: number, used: ReadonlySet<string>): Child[] {
    const props = [...this.#graph.properties(owner)].sort((a, b) => {
      const rank = (p: PropertyInfo): number => (p.kind === 'class' ? 2 : p.derived ? 1 : 0);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    const out: Child[] = [];
    for (const p of props) {
      const mapped = this.#mapped(owner, p);
      if (!mapped && !this.options.showUnmapped) continue;
      // an association end back to where we came from is a loop: skip it (upstream prunes the same)
      const path: PropertyPath = [...prefix, stepOf(p)];
      out.push(this.#node(owner, p, path, depth, mapped, used));
      if (p.kind === 'class' && this.#open.has(key(path))) {
        out.push(...this.#children(p.type, path, depth + 1, used));
      }
    }
    for (const sub of this.#graph.subclasses(owner)) {
      out.push(h('div', { class: 'q-node', style: `padding-left:${depth * 14 + 6}px`, title: `Subtype ${sub}` },
        h('span', { class: 'twist' }), h('span', { class: 'ico' }, '@'), h('span', { class: 'label q-muted' }, `@${simpleName(sub)}`)));
    }
    return out;
  }

  #node(owner: string, p: PropertyInfo, path: PropertyPath, depth: number, mapped: boolean, used: ReadonlySet<string>): HTMLElement {
    const k = key(path);
    const isClass = p.kind === 'class';
    const open = this.#open.has(k);
    const label = this.options.humanized ? humanize(p.name) : p.name;
    const node = h('div', {
      class: `q-node${mapped ? '' : ' unmapped'}${used.has(path.map((s) => s.property).join('.')) ? ' used' : ''}`,
      style: `padding-left:${depth * 14}px`,
      role: 'treeitem',
      'aria-expanded': isClass ? String(open) : undefined,
      draggable: 'true',
      ondragstart: (e: DragEvent) => {
        e.dataTransfer?.setData(PROPERTY_DRAG, JSON.stringify(path));
        e.dataTransfer?.setData('text/plain', `$x.${path.map((s) => s.property).join('.')}`);
      },
      ondblclick: () => (isClass ? this.#toggle(k) : this.#addColumn(path)),
      oncontextmenu: (e: MouseEvent) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          ...(isClass
            ? [{ label: 'Add all properties as columns', action: () => this.#addAll(p.type, path) }]
            : [{ label: 'Add as column', action: () => this.#addColumn(path) }]),
          ...(isClass ? [] : [{ label: 'Add as filter condition', action: () => this.#addFilter(path) }]),
          ...(isClass ? [] : ['separator' as const, { label: 'Preview data', action: () => this.#onPreview(path), disabled: !mapped || !probeable(this.#session, path) }]),
        ]);
      },
    },
    h('span', { class: 'twist', onclick: () => isClass && this.#toggle(k) }, isClass ? (open ? '▾' : '▸') : ''),
    h('span', { class: 'ico' }, iconOf(p)),
    h('span', { class: 'label' }, label),
    isToMany(p.multiplicity) ? h('span', { class: 'badge', title: 'Many values: this can multiply rows' }, '*') : null,
    p.derived ? h('span', { class: 'badge', title: 'Derived property' }, '( )') : null);
    tooltip(node, () => h('dl', null,
      h('dt', null, 'Property'), h('dd', null, h('b', null, p.name)),
      h('dt', null, 'Type'), h('dd', { class: 'mono' }, `${p.type}${multiplicityText(p.multiplicity)}`),
      h('dt', null, 'Path'), h('dd', { class: 'mono' }, `$x.${path.map((s) => s.property).join('.')}`),
      p.derived ? [h('dt', null, 'Derived'), h('dd', null, 'yes')] : null,
      h('dt', null, 'Mapped'), h('dd', null, mapped ? 'yes' : 'no'),
      p.doc ? [h('dt', null, 'Documentation'), h('dd', null, p.doc)] : null,
      p.taggedValues.map((t) => [h('dt', null, `${simpleName(t.tag.profile)}.${t.tag.value}`), h('dd', null, t.value)]),
      h('dt', null, 'Declared on'), h('dd', { class: 'mono' }, `${simpleName(owner)}${p.association ? ` (via ${simpleName(p.association)})` : ''}`)));
    return node;
  }

  /** Every property whose name or documentation matches, to depth 4, as a flat list. */
  #searchResults(root: string, used: ReadonlySet<string>): Child[] {
    const out: Child[] = [];
    const queue: { owner: string; prefix: PropertyPath; depth: number }[] = [{ owner: root, prefix: [], depth: 0 }];
    while (queue.length > 0 && out.length < 100) {
      const { owner, prefix, depth } = queue.shift()!;
      for (const p of this.#graph.properties(owner)) {
        const mapped = this.#mapped(owner, p);
        if (!mapped && !this.options.showUnmapped) continue;
        const path: PropertyPath = [...prefix, stepOf(p)];
        const text = `${p.name} ${humanize(p.name)} ${p.doc ?? ''}`.toLowerCase();
        if (text.includes(this.#search)) {
          const n = this.#node(owner, p, path, 0, mapped, used);
          n.querySelector('.label')!.textContent = path.map((s) => (this.options.humanized ? humanize(s.property) : s.property)).join(' / ');
          out.push(n);
        }
        if (p.kind === 'class' && depth < 3) queue.push({ owner: p.type, prefix: path, depth: depth + 1 });
      }
    }
    if (out.length === 0) out.push(h('div', { class: 'q-hint' }, 'No property matches.'));
    return out;
  }

  #toggle(k: string): void {
    if (this.#open.has(k)) this.#open.delete(k); else this.#open.add(k);
    this.render();
  }

  #addColumn(path: PropertyPath): void {
    this.#session.update((q) => addColumn(q, path, this.options.humanized));
  }

  #addFilter(path: PropertyPath): void {
    this.#session.update((q) => addCondition(this.#graph, q, path));
  }

  #addAll(cls: string, prefix: PropertyPath): void {
    this.#session.update((q) => {
      let next = q;
      for (const p of this.#graph.properties(cls)) {
        if (p.kind === 'class' || p.derived || !this.#mapped(cls, p)) continue;
        next = addColumn(next, [...prefix, { property: p.name }], this.options.humanized);
      }
      return next;
    });
  }
}

/** A derived property with parameters carries its arguments; any other is just its name. */
function stepOf(p: PropertyInfo): PropertyPath[number] {
  return p.parameters.length > 0 ? { property: p.name, args: [] } : { property: p.name };
}

function key(path: PropertyPath): string {
  return path.map((s) => s.property).join('.');
}

/** A property's preview in a dialog: its commonest values, or a number's aggregates. */
export async function showPreview(app: AppContext, session: Session, path: PropertyPath): Promise<void> {
  const body = h('div', null, h('span', { class: 'q-spinner' }), ' Loading…');
  dialog(`Preview: ${path.map((s) => humanize(s.property)).join(' / ')}`, (d) => ({
    body,
    foot: h('button', { class: 'q-btn primary', onclick: () => d.close() }, 'Close'),
  }));
  try {
    const p = await preview(app, session, path);
    mount(body, h('table', { class: 'q-table' },
      h('thead', null, h('tr', null, p.columns.map((c) => h('th', null, c)))),
      h('tbody', null, p.rows.map((r) => h('tr', null, r.map((v) => h('td', { class: typeof v === 'number' ? 'mono' : '' }, v === null ? 'null' : cellText(v))))))));
  } catch (e) {
    mount(body, h('div', { class: 'q-error-box' }, (e as Error).message));
  }
}
