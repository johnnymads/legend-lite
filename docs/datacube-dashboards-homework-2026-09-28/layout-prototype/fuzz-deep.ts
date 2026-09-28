// Heavier fuzz than the test file: 2,000 seeds x 300 random gestures, random sizes, ~15% static.
import { moveTile, resizeTile, resizeRect, edgeRect, moveBy, resizeBy, place, compact, problems, fitToColumns, type Tile, type Edge } from './tile-layout.ts';
const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const EDGES: Edge[] = ['n','s','e','w','ne','nw','se','sw'];
let steps = 0, fails = 0; const t0 = performance.now();
for (let seed = 1; seed <= 2000 && fails < 5; seed++) {
  const r = rng(seed); const cols = [12, 12, 8, 6][seed % 4]!; const n = 3 + Math.floor(r() * 25);
  let raw: Tile[] = []; for (let i = 0; i < n; i++) { const w = 1 + Math.floor(r() * Math.min(cols, 6)); const t: Tile = { id: 't' + i, x: Math.floor(r() * (cols - w + 1)), y: Math.floor(r() * 30), w, h: 1 + Math.floor(r() * 4), ...(r() < 0.15 ? { static: true } : {}), ...(r() < 0.3 ? { minW: 2, minH: 2 } : {}) };
    if (!raw.some(u => t.x < u.x + u.w && u.x < t.x + t.w && t.y < u.y + u.h && u.y < t.y + t.h)) raw.push({ ...t, w: Math.max(t.w, t.minW ?? 1), h: Math.max(t.h, t.minH ?? 1) }); }
  if (problems(raw, cols).length) continue;
  let l = compact(raw); const st = JSON.stringify(l.filter(t => t.static));
  for (let k = 0; k < 300; k++) {
    const t = l[Math.floor(r() * l.length)]!; const op = Math.floor(r() * 6); steps++;
    if (op === 0) l = moveTile(l, t.id, Math.floor(r() * (cols + 2)) - 1, Math.floor(r() * 40) - 1, cols);
    else if (op === 1) l = resizeTile(l, t.id, Math.floor(r() * (cols + 2)), Math.floor(r() * 6), cols);
    else if (op === 2) l = moveBy(l, t.id, Math.floor(r() * 3) - 1, Math.floor(r() * 3) - 1, cols).layout;
    else if (op === 3) l = resizeBy(l, t.id, Math.floor(r() * 3) - 1, Math.floor(r() * 3) - 1, cols).layout;
    else if (op === 4) l = resizeRect(l, t.id, edgeRect(t, EDGES[Math.floor(r() * 8)]!, Math.floor(r() * 7) - 3, Math.floor(r() * 7) - 3), cols);
    else {
      // a drag: several held steps (checked legal), then the drop where the pointer ended
      let x = 0, y = 0;
      for (let d = 0; d < 4; d++) {
        x = Math.floor(r() * cols); y = Math.floor(r() * 30);
        const held = place(l, t.id, { x, y, w: t.w, h: t.h }, cols, { hold: true, swap: true });
        if (problems(held, cols).length) { console.log('HELD FAIL', seed, k, problems(held, cols)); fails++; }
      }
      l = moveTile(l, t.id, x, y, cols);
    }
    const bad = problems(l, cols); const stNow = JSON.stringify(l.filter(t => t.static));
    const settled = JSON.stringify(compact(l)) === JSON.stringify(l);
    if (bad.length || stNow !== st || !settled) { fails++; if (fails===1) { const {bottom}=await import("./tile-layout.ts"); const d=(l:readonly Tile[])=>{const rows=Array.from({length:bottom(l)},()=>Array(cols).fill("."));for(const t of l)for(let y=t.y;y<t.y+t.h;y++)for(let x=t.x;x<t.x+t.w;x++)rows[y]![x]=String.fromCharCode(97+Number(t.id.slice(1))%26)[t.static?"toUpperCase":"toString"]();return rows.map(r=>r.join("")).join("\n");}; console.log(d(l)); console.log("-- compacted again"); console.log(d(compact(l))); } console.log('FAIL seed', seed, 'step', k, 'op', op, bad, stNow !== st ? 'static moved' : '', settled ? '' : 'not settled'); break; }
  }
  for (const c of [8, 6, 4, 3, 2, 1]) if (c < cols && problems(fitToColumns(l, cols, c), c).length) { fails++; console.log('FIT FAIL', seed, c); }
}
console.log(`steps=${steps} fails=${fails} ms=${(performance.now() - t0).toFixed(0)}`);
