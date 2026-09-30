// What every screen of the app shares: the engine and query store, the loaded project and its
// model graph, the current user, recently viewed things.

import type { Engine, QueryStore } from '../backend/engine.ts';
import type { WasmGrammar } from '../backend/wasm-grammar.ts';
import type { PureModelContextText } from '../backend/wire.ts';
import type { ModelGraph } from '../model/graph.ts';

export interface ProjectConfig {
  readonly groupId: string;
  readonly artifactId: string;
  readonly versionId: string;
  readonly title?: string;
  /** Model files (Pure grammar), relative to the page. */
  readonly models: readonly string[];
}

export interface AppConfig {
  /** The engine's API root: legend-lite's server or legend-engine (`http://host:port/api`). */
  readonly engine: string;
  /** legend-lite's planner in the tab, for grammar and typing; absent means the server answers them. */
  readonly planner?: { readonly worker: string; readonly vendor: string };
  readonly projects: readonly ProjectConfig[];
}

/** A project's model, loaded: its text (what execution sends), and its graph (what the screens read). */
export interface LoadedProject {
  readonly config: ProjectConfig;
  readonly gav: string;
  readonly context: PureModelContextText;
  readonly graph: ModelGraph;
}

export function gavOf(p: ProjectConfig): string {
  return `${p.groupId}:${p.artifactId}:${p.versionId}`;
}

export interface Recent {
  readonly dataSpaces: readonly { readonly gav: string; readonly path: string; readonly context?: string }[];
  readonly queries: readonly string[];
}

const RECENT_DATA_SPACES = 'query-editor.recent-dataSpaces';
const RECENT_QUERIES = 'query-editor.recent-queries';

function readList<T>(key: string): T[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? v as T[] : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: readonly unknown[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(list));
  } catch { /* storage unavailable: recents are a convenience */ }
}

/** Recently viewed data spaces and queries (upstream's user-data keys, 10 each). */
export const recent = {
  get(): Recent {
    return { dataSpaces: readList(RECENT_DATA_SPACES), queries: readList(RECENT_QUERIES) };
  },
  dataSpace(gav: string, path: string, context?: string): void {
    const list = readList<{ gav: string; path: string }>(RECENT_DATA_SPACES).filter((d) => !(d.gav === gav && d.path === path));
    writeList(RECENT_DATA_SPACES, [{ gav, path, context }, ...list].slice(0, 10));
  },
  query(id: string): void {
    writeList(RECENT_QUERIES, [id, ...readList<string>(RECENT_QUERIES).filter((q) => q !== id)].slice(0, 10));
  },
  forgetQuery(id: string): void {
    writeList(RECENT_QUERIES, readList<string>(RECENT_QUERIES).filter((q) => q !== id));
  },
};

export class AppContext {
  readonly config: AppConfig;
  readonly engine: Engine;
  readonly store: QueryStore;
  readonly planner: WasmGrammar | undefined;
  readonly projects: readonly LoadedProject[];
  readonly user: string;

  constructor(config: AppConfig, engine: Engine, store: QueryStore, planner: WasmGrammar | undefined,
    projects: readonly LoadedProject[], user: string) {
    this.config = config;
    this.engine = engine;
    this.store = store;
    this.planner = planner;
    this.projects = projects;
    this.user = user;
  }

  project(gav: string): LoadedProject {
    const p = this.projects.find((x) => x.gav === gav);
    if (!p) throw new Error(`no project ${gav} is configured`);
    return p;
  }

  /** The project that holds an element, by path. */
  projectOf(path: string): LoadedProject | undefined {
    return this.projects.find((p) => p.graph.elements.has(path));
  }
}
