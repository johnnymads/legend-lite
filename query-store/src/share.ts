// A SAVED QUERY'S SHARE LINK: everything that IS the query -- its name, project, execution context,
// content and saved parameter values -- in the URL, so it can be sent without a store in common.
// Not its identity in a store (id, owner, version, timestamps): whoever opens the link keeps their
// own copy, in their own store. Never data, never the model: the project is named by its GAV, and
// the app that opens the link must know it.
//
//   q1.<base64url of deflate-raw(the record's JSON)>
//
// `q1` names the format; a version this build does not know is refused BY NAME, and a link that
// cannot be read fails loudly, never opening half a query. Encoded, not encrypted: anyone holding
// the link reads the query.

import type { Query } from './wire.ts';

export const QUERY_LINK_VERSION = 'q1';

/** What a link carries: the query, without the store's own fields. */
export type SharedQuery = Omit<Query, 'id' | 'owner' | 'createdAt' | 'lastUpdatedAt' | 'lastOpenAt' | 'deletedAt' | 'validUntil' | 'version'>;

export class QueryLinkError extends Error {
  constructor(detail: string) {
    super(`cannot open this query link: ${detail}`);
    this.name = 'QueryLinkError';
  }
}

/** The fields a link keeps, in the engine's order. */
const SHARED = ['name', 'description', 'groupId', 'artifactId', 'versionId', 'originalVersionId', 'executionContext',
  'content', 'taggedValues', 'stereotypes', 'defaultParameterValues', 'gridConfig'] as const;

/** What of a saved query is the query itself, shared: its record without the store's own fields. */
export function sharedPart(q: SharedQuery): SharedQuery {
  const kept: Record<string, unknown> = {};
  for (const f of SHARED) if (q[f] !== undefined && q[f] !== null) kept[f] = q[f];
  return kept as unknown as SharedQuery;
}

/** A saved query (or one about to be) as a link's fragment, without the `#`: `q1.<data>`. */
export async function queryFragment(q: SharedQuery): Promise<string> {
  const kept = sharedPart(q);
  return `${QUERY_LINK_VERSION}.${toBase64Url(await squeeze(new TextEncoder().encode(JSON.stringify(kept)), 'compress'))}`;
}

/** Whether a fragment (or a hash route's last segment), with or without its `#`, is a query link. */
export function isQueryFragment(fragment: string): boolean {
  return /^#?q\d+\./.test(fragment);
}

/** The query a fragment carries. Throws `QueryLinkError`, saying why. */
export async function readQueryFragment(fragment: string): Promise<SharedQuery> {
  const f = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const dot = f.indexOf('.');
  const version = dot > 0 ? f.slice(0, dot) : '';
  if (!/^q\d+$/.test(version)) throw new QueryLinkError('it is not a saved query link');
  if (version !== QUERY_LINK_VERSION) throw new QueryLinkError(`it is a ${version} link, which this version cannot read`);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await squeeze(fromBase64Url(f.slice(dot + 1)), 'decompress')));
  } catch {
    throw new QueryLinkError('it is cut short or altered');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new QueryLinkError('it holds no query');
  const q = raw as Record<string, unknown>;
  for (const f of ['name', 'groupId', 'artifactId', 'versionId', 'content'] as const) {
    if (typeof q[f] !== 'string' || q[f] === '') throw new QueryLinkError(`its query has no ${f}`);
  }
  return q as unknown as SharedQuery;
}

async function squeeze(bytes: Uint8Array, how: 'compress' | 'decompress'): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(how === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new QueryLinkError('it is not base64url');
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
