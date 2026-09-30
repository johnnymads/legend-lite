// Which cube an element belongs to, when a page holds several (plan F6).
//
// A cube marks its root -- and each window it opens, wherever the host puts it -- with
// `data-dc-cube`. Drag and drop is one per document, so what is being dragged can stay in one
// place; what must not be shared is where it may LAND: a column dragged out of cube A's grid
// is nothing to cube B's zones.

let next = 0;

/** A fresh id for a cube on this page. */
export function newCubeScope(): string {
  next += 1;
  return `cube-${next}`;
}

/** The cube `target` is inside, or null when it is inside none. */
export function cubeScopeOf(target: EventTarget | null | undefined): string | null {
  const node = target && typeof (target as Node).nodeType === 'number' ? target as Node : null;
  const el = node ? (node.nodeType === 1 ? node as Element : node.parentElement) : null;
  return el?.closest('[data-dc-cube]')?.getAttribute('data-dc-cube') ?? null;
}
