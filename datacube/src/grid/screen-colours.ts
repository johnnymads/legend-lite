// A configured colour that IS DataCube's default is the theme's to decide, on screen.
//
// Every cube's configuration carries the default colours (normal text #000000, grid lines
// #d4d4d4, ...) and the grid paints them inline, so a dark page would still get black text. Here,
// on the way to the DOM only, a colour equal to its default becomes a custom property with that
// default as the fallback: the light theme paints exactly the default, as before, and the dark
// theme (theme.css, `:root[data-dc-theme='dark']`) supplies its own. A colour a person chose is
// painted as chosen. Exports never come here -- a file is light, whatever the page is.

import { DEFAULT_CONFIGURATION } from '../config.ts';

const look = DEFAULT_CONFIGURATION.appearance;

/** (style property, its default value) -> the theme token that may replace it. */
const THEMED = new Map<string, string>([
  [`color ${look.normalForeground}`, '--dc-theme-fg'],
  [`color ${look.negativeForeground}`, '--dc-theme-negative'],
  [`color ${look.zeroForeground}`, '--dc-theme-zero'],
  [`color ${look.errorForeground}`, '--dc-theme-error'],
  [`--dc-grid-line ${look.gridLineColor}`, '--dc-theme-grid-line'],
  [`--dc-alt-row ${look.alternateRowsColor}`, '--dc-theme-band'],
].map(([k, v]) => [k!.toLowerCase(), v!]));

/** A style for the screen: each default colour as its theme token, with the default as fallback. */
export function onScreen(style: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [property, value] of Object.entries(style)) {
    const token = THEMED.get(`${property} ${value}`.toLowerCase());
    out[property] = token === undefined ? value : `var(${token}, ${value})`;
  }
  return out;
}
