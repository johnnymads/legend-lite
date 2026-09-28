import * as vl from 'vega-lite'; import * as vega from 'vega'; import { expressionInterpreter } from 'vega-interpreter';
const spec = vl.compile({data:{values:[{k:'a',v:3},{k:'b',v:5}]},mark:'bar',encoding:{x:{field:'k',type:'nominal'},y:{field:'v',type:'quantitative'}}, params:[{name:'sel',select:'point'}]}).spec;
globalThis.Function = function(){ throw new Error('Function ctor used'); };
const view = new vega.View(vega.parse(spec,null,{ast:true}),{renderer:'none', expr: expressionInterpreter});
const svg = await view.toSVG(); console.log('vega', svg.length, (svg.match(/<path/g)||[]).length, svg.match(/aria-[a-z]+="[^"]{0,80}/g)?.slice(0,3)); view.finalize();
