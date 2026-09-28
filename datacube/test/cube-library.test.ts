// The Cubes window (src/ui/cube-library.ts): "changed since saved" -- the marker, opening
// another cube over unsaved changes, and saving over a copy the file could not fully show.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';

import { MemoryRecords, RuleStore } from '../src/cube-store.ts';
import { CubeLibrary, type CubeLibraryHost } from '../src/ui/cube-library.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the Cubes window', () => {
  let root: HTMLElement;
  let calls: string[];
  let state: { dirty: boolean; warning?: string; id?: string };
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
      saveName: () => 'Alpha',
      currentId: () => state.id,
      save: async (name, asNew) => { calls.push(`save ${name} ${asNew ? 'new' : 'over'}`); },
      open: async (id) => { calls.push(`open ${id}`); },
      openText: async () => {},
      forget: async () => {},
      dirty: () => state.dirty,
      saveWarning: () => state.warning,
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

  it('marks unsaved changes, and clears the mark when there are none', () => {
    const mark = root.querySelector('.dc-lib-unsaved') as HTMLElement;
    assert.equal(mark.hidden, true);
    state.dirty = true;
    library.sync();
    assert.equal(mark.hidden, false);
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

  it('says what saving over the saved copy drops, and offers save as new', async () => {
    state.warning = 'The saved "Alpha" has parts this file cannot show';
    button('Save').click();
    await tick();
    assert.deepEqual(calls, [], 'nothing saved before the user decides');
    const ask = root.querySelector('.dc-lib-ask') as HTMLElement;
    assert.equal(ask.hidden, false);
    assert.match(ask.textContent ?? '', /parts this file cannot show/);
    button('Save as new', ask).click();
    await tick();
    assert.deepEqual(calls, ['save Alpha new']);
    button('Save').click();
    await tick();
    button('Save anyway', root.querySelector('.dc-lib-ask') as HTMLElement).click();
    await tick();
    assert.deepEqual(calls, ['save Alpha new', 'save Alpha over']);
  });
});
