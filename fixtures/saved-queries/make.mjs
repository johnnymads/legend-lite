// Writes fixtures/saved-queries/*.json: each a saved Query exactly as legend-lite's /api/pure/v1/query
// answers GET -- created through POST on a server started with --query-store -- and checks each
// content RUNS (its parameters bound from defaultParameterValues, ->from(mapping, runtime)) on the
// demo model, so a fixture is a real, runnable record. Regenerate:
//   java -jar bazel-bin/core/server_deploy.jar 18777 --query-store <empty dir> &
//   node fixtures/saved-queries/make.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const api = 'http://127.0.0.1:18777/api';
const model = { _type: 'text', code: readFileSync('query/demo/models/trading.pure', 'utf8') + '\n' + readFileSync('query/demo/models/runtime-h2.pure', 'utf8') };
const call = async (method, path, body, text = false) => {
  const r = await fetch(api + path, { method, headers: { 'Content-Type': text ? 'text/plain' : 'application/json' }, ...(body === undefined ? {} : { body: text ? body : JSON.stringify(body) }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 300)}`);
  return t;
};
const base = { groupId: 'demo', artifactId: 'trading', versionId: '0.0.0', stereotypes: [], gridConfig: null };
const records = {
  'explicit-context': { ...base, id: 'fixture-explicit-context', name: 'Big trades',
    executionContext: { _type: 'explicitExecutionContext', mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::Runtime' },
    content: "|demo::trading::Trade.all()->filter(\n  x|$x.quantity > 1000000\n)->project(\n  ~[\n     'Trade Id': x|$x.tradeId,\n     Quantity: x|$x.quantity\n   ]\n)",
    taggedValues: [], defaultParameterValues: [] },
  'data-space-context': { ...base, id: 'fixture-data-space-context', name: 'Sells',
    executionContext: { _type: 'dataSpaceExecutionContext', dataSpacePath: 'demo::trading::TradingDataSpace', executionKey: 'Production' },
    content: "|demo::trading::Trade.all()->filter(\n  x|$x.side ==\n    demo::trading::Side.SELL\n)->project(\n  ~[\n     'Trade Id': x|$x.tradeId,\n     Side: x|$x.side,\n     Quantity: x|$x.quantity\n   ]\n)",
    taggedValues: [{ tag: { profile: 'meta::pure::profiles::query', value: 'dataSpace' }, value: 'demo::trading::TradingDataSpace' }],
    defaultParameterValues: [] },
  'default-parameter-values': { ...base, id: 'fixture-default-parameter-values', name: 'Trades over a quantity',
    executionContext: { _type: 'explicitExecutionContext', mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::Runtime' },
    content: "{minQty: Integer[1]|demo::trading::Trade.all()->filter(\n  x|$x.quantity > $minQty\n)->project(\n  ~[\n     'Trade Id': x|$x.tradeId,\n     Quantity: x|$x.quantity\n   ]\n)}",
    taggedValues: [], defaultParameterValues: [{ name: 'minQty', content: '1000000' }] },
  'graph-fetch': { ...base, id: 'fixture-graph-fetch', name: 'Firms as objects',
    executionContext: { _type: 'explicitExecutionContext', mapping: 'demo::trading::TradingMapping', runtime: 'demo::trading::Runtime' },
    content: '|demo::trading::Firm.all()->graphFetch(\n  #{demo::trading::Firm{legalName}}#\n)->serialize(\n  #{demo::trading::Firm{legalName}}#\n)',
    taggedValues: [], defaultParameterValues: [] },
};

mkdirSync('fixtures/saved-queries', { recursive: true });
for (const [file, record] of Object.entries(records)) {
  await call('POST', '/pure/v1/query', record);
  const answer = JSON.parse(await call('GET', `/pure/v1/query/${record.id}`));
  // runnable: the content, its parameters bound from defaultParameterValues, ->from(mapping, runtime)
  const lambda = JSON.parse(await call('POST', '/pure/v1/grammar/grammarToJson/lambda', answer.content, true));
  const last = lambda.body[lambda.body.length - 1];
  lambda.body[lambda.body.length - 1] = { _type: 'func', function: 'from', parameters: [last,
    { _type: 'packageableElementPtr', fullPath: 'demo::trading::TradingMapping' }, { _type: 'packageableElementPtr', fullPath: 'demo::trading::Runtime' }] };
  const parameterValues = [];
  for (const pv of answer.defaultParameterValues) {
    const v = JSON.parse(await call('POST', '/pure/v1/grammar/grammarToJson/lambda', `|${pv.content}`, true));
    parameterValues.push({ name: pv.name, value: v.body[0] });
  }
  const result = JSON.parse(await call('POST', '/pure/v1/execution/execute', { function: lambda, model, parameterValues, context: { _type: 'BaseExecutionContext' } }));
  const shape = result.result?.rows ? `${result.result.rows.length} rows` : `${Array.isArray(result.values) ? result.values.length : 1} object(s)`;
  writeFileSync(`fixtures/saved-queries/${file}.json`, JSON.stringify(answer, null, 2) + '\n');
  console.log(`${file}: GET answered, runs -> ${shape}`);
}
