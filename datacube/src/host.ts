// What a page hosting a cube must get right around it (Leg B / B6): the work a tab holds that
// leaving would lose, and which of several opens is the one the person meant. Kept here, tested,
// rather than in one demo page, so every host gets the same rules.

/**
 * What a tab holds that leaving would lose. Each part of a page says what IT holds -- an opened
 * file lives only in the tab's database, a warehouse session only in memory, unsaved changes
 * nowhere else -- and the page asks before it goes (P2-337).
 */
export class TabWork {
  readonly #parts: (() => string | undefined)[] = [];

  /** A part of the page, saying what it holds now (or nothing). */
  add(part: () => string | undefined): void {
    this.#parts.push(part);
  }

  /** The first thing leaving would lose, or undefined when nothing would be. */
  what(): string | undefined {
    for (const part of this.#parts) {
      const held = part();
      if (held !== undefined) return held;
    }
    return undefined;
  }
}

/**
 * Before the page goes (another plane, say): true to go. Asks -- with what would be lost -- only
 * when the tab holds work; `ask` is the page's confirmation (window.confirm).
 */
export function mayLeave(work: TabWork, ask: (question: string) => boolean, doing: string): boolean {
  const lost = work.what();
  return lost === undefined || ask(`${doing}: ${lost} will be lost. Go anyway?`);
}

/**
 * Latest wins among overlapping starts of the same thing (opening a file): each start is told,
 * at every later wait, whether a newer one has begun -- and then stops before it touches
 * anything (P2-330).
 */
export class Latest {
  #n = 0;

  /** A new start; the function answers whether it is still the newest. */
  start(): () => boolean {
    const mine = (this.#n += 1);
    return () => mine === this.#n;
  }
}
