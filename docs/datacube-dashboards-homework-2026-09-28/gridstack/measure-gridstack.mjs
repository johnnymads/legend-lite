// Counts gridstack 14.0.0 TS source (extracted from its sourcemaps) by concern.
// "code" = non-blank lines that are not // or /* */ or * comment lines.
import { readFileSync } from 'node:fs';
const lines = (f) => readFileSync(new URL('./gs-src/' + f, import.meta.url), 'utf8').split('\n');
const isCode = (l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); };
const count = (f, a, b) => { const L = lines(f).slice(a - 1, b ?? undefined); return [L.length, L.filter(isCode).length]; };
const C = {
  'engine: collision (fixCollisions, collide*, directionCoverage, swap, isAreaEmpty)': [['gridstack-engine.ts', 110, 378]],
  'engine: compaction / float / packNodes / sort': [['gridstack-engine.ts', 379, 528]],
  'engine: node normalisation (prepareNode, nodeBoundFix)': [['gridstack-engine.ts', 529, 665]],
  'engine: dirty tracking, notify, save/restoreInitial, batch': [['gridstack-engine.ts', 1, 109], ['gridstack-engine.ts', 666, 751], ['gridstack-engine.ts', 1065, 1095]],
  'engine: add/remove/findEmptyPosition': [['gridstack-engine.ts', 752, 884]],
  'engine: move (moveNodeCheck, willItFit, moveNode)': [['gridstack-engine.ts', 885, 1064]],
  'engine: save': [['gridstack-engine.ts', 1096, 1121]],
  'engine: column change / responsive layout cache': [['gridstack-engine.ts', 1122, null]],
  'grid: init, options, constructor, placeholder': [['gridstack.ts', 1, 454]],
  'grid: widget DOM (add/make/remove, attrs, static)': [['gridstack.ts', 455, 528], ['gridstack.ts', 1143, 1165], ['gridstack.ts', 1308, 1366], ['gridstack.ts', 1442, 1498], ['gridstack.ts', 1522, 1718], ['gridstack.ts', 1794, 1875], ['gridstack.ts', 1895, 1919], ['gridstack.ts', 1996, 2164], ['gridstack.ts', 2251, 2328]],
  'grid: nested sub-grids': [['gridstack.ts', 529, 671]],
  'grid: save/load': [['gridstack.ts', 672, 870]],
  'grid: sizing, column(), responsive breakpoints, onResize, resizeToContent, compact()': [['gridstack.ts', 871, 1142], ['gridstack.ts', 1166, 1307], ['gridstack.ts', 1719, 1793], ['gridstack.ts', 1958, 1995], ['gridstack.ts', 2165, 2250]],
  'grid: events (on/off, trigger*)': [['gridstack.ts', 1367, 1441], ['gridstack.ts', 1876, 1894], ['gridstack.ts', 1920, 1957]],
  'grid: animation toggle': [['gridstack.ts', 1499, 1521]],
  'grid: DD glue (movable/resizable/enable, prepareDragDrop, _onStartMoving, _dragOrResize, _leave)': [['gridstack.ts', 2329, 2586], ['gridstack.ts', 2864, null]],
  'grid: drag-in from outside / between grids (_setupAcceptWidget)': [['gridstack.ts', 2587, 2863]],
  'DD: draggable (+ helper, scroll, dragstart handling)': [['dd-draggable.ts', 1, null]],
  'DD: resizable + handles': [['dd-resizable.ts', 1, null], ['dd-resizable-handle.ts', 1, null]],
  'DD: droppable + manager + base + element + dd-gridstack': [['dd-droppable.ts', 1, null], ['dd-manager.ts', 1, null], ['dd-base-impl.ts', 1, null], ['dd-element.ts', 1, null], ['dd-gridstack.ts', 1, null]],
  'DD: touch shim (touch -> mouse simulation)': [['dd-touch.ts', 1, null]],
  'types.ts (options/interfaces)': [['types.ts', 1, null]],
  'utils.ts (geometry, clone, sort, scroll helpers)': [['utils.ts', 1, null]],
};
let T = [0, 0];
console.log('| concern | lines | code lines |\n|---|---:|---:|');
for (const [k, rs] of Object.entries(C)) {
  const s = rs.map(([f, a, b]) => count(f, a, b)).reduce((x, y) => [x[0] + y[0], x[1] + y[1]]);
  T = [T[0] + s[0], T[1] + s[1]];
  console.log(`| ${k} | ${s[0]} | ${s[1]} |`);
}
console.log(`| TOTAL | ${T[0]} | ${T[1]} |`);
