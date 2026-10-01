import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_CONFIGURATION } from '../src/config.ts';
import { onScreen } from '../src/grid/screen-colours.ts';
import { cellStyle, gridVariables } from '../src/style.ts';

// A configured colour that is DataCube's default is the theme's to decide on screen (the dark
// theme, theme.css); one a person chose is painted as chosen. The fallback is the default
// itself, so the light theme paints exactly what it did.
describe('onScreen', () => {
  const look = DEFAULT_CONFIGURATION.appearance;

  it("hands the defaults to the theme, each falling back to itself", () => {
    assert.deepEqual(onScreen({ color: look.normalForeground! }), { color: 'var(--dc-theme-fg, #000000)' });
    assert.deepEqual(onScreen({ color: look.negativeForeground! }), { color: 'var(--dc-theme-negative, #ef4444)' });
    assert.deepEqual(onScreen({ '--dc-grid-line': look.gridLineColor! }), { '--dc-grid-line': 'var(--dc-theme-grid-line, #d4d4d4)' });
  });

  it('paints a colour a person chose as chosen', () => {
    assert.deepEqual(onScreen({ color: '#123456', 'background-color': '#000000' }),
      { color: '#123456', 'background-color': '#000000' });
  });

  it('leaves everything that is not a colour alone', () => {
    const style = { 'font-weight': '700', '--dc-hgrid': '0' };
    assert.deepEqual(onScreen(style), style);
  });

  it("reaches the grid's own styles: a default cell and the default lines", () => {
    assert.equal(onScreen(cellStyle(look, 5, 'Integer'))['color'], 'var(--dc-theme-fg, #000000)');
    assert.equal(onScreen(cellStyle(look, -5, 'Integer'))['color'], 'var(--dc-theme-negative, #ef4444)');
    assert.equal(onScreen(gridVariables(look))['--dc-grid-line'], 'var(--dc-theme-grid-line, #d4d4d4)');
  });

  it('is for the screen only: the styles exports read are untouched', () => {
    // exports call cellStyle/gridVariables directly; a file must get real colours, never var()
    assert.equal(cellStyle(look, 5, 'Integer')['color'], '#000000');
  });
});
