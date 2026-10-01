// The page's theme: Query's own (`data-theme` on the root, or the system's when unset), and the
// embedded DataCube's (`data-dc-theme`, datacube/src/theme.css) kept the same, so the results
// cube follows the light/dark switch and the system's setting.

const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function isDark(): boolean {
  const theme = document.documentElement.dataset['theme'];
  return theme === 'dark' || (theme === undefined && matchMedia(SYSTEM_DARK).matches);
}

/** Tell DataCube what the page shows now. */
function syncCube(): void {
  document.documentElement.dataset['dcTheme'] = isDark() ? 'dark' : 'light';
}

/** Follow the theme from now on: now, and whenever the system's setting changes. */
export function followTheme(): void {
  syncCube();
  matchMedia(SYSTEM_DARK).addEventListener('change', syncCube);
}

/** The light/dark switch: the other one, explicitly. */
export function toggleTheme(): void {
  document.documentElement.dataset['theme'] = isDark() ? 'light' : 'dark';
  syncCube();
}
