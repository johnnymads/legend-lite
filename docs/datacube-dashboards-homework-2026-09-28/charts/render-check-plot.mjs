import { JSDOM } from 'jsdom'; import * as Plot from '@observablehq/plot';
const {window} = new JSDOM(''); const p = Plot.barY([{k:'a',v:3},{k:'b',v:5}],{x:'k',y:'v'}).plot({document: window.document, ariaLabel:'Sales'});
console.log('plot', p.outerHTML.length, (p.outerHTML.match(/<rect/g)||[]).length, (p.outerHTML.match(/aria-[a-z]+="[^"]{0,40}/g)||[]).slice(0,4));
