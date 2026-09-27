// A file becomes a cube: infer the schema, then WRITE THE MODEL.
//
// This is what lets someone open the page and drop a file in, rather
// than hand-authoring a Pure model that happens to match their
// columns. DuckDB sniffs the types and reports them (`DESCRIBE`, or a
// warehouse's catalog); legend-lite's DuckDB dialect reads those into the
// `###Relational Database` (T2: `WasmPlanner.databaseFromCatalog`, the
// compiler's own reading -- this file holds no type table); this wraps it
// in the `###Connection` + `###Runtime` the planner needs. The cube's COLUMNS are not decided here: the
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


/** One column, as DuckDB's `DESCRIBE` reports it. */
export interface DescribedColumn {
  readonly name: string;
  /** DuckDB's own type name, e.g. 'VARCHAR', 'BIGINT', 'DECIMAL(9,2)'. */
  readonly type: string;
}

/** A table's catalog, as the compiler's builder takes it. */
export interface CatalogTable {
  /** The Database element's path, e.g. `local::DB`. */
  readonly path: string;
  readonly schema?: string;
  readonly table: string;
  readonly columns: readonly DescribedColumn[];
  /**
   * Whether the source can apply a conversion: an upload, rewritten at ingest, can; a
   * read-only warehouse table cannot, and a column that needs one is left out.
   */
  readonly convertible: boolean;
}

/** The compiler's Database for a catalog. */
export interface CatalogDatabase {
  /** `###Relational Database ...`, every column declared by the dialect. */
  readonly text: string;
  /** The relation expression that reads the table: `#>{local::DB.t}#`. */
  readonly accessor: string;
  /** SQL over a column the source must apply so it holds its declared type. */
  readonly conversions: readonly { readonly column: string; readonly sql: string }[];
  /** Columns left out because the source cannot convert them. */
  readonly excluded: readonly string[];
}

/** The compiler's builder: `WasmPlanner.databaseFromCatalog`. */
export type CatalogBuilder = (table: CatalogTable) => Promise<CatalogDatabase>;

export interface InferredModel {
  /** Pure source: database, connection, runtime. */
  readonly model: string;
  readonly runtime: string;
  /** The relation expression the cube reads from. */
  readonly source: string;
  /** What the source must apply, and what was left out (see `CatalogDatabase`). */
  readonly conversions: CatalogDatabase['conversions'];
  readonly excluded: CatalogDatabase['excluded'];
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
}

/**
 * Turn a table's catalog into a model the planner can compile: the compiler's Database,
 * wrapped in a DuckDB connection and a runtime.
 */
export async function inferModel(
  build: CatalogBuilder,
  described: readonly DescribedColumn[],
  options: InferOptions,
): Promise<InferredModel> {
  const pkg = options.pkg ?? 'local';
  const db = await build({
    path: `${pkg}::DB`,
    ...(options.schema === undefined ? {} : { schema: options.schema }),
    table: options.table,
    columns: described,
    convertible: options.convertible,
  });

  const model = `${db.text}
###Connection
RelationalDatabaseConnection ${pkg}::Conn
{
    type: DuckDB;
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
    source: db.accessor,
    conversions: db.conversions,
    excluded: db.excluded,
  };
}
