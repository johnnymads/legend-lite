// The board in a DOM: tiles placed by the layout model, edit mode's
// affordances, the keyboard, and the narrow board. The pointer is checked
// in a browser (jsdom has no layout to drag across).

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { Board, type BoardTile } from '../src/layout/board.ts';

let dom: JSDOM;
let host: HTMLElement;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><body><div id="host"></div></body>');
  host = dom.window.document.getElementById('host')!;
});

function tile(id: string, extra: Partial<BoardTile> = {}): BoardTile {
  const element = dom.window.document.createElement('div');
  element.textContent = `content of ${id}`;
  return { id, title: id.toUpperCase(), element, ...extra };
}

function root(id: string): HTMLElement {
  return host.querySelector(`[data-tile="${id}"]`)!;
}

function live(): string {
  return host.querySelector('.dc-board-live')!.textContent ?? '';
}

function key(el: HTMLElement, k: string, shiftKey = false): void {
  el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));
}

describe('the board', () => {
  it('places tiles where the layout says, as CSS grid lines', () => {
    const board = new Board(host);
    board.add(tile('grid'), { x: 0, y: 0, w: 7, h: 16 });
    board.add(tile('chart'), { x: 7, y: 0, w: 5, h: 16 });
    assert.equal(board.size, 2);
    assert.equal(root('grid').style.gridColumn, '1 / span 7');
    assert.equal(root('chart').style.gridColumn, '8 / span 5');
    assert.equal(root('chart').style.gridRow, '1 / span 16');
    assert.equal(root('chart').querySelector('.dc-tile-body')!.textContent, 'content of chart');
  });

  it('puts a tile with no place below everything, and makes room for one placed on top', () => {
    const board = new Board(host);
    board.add(tile('a'), { x: 0, y: 0, w: 12, h: 4 });
    board.add(tile('b'));
    assert.deepEqual(board.layout.find((t) => t.id === 'b'), { id: 'b', x: 0, y: 4, w: 6, h: 10 });
    board.add(tile('c'), { x: 0, y: 0, w: 12, h: 2 });
    const a = board.layout.find((t) => t.id === 'a')!;
    assert.ok(a.y >= 2, 'the tile underneath moved down');
  });

  it('removes a tile, leaving its content element whole', () => {
    const board = new Board(host);
    const t = tile('a');
    board.add(t);
    board.remove('a');
    assert.equal(board.size, 0);
    assert.equal(board.layout.length, 0);
    assert.equal(t.element.textContent, 'content of a');
  });

  it('shows the remove button, the resize corner and the handle only while editing', () => {
    const removed: string[] = [];
    const board = new Board(host, { onRemove: (id) => removed.push(id) });
    board.add(tile('grid', { removable: false }));
    board.add(tile('chart'));
    const button = (id: string) => root(id).querySelector<HTMLButtonElement>('.dc-tile-remove')!;
    assert.equal(button('chart').hidden, true);
    board.setEditing(true);
    assert.equal(button('chart').hidden, false);
    assert.equal(button('grid').hidden, true, 'the grid cannot be removed');
    assert.equal(root('chart').querySelector<HTMLElement>('.dc-tile-resize')!.hidden, false);
    assert.ok(root('chart').querySelector('.dc-tile-head')!.classList.contains('dc-tile-handle'));
    assert.equal(root('chart').tabIndex, 0);
    button('chart').click();
    assert.deepEqual(removed, ['chart'], 'the caller is asked; the board does not remove it itself');
    board.setEditing(false);
    assert.equal(button('chart').hidden, true);
    assert.equal(root('chart').tabIndex, -1);
  });

  it('moves and resizes the focused tile with the keyboard, and says where it went', () => {
    const changes: number[] = [];
    const board = new Board(host, { onChange: () => changes.push(1) });
    board.add(tile('a'), { x: 0, y: 0, w: 4, h: 4 });
    key(root('a'), 'ArrowRight');
    assert.deepEqual(changes, [], 'no keyboard outside edit mode');
    board.setEditing(true);
    key(root('a'), 'ArrowRight');
    assert.equal(board.layout[0]!.x, 1);
    assert.match(live(), /^A: column 2 of 12/);
    key(root('a'), 'ArrowDown', true);
    assert.equal(board.layout[0]!.h, 5);
    assert.equal(changes.length, 2);
    // at the left edge: nothing moves, and it says so
    key(root('a'), 'ArrowLeft');
    key(root('a'), 'ArrowLeft');
    assert.equal(board.layout[0]!.x, 0);
    assert.match(live(), /at the left edge/);
  });

  it('leaves keys typed inside a tile\'s content alone', () => {
    const board = new Board(host);
    const t = tile('a');
    board.add(t, { x: 0, y: 0, w: 4, h: 4 });
    board.setEditing(true);
    key(t.element, 'ArrowRight');
    assert.equal(board.layout[0]!.x, 0);
  });

  it('is one column, and not editable, when narrow; the saved layout is unchanged', () => {
    Object.defineProperty(host, 'clientWidth', { value: 400 });
    const board = new Board(host);
    board.add(tile('a'), { x: 0, y: 0, w: 6, h: 4 });
    board.add(tile('b'), { x: 6, y: 0, w: 6, h: 4 });
    assert.ok(host.classList.contains('dc-board-narrow'));
    assert.equal(root('b').style.gridColumn, '1 / span 1');
    assert.deepEqual(board.layout.map((t) => [t.x, t.w]), [[0, 6], [6, 6]]);
    board.setEditing(true);
    assert.equal(board.editing, false);
  });

  it('refuses a second tile with the same id', () => {
    const board = new Board(host);
    board.add(tile('a'));
    assert.throws(() => board.add(tile('a')), /already on the board/);
  });
});

describe('a board that fits the screen', () => {
  it('divides its visible height among its rows', () => {
    Object.defineProperty(host, 'clientHeight', { value: 24 * 20 + 23 * 8 });
    new Board(host, { fitRows: 24 });
    assert.equal(host.querySelector<HTMLElement>('.dc-board-grid')!.style.gridAutoRows, '20px');
  });

  it('keeps rows readable on a short screen', () => {
    Object.defineProperty(host, 'clientHeight', { value: 200 });
    new Board(host, { fitRows: 24, rowHeight: 16 });
    assert.equal(host.querySelector<HTMLElement>('.dc-board-grid')!.style.gridAutoRows, '16px');
  });

  it('gives a laid-out tile its own limits back', () => {
    const board = new Board(host);
    board.add(tile('a', { minH: 6 }));
    board.setLayout([{ id: 'a', x: 0, y: 0, w: 4, h: 8 }, { id: 'ghost', x: 0, y: 0, w: 1, h: 1 }]);
    assert.deepEqual(board.layout, [{ id: 'a', x: 0, y: 0, w: 4, h: 8, minH: 6 }]);
  });
});
