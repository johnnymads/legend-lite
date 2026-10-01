// The editor's resizable layout, as upstream's query builder lays it out (react-reflex,
// QueryBuilder.tsx): left 450px (min 300), centre and right sharing the rest equally (min 300
// each), the results 300px along the bottom (min 40) under a top of at least 120px. The gutters
// are 4px, the strong border colour while hovered or dragged.

import { h } from './dom.ts';

const MIN = { left: 300, center: 300, right: 300, top: 120, bottom: 40 };

/** Drag a gutter: `move` gets the pointer's position for as long as the button is down. */
function gutter(axis: 'x' | 'y', label: string, move: (at: { x: number; y: number }) => void): HTMLElement {
  const g = h('div', { class: `q-gutter q-gutter--${axis}`, role: 'separator', 'aria-label': label, 'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal' });
  g.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    g.setPointerCapture(e.pointerId);
    g.classList.add('q-gutter--active');
    const onMove = (m: PointerEvent): void => move({ x: m.clientX, y: m.clientY });
    const onUp = (): void => {
      g.classList.remove('q-gutter--active');
      g.removeEventListener('pointermove', onMove);
      g.removeEventListener('pointerup', onUp);
    };
    g.addEventListener('pointermove', onMove);
    g.addEventListener('pointerup', onUp);
  });
  return g;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The workspace: three panes side by side over one along the bottom, every boundary draggable. */
export function workspace(left: HTMLElement, center: HTMLElement, right: HTMLElement, bottom: HTMLElement): HTMLElement {
  const top = h('div', { class: 'q-ws__top' });
  const ws = h('div', { class: 'q-ws' }, top);
  top.append(
    h('div', { class: 'q-ws__pane' }, left),
    gutter('x', 'Resize the side panel', ({ x }) => {
      const r = top.getBoundingClientRect();
      ws.style.setProperty('--ws-left', `${clamp(x - r.left, MIN.left, r.width - MIN.center - MIN.right - 8)}px`);
    }),
    h('div', { class: 'q-ws__pane' }, center),
    gutter('x', 'Resize the filter panel', ({ x }) => {
      const r = top.getBoundingClientRect();
      const leftWidth = top.firstElementChild!.getBoundingClientRect().width;
      ws.style.setProperty('--ws-right', `${clamp(r.right - x, MIN.right, r.width - leftWidth - MIN.center - 8)}px`);
    }),
    h('div', { class: 'q-ws__pane' }, right));
  ws.append(
    gutter('y', 'Resize the results panel', ({ y }) => {
      const r = ws.getBoundingClientRect();
      ws.style.setProperty('--ws-bottom', `${clamp(r.bottom - y, MIN.bottom, r.height - MIN.top - 4)}px`);
    }),
    h('div', { class: 'q-ws__pane' }, bottom));
  return ws;
}
