// A saved query's versions (census §8): every earlier revision from the store, each viewable as
// Pure, any two compared side by side, and any one restored as the newest version (the owner's).
// And the query's facts: project, source, owner, times.

import type { AppContext } from '../app/context.ts';
import type { Session } from '../app/session.ts';
import type { Query } from '../backend/wire.ts';
import { simpleName } from '../model/graph.ts';
import { confirmDialog, dialog, h, mount, toast } from './dom.ts';
import { timeAgo } from './format.ts';

/** A line diff: each line of `a` and `b`, marked kept, removed or added (longest common subsequence). */
export function lineDiff(a: string, b: string): { kind: ' ' | '-' | '+'; line: string }[] {
  const x = a.split('\n'), y = b.split('\n');
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: { kind: ' ' | '-' | '+'; line: string }[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ kind: ' ', line: x[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: '-', line: x[i++]! });
    else out.push({ kind: '+', line: y[j++]! });
  }
  while (i < x.length) out.push({ kind: '-', line: x[i++]! });
  while (j < y.length) out.push({ kind: '+', line: y[j++]! });
  return out;
}

function diffView(a: string, b: string): HTMLElement {
  return h('pre', { class: 'q-json', style: 'white-space:pre-wrap; max-height:50vh; overflow:auto; border:1px solid var(--border); border-radius:6px' },
    lineDiff(a, b).map((d) => h('div', {
      style: d.kind === '-' ? 'background:var(--error-soft); color:var(--error)' : d.kind === '+' ? 'background:var(--accent-soft)' : '',
    }, `${d.kind} ${d.line}`)));
}

export async function historyDialog(app: AppContext, session: Session): Promise<void> {
  const saved = session.saved;
  if (!saved) { toast('Save the query first: history is kept for saved queries.'); return; }
  const body = h('div', null, h('span', { class: 'q-spinner' }), ' Loading history…');
  const handle = dialog(`History: ${saved.name}`, (d) => ({ body, foot: h('button', { class: 'q-btn primary', onclick: () => d.close() }, 'Close') }), { wide: true });
  try {
    const earlier = await app.store.history(saved.id);
    const all: Query[] = [saved, ...[...earlier].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))];
    let left = all[1] ?? all[0]!;
    let right = all[0]!;
    const view = h('div');
    const pick = (q: Query, onClick: () => void, on: boolean): HTMLElement => h('button', {
      class: `q-btn small${on ? ' primary' : ''}`, onclick: onClick,
    }, `v${q.version ?? '?'}`);
    const draw = (): void => {
      mount(view,
        h('div', { style: 'display:flex; gap:12px; align-items:center; flex-wrap:wrap' },
          h('span', { class: 'q-faint' }, 'Compare'), all.map((q) => pick(q, () => { left = q; draw(); }, q === left)),
          h('span', { class: 'q-faint' }, 'with'), all.map((q) => pick(q, () => { right = q; draw(); }, q === right))),
        h('div', { class: 'q-faint', style: 'margin:8px 0' },
          `v${left.version} ${left.lastUpdatedAt ? `(${timeAgo(left.lastUpdatedAt)})` : ''} → v${right.version} ${right.lastUpdatedAt ? `(${timeAgo(right.lastUpdatedAt)})` : ''}`),
        diffView(left.content, right.content),
        left !== all[0] && saved.owner === app.user ? h('div', { style: 'margin-top:10px' }, h('button', {
          class: 'q-btn',
          onclick: async () => {
            if (!await confirmDialog('Restore this version?', `v${left.version} becomes the newest version of “${saved.name}”. Nothing is lost: the current version stays in the history.`, 'Restore')) return;
            try {
              const restored = await app.store.update({ ...left, id: saved.id, name: saved.name });
              handle.close();
              toast(`Restored as v${restored.version}. Reloading…`);
              location.reload();
            } catch (e) {
              toast(`Restore failed: ${(e as Error).message}`, 5000);
            }
          },
        }, `Restore v${left.version}`)) : null);
    };
    mount(body, all.length === 1 ? h('div', { class: 'q-empty' }, 'This is the first version: nothing earlier to compare.') : view);
    if (all.length > 1) draw();
  } catch (e) {
    mount(body, h('div', { class: 'q-error-box' }, (e as Error).message));
  }
}

export function infoDialog(app: AppContext, session: Session): void {
  const q = session.saved;
  const src = session.query.source;
  const p = session.project.config;
  const row = (k: string, v: string | undefined | null): HTMLElement | null => (v ? h('tr', null, h('th', null, k), h('td', { class: 'mono' }, v)) : null);
  dialog('About this query', (d) => ({
    body: h('table', { class: 'q-table' }, h('tbody', null,
      row('Name', q?.name ?? '(not saved)'),
      row('Id', q?.id),
      row('Description', q?.description),
      row('Owner', q?.owner ? (q.owner === app.user ? `${q.owner} (you)` : q.owner) : undefined),
      row('Version', q?.version != null ? `v${q.version}` : undefined),
      row('Created', q?.createdAt ? new Date(q.createdAt).toLocaleString() : undefined),
      row('Updated', q?.lastUpdatedAt ? new Date(q.lastUpdatedAt).toLocaleString() : undefined),
      row('Project', `${p.groupId}:${p.artifactId}:${p.versionId}`),
      row('Data space', src.dataSpace ? `${src.dataSpace.path} [${src.dataSpace.context}]` : undefined),
      row('Class', src.class ? `${simpleName(src.class)} (${src.class})` : undefined),
      row('Mapping', src.mapping),
      row('Runtime', src.runtime))),
    foot: h('button', { class: 'q-btn primary', onclick: () => d.close() }, 'Close'),
  }));
}
