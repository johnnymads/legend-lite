// Where the pages' servers are: DEPLOYMENT data, never compiled in.
//
// `config.json`, served beside the page, names them; a deployment ships its
// own. A URL parameter overrides the file for one visit (`?legendLite=`,
// `?engine=`, `?warehouse=`), so a page can be pointed at another server
// without rebuilding or editing anything. The file in the repository names the
// local development servers (`bazel run //core:server`, a legend-engine on its
// default port); the warehouse has none by default -- its URL is typed, or
// remembered by this browser from the last sign-in.

export interface PageConfig {
  /** legend-lite's server: the server-mode page plans there. Empty: not configured. */
  readonly legendLite: string;
  /** legend-engine: the engine-mode page runs there. Empty: not configured. */
  readonly legendEngine: string;
  /** The warehouse the Data window offers first. Empty: none. */
  readonly warehouse: string;
}

const EMPTY: PageConfig = { legendLite: '', legendEngine: '', warehouse: '' };

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * The page's configuration: `config.json`, then the URL's parameters over it.
 * A missing or unreadable file is an EMPTY configuration, not an error: the
 * local page needs no server at all, and a page that does says which setting
 * is missing rather than guessing an address.
 */
export async function pageConfig(location: Location = window.location): Promise<PageConfig> {
  let file: PageConfig = EMPTY;
  try {
    const r = await fetch(new URL('config.json', location.href), { cache: 'no-cache' });
    if (r.ok) {
      const raw = await r.json() as Record<string, unknown>;
      file = { legendLite: text(raw['legendLite']), legendEngine: text(raw['legendEngine']), warehouse: text(raw['warehouse']) };
    }
  } catch {
    // no configuration file: every setting is empty
  }
  const q = new URLSearchParams(location.search);
  return {
    legendLite: text(q.get('legendLite')) || file.legendLite,
    legendEngine: text(q.get('engine')) || file.legendEngine,
    warehouse: text(q.get('warehouse')) || file.warehouse,
  };
}
