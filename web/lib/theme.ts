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
 * The page background each scheme/theme pair paints, mirrored into
 * <meta name="theme-color"> so the browser and installed-PWA chrome match the
 * app instead of the OS. Both axes matter: Sonto has its own backgrounds, so
 * changing either one changes the answer.
 *
 * These must stay in step with --background in globals.css.
 */
export const CHROME_COLORS: Record<ColorScheme, Record<Theme, string>> = {
  default: { light: "#f4f8fc", dark: "#0e1730" },
  sonto: { light: "#f7f3fc", dark: "#1a1330" },
};

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function currentScheme(): ColorScheme {
  return document.documentElement.dataset.scheme === "sonto" ? "sonto" : "default";
}

/**
 * Repaints the browser chrome for the theme and scheme now on the document.
 *
 * Without this the meta tag keeps whatever the OS preference produced, so a
 * user on a light OS running the app in dark mode gets a light status bar over
 * a dark app. Only visible in the installed PWA and mobile browsers.
 */
export function applyChromeColor(theme: Theme = currentTheme(), scheme: ColorScheme = currentScheme()) {
  // Upsert rather than assume: this is the only writer of the tag, so it also
  // owns creating it.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", CHROME_COLORS[scheme][theme]);
}

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
  applyChromeColor(theme);
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
  applyChromeColor(currentTheme(), scheme);
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
 *
 * It also writes <meta name="theme-color">, which is why the layout does not
 * declare one: a media-keyed tag from the framework would follow the OS while
 * the app follows the stored preference, and the two disagree often. The
 * colour table is interpolated from CHROME_COLORS so the two cannot drift.
 */
export const themeBootstrapScript = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}var s=null;try{s=localStorage.getItem("${COLOR_SCHEME_STORAGE_KEY}")}catch(e){}try{var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;if(s==="sonto"){r.dataset.scheme=s}else{delete r.dataset.scheme}var c=${JSON.stringify(CHROME_COLORS)};var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m)}m.setAttribute("content",c[s==="sonto"?"sonto":"default"][t])}catch(e){}})();`;
