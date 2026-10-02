// A file becomes a cube: infer the schema, then WRITE THE MODEL.
//
// This is what lets someone open the page and drop a file in, rather
// than hand-authoring a Pure model that happens to match their
// columns. DuckDB sniffs the types and its catalog reports them, structured
// (`catalogColumnsSql`, or a warehouse's listing); legend-lite's writer, generated
// and tested against legend-lite (catalog-model.ts -- this file holds no type
// table), declares them in the `###Relational Database`; this wraps it in the
// `###Connection` + `###Runtime` the planner needs. The cube's COLUMNS are not decided here: the
// compiler types the source once the model is in (`sourceColumns`,
// docs/DATACUBE_TYPES_TO_SERVER_2026_09_27.md).
//
// Generating the model rather than special-casing "uploaded" data is
// the whole point. Everything downstream -- the planner, the tree
// assembly, the SQL panel, the snap plane -- sees an ordinary model
// over an ordinary table, and none of it learns where the rows came
// from. A separate "local file mode" would be a second pipeline to
// keep in agreement with the first.
//
// Upstream's DataCube does the same thing (LocalFileDataCubeSource:
// registerFileText, insertCSVFromPath with detect:true, then
// DESCRIBE) and is CSV-only, with a warning that the format must
// have a header row and comma delimiters. We read Parquet too,
// because duckdb-wasm has it compiled in and registerFileBuffer
// makes it no harder.

import type { ValueSpecification } from '../../pure-protocol/src/index.ts';
import { catalogType, databaseFromCatalog, type CatalogColumn, type CatalogDatabase } from './catalog-model.ts';

export interface InferredModel {
  /** Pure source: database, connection, runtime. */
  readonly model: string;
  readonly runtime: string;
  /** The relation the cube reads from, as protocol. */
  readonly source: ValueSpecification;
  /** What the source must apply, and what was left out (see `CatalogDatabase`). */
  readonly conversions: CatalogDatabase['conversions'];
  readonly excluded: CatalogDatabase['excluded'];
  /**
   * The columns declared BIT (DuckDB's BOOLEAN): legend-engine types them TinyInt, and a planner
   * on engine reads them Boolean (relation-type.ts, ENGINE DEFECT S23).
   */
  readonly bitColumns: readonly string[];
}

export interface InferOptions {
  /** Table name the data was ingested under. */
  readonly table: string;
  /**
   * Its schema, when it has one: a warehouse's `sales.v_orders`. The model
   * then declares `Schema sales ( Table v_orders ... )`, and the planner
   * writes `"sales"."v_orders"` -- the same name on the warehouse and in a
   * local snap, so one model reads both.
   */
  readonly schema?: string;
  /** Package for the generated elements. Must be a valid Pure path. */
  readonly pkg?: string;
  /** See `CatalogTable.convertible`. */
  readonly convertible: boolean;
  /**
   * The SQL the table's database runs: the runtime's connection type, from which the planner
   * picks its dialect. A warehouse's Postgres catalog is `postgres`; default `duckdb`.
   */
  readonly engine?: 'duckdb' | 'postgres';
}

/**
 * Turn a table's catalog into a model the planner can compile: legend-lite's Database (written
 * here, catalog-model.ts), wrapped in a DuckDB connection and a runtime. A column of a type no
 * Database declares is refused (`CatalogRefusal`), naming it.
 */
export function inferModel(
  columns: readonly CatalogColumn[],
  options: InferOptions,
): InferredModel {
  const pkg = options.pkg ?? 'local';
  const db = databaseFromCatalog({
    path: `${pkg}::DB`,
    ...(options.schema === undefined ? {} : { schema: options.schema }),
    table: options.table,
    columns,
    convertible: options.convertible,
  });

  const model = `${db.text}
###Connection
RelationalDatabaseConnection ${pkg}::Conn
{
    type: ${options.engine === 'postgres' ? 'Postgres' : 'DuckDB'};
    specification: DuckDB { };
    auth: Test;
}

###Runtime
Runtime ${pkg}::RT
{
    mappings: [];
    connections:
    [
        ${pkg}::DB: [ c1: ${pkg}::Conn ]
    ];
}
`;

  return {
    model,
    runtime: `${pkg}::RT`,
    source: db.source,
    conversions: db.conversions,
    excluded: db.excluded,
    bitColumns: columns.filter((c) => !db.excluded.includes(c.name) && catalogType(c).declared === 'BIT').map((c) => c.name),
  };
}
