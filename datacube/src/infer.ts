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
  /**
   * The runtime a COPY of the table is planned against (`InferOptions.snapDatabaseType`): the same
   * Database, through a connection of the copy's store's type. Present only when asked for.
   */
  readonly snapRuntime?: string;
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
   * The table's database type, as a Pure connection names it (`DuckDB`, `Postgres`): the runtime's
   * connection `type`, from which the planner picks its dialect. Given by where the table is -- the
   * tab's engine (`QueryEngine.databaseType`) or a warehouse catalog (`CatalogObject.databaseType`).
   */
  readonly databaseType: string;
  /**
   * The database type of the store a Snap copies the table into (the tab's engine,
   * `QueryEngine.databaseType`), when it can be snapped. The model then also carries a second
   * runtime over the SAME Database (`snapRuntime`): the rows are pulled with a plan against the
   * table's own runtime, and every query on the copy is planned against this one, so a Postgres
   * table's copy in the tab's DuckDB is queried in DuckDB's SQL (leg C,
   * docs/DATACUBE_APP_PLAN_2026_10_02.md).
   */
  readonly snapDatabaseType?: string;
}

/**
 * Turn a table's catalog into a model the planner can compile: legend-lite's Database (written
 * here, catalog-model.ts), wrapped in a DuckDB connection and a runtime. A column of a type no
 * Database declares is refused (`CatalogRefusal`), naming it. Given `snapDatabaseType`, the model
 * carries the snap runtime too, and says so in its type.
 */
export function inferModel(
  columns: readonly CatalogColumn[],
  options: InferOptions & { readonly snapDatabaseType: string },
): InferredModel & { readonly snapRuntime: string };
export function inferModel(columns: readonly CatalogColumn[], options: InferOptions): InferredModel;
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
    databaseType: options.databaseType,
  });

  const model = `${db.text}
###Connection
RelationalDatabaseConnection ${pkg}::Conn
{
    type: ${options.databaseType};
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
${options.snapDatabaseType === undefined ? '' : `
###Connection
RelationalDatabaseConnection ${pkg}::SnapConn
{
    type: ${options.snapDatabaseType};
    specification: DuckDB { };
    auth: Test;
}

###Runtime
Runtime ${pkg}::SnapRT
{
    mappings: [];
    connections:
    [
        ${pkg}::DB: [ c1: ${pkg}::SnapConn ]
    ];
}
`}`;

  return {
    model,
    runtime: `${pkg}::RT`,
    ...(options.snapDatabaseType === undefined ? {} : { snapRuntime: `${pkg}::SnapRT` }),
    source: db.source,
    conversions: db.conversions,
    excluded: db.excluded,
    bitColumns: columns.filter((c) => !db.excluded.includes(c.name) && catalogType(c, options.databaseType).declared === 'BIT').map((c) => c.name),
  };
}
