export type Theme = "light" | "dark";

/**
 * The color palette, independent of light/dark mode. "default" is the
 * standing blue-led system; "sonto" is the purple pastel alternative. Either
 * one still has a light and a dark variant (see globals.css).
 */
export type ColorScheme = "default" | "sonto";

/** Where the resolved theme is cached so the next load can paint it directly. */
export const THEME_STORAGE_KEY = "expenses.theme";

/** Where the resolved color scheme is cached, mirroring THEME_STORAGE_KEY. */
export const COLOR_SCHEME_STORAGE_KEY = "expenses.colorScheme";

/**
 * Applies a theme and remembers it.
 *
 * Persisting matters as much as applying: the stored value is what the
 * pre-paint script reads on the next load, which is what prevents a light
 * flash before preferences arrive from the API.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing or a full quota: the theme still applies for this page.
  }
}

/**
 * Applies a color scheme and remembers it, the same way applyTheme does for
 * light/dark mode. The two are independent axes: this never touches
 * data-theme, so switching schemes can't accidentally flip light/dark.
 */
export function applyColorScheme(scheme: ColorScheme) {
  if (scheme === "default") {
    delete document.documentElement.dataset.scheme;
  } else {
    document.documentElement.dataset.scheme = scheme;
  }
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    // Private browsing or a full quota: the scheme still applies for this page.
  }
}

/**
 * Runs before first paint, so the document is never painted in the wrong theme
 * or color scheme.
 *
 * Order of precedence: the theme the user last had, then the OS preference.
 * The color scheme has no OS equivalent, so it just falls back to the
 * default palette. Each step is guarded separately — a browser that blocks
 * storage (private mode) must still get the OS preference rather than
 * silently falling back to light. Kept dependency-free and tiny because it is
 * inlined into the document head and blocks paint.
 */
export const themeBootstrapScript = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}var s=null;try{s=localStorage.getItem("${COLOR_SCHEME_STORAGE_KEY}")}catch(e){}try{var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;if(s==="sonto"){r.dataset.scheme=s}else{delete r.dataset.scheme}}catch(e){}})();`;
