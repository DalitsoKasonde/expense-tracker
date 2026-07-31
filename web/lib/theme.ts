export type Theme = "light" | "dark";

/** Where the resolved theme is cached so the next load can paint it directly. */
export const THEME_STORAGE_KEY = "expenses.theme";

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
 * Runs before first paint, so the document is never painted in the wrong theme.
 *
 * Order of precedence: the theme the user last had, then the OS preference.
 * Each step is guarded separately — a browser that blocks storage (private
 * mode) must still get the OS preference rather than silently falling back to
 * light. Kept dependency-free and tiny because it is inlined into the document
 * head and blocks paint.
 */
export const themeBootstrapScript = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}try{var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t}catch(e){}})();`;
