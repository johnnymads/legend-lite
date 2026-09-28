import { moveTile, fitToColumns, moveBy, compact, problems, bottom, type Tile } from './tile-layout.ts';
const T = (id: string, x: number, y: number, w: number, h: number, e: Partial<Tile> = {}): Tile => ({ id, x, y, w, h, ...e });
const draw = (l: readonly Tile[], cols: number) => { const rows = Array.from({ length: bottom(l) }, () => Array(cols).fill('.')); for (const t of l) for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) rows[y]![x] = t.id; return rows.map(r => r.join('')).join('\n'); };
const l0 = [T('m', 8, 0, 4, 2), T('a', 0, 0, 4, 2), T('b', 2, 2, 4, 2), T('c', 4, 4, 4, 2)];
console.log(draw(l0,12)); console.log('--held'); console.log(draw(moveTile(l0,'m',0,0,12,{swap:true,hold:true}),12));
console.log('--drop'); console.log(draw(moveTile(l0,'m',0,0,12),12));
// keyboard: side-by-side tiles, move small tile down under wide
const k = [T('a',0,0,4,2),T('b',4,0,8,4),T('c',0,2,4,2)];
console.log('--kbd before'); console.log(draw(k,12));
let r = moveBy(k,'a',0,1,12); console.log('--a down', r.changed); console.log(draw(r.layout,12));
r = moveBy(k,'a',1,0,12); console.log('--a right', r.changed); console.log(draw(r.layout,12));
// uneven 12->5
const page = [T('g',0,0,6,4),T('p',6,0,6,4),T('t',0,4,12,3),T('1',0,7,4,2),T('2',4,7,4,2),T('3',8,7,4,2)];
console.log('--12->5'); console.log(draw(fitToColumns(page,12,5),5));
console.log('--12->4'); console.log(draw(fitToColumns(page,12,4),4));
// order-vs-gravity gap
const gap = [T('A',0,0,6,1),T('B',6,0,6,6),T('C',0,1,6,1)];
console.log('--gap 12->6? '); const f = fitToColumns([T('A',0,0,3,1),T('B',3,0,9,6),T('C',0,1,3,1),T('D',9,6,3,1)],12,6); console.log(draw(f,6));
