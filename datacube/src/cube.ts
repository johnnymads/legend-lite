// The controller: snapshot in, rows on screen.
//
// Holds the single source of truth (the snapshot), asks the planner for
// SQL, runs it under an epoch guard, and pushes the result at the grid.
// Every user interaction goes through `update`, which is what keeps
// "one snapshot, one query, one render" true rather than aspirational.

import { from, type Lambda } from '../../pure-protocol/src/index.ts';
import type { QueryEngine } from './engine.ts';
import type { PrintStyle } from './pure-v1.ts';
import { EpochGuard, isStale, type Stale } from './epoch.ts';
import {
  buildColumnModel,
  type ColumnLayout,
  type ColumnModel,
} from './grid/columns.ts';
import type { CubeSnapshot } from './snapshot.ts';
import { CubeRefusal } from './snapshot.ts';
import {
  pinnedPivotFacts,
  pivotLabel,
  type LevelScope,
  type PivotColumn,
  type PivotFacts,
  childAggregateLambda,
  levelLambda,
  pivotValuesLambda,
} from './query.ts';
import { planPivot, typeColumns, type PivotPlan, type SchemaChange } from './plan.ts';
import type { ResultTable } from './result.ts';
import { SnapManager, type RemoteSource, type SnapTarget } from './snap.ts';
import {
  PlanThenRun,
  type QueryRunner,
  type RunOutcome,
} from './runner.ts';
import { requestKey } from './tree.ts';
import {
  TreeState,
  type LevelRequest,
  type RowPath,
  type TreeRow,
} from './tree.ts';
import { DEFAULT_MAX_ROWS, fetchTree, takeRows } from './treeview.ts';
import { History, type CubeState } from './history.ts';
import type { Plan, PlanColumn } from './relation-type.ts';

/** What compiling a cube found: the query refused (or the first), and why. */
export interface CompileOutcome {
  /** The refused query, or the first one when all compile. */
  readonly query: Lambda;
  /** The compiler's refusal; null when every query compiles. */
  readonly refusal: string | null;
}

/**
 * Turns a snapshot into SQL.
 *
 * This is a seam, not a detail. legend-lite is the SINGLE planner: the
 * snapshot serialises to Pure grammar, legend-lite lowers that to SQL
 * once, and the only thing that differs between the server plane and
 * the browser plane is where the SQL runs. Implementing a second
 * planner in TypeScript would mean two things that must agree about
 * null ordering, type coercion and aggregate semantics -- the exact
 * class of divergence the differential tests exist to catch. So the
 * interface stays narrow and the real implementation calls the engine.
 */
export interface Planner {
  /** A query (a protocol tree, query.ts) in, SQL and the compiler's result type out. */
  plan(query: Lambda, signal?: AbortSignal): Promise<Plan>;
  /**
   * The compiler's type of a query's result, compile-only (upstream
   * `lambdaRelationType`): how the cube types its source and calculated
   * columns BEFORE a level query runs.
   */
  relationType(query: Lambda, signal?: AbortSignal): Promise<PlanColumn[]>;
  /** What a person typed (a source, a calculated column) as its lambda: E1, the compiler's parse. */
  parse(text: string, signal?: AbortSignal): Promise<Lambda>;
  /** A query as Pure text, for a person to read: E4, the compiler's print (PRETTY unless asked). */
  print(query: Lambda, style?: PrintStyle, signal?: AbortSignal): Promise<string>;
}

export interface CubeView {
  readonly snapshot: CubeSnapshot;
  readonly columns: ColumnModel;
  readonly rows: ResultTable;
  /** Tree metadata per row, parallel to `rows`. Empty for a flat cube. */
  readonly treeRows: readonly TreeRow[];
  /**
   * Levels that hit the row cap. Non-empty means the grid shows a
   * prefix, and the UI must say so rather than leave the user to
   * infer it from a suspiciously round row count.
   */
  readonly truncated: readonly LevelRequest[];
  /**
   * The query, for the "show me the query" panel.
   *
   * BOTH, because they answer different questions: the query is what
   * this product built (shown as the compiler prints it), the SQL is what
   * the planner made of it and what the engine actually ran.
   */
  readonly query: Lambda;
  readonly sql: string;
  /**
   * A pivoted cube's first step, answered: the values it found and
   * every column the pivot makes, with what each one IS. The column
   * model, the tool panel, calculated columns, formats and
   * drill-through read it rather than parsing `2021__|__notional`.
   */
  readonly pivot?: PivotPlan;
  /**
   * Source columns whose declared type the compiler no longer gives them
   * (step 0, `typeColumns`): a schema change, for the host to show.
   */
  readonly schemaChanges?: readonly SchemaChange[];
}

/** A pivot's columns as header paths: values, then the measure. */
export function pivotHeaderPaths(
  columns: readonly PivotColumn[] | undefined,
): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  for (const c of columns ?? []) {
    if (c.tuple !== null) out.set(c.name, [...c.tuple.map(pivotLabel), c.measure.name]);
  }
  return out;
}

export interface CubeControllerOptions {
  /** Column order, visibility and widths. */
  readonly layout?: ColumnLayout;
  readonly onView?: (view: CubeView) => void;
  readonly onError?: (error: unknown) => void;
  readonly onBusy?: (busy: boolean) => void;
  /**
   * Where a snap materialises: another relation the SAME model declares, so
   * the host names it. A cube without one cannot snap.
   */
  readonly snapTarget?: SnapTarget;
  /**
   * A LIVE engine on another machine (the warehouse), beside the local pair.
   *
   * Live queries run there; snapping copies the rows the user may read into
   * the local store and queries run here until released. One planner above
   * both. The plane is the user's explicit choice (the Live/Snap button),
   * fixed engines chosen at construction -- never a fallback: a live failure
   * is an error, not quietly answered from a snap (snap.ts, rule 2).
   */
  readonly live?: QueryEngine & RemoteSource;
  /** How many undo steps to keep. */
  readonly historyLimit?: number;
  /** Fired whenever undo/redo availability changes, for the UI. */
  readonly onHistory?: (state: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
  }) => void;
  /**
   * Capture and restore the host's half of the undoable state.
   *
   * The controller owns the query; the host owns presentation. Undo
   * has to cover both or it reverts itself -- see CubeState.host.
   * Whatever `captureHost` returns is handed back to `restoreHost`
   * unchanged, so an immutable configuration object is exactly the
   * right thing to pass.
   */
  readonly captureHost?: () => unknown;
  readonly restoreHost?: (host: unknown) => void;
}

export class CubeController {
  /** What answers queries while live: the local pair, a remote engine's pair, or a runner. */
  readonly #liveRunner: QueryRunner;
  /**
   * The local pair, when there is one.
   *
   * Snapping freezes a cube by materialising its source into a local
   * store, so it needs both halves: the planner for the source SQL,
   * the engine to hold the table. A remote engine answers queries
   * for us and cannot do that on our behalf, so there it is null and
   * `snap` refuses by name.
   */
  readonly #local: PlanThenRun | null;
  readonly #guard = new EpochGuard();
  readonly #snaps: SnapManager;
  readonly #options: CubeControllerOptions;
  #snapshot: CubeSnapshot | null = null;
  #view: CubeView | null = null;
  #tree = TreeState.empty();
  readonly #history: History;
  /** The last state that reached the screen. See #remember. */
  #lastState: CubeState | null = null;

  /**
   * Two arrangements, and the choice is the CALL, not a flag.
   *
   * `new CubeController(engine, planner)` plans then executes
   * locally -- both browser planes. `new CubeController(runner)`
   * takes whatever turns Pure into rows, which is how a remote
   * engine plane is built: `new CubeController(new RemoteRun(...))`.
   *
   * Settled at construction and unable to change afterwards, for the
   * reason `test/guardrails.test.ts` records: the one time shipped
   * code could pick a planner at runtime, a health-check fallback hid
   * three real bugs for the life of the project.
   */
  constructor(runner: QueryRunner, options?: CubeControllerOptions);
  constructor(
    engine: QueryEngine,
    planner: Planner,
    options?: CubeControllerOptions,
  );
  constructor(
    first: QueryEngine | QueryRunner,
    second?: Planner | CubeControllerOptions,
    third: CubeControllerOptions = {},
  ) {
    // WHICH FORM, by the shape of what arrived. An engine executes
    // plans (and runs raw SQL); a runner has no `execute`. This is a
    // construction-time reading of the caller's intent, not a choice
    // the cube makes for itself.
    const asRunner = 'execute' in first ? null : (first as QueryRunner);
    const local = asRunner
      ? null
      : new PlanThenRun(second as Planner, first as QueryEngine);
    this.#local = local;
    const options = asRunner
      ? ((second as CubeControllerOptions | undefined) ?? {})
      : third;
    this.#liveRunner = asRunner
      ?? (options.live ? new PlanThenRun(second as Planner, options.live) : (local as PlanThenRun));
    this.#options = options;
    this.#snaps = new SnapManager(local ? local.engine : null, options.live ?? null);
    this.#history = new History(
      options.historyLimit !== undefined
        ? { limit: options.historyLimit }
        : {},
    );
  }

  get snaps(): SnapManager {
    return this.#snaps;
  }

  /**
   * What answers the next query: while snapped the local pair (the snap is
   * there), otherwise the live runner. The plane is the user's choice.
   */
  get #runner(): QueryRunner {
    return this.#snaps.isSnapped && this.#local ? this.#local : this.#liveRunner;
  }

  /** Which arrangement answers queries, for diagnostics. */
  get runnerName(): string {
    return this.#runner.name;
  }

  /**
   * Compile a cube without running it: the calculated-column editor's
   * live check and the Properties editor's Apply. It compiles EXACTLY
   * the queries a refresh would send -- the source this plane reads,
   * each tree level (the grand total when the tree shows it) or the
   * flat query, each with its row cap -- because a check of a
   * different query passes a draft its own run then refuses (a Row
   * Limit the planner refused sailed through a cap-less compile).
   * Resolves to the first refused query and the refusal, the first
   * query and null when all compile, or undefined when this plane
   * cannot compile without executing.
   */
  async compile(
    snapshot: CubeSnapshot,
    signal?: AbortSignal,
  ): Promise<CompileOutcome | undefined> {
    const runner = this.#runner;
    const s: CubeSnapshot = {
      ...snapshot,
      source: { query: this.#snaps.sourceFor(snapshot.source.query) },
    };
    const scopes: (LevelScope | undefined)[] = [];
    if (s.rows.length > 0) {
      const limit = (s.maxRows ?? DEFAULT_MAX_ROWS) + 1;
      for (let level = this.#tree.showTotals ? 0 : 1; level <= s.rows.length; level += 1) {
        scopes.push({ level, parent: [], limit });
      }
    } else {
      scopes.push(s.maxRows === undefined ? undefined : { level: 1, parent: [], limit: s.maxRows + 1 });
    }
    // A PIVOTED draft is two steps, like its run: the values query, then
    // each level written with values. Compiling does not execute, so the
    // values are the current view's when the draft pivots on the same
    // keys (their literals have the types the draft's will), and none
    // otherwise -- the level still compiles its Totals and carried
    // columns, and the cell form is the same for every value.
    const valuesQuery = pivotValuesLambda(s);
    const shown = this.#view;
    const facts: PivotFacts | undefined = s.pivotOn.length === 0
      ? undefined
      : pinnedPivotFacts(s)
        ?? (shown?.pivot && shown.snapshot.pivotOn.join('\u0000')
          === s.pivotOn.join('\u0000') ? shown.pivot.facts : { tuples: [] });
    // Each level's own query, then its child-group aggregates' -- a
    // column whose own query the planner refuses must not pass.
    const queries = [
      ...(valuesQuery !== null ? [valuesQuery] : []),
      ...scopes.flatMap((scope) => {
        const child = scope ? childAggregateLambda(s, scope) : null;
        const level = levelLambda(s, scope, facts);
        return child ? [level, child.query] : [level];
      }),
    ];
    for (const query of queries) {
      try {
        await runner.compile(query, s, signal);
      } catch (error: unknown) {
        if (signal?.aborted) throw error;
        return { query, refusal: error instanceof Error ? error.message : String(error) };
      }
    }
    return { query: queries[0]!, refusal: null };
  }


  /**
   * One query, for a host that needs rows of its own.
   *
   * Drill-through is the case: it asks for the rows behind a cell,
   * which is a query the cube did not plan. It goes through the same
   * runner as everything else, so it works on every plane -- before
   * this, the host planned and executed it by hand, which meant the
   * one plane where the engine executes would have had a
   * drill-through that could not run.
   */
  async runQuery(
    query: Lambda,
    snapshot: CubeSnapshot,
    scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<RunOutcome> {
    return this.#runner.run(query, snapshot, scope, signal);
  }

  /** A query's rows a chunk at a time, none kept (`QueryRunner.stream`). */
  async streamQuery(
    query: Lambda,
    snapshot: CubeSnapshot,
    onChunk: (chunk: ResultTable) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.#runner.stream(query, snapshot, onChunk, signal);
  }

  /** What a person typed, as its lambda: the compiler's parse (E1, or its twin in the tab). */
  async parse(text: string, signal?: AbortSignal): Promise<Lambda> {
    return this.#runner.parse(text, signal);
  }

  /** A query as Pure text for a person to read: the compiler's print (E4). */
  async print(query: Lambda, style?: PrintStyle, signal?: AbortSignal): Promise<string> {
    return this.#runner.print(query, style, signal);
  }

  get view(): CubeView | null {
    return this.#view;
  }

  get snapshot(): CubeSnapshot | null {
    return this.#snapshot;
  }

  get tree(): TreeState {
    return this.#tree;
  }

  /**
   * Open or close a group and refresh.
   *
   * Only the newly-opened branch is fetched; the rest of the tree is
   * re-requested only because the level results are not yet cached
   * across refreshes, which is a pure optimisation and not a
   * correctness concern.
   */
  async toggle(path: RowPath): Promise<void> {
    this.#remember();
    this.#tree = this.#tree.toggle(path);
    await this.refresh();
  }

  /**
   * Take a tree WITHOUT re-querying; the caller refreshes.
   *
   * `setTree` refreshes, and a refresh pushes a view at the host --
   * which is how loading a saved view silently restored nothing.
   * `loadView` set the app's snapshot, then called `setTree`, whose
   * refresh ran the CONTROLLER's snapshot (still the old one) and
   * handed that view back; the host's `onView` assigns
   * `this.#snapshot = view.snapshot`, so the freshly loaded snapshot
   * was overwritten by the stale one, and the refresh that followed
   * queried the shape the user had just replaced. The status line
   * said `loaded "..."` either way.
   *
   * So a caller that is about to refresh anyway adopts the tree
   * quietly and gets ONE query with both halves in place, instead of
   * two where the first clobbers the second.
   */
  adoptTree(state: TreeState): void {
    this.#tree = state;
  }

  async setTree(state: TreeState): Promise<void> {
    this.#remember();
    this.#tree = state;
    await this.refresh();
  }

  /**
   * Apply a new snapshot and refresh.
   *
   * Takes the whole snapshot rather than a patch, because a partial
   * update is how two sources of truth start: the caller derives the
   * next snapshot from the current one and hands it over whole.
   */
  async update(next: CubeSnapshot): Promise<CubeView | Stale> {
    this.#remember();
    this.#snapshot = next;
    return this.refresh();
  }

  /** Re-run the current snapshot, e.g. after snapping or releasing. */
  async refresh(): Promise<CubeView | Stale> {
    const snapshot = this.#snapshot;
    if (!snapshot) return this.#fail(new Error('no snapshot set'));

    this.#options.onBusy?.(true);
    try {
      const out = await this.#guard.issue(async (epoch, signal) => {
        // The snapshot's own epoch is advisory; the guard's is
        // authoritative, so a stale answer cannot win a race.
        // The PLANE decides what a query reads from. Without this
        // the snap was cosmetic: a table was materialised and every
        // subsequent query still went to the live source.
        const reading: CubeSnapshot = {
          ...snapshot,
          epoch,
          source: { query: this.#snaps.sourceFor(snapshot.source.query) },
        };
        // STEP 0: the columns' types, from the compiler, before any query
        // reads them to choose an aggregate (plan.ts, `typeColumns`).
        const typed = await typeColumns(reading, this.#runner, signal);
        const withEpoch: CubeSnapshot = typed.snapshot;
        const withChanges = typed.changes.length > 0 ? { schemaChanges: typed.changes } : {};
        const measureNames = withEpoch.measures.map((m) => m.name);
        // STEP 1 of a pivoted cube: its values, from their own query,
        // on this refresh's data (plan.ts). Every level is then one
        // groupBy written with them.
        const pivot = await planPivot(withEpoch, this.#runner, signal);
        const pivotPaths = pivotHeaderPaths(pivot?.columns);
        const withPivot = pivot ? { pivot } : {};

        // A cube with row dimensions is a tree: the grand total and
        // each open branch are separate queries, stitched in order.
        if (withEpoch.rows.length > 0) {
          const view = await fetchTree(withEpoch, this.#tree, {
            runner: this.#runner,
            guard: this.#guard,
            epoch,
            signal,
            ...(pivot ? { pivot: pivot.facts } : {}),
          });
          return {
            snapshot: withEpoch,
            columns: buildColumnModel(
              view.table,
              withEpoch.rows,
              measureNames,
              this.#options.layout ?? {},
              withEpoch.pivotOn.length,
              pivotPaths,
            ),
            rows: view.table,
            treeRows: view.rows,
            truncated: view.truncated,
            query: levelLambda(withEpoch, { level: 1, parent: [] }, pivot?.facts),
            // The level-1 plan is the representative one: it is the
            // query behind the rows a user is looking at.
            sql:
              view.levels.get(requestKey({ level: 1, parent: [] }))?.sql ??
              '',
            ...withPivot,
            ...withChanges,
          } satisfies CubeView;
        }

        // THE ROW LIMIT, on a flat cube too. General Properties > Row
        // Limit capped every level of a tree and nothing here: a flat
        // cube fetched all its rows whatever the setting said (2026-09-25
        // sweep). Upstream limits every query. One more than the cap is
        // asked for, as the tree does, so "there is more" costs no
        // second query and the truncation warning can say so.
        // Only a limit the USER set: unset means none, as upstream.
        const maxRows = withEpoch.maxRows;
        const scope = maxRows === undefined
          ? undefined
          : ({ level: 1, parent: [], limit: maxRows + 1 } as const);
        const query = levelLambda(withEpoch, scope, pivot?.facts);
        const { rows: full, sql } = await this.#runner.run(
          query,
          withEpoch,
          scope,
          signal,
        );
        const cut = maxRows !== undefined && full.rowCount > maxRows;
        const rows = cut ? takeRows(full, maxRows) : full;
        const columns = buildColumnModel(
          rows,
          withEpoch.rows,
          measureNames,
          this.#options.layout ?? {},
          withEpoch.pivotOn.length,
          pivotPaths,
        );
        return {
          snapshot: withEpoch,
          columns,
          rows,
          treeRows: [],
          truncated: cut ? [{ level: 1, parent: [] }] : [],
          query,
          sql,
          ...withPivot,
          ...withChanges,
        } satisfies CubeView;
      });

      if (isStale(out)) return out;
      this.#view = out;
      // Snapshot the state that just landed, so the NEXT change has
      // something truthful to record as its "before".
      this.#lastState = this.#state();
      this.#options.onView?.(out);
      return out;
    } catch (error) {
      return this.#fail(error);
    } finally {
      this.#options.onBusy?.(false);
    }
  }

  /**
   * Freeze the rows behind the current view, then refresh against them.
   *
   * The pivot columns are captured at snap time, which is what removes
   * the per-query discovery pass while snapped.
   */
  async snap(label?: string): Promise<void> {
    const snapshot = this.#snapshot;
    if (!snapshot) throw new Error('no snapshot set');

    // Through the PLANNER, like every other query. This used to
    // build `SELECT "a", "b" FROM <source>` by hand, which worked
    // only because the demo's source happened to be a bare SQL
    // identifier; against the real planner the source is a Pure
    // accessor and the hand-built SQL was nonsense. "One planner"
    // is an architectural commitment and this was the one place
    // that quietly broke it.
    //
    // EVERY source column, not the ones this view references: a snap is
    // something to keep exploring (rule 3, "drillable grain"), so a column
    // added to the view after snapping must answer from the snap too. A
    // fresh cube references none, which made this `select(~[])` and the
    // planner refuse it. The query is a tree, so a column called
    // `trade date` is a name, not grammar.
    if (!this.#local) {
      // The SnapManager says the same thing; saying it here too
      // keeps the reason next to the attempt.
      throw new CubeRefusal(
        'this cube\u2019s queries run on a remote engine: there is no'
        + ' local store to freeze a snapshot into.',
      );
    }
    const target = this.#options.snapTarget;
    if (!target) {
      throw new CubeRefusal('this cube names no table to freeze a snapshot into.');
    }
    const query = from(snapshot.source.query).select(snapshot.columns.map((c) => c.name)).lambda();
    const sourceSql = (await this.#local.planner.plan(query)).sql;

    await this.#snaps.snap(sourceSql, this.#guard.current, {
      ...(label !== undefined ? { label } : {}),
      target,
    });
    await this.refresh();
  }

  async release(): Promise<void> {
    await this.#snaps.release();
    await this.refresh();
  }

  // -- undo / redo ----------------------------------------------------

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  /** Steps available each way. Diagnostics and tests. */
  get historyDepth(): { readonly past: number; readonly future: number } {
    return this.#history.depth;
  }

  /**
   * Push the state about to be replaced onto the undo stack.
   *
   * Called by the mutators rather than by refresh(), and the
   * distinction is the whole design: refresh re-runs the CURRENT cube
   * (after a snap, on a retry, when the plane changes) and is not a
   * step a user would ever want to undo. Recording there would fill
   * the stack with entries that all undo to the same screen.
   */
  /**
   * Push the last RENDERED state onto the undo stack.
   *
   * Not the state as it is right now. By the time a mutator runs, the
   * host may already have changed its half -- a pin is applied to the
   * configuration and only then does the refresh begin -- so
   * capturing at this moment would record the new configuration as
   * though it were the old one, and undo would restore the very thing
   * it was meant to remove. The last state that actually reached the
   * screen is the one a person means by "back".
   */
  #remember(): void {
    if (!this.#lastState) return;
    this.#history.record(this.#lastState);
    this.#announceHistory();
  }

  #state(): CubeState {
    const host = this.#options.captureHost?.();
    return {
      snapshot: this.#snapshot as CubeSnapshot,
      tree: this.#tree,
      ...(host !== undefined ? { host } : {}),
    };
  }

  #announceHistory(): void {
    this.#options.onHistory?.({
      canUndo: this.#history.canUndo,
      canRedo: this.#history.canRedo,
    });
  }

  /**
   * Apply a state from the history WITHOUT recording it as a new step.
   *
   * Going through update() here would record the undo itself, so the
   * next undo would return to where you just came from and the stack
   * would never advance past two entries -- undo that toggles.
   */
  /** Put the cube into a state without re-querying. */
  #install(state: CubeState): void {
    this.#snapshot = state.snapshot;
    this.#tree = state.tree;
    // BEFORE the refresh, not after: the host folds its configuration
    // into the snapshot on refresh, so restoring it afterwards would
    // let the stale config overwrite the state just restored.
    if (state.host !== undefined) this.#options.restoreHost?.(state.host);
  }

  /**
   * Move to a state from the history, ALL OR NOTHING.
   *
   * Undo mutates the cube and then re-queries, and that query can
   * fail -- the engine is down, the planner refuses it. Without a
   * rollback the cube had already moved, the step was already spent,
   * and the screen still showed the old view: the model and the
   * display disagreeing, with no way back and a redo pointing at a
   * state that was never rendered.
   *
   * A SUPERSEDED refresh is not a failure and is not rolled back: the
   * user did something else while this was in flight, and the newer
   * interaction legitimately owns the cube from here.
   */
  async #applyHistory(
    state: CubeState,
    rollback: (current: CubeState) => void,
  ): Promise<CubeView | Stale> {
    const current = this.#state();
    this.#install(state);
    this.#announceHistory();
    try {
      return await this.refresh();
    } catch (error) {
      this.#install(current);
      rollback(current);
      this.#announceHistory();
      throw error;
    }
  }

  async undo(): Promise<CubeView | Stale | null> {
    if (!this.#snapshot) return null;
    const previous = this.#history.undo(this.#state());
    if (!previous) return null;
    return this.#applyHistory(previous, () =>
      this.#history.rollbackUndo(previous),
    );
  }

  async redo(): Promise<CubeView | Stale | null> {
    if (!this.#snapshot) return null;
    const next = this.#history.redo(this.#state());
    if (!next) return null;
    return this.#applyHistory(next, () => this.#history.rollbackRedo(next));
  }

  /**
   * One level of a cube of the host's own, as a query through this cube's
   * runner -- whichever plane it is -- outside the tree: Ad Hoc Analysis
   * mode's grid and member lookups.
   */
  async level(
    snapshot: CubeSnapshot,
    scope?: LevelScope,
    signal?: AbortSignal,
  ): Promise<ResultTable> {
    const query = levelLambda(snapshot, scope);
    const { rows } = await this.#runner.run(query, snapshot, scope, signal);
    return rows;
  }

  /** Settings > Max History Stack Size. */
  setHistoryLimit(limit: number): void {
    this.#history.setLimit(limit);
    this.#announceHistory();
  }

  /** Drop the history, e.g. when a wholly different cube is opened. */
  clearHistory(): void {
    this.#history.clear();
    this.#announceHistory();
  }

  #fail(error: unknown): Stale {
    this.#options.onError?.(error);
    throw error;
  }
}
