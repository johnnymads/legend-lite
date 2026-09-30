// Formatting shared by the screens.

export function timeAgo(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(epochMs).toLocaleDateString();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** A cell's text: a number with grouping (exact digits kept for big ones), null as empty. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
