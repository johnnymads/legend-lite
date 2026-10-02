// A TABLE'S MODEL -- the Pure Database, from its database's own STRUCTURED catalog (DuckDB's, or
// Postgres's as a warehouse lists an attached catalog) -- written here,
// with no WebAssembly, whichever planner the page uses (the user, 2026-10-01). As upstream DataCube
// writes a local file's model in the browser (no server can read a database inside the tab); the
// chosen planner then compiles and types it, and its answer decides whether the table opens.
//
// It CANNOT DRIFT from legend-lite's own writer (core's CatalogModel and CatalogRules.typeOf):
//   - every type decision, per database, and DuckDB's catalog question are GENERATED from
//     legend-lite (generated/catalog-facts.ts) -- this file holds no type rule, only typeOf's
//     algorithm over that data;
//   - the assembly below is tested against what CatalogModel.database answers for a corpus of
//     real DuckDB tables and Postgres catalog rows (test/catalog-model.test.ts,
//     test/generated/catalog-corpus.ts).
// Nothing parses a type string: a column's canonical type and a DECIMAL's precision and scale come
// from the catalog as data; JSON (an alias of VARCHAR) is known by its alias name.

import { CATALOG_COLUMNS_SQL, CATALOG_RULES, type CatalogRead, type CatalogRules, type CatalogType } from './generated/catalog-facts.ts';
import type { ValueSpecification } from '../../pure-protocol/src/index.ts';

/** One column, as its database's catalog describes it (the catalog question's row). */
export interface CatalogColumn {
  readonly name: string;
  /** Its own type name, as the catalog writes it: for an alias and for messages, never parsed. */
  readonly dataType: string;
  /** Its canonical type (DuckDB's `duckdb_types().logical_type`; Postgres's base type name, or its kind:
   *  `ARRAY`, `ENUM`, ...), or null when the catalog names none. */
  readonly logicalType: string | null;
  /** A DECIMAL's precision and scale, as numbers; null for any other type. */
  readonly precision: number | null;
  readonly scale: number | null;
  /** The catalog says it holds no NULL: declared `NOT NULL`, so the compiler types it `[1]`. */
  readonly notNull: boolean;
}

/** A table's catalog, to write its Database from. */
export interface CatalogTable {
  /** The table's database type, as a Pure connection names it (`DuckDB`, `Postgres`): whose rules read its catalog. */
  readonly databaseType: string;
  /** The Database element's path, e.g. `local::DB`. */
  readonly path: string;
  readonly schema?: string;
  readonly table: string;
  readonly columns: readonly CatalogColumn[];
  /**
   * Whether the source can apply a conversion: an upload, rewritten at ingest, can; a read-only
   * warehouse table cannot, and a column that needs one to be read at all is left out (a zoned
   * timestamp needs one only in a copy: read in place, it is its UTC instant under the UTC session).
   */
  readonly convertible: boolean;
}

/** The Database for a catalog. */
export interface CatalogDatabase {
  /** `###Relational Database ...`, every column declared. */
  readonly text: string;
  /** The relation that reads the table (`#>{local::DB.t}#`), as protocol. */
  readonly source: ValueSpecification;
  /**
   * SQL over a column that a COPY of the table applies so it holds its declared type: an upload's
   * rewrite, a Snap. A read-only source reads such a column (a zoned timestamp) as stored.
   */
  readonly conversions: readonly { readonly column: string; readonly sql: string }[];
  /** Columns left out: the source cannot convert them, or no Database type holds them (bytes). */
  readonly excluded: readonly string[];
}

/** A refusal to write a Database (a type no Database holds, a name the accessor cannot carry): said, never guessed. */
export class CatalogRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogRefusal';
  }
}

/** THE catalog question for one table, its schema and table as SQL string literals. */
export function catalogColumnsSql(schema: string, table: string): string {
  const lit = (text: string): string => `'${text.replace(/'/g, "''")}'`;
  return CATALOG_COLUMNS_SQL.replace('{schema}', lit(schema)).replace('{table}', lit(table));
}

/** The rules that read a database type's catalog, or a refusal naming the type. */
export function catalogRules(databaseType: string): CatalogRules {
  const rules = CATALOG_RULES[databaseType];
  if (!rules) throw new CatalogRefusal(`legend-lite reads no catalog of database type '${databaseType}'`);
  return rules;
}

/** How a column is declared by its database's rules (CatalogRules.typeOf): an alias, the exact decimal, a decision, or refused. */
export function catalogType(column: CatalogColumn, databaseType: string): CatalogType {
  const rules = catalogRules(databaseType);
  const alias = rules.aliases[column.dataType.trim().toUpperCase()];
  if (alias) return alias;
  // absent (a catalog older than the structured listing) reads as null: no canonical type named
  const logical = column.logicalType == null ? null : column.logicalType.toUpperCase();
  if (logical === rules.decimal) {
    if (column.precision !== null && column.scale !== null) {
      return { read: 'AS_STORED', declared: `DECIMAL(${column.precision},${column.scale})`, conversion: null, reason: null };
    }
    if (rules.unsizedDecimal !== null) return rules.unsizedDecimal;
    throw new CatalogRefusal(`a ${rules.decimal} column whose catalog gives no precision and scale ('${column.dataType}') cannot be declared`);
  }
  const known = logical === null ? undefined : rules.types[logical];
  if (known) return known;
  const why = logical === null ? undefined : rules.refused[logical];
  throw new CatalogRefusal(`a column of ${rules.database} type '${column.dataType}' cannot be declared in a Pure Database (${
    why ?? (logical === null ? 'its catalog names no canonical type' : 'a type this dialect does not read')})`);
}

/**
 * The Database for a table's catalog (CatalogModel.database): `###Relational Database <path> (
 * [Schema s (] Table t ( col TYPE, ... ) [)] )`. A column of a type no Database declares is
 * refused, naming the column; so are two columns one name apart only by case, and a schema or
 * table name the accessor cannot carry.
 */
export function databaseFromCatalog(t: CatalogTable): CatalogDatabase {
  const schema = t.schema ?? null;
  if (t.columns.length === 0) throw new CatalogRefusal(`the table '${t.table}' has no columns`);
  accessorName('schema', schema);
  accessorName('table', t.table);
  const lines: string[] = [];
  const conversions: { column: string; sql: string }[] = [];
  const excluded: string[] = [];
  const seen = new Set<string>();
  for (const c of t.columns) {
    const lower = c.name.toLowerCase();
    if (seen.has(lower)) throw new CatalogRefusal(`the table '${t.table}' has two columns named '${c.name}'`);
    seen.add(lower);
    let type: CatalogType;
    try {
      type = catalogType(c, t.databaseType);
    } catch (e) {
      throw new CatalogRefusal(`column '${c.name}': ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!readsFrom(type.read, t.convertible) || type.declared === null) {
      excluded.push(c.name);
      continue;
    }
    lines.push(`${ident(c.name)} ${type.declared}${c.notNull ? ' NOT NULL' : ''}`);
    // what a copy applies (CatalogModel.database): every declared column's conversion
    if (type.conversion !== null) {
      conversions.push({ column: c.name, sql: type.conversion.replace('%s', sqlIdent(c.name)) });
    }
  }
  if (lines.length === 0) {
    throw new CatalogRefusal(`no column of '${t.table}' can be read from its source: ${excluded.join(', ')}`);
  }
  const tableBlock = `Table ${ident(t.table)}\n    (\n        ${lines.join(',\n        ')}\n    )`;
  const body = schema === null ? `    ${tableBlock}`
    : `    Schema ${ident(schema)}\n    (\n        ${tableBlock.replace(/\n/g, '\n    ')}\n    )`;
  const parts = [t.path, ...(schema === null ? [] : [ident(schema)]), ident(t.table)];
  return {
    text: `###Relational\nDatabase ${t.path}\n(\n${body}\n)\n`,
    // as the compiler parses the accessor: each part as the Database spells it
    source: { _type: 'classInstance', type: '>', value: { path: parts } } as unknown as ValueSpecification,
    conversions,
    excluded,
  };
}

/**
 * Whether a column read this way is declared on a source that can (or cannot) convert
 * (CatalogModel.database): a COPY_CONVERTED column (a zoned timestamp) reads as stored in place,
 * under the UTC session.
 */
function readsFrom(read: CatalogRead, convertible: boolean): boolean {
  switch (read) {
    case 'AS_STORED':
    case 'COPY_CONVERTED':
      return true;
    case 'CONVERTED':
      return convertible;
    case 'LEFT_OUT':
      return false;
  }
}

/**
 * A schema or table name the accessor can carry. Upstream reads `#>{db.schema.table}#` by splitting
 * on `.`, and the accessor's grammar refuses `( ) { } | ; =` and a line break.
 */
function accessorName(what: string, name: string | null): void {
  if (name !== null && /[.(){}|;=\n]/.test(name)) {
    throw new CatalogRefusal(`the ${what} name '${name}' cannot be read through #>{db.${what}}#: a '.', '(', ')', '{', '}', '|', ';',`
      + ` '=' or line break cannot be carried there`);
  }
}

/** A name as a Pure Database identifier: bare when it is one, else quoted with the lexer's backslash escapes. */
function ident(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** A name as a SQL identifier, always quoted, for a conversion's column reference. */
function sqlIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
