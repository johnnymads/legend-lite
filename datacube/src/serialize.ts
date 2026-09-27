// Snapshot -> Pure relation grammar, the text legend-lite compiles.
//
// This is the only place that knows the grammar. Every syntax form
// emitted here was taken from legend-lite's own test corpus rather than
// inferred, because a plausible-looking function name that the compiler
// rejects is the easiest possible way to waste a day:
//
//   sort        sort([~id->ascending(), ~name->ascending()])
//   slice       slice(1, 3)                 -- offset and END, not count
//   limit       limit(2)
//   select      select(~[NAME, deptName])
//   extend      extend(~[deptName: __r|$__r.n1.NAME])
//   groupBy     groupBy(~[grp], ~[total:x|$x.id:y|$y->count()])
//   distinct    select(~[year])->distinct()
//   if          if($x.year == 2021, |$x.notional, |[])
//   concatenate concatenate($b)
//
// A PIVOT IS WRITTEN AS A GROUPBY (docs/DATACUBE_CUBE_PLAN_DESIGN_2026_09_27.md):
// one conditional aggregate per value and measure -- the measure over
// exactly the rows of that value -- beside the Total and every carried
// column, in ONE groupBy over the level's keys. The values come first,
// from their own query (`pivotValuesQuery`, run by plan.ts).

import {
  CubeRefusal,
  columnType,
  LEAF_COUNT_COLUMN,
  PIVOT_TOTAL_KEY,
  isJsonValue,
  isRelativeDate,
  referencedColumns,
  rowColumns,
  totalOrderSorts,
  WINDOW_FUNCTIONS,
  type AggregateFn,
  type ColumnKind,
  type CubeSnapshot,
  type FilterNode,
  type FilterValue,
  type Measure,
  type SortSpec,
  type DerivedColumn,
  type WindowSpec,
} from './snapshot.ts';
import type { RowPath } from './tree.ts';
import { ROOT_COLUMN } from './grid/columns.ts';
import { PIVOT_SEPARATOR } from './generated/lite-facts.ts';
import { isBoolean, isNumeric, isTemporal, isVariant } from './types.ts';

/** What the grand total's synthetic key holds. Upstream's value. */
const ROOT_VALUE = '[ROOT]';

/** Identifiers that are not plain alphanumerics need quoting. */
const PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Escape the inside of a single-quoted Pure string.
 *
 * THE BACKSLASH GOES FIRST, and the order is the whole point. Escaping
 * quotes alone turns a trailing backslash into an escape for the
 * CLOSING quote: `C:\` became `'C:\'`, an unterminated literal, and
 * `back\'` became `'back\''`, where the user's text stops being a
 * value and starts being grammar. The first is a crash from a path
 * somebody pasted; the second is injection, and a filter travels
 * inside a saved view that one person can hand to another.
 *
 * Escaping the backslash first makes the quote escape unambiguous,
 * because by then every backslash in the text is already doubled.
 */
function escapePure(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function ident(name: string): string {
  return PLAIN_IDENT.test(name) ? name : `'${escapePure(name)}'`;
}

/** A column reference on the lambda parameter, e.g. `$x.'odd name'`. */
function colRef(param: string, name: string): string {
  return `$${param}.${ident(name)}`;
}

/**
 * A date or a timestamp, in LOCAL terms and to the precision it has.
 *
 * Two decisions, and both were wrong before.
 *
 * LOCAL, not UTC. Every Date in this product is built in local terms
 * -- a date column arrives as epoch milliseconds and is rebuilt at
 * LOCAL midnight, which is what the grid then displays. Reading it
 * back with `toISOString()` shifts it: local midnight in New York is
 * 05:00 UTC the same day, but local midnight in Sydney is 13:00 UTC
 * the day BEFORE, so a filter built from a displayed date would name
 * a different day than the one on screen. This is the fourth
 * timezone fault in this area; every one of them came from mixing the
 * two frames.
 *
 * FULL PRECISION when there is any. A date keeps ten characters, but
 * a timestamp keeps its time, because truncating one made a group key
 * match its whole DAY -- drilling into a single minute of trading
 * returned every trade that day. A wrong answer with no error is
 * worse than an error. Midnight still prints as a plain date, which
 * compares correctly against a timestamp column anyway, and the core
 * parses both forms (`SpecParser.parseDateOrDateTime`).
 */
export function temporalLiteral(v: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const day = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  const midnight =
    v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0;
  return midnight
    ? `%${day}`
    : `%${day}T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`;
}

/** The exact texts values.ts writes: a day, a timestamp, a time of day; an exact number. */
const TEMPORAL_TEXT = /^(-?\d{4,}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?)?|\d{2}:\d{2}:\d{2}(\.\d+)?)$/;
const EXACT_NUMBER = /^-?\d+(\.\d+)?$/;

/** A column's compiler type, by name: how a value's literal is spelled (T3). */
export type TypeOf = (column: string) => string | undefined;

/**
 * A value as a Pure literal. `type` is its column's COMPILER type: a cell's date, timestamp,
 * time or decimal is the database's exact text (values.ts), so the type -- never the
 * text's JS type -- says it is a `%2024-01-02`, a `%2024-01-02T03:04:05.123456` or an
 * exact number. (T4 replaces this spelling with typed protocol-JSON nodes, decision D2.)
 */
export function literal(v: FilterValue, type?: string): string {
  if (isRelativeDate(v)) return v.relative === 'today' ? 'today()' : 'now()';
  if (isJsonValue(v)) return `fromJson('${escapePure(v.json)}')`;
  if (typeof v === 'string' && isTemporal(type) && TEMPORAL_TEXT.test(v)) {
    return `%${v.replace(' ', 'T')}`;
  }
  if (typeof v === 'string' && isNumeric(type) && EXACT_NUMBER.test(v)) return v;
  if (typeof v === 'string') return `'${escapePure(v)}'`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return temporalLiteral(v);
  if (Number.isInteger(v)) return String(v);
  return String(v);
}

/**
 * The map and reduce halves of an aggregate.
 *
 * `count` maps to the constant 1 rather than to a column, which is what
 * makes it null-insensitive and lets it work on a snapshot with no
 * numeric column at all. `wavg` needs a weight column and is rejected
 * without one, rather than silently degrading to a plain average --
 * a wrong weighted average is worse than an error.
 *
 * `when`, for a PIVOT CELL: the map yields its value only on the rows
 * of the cell's pivot value and nothing (`[]`) elsewhere, so the reduce
 * sees exactly that value's rows -- `AVG(CASE WHEN year = 2021 THEN
 * notional END)`. Every aggregate ignores the empties, so every one is
 * right, the average and the median included.
 */
function aggregateLambdas(m: Measure, when?: string): { map: string; reduce: string } {
  const only = (value: string): string =>
    when === undefined ? value : `if(${when}, |${value}, |[])`;
  switch (m.fn) {
    case 'count':
      return { map: `x|${only('1')}`, reduce: 'y|$y->count()' };
    case 'wavg': {
      if (!m.weight) {
        throw new CubeRefusal(
          `measure '${m.name}' uses wavg but has no weight column`,
        );
      }
      // The weight has to be captured in the MAP, where the row is
      // still in scope. Reducing over the value alone and reaching
      // for the weight in the reduce -- which is what this did --
      // cannot work: by then `$y` is a collection of the mapped
      // NUMBERS and the weight column is long gone. The engine says
      // so in as many words ("cannot access 'w' on Float"), and it
      // said it the first time this ran against a real engine rather
      // than a stub.
      //
      // wavgRowMapper pairs each value with its weight as the map
      // result, so the reduce is a plain wavg() over the pairs. In a
      // pivot cell BOTH halves are conditional: the pair is (value,
      // weight) on the cell's rows and (empty, empty) elsewhere, which
      // both sums of the weighted average skip.
      return {
        map: `x|${only(colRef('x', m.column))}->wavgRowMapper(${only(colRef('x', m.weight))})`,
        reduce: `y|$y->wavg()`,
      };
    }
    case 'joinStrings':
      return {
        map: `x|${only(colRef('x', m.column))}`,
        reduce: `y|$y->joinStrings(', ')`,
      };
    case 'unique':
      return {
        map: `x|${only(colRef('x', m.column))}`,
        reduce: `y|$y->uniqueValueOnly()`,
      };
    default: {
      const fn: AggregateFn = m.fn;
      return {
        map: `x|${only(colRef('x', m.column))}`,
        reduce: `y|$y->${fn}()`,
      };
    }
  }
}

function aggregateSpec(m: Measure, when?: string): string {
  const { map, reduce } = aggregateLambdas(m, when);
  return `${ident(m.name)}:${map}:${reduce}`;
}

const COMPARISON: Partial<Record<string, string>> = {
  equal: '==',
  notEqual: '!=',
  lessThan: '<',
  lessThanEqual: '<=',
  greaterThan: '>',
  greaterThanEqual: '>=',
};

/** Column-to-column comparisons, sharing the operators above. */
const COLUMN_COMPARISON: Partial<Record<string, string>> = {
  equalColumn: '==',
  equalCaseInsensitiveColumn: '==',
  notEqualColumn: '!=',
  notEqualCaseInsensitiveColumn: '!=',
  lessThanColumn: '<',
  lessThanEqualColumn: '<=',
  greaterThanColumn: '>',
  greaterThanEqualColumn: '>=',
};

/**
 * A literal, lower-cased BY PURE rather than by us.
 *
 * `toLower('EMEA')` instead of `'emea'`. It reads as the same
 * comparison on both sides -- column and value through the same
 * function -- which is how upstream writes it
 * (DataCubeQueryFilterOperation__EqualCaseInsensitive:
 * `equal(toLower(toOne($x.col)), toLower(value))`), and it keeps the
 * lowering rule the ENGINE's rather than JavaScript's. They are not
 * the same rule: JS lower-cases by Unicode default casing, a
 * database by its collation.
 */
function lowerLiteral(v: FilterValue): string {
  return typeof v === 'string' ? `toLower(${literal(v)})` : literal(v);
}

/**
 * A column, ready for `toLower`.
 *
 * A relational column is `[0..1]` -- nullable -- and `toLower` takes
 * `String[1]`, so the real engine refuses `$x.region->toLower()`
 * outright: "Can't find a match for function
 * 'toLower(Varchar(32)[0..1])'". Nine of our filter operators were
 * unusable upstream for want of this one call. `toOne` is what
 * upstream inserts, in exactly this position.
 */
function lowerRef(ref: string): string {
  return `${ref}->toOne()->toLower()`;
}

/** A literal already lower-cased, for the `in` lists. See below. */
function preLowered(v: FilterValue): string {
  return typeof v === 'string' ? literal(v.toLowerCase()) : literal(v);
}

export function filterExpression(node: FilterNode, param = 'x', typeOf: TypeOf = () => undefined): string {
  switch (node.kind) {
    case 'and':
    case 'or': {
      if (node.children.length === 0) {
        // An empty group is a no-op, not an error: the UI can hold one
        // while the user is still building a condition.
        return node.kind === 'and' ? 'true' : 'false';
      }
      const op = node.kind === 'and' ? ' && ' : ' || ';
      const parts = node.children.map((c) => filterExpression(c, param, typeOf));
      return parts.length === 1 ? parts[0]! : `(${parts.join(op)})`;
    }
    case 'not':
      return `!(${filterExpression(node.child, param, typeOf)})`;
    case 'condition': {
      const ref = colRef(param, node.column);
      const lower = lowerRef(ref);
      const type = typeOf(node.column);
      const one = () => literal(node.value as FilterValue, type);
      const many = () => (node.value as readonly FilterValue[]) ?? [];

      const cmp = COMPARISON[node.operator];
      if (cmp) return `${ref} ${cmp} ${one()}`;

      const colCmp = COLUMN_COMPARISON[node.operator];
      if (colCmp) {
        if (!node.rightColumn) {
          throw new CubeRefusal(
            `operator '${node.operator}' on '${node.column}' needs a rightColumn`,
          );
        }
        // Case-insensitive column comparisons lower BOTH columns, for
        // the same reason the literal forms do: collation differs
        // between backends, and the same cube must not answer
        // differently on two engines.
        const insensitive = node.operator.includes('CaseInsensitive');
        const right = colRef(param, node.rightColumn);
        return insensitive
          ? `${lowerRef(ref)} ${colCmp} ${lowerRef(right)}`
          : `${ref} ${colCmp} ${right}`;
      }

      switch (node.operator) {
        case 'isEmpty':
          return `${ref}->isEmpty()`;
        case 'isNotEmpty':
          // isNotEmpty is a function in its own right, so use it rather
          // than negating isEmpty: the engine's own vocabulary reads
          // better in a generated query someone has to debug.
          return `${ref}->isNotEmpty()`;
        case 'contains':
          return `${ref}->contains(${one()})`;
        case 'notContains':
          return `!${ref}->contains(${one()})`;
        case 'startsWith':
          return `${ref}->startsWith(${one()})`;
        case 'notStartsWith':
          return `!${ref}->startsWith(${one()})`;
        case 'endsWith':
          return `${ref}->endsWith(${one()})`;
        case 'notEndsWith':
          return `!${ref}->endsWith(${one()})`;
        case 'in':
          return `${ref}->in([${many().map((v) => literal(v, type)).join(', ')}])`;
        case 'notIn':
          return `!${ref}->in([${many().map((v) => literal(v, type)).join(', ')}])`;

        // Both sides are lowered rather than trusting collation, which
        // differs between backends and would let the same cube answer
        // differently on two engines.
        case 'equalCaseInsensitive':
          return `${lower} == ${lowerLiteral(node.value as FilterValue)}`;
        case 'notEqualCaseInsensitive':
          return `${lower} != ${lowerLiteral(node.value as FilterValue)}`;
        // PRE-LOWERED, like the `in` lists below and for the same
        // reason: the engine's dialect translation cannot render
        // `toLower(<literal>)` in this position. Measured against a
        // running legend-engine 4.138.5 --
        // `toLower(col)->contains(toLower('rates'))` dies with a
        // StackOverflowError inside sqlDialect.pure, and
        // startsWith/endsWith with "Match failure: TypedFunction" --
        // while the identical query with a plain literal executes and
        // returns the right rows. Curiously `equal` DOES accept
        // `toLower(<literal>)`, which is why equalCaseInsensitive is
        // spelled the upstream way above; the inconsistency is the
        // engine's, not ours.
        //
        // The cost is the one the `in` lists already pay: the LITERAL
        // is folded by JavaScript's Unicode default casing while the
        // COLUMN is folded by the database's collation. Identical for
        // ASCII, and not for Turkish dotless i or German sharp s. A
        // working operator with that caveat beats one that cannot run.
        case 'containsCaseInsensitive':
          return `${lower}->contains(${preLowered(node.value as FilterValue)})`;
        case 'startsWithCaseInsensitive':
          return `${lower}->startsWith(${preLowered(node.value as FilterValue)})`;
        case 'endsWithCaseInsensitive':
          return `${lower}->endsWith(${preLowered(node.value as FilterValue)})`;
        // IN TAKES LITERALS, and only literals: the engine asserts
        // "IN is supported only for literal values or negative
        // numbers", so these two cannot wrap their values in
        // `toLower` the way every other case-insensitive comparison
        // does. The values are lowered here instead -- the one place
        // the rule is JavaScript's rather than the engine's, and the
        // reason upstream ships no builder for these two at all.
        case 'inCaseInsensitive':
          return `${lower}->in([${many().map(preLowered).join(', ')}])`;
        case 'notInCaseInsensitive':
          return `!${lower}->in([${many().map(preLowered).join(', ')}])`;

        default: {
          const never: never = node.operator as never;
          throw new Error(`unhandled filter operator: ${String(never)}`);
        }
      }
    }
  }
}

/**
 * A calculated column as its `extend`: an expression over one row, or
 * a window over the rows around it.
 *
 * `level`, at the GROUP stage: which of the cube's row dimensions this
 * query groups by, and the order it shows them in. A window may only
 * name columns the level has, so a deeper dimension drops out of its
 * partition and order; an empty order takes the level's display order,
 * so a running total runs down the rows as the grid shows them.
 */
export function derivedExtend(
  d: DerivedColumn,
  level?: { readonly rows: readonly string[]; readonly present: readonly string[]; readonly order: readonly SortSpec[] },
): string {
  if (!d.window) return `extend(~[${ident(d.name)}: x|${d.expression}])`;
  let w: WindowSpec = d.window;
  if (level) {
    const here = new Set(level.present);
    const has = (c: string): boolean => here.has(c) || !level.rows.includes(c);
    const order = w.order.filter((o) => has(o.column));
    w = {
      ...w,
      partition: w.partition.filter(has),
      order: order.length > 0 ? order : level.order.filter((o) => has(o.column)),
    };
  }
  return windowExtend(d.name, w);
}

/**
 * `extend(over(partition, order, frame), ~name:{p,w,r|...})`, in the
 * forms Pure's `over` overloads take (probed against the planner,
 * 2026-09-26): partition as a column array, order as a list; with no
 * partition, the order alone -- or, to carry a frame, the general
 * `over([], [order], frame)`.
 */
export function windowExtend(name: string, w: WindowSpec): string {
  const sorts = w.order.map(
    (o) => `~${ident(o.column)}->${o.direction === 'asc' ? 'ascending' : 'descending'}()`,
  );
  const meta = WINDOW_META.get(w.fn);
  if (!meta) throw new CubeRefusal(`unknown window function '${String(w.fn)}'`);
  // A whole-partition aggregate needs no order; a ranking one refuses a
  // frame. Last value reads the whole partition unless told otherwise:
  // its default frame ends at the current row, which is always itself.
  const frameOf = (): string | undefined => {
    if (!meta.framed) return undefined;
    const f = w.frame ?? (w.fn === 'last' ? 'partition' : undefined);
    if (f === undefined) return undefined;
    if (f === 'partition') return 'rows(unbounded(), unbounded())';
    if (sorts.length === 0) return undefined; // running / moving need an order
    if (f === 'running') return 'rows(unbounded(), 0)';
    const n = Math.max(1, Math.floor(f.lastRows));
    return `rows(${-(n - 1)}, 0)`;
  };
  const frame = frameOf();
  let over: string;
  if (w.partition.length > 0) {
    const by = `~[${w.partition.map(ident).join(', ')}]`;
    over = `over(${by}${sorts.length > 0 ? `, [${sorts.join(', ')}]` : ''}${frame ? `, ${frame}` : ''})`;
  } else if (sorts.length > 0) {
    over = frame ? `over([], [${sorts.join(', ')}], ${frame})` : `over([${sorts.join(', ')}])`;
  } else {
    // One partition, no order: the whole relation. Pure has no empty
    // over(); ordering by the column read, over the whole frame, is the
    // same set of rows whatever the order.
    const key = w.column;
    if (!key) throw new CubeRefusal(`'${name}' needs an order or a partition`);
    over = `over([], [~${ident(key)}->ascending()], rows(unbounded(), unbounded()))`;
  }
  if (meta.column && !w.column) throw new CubeRefusal(`'${name}' needs a column to read`);
  if (meta.ordered && sorts.length === 0) throw new CubeRefusal(`'${name}' needs an order`);
  const read = w.column !== undefined ? `.${ident(w.column)}` : '';
  const at = (n: number | undefined): string => (n !== undefined && n !== 1 ? `, ${Math.floor(n)}` : '');
  let fn: string;
  switch (w.fn) {
    case 'sum': fn = `{p,w,r|$r${read}}:y|$y->plus()`; break;
    case 'average': fn = `{p,w,r|$r${read}}:y|$y->average()`; break;
    case 'min': fn = `{p,w,r|$r${read}}:y|$y->min()`; break;
    case 'max': fn = `{p,w,r|$r${read}}:y|$y->max()`; break;
    case 'count': fn = `{p,w,r|$r${read}}:y|$y->count()`; break;
    case 'rank': fn = '{p,w,r|$p->rank($w, $r)}'; break;
    case 'denseRank': fn = '{p,w,r|$p->denseRank($w, $r)}'; break;
    case 'rowNumber': fn = '{p,w,r|$p->rowNumber($r)}'; break;
    case 'percentRank': fn = '{p,w,r|$p->percentRank($w, $r)}'; break;
    case 'cumeDist': fn = '{p,w,r|$p->cumulativeDistribution($w, $r)}'; break;
    case 'ntile': fn = `{p,w,r|$p->ntile($r, ${Math.max(1, Math.floor(w.buckets ?? 4))})}`; break;
    case 'lag': fn = `{p,w,r|$p->lag($r${at(w.offset)})${read}}`; break;
    case 'lead': fn = `{p,w,r|$p->lead($r${at(w.offset)})${read}}`; break;
    case 'first': fn = `{p,w,r|$p->first($w, $r)${read}}`; break;
    case 'last': fn = `{p,w,r|$p->last($w, $r)${read}}`; break;
  }
  return `extend(${over}, ~[${ident(name)}:${fn}])`;
}

const WINDOW_META = new Map(WINDOW_FUNCTIONS.map((f) => [f.fn, f]));

function sortClause(sorts: readonly SortSpec[]): string {
  const keys = sorts.map(
    (s) =>
      `~${ident(s.column)}->${
        s.direction === 'asc' ? 'ascending' : 'descending'
      }()`,
  );
  return `sort([${keys.join(', ')}])`;
}

/**
 * One level of the row-group tree.
 *
 * `level` is how many row dimensions to group by: 0 is the grand
 * total, 1 the top level, and so on. `parent` pins the ancestors, so
 * expanding EMEA fetches only EMEA's children.
 *
 * A subtotal is therefore literally the same measure expression with
 * grouping columns dropped -- not a second aggregation pass that could
 * disagree with the detail underneath it.
 */
export interface LevelScope {
  readonly level: number;
  readonly parent: RowPath;
  /**
   * Cap on rows for this level. Callers pass maxRows + 1 so that the
   * presence of the extra row reports "there is more" without a
   * second counting query.
   */
  readonly limit?: number;
}

/**
 * Sentinel for a group whose key is SQL NULL.
 *
 * A group label is a rendered string, so any printable sentinel could
 * collide with a real value; this one cannot be produced by
 * formatting.
 */
export const NULL_GROUP = '\u0000null';

/**
 * Conditions pinning a branch: region == 'EMEA', and so on.
 *
 * A NULL group key cannot be matched with `==`, so it becomes an
 * isEmpty test. Without that, expanding a group whose key is null
 * silently returns no children.
 */
/**
 * A group key, turned back into the value it came from.
 *
 * Paths are TEXT -- one string per level -- so a temporal key
 * arrives here as the ISO form `groupValue` wrote. Comparing that
 * string against a timestamp column is what produced `Conversion
 * Error: invalid timestamp field format`, so the declared type of
 * the dimension decides how to read it back.
 *
 * A value that does not parse is left as text rather than turned
 * into `Invalid Date`: a filter that cannot be built is better than
 * one that silently matches nothing.
 */
function keyValue(type: string | undefined, value: string): FilterValue {
  // A Variant key is the document's JSON text, exactly as the database
  // printed it -- so it matches as a document (DuckDB compares JSON as
  // text, and this is that text).
  if (isVariant(type)) return { json: value };
  // A NUMBER or a BOOLEAN key compares as one. As text it was
  // `$x.year == '2021'`, which one engine casts and another refuses.
  // Only when the text round-trips exactly: an integer past 2^53 stays
  // text rather than becoming a neighbouring number.
  // A number or a date keeps its EXACT text; `literal` spells it by the column's type
  // (an integer past 2^53, a decimal's digits, a timestamp's microseconds all survive).
  if (isBoolean(type) && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}

/**
 * The conditions pinning a member of a hierarchy -- `columns[i] ==
 * path[i]` down its path, typed as the tree's keys are. Ad Hoc Analysis mode's
 * members use the same rule the tree's branches do.
 */
export function memberConditions(
  snapshot: CubeSnapshot,
  columns: readonly string[],
  path: RowPath,
): FilterNode[] {
  return parentConditions({ ...snapshot, rows: columns }, path);
}

function parentConditions(
  snapshot: CubeSnapshot,
  parent: RowPath,
): FilterNode[] {
  const out: FilterNode[] = [];
  // Calculated columns too: a group on one has keys of its own type.
  const typeOf = new Map(rowColumns(snapshot).map((c) => [c.name, c.type]));
  parent.forEach((value, i) => {
    const column = snapshot.rows[i];
    if (column === undefined) return;
    out.push(
      value === NULL_GROUP
        ? { kind: 'condition', column, operator: 'isEmpty' }
        : {
            kind: 'condition',
            column,
            operator: 'equal',
            value: keyValue(typeOf.get(column), value),
          },
    );
  });
  return out;
}

/**
 * The cube for ONE group's detail rows: upstream's last drilldown level,
 * where "no groupBy() is needed" -- the group's keys become a filter
 * and the rows come back as they are, sorted and capped as the cube
 * says. Group-level calculated columns still apply ("computed for each
 * row in the table, no matter whether it's a leaf-level row or an
 * aggregate"). Sorts on names only an aggregate has (a measure, a
 * pivot column) are dropped: a source row has no such column.
 *
 * A PIVOTED cube keeps its pivot, grouped by every dimension -- the
 * finest rows a pivot has, as upstream's pivot without its groupBy.
 */
export function detailSnapshot(s: CubeSnapshot, parent: RowPath): CubeSnapshot {
  const keys = parentConditions(s, parent);
  const all = [...(s.filter ? [s.filter] : []), ...keys];
  const filter: FilterNode | undefined = all.length === 0 ? undefined
    : all.length === 1 ? all[0] : { kind: 'and', children: all };
  const { filter: _old, ...rest } = s;
  void _old;
  const visible = new Set([
    ...detailColumns(s),
    ...(s.groupDerived ?? []).map((d) => d.name),
  ]);
  const base: CubeSnapshot = {
    ...rest,
    ...(filter ? { filter } : {}),
    sorts: s.sorts.filter((x) => visible.has(x.column)),
    leafCount: false,
  };
  if (s.pivotOn.length === 0) return { ...base, rows: [], measures: [] };
  const isOn = new Set(s.pivotOn);
  const dims = rowColumns(s)
    .filter((c) => c.kind === 'dimension' && !isOn.has(c.name))
    .map((c) => c.name);
  // The same pivot columns as every level above it: the cube's values,
  // not the group's, so a group with no EMEA rows shows an empty EMEA
  // column rather than a missing one.
  return { ...base, rows: dims };
}

// ---------------------------------------------------------------------------
// THE PIVOT, as two plain queries (docs/DATACUBE_CUBE_PLAN_DESIGN_2026_09_27.md).
//
// Step 1 finds the values (`pivotValuesQuery`); step 2 is one groupBy per
// level with a conditional aggregate per value and measure (`serialize`).
// Both are ordinary Pure, planned by legend-lite with static types, so a
// warehouse reader may run them and every engine answers the same SQL.
// ---------------------------------------------------------------------------

/** More value combinations than this is refused, not cut off. */
export const MAX_PIVOT_VALUES = 500;

/** The header text of a NULL pivot value's column. */
export const EMPTY_PIVOT_LABEL = '(empty)';

/**
 * Step 1's answer: the value combinations present, in header order.
 *
 * Each value is a group-key text -- what a tree path holds, NULL_GROUP
 * for a missing value -- so a pivot value and a group key become a
 * literal by one rule (`keyValue`).
 */
export interface PivotFacts {
  readonly tuples: readonly (readonly string[])[];
}

/**
 * A column the pivot makes: a CELL (one value combination crossed with
 * one measure) or a TOTAL (`tuple` null: the measure over every value).
 *
 * What a pivot column IS comes from here, never from parsing its name.
 */
export interface PivotColumn {
  readonly name: string;
  readonly measure: Measure;
  readonly tuple: readonly string[] | null;
}

/** The name of one measure's pivot total column. */
export function pivotTotalColumn(measure: string): string {
  return `${PIVOT_TOTAL_KEY}${PIVOT_SEPARATOR}${measure}`;
}

/** Whether a column is a pivot total (see `PivotTotal`). */
export function isPivotTotalColumn(name: string): boolean {
  return name.startsWith(`${PIVOT_TOTAL_KEY}${PIVOT_SEPARATOR}`);
}

/** A pivot value as its column's header shows it. */
export function pivotLabel(key: string): string {
  return key === NULL_GROUP ? EMPTY_PIVOT_LABEL : key;
}

/** The pivot keys that pivot: those not excluded from the pivot. */
export function effectivePivotOn(s: CubeSnapshot): string[] {
  const excluded = excludedFromPivot(s);
  return s.pivotOn.filter((c) => !excluded.has(c));
}

function excludedFromPivot(s: CubeSnapshot): Set<string> {
  return new Set(rowColumns(s).filter((c) => c.excludedFromPivot).map((c) => c.name));
}

/**
 * The measures a pivot spreads across its values.
 *
 * The configured ones, minus any whose column is excluded from the
 * pivot (that setting did nothing on a cube with configured measures,
 * P2-16). None configured: every measure-kind column that is neither a
 * pivot key nor excluded, on its own aggregate -- upstream's
 * `_pivotAggCols`. Nothing at all: a filler count, as upstream's
 * `_fixEmptyAggCols`, because a pivot has to show something.
 */
export function spreadMeasures(s: CubeSnapshot): Measure[] {
  const excluded = excludedFromPivot(s);
  const on = effectivePivotOn(s);
  if (s.measures.length > 0) {
    const kept = s.measures.filter((m) => !excluded.has(m.column));
    if (kept.length > 0) return kept;
  } else {
    const isOn = new Set(on);
    const specOf = columnSpecs(s);
    const synthesised = rowColumns(s)
      .filter((c) => !isOn.has(c.name) && !excluded.has(c.name) && c.kind === 'measure')
      .map((c) => defaultMeasure(c.name, specOf.get(c.name), 'sum'));
    if (synthesised.length > 0) return synthesised;
  }
  return [{ name: 'count', column: on[0] ?? '', fn: 'count' }];
}

/**
 * The columns a pivoted cube's queries make, in header order: each value
 * combination's cells, measure by measure, then the Totals when the cube
 * shows them. A deterministic function of the cube and step 1's answer,
 * so the query and every reader of its result agree on it.
 *
 * A cell is named `value__|__measure` (upstream's spelling). A name that
 * is already taken -- by a source column, or by a real value that reads
 * like a NULL's "(empty)" -- gets a `~2` suffix: names are identifiers
 * here, and nothing reads meaning out of them.
 */
export function pivotColumns(s: CubeSnapshot, facts: PivotFacts): PivotColumn[] {
  const spread = spreadMeasures(s);
  const taken = new Set([
    ...detailColumns(s),
    ...(s.groupDerived ?? []).map((d) => d.name),
  ]);
  const out: PivotColumn[] = [];
  for (const tuple of facts.tuples) {
    for (const measure of spread) {
      const base = [...tuple.map(pivotLabel), measure.name].join(PIVOT_SEPARATOR);
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base}~${n}`;
      taken.add(name);
      out.push({ name, measure, tuple });
    }
  }
  const total = s.pivotTotal;
  if (total) {
    for (const measure of spread) {
      const fn = total.functions?.[measure.column] ?? measure.fn;
      const { weight: _w, ...rest } = measure;
      const retargeted: Measure = fn === 'wavg' && measure.weight !== undefined
        ? { ...rest, fn, weight: measure.weight }
        : { ...rest, fn };
      out.push({ name: pivotTotalColumn(measure.name), measure: retargeted, tuple: null });
    }
  }
  return out;
}

/**
 * STEP 1: the pivot's value combinations, as a query of their own.
 *
 * Over the cube's filter and its row-stage calculated columns, so the
 * columns are the values present in what the cube shows -- but never a
 * group's own keys, so every tree level has the same columns. Ordered
 * by the database, each key in its configured direction, so a number
 * sorts as a number. NULLs are values: a missing key gets a column.
 * One more than the cap is asked for, so "too many" costs no count.
 *
 * Null when the cube does not pivot, or pins its values.
 */
export function pivotValuesQuery(s: CubeSnapshot): string | null {
  const on = effectivePivotOn(s);
  if (on.length === 0 || (s.pivotValues !== undefined && s.pivotValues.length > 0)) return null;
  refuseUnpivotable(s);
  const parts: string[] = [s.source.expression];
  for (const d of s.derived) parts.push(derivedExtend(d));
  if (s.filter) parts.push(`filter(x|${filterExpression(s.filter, 'x', (c) => columnType(s, c))})`);
  parts.push(`select(~[${on.map(ident).join(', ')}])`);
  parts.push('distinct()');
  parts.push(sortClause(on.map((column) => ({
    column, direction: s.pivotSort?.[column] === 'desc' ? 'desc' as const : 'asc' as const,
  }))));
  parts.push(`limit(${MAX_PIVOT_VALUES + 1})`);
  return parts.join('->');
}

/**
 * A pivot names a column after each distinct value, and a Variant's value
 * is a whole JSON document: every column would be called
 * `{"items": [...]}__|__qty`. The question is always about a value INSIDE
 * the document, so say how to get it -- before either step runs.
 */
function refuseUnpivotable(s: CubeSnapshot): void {
  const specOf = columnSpecs(s);
  for (const name of effectivePivotOn(s)) {
    if (isVariant(specOf.get(name)?.type)) {
      throw new CubeRefusal(
        `cannot pivot on '${name}': it holds JSON. Pivot on a value `
        + `extracted from it instead -- a calculated column such as `
        + `${colRef('x', name)}->get('key')->to(@String)`,
      );
    }
  }
}

/** Pinned values as step 1's answer (`pivotValues`, one key). */
export function pinnedPivotFacts(s: CubeSnapshot): PivotFacts | null {
  if (s.pivotValues === undefined || s.pivotValues.length === 0) return null;
  // A key as `groupValue` writes a tree key: a cell's exact text (a filter editor's Date,
  // until T4 types the editor's values, keeps its old local spelling)
  const p = (n: number): string => String(n).padStart(2, '0');
  const key = (v: FilterValue): string => (v instanceof Date
    ? `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
      + `T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
    : isJsonValue(v) ? v.json
      : isRelativeDate(v) ? v.relative : String(v));
  return { tuples: s.pivotValues.map((v) => [key(v)]) };
}

/** The condition a pivot cell's rows meet: each key equal to its value. */
function tupleCondition(s: CubeSnapshot, tuple: readonly string[]): string {
  const conditions = memberConditions(s, effectivePivotOn(s), tuple);
  return filterExpression(conditions.length === 1
    ? conditions[0]!
    : { kind: 'and', children: conditions }, 'x', (c) => columnType(s, c));
}

/**
 * The columns a grouped pivot carries BESIDE its cells, each on its own
 * aggregate in the same groupBy (upstream's `pivotGroupByColumns`): the
 * other dimensions take their unique value, the other measures their
 * own aggregate. A configured measure excluded from the pivot is one of
 * them, under its own name. Before, these came from a second query
 * joined in by key; now they are columns of the level's own.
 */
function carriedMeasures(s: CubeSnapshot, groupCols: readonly string[]): Measure[] {
  const excluded = excludedFromPivot(s);
  const isKey = new Set([...groupCols, ...effectivePivotOn(s)]);
  const spread = spreadMeasures(s);
  const excludedConfigured = s.measures.filter((m) => excluded.has(m.column));
  const handled = new Set([
    ...spread.map((m) => m.column),
    ...excludedConfigured.map((m) => m.column),
  ]);
  const specOf = columnSpecs(s);
  const out: Measure[] = [...excludedConfigured];
  for (const name of detailColumns(s)) {
    if (isKey.has(name) || handled.has(name)) continue;
    const spec = specOf.get(name);
    const measure = spec?.kind === 'measure'
      || (isNumeric(spec?.type) && spec?.kind === undefined);
    out.push(defaultMeasure(name, spec, measure ? 'sum' : 'unique'));
  }
  return out;
}

/**
 * Serialize a snapshot to Pure relation grammar.
 *
 * The pipeline is emitted in the order legend-lite expects, and each
 * stage is omitted entirely when it would be a no-op, so a simple cube
 * produces simple text that a human can read in a bug report.
 */
/** No grouping, no pivot, no measures: rows straight through. */
function isDetail(s: CubeSnapshot): boolean {
  return (
    s.rows.length === 0 && s.pivotOn.length === 0 && s.measures.length === 0
  );
}

/**
 * Every column an aggregate default may consult, derived included.
 *
 * A calculated column has a type once a result has landed (see
 * `DerivedColumn.type`), and the default has to see it: a numeric one
 * must sum like any other number rather than fall through to `unique`.
 * Source columns win a name collision, which cannot happen anyway --
 * `nameProblem` refuses it in the editor.
 */
interface SpecLike {
  readonly name: string;
  readonly type?: string;
  readonly kind?: ColumnKind;
  readonly aggregate?: AggregateFn;
  readonly aggregateWeight?: string;
}

function columnSpecs(s: CubeSnapshot): Map<string, SpecLike> {
  const out = new Map<string, SpecLike>();
  for (const d of [...s.derived, ...(s.groupDerived ?? [])]) {
    // The DECLARED kind wins over the type, exactly as it does for a
    // source column: `kindOf` reads an explicit kind first, and a
    // calculated column the user called a dimension must not sum
    // because its values happen to be numeric.
    out.set(d.name, {
      name: d.name,
      ...(d.type === undefined ? {} : { type: d.type }),
      ...(d.kind === undefined ? {} : { kind: d.kind }),
      ...(d.aggregate === undefined ? {} : { aggregate: d.aggregate }),
      ...(d.aggregateWeight === undefined
        ? {}
        : { aggregateWeight: d.aggregateWeight }),
    });
  }
  for (const c of s.columns) out.set(c.name, c);
  return out;
}

/**
 * The aggregate a column takes when nothing configured a MEASURE for
 * it: Column Properties > Aggregation when set (census §2 -- the
 * dropdown reached no query before), else the kind's default.
 */
function defaultMeasure(
  name: string,
  spec: SpecLike | undefined,
  fallback: AggregateFn,
): Measure {
  return {
    name,
    column: name,
    fn: spec?.aggregate ?? fallback,
    ...(spec?.aggregateWeight !== undefined
      ? { weight: spec.aggregateWeight }
      : {}),
  };
}

/**
 * Every column available BEFORE aggregation: the source's, plus the
 * row-stage calculated ones.
 *
 * `groupDerived` is deliberately absent. Those are extended AFTER the
 * groupBy -- that is the whole point of the stage -- so naming one in
 * the projection asks the source for a column that does not exist
 * yet. It did, and the planner said so: "unknown column 'margin' in
 * (region:String[0..1], ...)". Every group-stage calculated column
 * was unusable for as long as that line was here.
 */
function detailColumns(s: CubeSnapshot): string[] {
  return [
    ...s.columns.map((c) => c.name),
    ...s.derived.map((d) => d.name),
  ];
}

/**
 * Whether this query can only ever return ONE row.
 *
 * True for an aggregate with nothing to group by -- the grand total.
 * False for a detail query, which also has no grouping but returns
 * every row, and therefore very much wants a sort and a cap.
 */
function isSingleRow(
  s: CubeSnapshot,
  groupCols: readonly string[],
  grandTotal = false,
): boolean {
  return (
    groupCols.length === 0
    && (grandTotal || s.measures.length > 0 || s.pivotOn.length > 0)
  );
}

export function serialize(
  snapshot: CubeSnapshot,
  scope?: LevelScope,
  /** Step 1's answer; required when the cube pivots (see plan.ts). */
  pivot?: PivotFacts,
): string {
  const parts: string[] = [snapshot.source.expression];
  // Grouping columns for this level. With no scope the cube is flat
  // and every row dimension groups, which is the original behaviour.
  const groupCols = scope
    ? snapshot.rows.slice(0, Math.max(0, scope.level))
    : snapshot.rows;
  // THE ROOT OF A GROUPED CUBE IS A GROUP. Level 0 under row
  // dimensions is the grand total whether or not a measure was
  // configured -- and without this, a cube with no explicit measures
  // (every uploaded file) sent `t->limit(1001)` for it: the "Total"
  // row showed the FIRST TRADE's values, and the 1,001 raw rows set
  // off the truncation warning.
  const grandTotal = scope !== undefined && scope.level === 0
    && snapshot.rows.length > 0;

  for (const d of snapshot.derived) parts.push(derivedExtend(d));

  const conditions: FilterNode[] = [];
  if (snapshot.filter) conditions.push(snapshot.filter);
  if (scope) conditions.push(...parentConditions(snapshot, scope.parent));
  const typeOf: TypeOf = (c) => columnType(snapshot, c);
  if (conditions.length === 1) {
    parts.push(`filter(x|${filterExpression(conditions[0]!, 'x', typeOf)})`);
  } else if (conditions.length > 1) {
    parts.push(
      `filter(x|${filterExpression({ kind: 'and', children: conditions }, 'x', typeOf)})`,
    );
  }

  // WHAT TO SELECT, which for a plain groupBy decides what it
  // aggregates: `_groupByAggCols` aggregates every SELECTED column that
  // is not a group key, so with row groups and no measures the
  // projection keeps every column -- narrowing it to the keys made them
  // vanish from the grid.
  // KEYS OR NONE. The grand total is a groupBy with no keys, and it
  // has to aggregate the same columns the levels below it do -- or
  // the total row sits blank under a column where every row beneath
  // it carries a figure, which reads as "no total for this" rather
  // than as a projection that dropped it.
  const on = effectivePivotOn(snapshot);
  const pivoting = on.length > 0;
  const grouping = !pivoting
    && (groupCols.length > 0 || snapshot.measures.length > 0 || grandTotal);

  /**
   * Every column that is not a group key, aggregated.
   *
   * This is what DataCube does, and the reason grouping there does
   * not make the other columns vanish: `_groupByAggCols` takes every
   * SELECTED column that is not a group-by column and builds an
   * aggregate for it from that column's own operator, defaulting to
   * SUM for Integer/Decimal/Float and UNIQUE for everything else
   * (DataCubeConfigurationBuilder). A configured measure wins; the
   * rest fall back to those defaults rather than being dropped.
   *
   * It also never emits an empty aggregate list -- `_fixEmptyAggCols`
   * substitutes a filler count -- so neither does this.
   */
  function groupedAggs(
    keys: readonly string[],
    projected: readonly string[],
  ): string {
    const isKey = new Set(keys);
    const byMeasure = new Map(snapshot.measures.map((m) => [m.column, m]));
    const specOf = columnSpecs(snapshot);
    const specs: string[] = [];
    // Only what the SELECT kept: aggregating a column that was
    // projected away is not a wider answer, it is an unresolvable one.
    for (const name of projected) {
      if (isKey.has(name)) continue;
      const configured = byMeasure.get(name);
      const spec = specOf.get(name);
      // DataCube defaults purely on TYPE -- numbers sum, everything
      // else takes its unique value. That sums a year and an id,
      // which is nonsense, and the kind inference already knows
      // better: a numeric column it judged key-like is a dimension.
      // An explicit kind wins over the type it is carried in.
      const measures = spec?.kind === 'measure'
        || (isNumeric(spec?.type) && spec?.kind === undefined);
      specs.push(aggregateSpec(configured
        ?? defaultMeasure(name, spec, measures ? 'sum' : 'unique')));
    }
    // "Show leaf count": the rows under each group, beside its label.
    // Only where there IS a group -- the grand total has no label.
    if (snapshot.leafCount === true && keys.length > 0) {
      specs.push(`${ident(LEAF_COUNT_COLUMN)}:x|1:y|$y->count()`);
    }
    return specs.length > 0
      ? specs.join(', ')
      // Upstream's filler: a groupBy has to aggregate something.
      : `count:x|${colRef('x', keys[0] ?? '')}:y|$y->count()`;
  }

  /** One groupBy over this level's keys, or over the root constant. */
  const groupByLevel = (aggs: string): void => {
    if (groupCols.length === 0) {
      // THE GRAND TOTAL IS A GROUP, NOT AN ABSENCE OF ONE.
      //
      // `groupBy(~[], ~[...])` is the obvious way to write "one group
      // over everything" and the real engine crashes on it -- a
      // NullPointerException out of the plan builder, not a refusal.
      // Upstream never writes it either: `_extendRootAggregation`
      // extends a constant column and groups by that, which is one
      // group by construction. The column is machinery and the grid
      // never shows it (`ROOT_COLUMN`).
      parts.push(`extend(~[${ident(ROOT_COLUMN)}: x|${literal(ROOT_VALUE)}])`);
      parts.push(`groupBy(~[${ident(ROOT_COLUMN)}], ~[${aggs}])`);
    } else {
      parts.push(`groupBy(~[${groupCols.map(ident).join(', ')}], ~[${aggs}])`);
    }
  };

  // What this level's query produces, for the sorts: a sort naming a
  // column the level does not make (a pivot value the data no longer
  // has) is dropped from the query rather than refused by the planner.
  let produced: Set<string> | null = null;

  if (pivoting) {
    refuseUnpivotable(snapshot);
    if (!pivot) {
      throw new Error('a pivoted cube is written with its pivot values: '
        + 'run pivotValuesQuery first (plan.ts)');
    }
    // THE PIVOT IS ONE GROUPBY. Each cell is its measure over exactly
    // the rows of its value -- `AVG(CASE WHEN year = 2021 THEN notional
    // END)` -- so every aggregate is right; the Total is the measure
    // over all of the group's rows, a column of the same query; and the
    // carried columns take their own aggregate beside them. Before
    // 2026-09-27 this was pivot -> cast -> groupBy, which re-aggregated
    // the pivot's finer partial results: an average of averages.
    const columns = pivotColumns(snapshot, pivot);
    const carried = snapshot.rows.length > 0 ? carriedMeasures(snapshot, groupCols) : [];
    const reads: string[] = [];
    const read = (name: string | undefined): void => {
      if (name !== undefined && name !== '' && !reads.includes(name)) reads.push(name);
    };
    groupCols.forEach(read);
    on.forEach(read);
    for (const m of [...columns.map((c) => c.measure), ...carried]) {
      if (m.fn !== 'count') read(m.column);
      read(m.weight);
    }
    parts.push(`select(~[${reads.map(ident).join(', ')}])`);
    const aggs = [
      ...columns.map((c) => aggregateSpec({ ...c.measure, name: c.name },
        c.tuple === null ? undefined : tupleCondition(snapshot, c.tuple))),
      ...carried.map((m) => aggregateSpec(m)),
      ...(snapshot.leafCount === true && groupCols.length > 0
        ? [`${ident(LEAF_COUNT_COLUMN)}:x|1:y|$y->count()`] : []),
    ];
    groupByLevel(aggs.join(', '));
    produced = new Set([
      ...groupCols,
      ...(groupCols.length === 0 ? [ROOT_COLUMN] : []),
      ...columns.map((c) => c.name),
      ...carried.map((m) => m.name),
      ...(snapshot.groupDerived ?? []).map((d) => d.name),
      LEAF_COUNT_COLUMN,
    ]);
  } else {
    const needed = grouping
      ? detailColumns(snapshot)
      : referencedColumns(snapshot, groupCols);
    if (needed.length > 0) {
      parts.push(`select(~[${needed.map(ident).join(', ')}])`);
    } else if (isDetail(snapshot)) {
      // A DETAIL cube -- no grouping, no pivot, no measures -- is the
      // plainest thing this product can show, and it referenced no
      // columns at all, so nothing was projected and the bare relation
      // came back. Naming them makes the query say what the CUBE
      // declares rather than whatever the source happens to hold.
      const all = detailColumns(snapshot);
      if (all.length > 0) parts.push(`select(~[${all.map(ident).join(', ')}])`);
    }
    if (snapshot.measures.length > 0 || groupCols.length > 0 || grandTotal) {
      // No column dimension: an ordinary aggregation over the row
      // dimensions.
      //
      // GROUP COLUMNS ALONE ARE ENOUGH. This used to require a measure,
      // so dragging a column into the row zone on a cube with no
      // measures emitted a plain select: the grid then showed one row
      // per SOURCE row -- "AMER" repeated down the screen -- and the
      // generated SQL had no GROUP BY in it at all. Grouping is what
      // the user asked for; an empty aggregate list is a detail of what
      // to show beside it, and `groupBy(~[region], ~[])` lowers to
      // exactly `GROUP BY t0.region`.
      groupByLevel(groupedAggs(groupCols, needed));
    }
  }

  // Post-aggregation columns come AFTER the pivot or groupBy, which
  // is the whole point: they see the aggregates rather than the rows
  // that produced them.
  // A window here sees this level's rows: its dimensions, in the order
  // the grid shows them.
  // With no display order the level's keys order it; the grand total,
  // one row grouped by the root constant, orders by that.
  const shown = totalOrderSorts(snapshot, groupCols);
  const rooted = (grouping || pivoting) && groupCols.length === 0;
  const keys: SortSpec[] = groupCols.length > 0
    ? groupCols.map((column) => ({ column, direction: 'asc' as const }))
    : rooted ? [{ column: ROOT_COLUMN, direction: 'asc' as const }] : [];
  const levelWindow = {
    rows: snapshot.rows,
    present: rooted ? [ROOT_COLUMN] : groupCols,
    order: shown.length > 0 ? shown : keys,
  };
  // A child-group aggregate is not extended here: its figures come
  // from its own query (childAggregateQuery), placed beside these.
  for (const d of snapshot.groupDerived ?? []) {
    if (!d.childAggregate) parts.push(derivedExtend(d, levelWindow));
  }

  // A grand total is a single row; sorting and limiting it is noise
  // that only makes the generated text harder to read in a bug
  // report. But "no grouping columns" is NOT the same as "one row":
  // a detail cube has no grouping either and returns everything, so
  // this guard silently dropped its sort AND its row cap. The
  // plainest possible grid was the one that honoured neither.
  if (!isSingleRow(snapshot, groupCols, grandTotal)) {
    const sorts = totalOrderSorts(snapshot, groupCols)
      .filter((x) => produced === null || produced.has(x.column));
    if (sorts.length > 0) parts.push(sortClause(sorts));

    if (scope?.limit !== undefined) {
      // The cap must come AFTER the sort, or it caps an arbitrary
      // subset and the first page is not the first page.
      parts.push(`limit(${scope.limit})`);
    } else if (snapshot.window) {
      // slice takes offset and END, not a count.
      const { offset, limit } = snapshot.window;
      parts.push(`slice(${offset}, ${offset + limit})`);
    }
  }

  return parts.join('->');
}

/**
 * The query for a level's CHILD-GROUP aggregates: each group's children
 * (one level deeper) with their figure, aggregated per group -- the
 * smallest desk total under each region. At the deepest group level
 * the children are the source rows, so it is the plain aggregate over
 * them. Null when the cube has none, is flat, or is pivoted.
 */
export function childAggregateQuery(
  snapshot: CubeSnapshot,
  scope: LevelScope,
): { readonly pure: string; readonly columns: readonly string[] } | null {
  const wanted = (snapshot.groupDerived ?? []).filter((d) => d.childAggregate);
  if (wanted.length === 0 || snapshot.rows.length === 0 || snapshot.pivotOn.length > 0) return null;
  const level = Math.max(0, scope.level);
  const depth = snapshot.rows.length;
  if (level > depth) return null;
  const specOf = columnSpecs(snapshot);
  // The figure a child shows for `of`: its measure, or -- a cube with
  // no measures -- the column's own default aggregate.
  const measureOf = (of: string): Measure => {
    const configured = snapshot.measures.find((m) => m.name === of);
    if (configured) return configured;
    const spec = specOf.get(of);
    const numeric = spec?.kind === 'measure' || (isNumeric(spec?.type) && spec?.kind === undefined);
    return defaultMeasure(of, spec, numeric ? 'sum' : 'unique');
  };
  const {
    pivotValues: _v, pivotTotal: _t, window: _w, ...rest
  } = snapshot;
  void _v; void _t; void _w;
  // ONLY what the figures need: the group keys and the columns the
  // measures read. The select decides what a groupBy aggregates, and
  // every other column would be aggregated for nothing.
  const reads = new Set([...snapshot.rows.slice(0, level + 1),
    ...wanted.map((d) => measureOf(d.childAggregate!.of).column)]);
  const derivedNeeded = snapshot.derived.some((d) => reads.has(d.name));
  const base: CubeSnapshot = {
    ...rest,
    // A row-stage calculated column may read any source column.
    columns: derivedNeeded ? snapshot.columns : snapshot.columns.filter((c) => reads.has(c.name)),
    derived: derivedNeeded ? snapshot.derived : [],
    pivotOn: [],
    sorts: [],
    groupDerived: [],
    leafCount: false,
    childCount: false,
  };
  const keys = snapshot.rows.slice(0, level);
  if (level === depth) {
    // The children are the source rows: aggregate them directly. Each
    // reads its OWN copy of the column -- two aggregates of one column
    // (its minimum and its count) are two measures, and measures are
    // matched to their column one to one.
    const copies = wanted.map((d) => ({
      name: `__child_${d.name}`,
      expression: colRef('x', measureOf(d.childAggregate!.of).column),
      kind: 'measure' as const,
    }));
    const measures = wanted.map((d, i) => ({
      name: d.name,
      column: copies[i]!.name,
      fn: d.childAggregate!.fn,
    }));
    return {
      pure: serialize({ ...base, derived: [...base.derived, ...copies], measures },
        { level, parent: scope.parent }),
      columns: wanted.map((d) => d.name),
    };
  }
  const inner = [...new Map(wanted.map((d) => {
    const m = measureOf(d.childAggregate!.of);
    return [m.name, m] as const;
  })).values()];
  const children = serialize({ ...base, measures: inner }, { level: level + 1, parent: scope.parent });
  const aggs = wanted.map((d) => aggregateSpec({
    name: d.name,
    column: measureOf(d.childAggregate!.of).name,
    fn: d.childAggregate!.fn,
  })).join(', ');
  const regroup = keys.length === 0
    ? `extend(~[${ident(ROOT_COLUMN)}: x|${literal(ROOT_VALUE)}])->groupBy(~[${ident(ROOT_COLUMN)}], ~[${aggs}])`
    : `groupBy(~[${keys.map(ident).join(', ')}], ~[${aggs}])`;
  return { pure: `${children}->${regroup}`, columns: wanted.map((d) => d.name) };
}

