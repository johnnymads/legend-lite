// ONE OWNER of the cube's state (docs/DATACUBE_LEG_B_STATE_OWNER_2026_09_28.md, Leg B).
//
// The cube's state -- its query definition (snapshot), its settings (configuration) and which
// groups are open (tree) -- lives HERE and nowhere else, as one immutable value in three places:
//
//   committed  the last state the user's actions produced and the engine ACCEPTED, as the
//              engine returned it (the query's step 0 adds the compiler's types)
//   rendered   the state of the view on screen; differs from committed only while a query runs
//   pending    the change in flight, if any
//
// Presentation paints `current` (pending ?? committed); anything read off the rows on screen
// reads `rendered`.
//
// Two kinds of change, told apart by the QUERY itself, never by a list of settings: a change
// whose state folds to the same query (`queryKey`) is PRESENTATION -- colours, widths,
// formats, labels -- and commits at once, with no query, and cannot be refused. Anything else
// is a TRANSACTION:
//
//   success     committed = rendered = the state the engine returned; one undo step if the
//               change was the user's; one `committed` event
//   refusal     the pending state is dropped and everything repaints from `committed`; a change
//               made on top of another still pending reverts BOTH, and says which
//   superseded  a newer change owns the cube: this one is dropped quietly (latest wins)
//
// Undo and redo are transactions over a stack of committed states that MOVES ONLY WHEN THE
// MOVE LANDS: an undo refused or overtaken leaves the stacks as they were. Undo while a change
// is in flight cancels that change -- the one thing the user just did -- and nothing more; undo
// while an undo is in flight goes one step further (two presses, two steps). A change made on
// top of an undo in flight lands as that undo AND the change, one step each.
//
// No DOM, no engine: the query runs through `run`, so every rule here is proven by fast tests
// (test/cube-state.test.ts).

import { applyToSnapshot, type CubeConfiguration } from './config.ts';
import type { CubeView } from './cube.ts';
import { isStale, type Stale } from './epoch.ts';
import type { CubeSnapshot } from './snapshot.ts';
import type { TreeState } from './tree.ts';

/** Everything that decides what the cube is and shows. */
export interface CubeState {
  readonly snapshot: CubeSnapshot;
  readonly configuration: CubeConfiguration;
  readonly tree: TreeState;
}

/**
 * Run a state: the query side (the controller). Resolves the view, or STALE when a newer run
 * superseded this one; throws when the engine refuses.
 */
export type RunState = (state: CubeState) => Promise<CubeView | Stale>;

export type Outcome =
  | { readonly kind: 'applied'; readonly view?: CubeView }
  | { readonly kind: 'refused'; readonly error: unknown; readonly reverted: readonly string[] }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'nothing' };

export interface ChangeOptions {
  /** A user's action is an undo step (the default); a machine's re-run is not. */
  readonly record?: boolean;
  /** How the change is named when it has to be reported undone. */
  readonly label?: string;
  /** Run the query even if the state folds to the same one (a refresh after a snap, a retry). */
  readonly force?: boolean;
}

export type OwnerEvent =
  | { readonly kind: 'pending' }
  | { readonly kind: 'committed'; readonly view: CubeView }
  | { readonly kind: 'presentation' }
  | { readonly kind: 'refused'; readonly error: unknown; readonly reverted: readonly string[] }
  | { readonly kind: 'cancelled'; readonly reverted: readonly string[] };

export interface OwnerOptions {
  /** How many undo steps are kept (Settings > Max History Stack Size). */
  readonly historyLimit?: number;
  /** Stop the query in flight, when a change is cancelled rather than replaced. */
  readonly abort?: () => void;
}

/**
 * The state as the query sees it: the configuration's query-shaping settings folded into
 * the snapshot (`applyToSnapshot`), so both halves of a state always agree.
 */
export function fold(state: CubeState): CubeState {
  return { ...state, snapshot: applyToSnapshot(state.snapshot, state.configuration) };
}

/**
 * What the query of a state IS: the folded snapshot (its epoch aside) and the open groups.
 * Two states with the same key run the same queries; a change that keeps the key is
 * presentation.
 */
export function queryKey(state: CubeState): string {
  const { epoch: _epoch, ...query } = fold(state).snapshot;
  return JSON.stringify([query, state.tree.key]);
}

/** A state's identity for undo: everything, presentation included. */
export function stateKey(state: CubeState): string {
  const { epoch: _epoch, ...query } = state.snapshot;
  return JSON.stringify([query, state.configuration, state.tree.key]);
}

/** The undo and redo stacks. A move is only made once the state it moves to has landed. */
export class UndoStack<T> {
  #past: T[] = [];
  #future: T[] = [];
  #limit: number;
  readonly #key: (t: T) => string;

  constructor(key: (t: T) => string, limit = 50) {
    this.#key = key;
    this.#limit = Math.max(1, limit);
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  get depth(): { readonly past: number; readonly future: number } {
    return { past: this.#past.length, future: this.#future.length };
  }

  setLimit(limit: number): void {
    this.#limit = Math.max(1, limit);
    while (this.#past.length > this.#limit) this.#past.shift();
  }

  /** A new step replaced `previous`: remember it, and the redo branch no longer follows. */
  record(previous: T): void {
    const top = this.#past[this.#past.length - 1];
    if (top === undefined || this.#key(top) !== this.#key(previous)) {
      this.#past.push(previous);
      if (this.#past.length > this.#limit) this.#past.shift();
    }
    this.#future = [];
  }

  /** Where `steps` undos would go, without going. */
  peekUndo(steps = 1): T | undefined {
    return this.#past[this.#past.length - steps];
  }

  peekRedo(steps = 1): T | undefined {
    return this.#future[this.#future.length - steps];
  }

  /** `steps` undos LANDED, leaving `from`: the states passed over become redo steps, in order. */
  undone(from: T, steps = 1): void {
    const passed = this.#past.splice(this.#past.length - steps, steps);
    this.#future.push(from);
    for (let i = passed.length - 1; i >= 1; i -= 1) this.#future.push(passed[i] as T);
  }

  /** `steps` redos LANDED, leaving `from`. */
  redone(from: T, steps = 1): void {
    const passed = this.#future.splice(this.#future.length - steps, steps);
    this.#past.push(from);
    for (let i = passed.length - 1; i >= 1; i -= 1) this.#past.push(passed[i] as T);
  }

  clear(): void {
    this.#past = [];
    this.#future = [];
  }
}

/** A pending history move: which way, and how many steps from the committed state. */
interface Move {
  readonly dir: 'undo' | 'redo';
  readonly steps: number;
}

interface Pending {
  readonly id: number;
  /**
   * The history move this pending state includes: the move itself in flight, or a move a
   * change was made on top of (`on` is then the move's state, the change's undo step).
   */
  readonly move?: Move & { readonly on?: CubeState };
  readonly state: CubeState;
  /** The user's changes this pending state carries, oldest first: what a refusal reverts. */
  readonly labels: readonly string[];
  /** Whether landing it is an undo step. */
  readonly record: boolean;
}

export class CubeStateOwner {
  #committed: CubeState;
  #rendered: CubeState;
  #view: CubeView | null = null;
  #pending: Pending | null = null;
  #seq = 0;
  readonly #run: RunState;
  readonly #stack: UndoStack<CubeState>;
  readonly #abort: (() => void) | undefined;
  readonly #listeners = new Set<(event: OwnerEvent) => void>();

  constructor(initial: CubeState, run: RunState, options: OwnerOptions = {}) {
    this.#committed = fold(initial);
    this.#rendered = this.#committed;
    this.#run = run;
    this.#stack = new UndoStack(stateKey, options.historyLimit);
    this.#abort = options.abort;
  }

  /** What presentation paints: the change in flight, else the committed state. */
  get current(): CubeState {
    return this.#pending?.state ?? this.#committed;
  }

  get committed(): CubeState {
    return this.#committed;
  }

  /** The state of the view on screen. */
  get rendered(): CubeState {
    return this.#rendered;
  }

  get view(): CubeView | null {
    return this.#view;
  }

  /** A change is in flight. */
  get busy(): boolean {
    return this.#pending !== null;
  }

  get canUndo(): boolean {
    return this.#pending !== null || this.#stack.canUndo;
  }

  get canRedo(): boolean {
    return this.#stack.canRedo;
  }

  get historyDepth(): { readonly past: number; readonly future: number } {
    return this.#stack.depth;
  }

  setHistoryLimit(limit: number): void {
    this.#stack.setLimit(limit);
  }

  clearHistory(): void {
    this.#stack.clear();
  }

  /** Told of every change of state: pending, committed, presentation, refused, cancelled. */
  subscribe(listener: (event: OwnerEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Run the committed state and show it: the first load, a refresh after a snap. Not a step. */
  async refresh(): Promise<Outcome> {
    return this.change((s) => s, { record: false, force: true, label: 'refresh' });
  }

  /**
   * Change the cube. `update` derives the next state from the CURRENT one (a change made
   * while another is in flight builds on it). Presentation commits at once; anything else is
   * a transaction.
   */
  async change(update: (state: CubeState) => CubeState, options: ChangeOptions = {}): Promise<Outcome> {
    const base = this.current;
    const next = fold(update(base));
    // asking for what already is changes nothing: no query, no step (P2-127's rule, everywhere)
    if (!options.force && stateKey(next) === stateKey(base)) return { kind: 'nothing' };
    if (!options.force && queryKey(next) === queryKey(base)) {
      return this.#present(update, options);
    }
    return this.#transact(next, options.label ?? 'change', options.record ?? true);
  }

  /**
   * Cancel the change in flight: the screen stays on the committed state, and the query is
   * stopped. Nothing when nothing is in flight.
   */
  cancel(): Outcome {
    const pending = this.#pending;
    if (!pending) return { kind: 'nothing' };
    this.#pending = null;
    this.#abort?.();
    this.#emit({ kind: 'cancelled', reverted: pending.labels });
    return { kind: 'cancelled' };
  }

  /**
   * Back one step. While the user's own change is in flight, undo cancels THAT change -- the
   * last thing they did -- and nothing more. While an undo is in flight, it goes one step
   * further back (two quick presses are two steps, never a cancel).
   */
  async undo(): Promise<Outcome> {
    return this.#history('undo');
  }

  /** Forward one step, the same way round. */
  async redo(): Promise<Outcome> {
    return this.#history('redo');
  }

  // ---------------------------------------------------------------------------------

  async #history(dir: 'undo' | 'redo'): Promise<Outcome> {
    // a move in flight on its own (not a change made on top of one)
    const pendingMove = this.#pending?.move?.on === undefined ? this.#pending?.move : undefined;
    // the user's own change in flight: undo cancels it; redo continues from what landed
    if (this.#pending && !pendingMove) {
      if (dir === 'undo') return this.cancel();
      this.cancel();
    }
    // an undo in flight and another undo: one step further (and a redo cancels the undo)
    let steps = 1;
    if (pendingMove) {
      if (pendingMove.dir !== dir) return this.cancel();
      steps = pendingMove.steps + 1;
    }
    const target = dir === 'undo' ? this.#stack.peekUndo(steps) : this.#stack.peekRedo(steps);
    if (target === undefined) return { kind: 'nothing' };
    const move: Move = { dir, steps };
    if (queryKey(target) !== queryKey(this.#committed)) return this.#transact(target, dir, false, move);
    // only presentation differs: no query (a move still in flight is dropped, its query stopped)
    if (this.#pending) {
      this.#pending = null;
      this.#abort?.();
    }
    this.#land(target, move);
    this.#emit({ kind: 'presentation' });
    return { kind: 'applied' };
  }

  /** The one place the committed state moves with the history: stacks first, then the state. */
  #land(state: CubeState, move: Pending['move'], record = false): void {
    const from = this.#committed;
    if (move) {
      if (move.dir === 'undo') this.#stack.undone(from, move.steps);
      else this.#stack.redone(from, move.steps);
    }
    if (record) this.#stack.record(move?.on ?? from);
    this.#committed = state;
    this.#rendered = state;
  }

  /**
   * Presentation: laid over committed, rendered and pending alike (it changes none of their
   * queries), one undo step, no query. Should laying it over one of them change that one's
   * query -- a change that is presentation only relative to the pending state -- the whole
   * change is a transaction instead.
   */
  #present(update: (state: CubeState) => CubeState, options: ChangeOptions): Outcome | Promise<Outcome> {
    // While a history move is in flight the stacks are that move's: the presentation change
    // rides the move (it is on both sides of it) rather than being a step of its own.
    const committed = fold(update(this.#committed));
    const rendered = fold(update(this.#rendered));
    if (queryKey(committed) !== queryKey(this.#committed) || queryKey(rendered) !== queryKey(this.#rendered)) {
      return this.#transact(fold(update(this.current)), options.label ?? 'change', options.record ?? true);
    }
    if ((options.record ?? true) && !this.#pending?.move) this.#stack.record(this.#committed);
    this.#committed = committed;
    this.#rendered = rendered;
    const pending = this.#pending;
    if (pending) {
      const on = pending.move?.on;
      this.#pending = {
        ...pending,
        state: fold(update(pending.state)),
        ...(pending.move && on ? { move: { ...pending.move, on: fold(update(on)) } } : {}),
      };
    }
    this.#emit({ kind: 'presentation' });
    return { kind: 'applied' };
  }

  async #transact(next: CubeState, label: string, record: boolean, move?: Move): Promise<Outcome> {
    const id = (this.#seq += 1);
    // A history move REPLACES a pending move rather than building on it; anything else is
    // carried: a change made on a pending one is reverted with it, and one made on a pending
    // move lands the move too.
    const carried = move ? null : this.#pending;
    const carriedMove = carried?.move ? { ...carried.move, on: carried.move.on ?? carried.state } : undefined;
    const pendingMove = move ?? carriedMove;
    this.#pending = {
      id,
      state: next,
      labels: [...(carried?.labels ?? []), ...(label === 'refresh' ? [] : [label])],
      record: record || (carried?.record ?? false),
      ...(pendingMove ? { move: pendingMove } : {}),
    };
    this.#emit({ kind: 'pending' });
    let out: CubeView | Stale;
    try {
      out = await this.#run(next);
    } catch (error) {
      const pending = this.#pending;
      if (pending?.id !== id) return { kind: 'superseded' };
      this.#pending = null;
      this.#emit({ kind: 'refused', error, reverted: pending.labels });
      return { kind: 'refused', error, reverted: pending.labels };
    }
    const pending = this.#pending;
    if (isStale(out) || pending?.id !== id) return { kind: 'superseded' };
    // As the ENGINE returned it (the compiler's types), but reading the source that was SENT:
    // the plane a query ran on (a snap's table) is the query side's, never the cube's state.
    // The pending state, not `next`: a presentation change made while it ran is laid on it.
    const landed: CubeState = {
      ...pending.state,
      snapshot: { ...out.snapshot, source: pending.state.snapshot.source },
    };
    this.#land(landed, pending.move, pending.record);
    this.#view = out;
    this.#pending = null;
    this.#emit({ kind: 'committed', view: out });
    return { kind: 'applied', view: out };
  }

  #emit(event: OwnerEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }
}
