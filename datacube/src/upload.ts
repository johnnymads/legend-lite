// Getting a picked file into DuckDB, and out again as a schema.
//
// Kept apart from `infer.ts` on purpose: this half touches the
// duckdb-wasm handle and the browser's File object, the other half is
// pure text-in text-out and is therefore the half worth unit testing.

import type { QueryEngine } from './engine.ts';
import type { RawTable } from './engine.ts';
import type { Scalar } from './result.ts';
import {
  inferModel,
  type CatalogBuilder,
  type DescribedColumn,
  type InferredModel,
} from './infer.ts';

/**
 * The duckdb-wasm surface used here.
 *
 * Declared structurally rather than imported so that this file, and
 * the tests around it, do not drag in the 36 MB package.
 */
export interface DuckDbFiles {
  registerFileText(name: string, text: string): Promise<void>;
  registerFileBuffer(name: string, buffer: Uint8Array): Promise<void>;
  /** Let go of a registered file's bytes (DuckDB-WASM's `dropFile`). */
  dropFile?(name: string): Promise<unknown>;
}

export type UploadFormat = 'csv' | 'parquet' | 'json';

export interface UploadResult extends InferredModel {
  readonly table: string;
  readonly rowCount: number;
  readonly fileName: string;
}

/** DuckDB's identifier quoting: the doubled quote, not a backslash. */
function dq(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Guess by extension; the picker allows only these. JSON covers both a
 * document holding an array of records and newline-delimited records
 * -- DuckDB's reader tells them apart itself.
 */
export function formatOf(fileName: string): UploadFormat {
  if (/\.parquet$/i.test(fileName)) return 'parquet';
  if (/\.(json|jsonl|ndjson)$/i.test(fileName)) return 'json';
  return 'csv';
}

/**
 * A table name derived from the file, safe to interpolate.
 *
 * The name reaches both SQL and a Pure Database declaration, and a
 * file can be called anything at all, so everything outside
 * [A-Za-z0-9_] goes. A leading digit gets a prefix because a bare
 * `2024_trades` is not an identifier.
 */
export function tableNameOf(fileName: string): string {
  const stem = fileName.replace(/\.[^.]*$/, '');
  const cleaned = stem.replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'data';
  return /^[0-9]/.test(cleaned) ? `t_${cleaned}` : cleaned;
}

/**
 * Read a picked file into DuckDB and describe what arrived.
 *
 * CSV goes in as text with `read_csv(..., AUTO_DETECT)` so DuckDB
 * sniffs the header and types; Parquet goes in as bytes and carries
 * its own schema. Either way the result is a real table, and from
 * there `DESCRIBE` is the only thing that says what the columns are
 * -- guessing from the file would be a second, worse sniffer.
 */
/**
 * An upload that was overtaken before its cube was built (a newer open won): its table and its
 * file's bytes go, so an open abandoned half-way leaves nothing held in the tab. The caller
 * makes sure no cube reads a table of the same name.
 */
export async function forgetUpload(engine: QueryEngine, db: DuckDbFiles, fileName: string): Promise<void> {
  const table = tableNameOf(fileName);
  await engine.run(`DROP TABLE IF EXISTS ${dq(table)}`, 0);
  await db.dropFile?.(`upload_${table}.${formatOf(fileName)}`);
}

export async function ingestFile(
  engine: QueryEngine,
  db: DuckDbFiles,
  file: { name: string; text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer> },
  build: CatalogBuilder,
): Promise<UploadResult> {
  const format = formatOf(file.name);
  const table = tableNameOf(file.name);
  // A fixed virtual filename per table: re-picking a file replaces
  // the registration rather than accumulating them.
  const virtualName = `upload_${table}.${format}`;

  if (format === 'parquet') {
    await db.registerFileBuffer(virtualName,
      new Uint8Array(await file.arrayBuffer()));
  } else {
    await db.registerFileText(virtualName, await file.text());
  }

  const reader = format === 'parquet'
    ? `read_parquet('${virtualName}')`
    : format === 'json'
      // Each record's top-level keys become columns; anything nested
      // below them arrives as a STRUCT or a LIST, kept as it is (a Variant).
      ? `read_json('${virtualName}', auto_detect=true)`
      // AUTO_DETECT sniffs delimiter, quoting and types. Upstream's
      // DataCube requires a header row and comma delimiters; DuckDB's
      // sniffer handles more than that, so there is no reason to
      // impose the narrower rule.
      : `read_csv('${virtualName}', AUTO_DETECT=TRUE, HEADER=TRUE)`;

  // The user's own column names, unchanged. An earlier version
  // renamed anything that was not a plain identifier, because a
  // quote in a header broke the model and a space broke groupBy and
  // sort. Both were core defects -- the lexer's escape is a
  // backslash, and name resolution compared a quoted wire name
  // against a bare reference -- and both are fixed there now, so
  // mangling the user's headers to route around them would be
  // keeping a workaround that has outlived its bug.
  // Quote the table name: it comes from a FILENAME, and `pivot.csv`
  // produced `CREATE OR REPLACE TABLE pivot AS …`, which is a syntax
  // error because pivot is reserved in DuckDB. tableNameOf already
  // strips it to [A-Za-z0-9_], so quoting is all that is left.
  const qt = dq(table);
  await engine.run(
    `CREATE OR REPLACE TABLE ${qt} AS SELECT * FROM ${reader}`, 0);

  // The compiler reads DESCRIBE's types (T2) and says which columns the
  // table must convert to hold what the model declares: a TIMESTAMPTZ its UTC
  // timestamp, a UBIGINT an exact DECIMAL(20,0), a UUID or TIME its text. A
  // nested STRUCT or LIST needs none: it is a Variant as stored
  // (docs/VARIANT_STORAGE_CENSUS_2026_09_27.md). An upload is ours to
  // rewrite, so it is rewritten here.
  const inferred = await inferModel(build, await describeTable(engine, qt),
    { table, convertible: true });
  if (inferred.conversions.length > 0) {
    const replaced = inferred.conversions
      .map((c) => `${c.sql} AS ${dq(c.column)}`).join(', ');
    await engine.run(
      `CREATE OR REPLACE TABLE ${qt} AS SELECT * REPLACE (${replaced}) `
        + `FROM ${qt}`, 0);
  }

  const counted = await engine.run(
    `SELECT count(*) AS n FROM ${qt}`, 0);
  const rowCount = Number(counted.columns[0]?.values[0] ?? 0);

  return {
    ...inferred,
    table,
    rowCount,
    fileName: file.name,
  };
}

/**
 * The table's columns and DuckDB types. A RawTable is COLUMNAR, so
 * DESCRIBE's answer is read by picking the two columns out and zipping
 * them, not row by row.
 */
async function describeTable(
  engine: QueryEngine,
  qt: string,
): Promise<DescribedColumn[]> {
  const describe = await engine.run(`DESCRIBE ${qt}`, 0);
  const names = columnOf(describe, 'column_name');
  const types = columnOf(describe, 'column_type');
  return names.map((n, i) => ({
    name: String(n),
    type: String(types[i] ?? 'VARCHAR'),
  }));
}

/** One column of a DESCRIBE result, by name. */
function columnOf(t: RawTable, name: string): readonly Scalar[] {
  const col = t.columns.find((c) => c.name === name);
  if (!col) {
    throw new Error(`DESCRIBE did not return ${name} — got `
      + t.columns.map((c) => c.name).join(', '));
  }
  return col.values;
}
