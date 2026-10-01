// The Cubes window (src/ui/cube-library.ts): opening a saved cube -- asked first over unsaved
// changes -- and the cube on screen marked. Saving is its own window (save-dialog.test.ts).

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { MemoryRecords, RuleStore } from '../src/cube-store.ts';
import { CubeLibrary, type CubeLibraryHost } from '../src/ui/cube-library.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the Cubes window', () => {
  let root: HTMLElement;
  let calls: string[];
  let state: { dirty: boolean; id?: string };
  let library: CubeLibrary;

  beforeEach(async () => {
    const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>');
    root = dom.window.document.getElementById('r') as HTMLElement;
    calls = [];
    state = { dirty: false, id: 'a' };
    const store = new RuleStore(new MemoryRecords(), 'me');
    await store.create({ id: 'a', name: 'Alpha', content: { kind: 'datacube.cube' } });
    await store.create({ id: 'b', name: 'Beta', content: { kind: 'datacube.cube' } });
    const host: CubeLibraryHost = {
      currentId: () => state.id,
      open: async (id) => { calls.push(`open ${id}`); },
      openText: async () => {},
      forget: async () => {},
      dirty: () => state.dirty,
    };
    library = new CubeLibrary(root, store, host);
    await library.refresh();
  });

  const button = (label: string, within: ParentNode = root): HTMLButtonElement =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)
      ?? assert.fail(`no button ${label}`);
  const row = (name: string): HTMLElement =>
    [...root.querySelectorAll<HTMLElement>('.dc-lib-row')].find((r) => r.textContent?.includes(name))
      ?? assert.fail(`no row ${name}`);

  it('marks the cube on screen', () => {
    assert.ok(row('Alpha').classList.contains('dc-lib-current'));
    assert.ok(!row('Beta').classList.contains('dc-lib-current'));
    state.id = 'b';
    library.sync();
    assert.ok(row('Beta').classList.contains('dc-lib-current'));
  });

  it('opens straight away with nothing unsaved', async () => {
    button('Open', row('Beta')).click();
    await tick();
    assert.deepEqual(calls, ['open b']);
  });

  it('asks before opening another cube over unsaved changes', async () => {
    state.dirty = true;
    button('Open', row('Beta')).click();
    await tick();
    assert.deepEqual(calls, [], 'not opened yet');
    assert.match(root.textContent ?? '', /unsaved changes\. Open "Beta" anyway\?/);
    button('Open anyway').click();
    await tick();
    assert.deepEqual(calls, ['open b']);
  });

});
