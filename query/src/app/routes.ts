// The app's addresses: upstream Query's own route patterns (census §1), under the URL hash so the
// app is a static site. A GAV is `groupId:artifactId:versionId`; `?p:name=value` sets a parameter.

export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'dataSpaceViewer'; readonly gav: string; readonly path: string }
  | { readonly kind: 'dataSpace'; readonly gav: string; readonly path: string; readonly context?: string; readonly runtime?: string; readonly class?: string }
  | { readonly kind: 'dataSpaceTemplate'; readonly gav: string; readonly path: string; readonly template: string }
  | { readonly kind: 'manual'; readonly gav: string; readonly mapping: string; readonly runtime: string; readonly class?: string }
  | { readonly kind: 'service'; readonly gav: string; readonly service: string }
  | { readonly kind: 'edit'; readonly id: string; readonly parameters: ReadonlyMap<string, string> }
  | { readonly kind: 'notFound'; readonly hash: string };

const enc = encodeURIComponent;

export function formatRoute(r: Route): string {
  switch (r.kind) {
    case 'home': return '#/';
    case 'dataSpaceViewer': return `#/dataspace/${enc(r.gav)}/${enc(r.path)}`;
    case 'dataSpace': {
      const q = new URLSearchParams();
      if (r.runtime) q.set('runtimePath', r.runtime);
      if (r.class) q.set('class', r.class);
      const qs = q.toString();
      return `#/extensions/dataspace/${enc(r.gav)}/${enc(r.path)}${r.context ? `/${enc(r.context)}` : ''}${qs ? `?${qs}` : ''}`;
    }
    case 'dataSpaceTemplate': return `#/extensions/dataspace/${enc(r.gav)}/${enc(r.path)}/template/${enc(r.template)}`;
    case 'manual': return `#/create/manual/${enc(r.gav)}/${enc(r.mapping)}/${enc(r.runtime)}${r.class ? `?class=${enc(r.class)}` : ''}`;
    case 'service': return `#/create-from-service/${enc(r.gav)}/${enc(r.service)}`;
    case 'edit': {
      const q = [...r.parameters].map(([k, v]) => `p:${enc(k)}=${enc(v)}`).join('&');
      return `#/edit/${enc(r.id)}${q ? `?${q}` : ''}`;
    }
    case 'notFound': return r.hash;
  }
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart = '/', queryPart = ''] = raw.split('?');
  const seg = pathPart.split('/').filter((s) => s.length > 0).map(decodeURIComponent);
  const query = new URLSearchParams(queryPart);
  const opt = (k: string): { [key: string]: string } => {
    const v = query.get(k);
    return v === null ? {} : { [k]: v };
  };
  if (seg.length === 0) return { kind: 'home' };
  if (seg[0] === 'dataspace' && seg.length === 3) return { kind: 'dataSpaceViewer', gav: seg[1]!, path: seg[2]! };
  if (seg[0] === 'extensions' && seg[1] === 'dataspace' && seg.length === 6 && seg[4] === 'template') {
    return { kind: 'dataSpaceTemplate', gav: seg[2]!, path: seg[3]!, template: seg[5]! };
  }
  if (seg[0] === 'extensions' && seg[1] === 'dataspace' && (seg.length === 4 || seg.length === 5)) {
    const runtime = query.get('runtimePath');
    const cls = query.get('class');
    return {
      kind: 'dataSpace', gav: seg[2]!, path: seg[3]!,
      ...(seg[4] !== undefined ? { context: seg[4] } : {}),
      ...(runtime !== null ? { runtime } : {}),
      ...(cls !== null ? { class: cls } : {}),
    };
  }
  if (seg[0] === 'create' && seg[1] === 'manual' && seg.length === 5) {
    return { kind: 'manual', gav: seg[2]!, mapping: seg[3]!, runtime: seg[4]!, ...opt('class') } as Route;
  }
  if (seg[0] === 'create-from-service' && seg.length === 3) return { kind: 'service', gav: seg[1]!, service: seg[2]! };
  if (seg[0] === 'edit' && seg.length === 2) {
    const parameters = new Map<string, string>();
    for (const [k, v] of query) if (k.startsWith('p:')) parameters.set(k.slice(2), v);
    return { kind: 'edit', id: seg[1]!, parameters };
  }
  return { kind: 'notFound', hash };
}
