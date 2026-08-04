import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLOR_SCHEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyColorScheme,
  applyTheme,
  themeBootstrapScript,
} from "./theme";

/** jsdom here runs without localStorage, so the tests provide one. */
function installStorage(store: Map<string, string> | null) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: store
      ? {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => void store.set(key, value),
          removeItem: (key: string) => void store.delete(key),
          clear: () => store.clear(),
        }
      : {
          getItem: () => {
            throw new Error("storage blocked");
          },
          setItem: () => {
            throw new Error("storage blocked");
          },
        },
  });
}

function setPrefersDark(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("dark") ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

/** Runs the inlined bootstrap exactly as the document head would. */
function runBootstrap() {
  new Function(themeBootstrapScript)();
}

describe("theme bootstrap", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    installStorage(store);
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-scheme");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the stored theme before the app renders", () => {
    store.set(THEME_STORAGE_KEY, "dark");
    setPrefersDark(false);

    runBootstrap();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("falls back to the operating system preference when nothing is stored", () => {
    setPrefersDark(true);

    runBootstrap();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("defaults to light when the OS prefers light", () => {
    setPrefersDark(false);

    runBootstrap();

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores a corrupt stored value instead of painting it", () => {
    store.set(THEME_STORAGE_KEY, "neon");
    setPrefersDark(true);

    runBootstrap();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("still honours the OS preference when storage is blocked", () => {
    installStorage(null);
    setPrefersDark(true);

    runBootstrap();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists the applied theme so the next load paints it directly", () => {
    applyTheme("dark");

    expect(store.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the theme even when it cannot be persisted", () => {
    installStorage(null);

    expect(() => applyTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the stored color scheme before the app renders", () => {
    store.set(THEME_STORAGE_KEY, "light");
    store.set(COLOR_SCHEME_STORAGE_KEY, "sonto");
    setPrefersDark(false);

    runBootstrap();

    expect(document.documentElement.dataset.scheme).toBe("sonto");
  });

  it("leaves data-scheme unset for the default color scheme", () => {
    store.set(THEME_STORAGE_KEY, "light");
    setPrefersDark(false);

    runBootstrap();

    expect(document.documentElement.dataset.scheme).toBeUndefined();
  });

  it("persists and applies a non-default color scheme", () => {
    applyColorScheme("sonto");

    expect(store.get(COLOR_SCHEME_STORAGE_KEY)).toBe("sonto");
    expect(document.documentElement.dataset.scheme).toBe("sonto");
  });

  it("clears data-scheme when returning to the default color scheme", () => {
    document.documentElement.dataset.scheme = "sonto";

    applyColorScheme("default");

    expect(store.get(COLOR_SCHEME_STORAGE_KEY)).toBe("default");
    expect(document.documentElement.dataset.scheme).toBeUndefined();
  });

  it("applies the color scheme even when it cannot be persisted", () => {
    installStorage(null);

    expect(() => applyColorScheme("sonto")).not.toThrow();
    expect(document.documentElement.dataset.scheme).toBe("sonto");
  });
});
