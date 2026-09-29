// One gate for a query side a test answers by hand: hold every call (or every call after the
// next N), let them through one at a time or all at once, or make them fail. The app's engine
// (cube-fixture.ts) and Ad Hoc's source (adhoc-transactions.test.ts) both pass through it, so a
// slow change finishing after a newer one is one exact ordering, never a race.

export class Gate {
  /** Hold every call until released. */
  hold = false;
  /** Hold every call after this many more (a zoom's member lookup answers, its step waits). */
  holdAfter: number | null = null;
  /** Fail every call, with this message. */
  fail: string | null = null;
  /** The calls held, in the order they arrived. */
  readonly held: (() => void)[] = [];
  #calls = 0;

  /** Calls passed through so far. */
  get calls(): number {
    return this.#calls;
  }

  /** One call: held while the gate holds, then failed or let through. */
  async pass(): Promise<void> {
    this.#calls += 1;
    if (this.holdAfter !== null && this.#calls > this.holdAfter) this.hold = true;
    if (this.hold) await new Promise<void>((r) => this.held.push(r));
    if (this.fail !== null) throw new Error(this.fail);
  }

  /** Let held call `i` (in arrival order) through. */
  release(i: number): void {
    const r = this.held[i];
    if (!r) throw new Error(`no held call ${i}`);
    r();
  }

  /** Stop holding, and let every held call through. */
  releaseAll(): void {
    this.hold = false;
    this.holdAfter = null;
    for (const r of this.held.splice(0)) r();
  }
}
