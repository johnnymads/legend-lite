// The compiler's catalog builder (T2), for tests: legend-lite's own WASM module, the same
// one the tab loads. A test that writes a model from a table's columns asks the compiler,
// never a copy of its type table.

import type { CatalogBuilder } from '../src/infer.ts';
import { WasmPlanner } from '../src/wasm-planner.ts';

const MODULE_DIR = new URL('../../wasm/planner/', import.meta.url).href;

// The builder reads no model: any planner instance answers it.
const planner = new WasmPlanner({ model: '', runtime: '', assetBaseUrl: MODULE_DIR, cache: false });

export const build: CatalogBuilder = (table) => planner.databaseFromCatalog(table);
