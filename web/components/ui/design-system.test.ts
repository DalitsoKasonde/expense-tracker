import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest runs with the web package as its working directory; import.meta.url is
// not a file URL under the jsdom environment.
const root = resolve(process.cwd());

function walk(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return entry.isFile() && relative.endsWith(".tsx") && !relative.endsWith(".test.tsx") ? [relative] : [];
  });
}

function sourceFiles() {
  return [...walk("app"), ...walk("components")].map((file) => ({
    file,
    text: readFileSync(join(root, file), "utf8"),
  }));
}

const css = readFileSync(join(root, "app/globals.css"), "utf8");

describe("design system invariants", () => {
  it("has no leftover legacy button classes", () => {
    const offenders = sourceFiles()
      .filter(({ text }) => /\b(primaryButton|ghostButton|dangerButton)\b/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps viewport height out of individual pages", () => {
    // The signed-in shell legitimately fills the viewport once; pages must not
    // repeat it, which is what produced a screen of empty scroll per page.
    const offenders = sourceFiles()
      .filter(({ file }) => file.startsWith(join("app", "(app)")))
      .filter(({ file }) => file !== join("app", "(app)", "layout.tsx"))
      .filter(({ text }) => /\bmin-h-(screen|dvh)\b/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("never pairs a token fill with a hard-coded white label", () => {
    // In dark mode the action fill is light, so text-white would be unreadable.
    const offenders = sourceFiles()
      .filter(({ text }) => /bg-(action|primary|expense|negative)[^"'`]*text-white/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it("keeps hard-coded white out of CSS labels and fills", () => {
    // Only token definitions may name a literal colour; rules must read tokens,
    // otherwise a light dark-mode fill ends up with a white label on top.
    const offenders = css
      .split("\n")
      .filter((line) => /(color|background)\s*:[^;]*(#fff\b|#ffffff|\bwhite\b)/i.test(line))
      .filter((line) => !line.trim().startsWith("--"));
    expect(offenders).toEqual([]);
  });

  it("has no duplicated recipe classes from codemods", () => {
    // e.g. "btn btn-primary btn btn-danger" — two variants fighting in one class
    // string, which renders whichever CSS rule happens to come last.
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles()) {
      for (const match of text.matchAll(/className="([^"]*)"/g)) {
        const classes = match[1].split(/\s+/).filter(Boolean);
        if (new Set(classes).size !== classes.length) offenders.push(`${file}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not let component classes override layout utilities", () => {
    // Component classes are declared after @tailwind utilities, so a `display`
    // in one silently beats a grid/flex/block utility on the same element.
    const componentRules = css.match(/\.(card|card-interactive|btn|badge)[^{]*\{[^}]*\}/g) ?? [];
    const withDisplay = componentRules.filter((rule) => /^\s*display:/m.test(rule));
    // .btn and .badge intentionally set inline-flex; use btn-block for width.
    const unexpected = withDisplay.filter((rule) => /^\.(card|card-interactive)\b/.test(rule.trim()));
    expect(unexpected).toEqual([]);
  });

  it("defines every control height and card edge from a token", () => {
    expect(css).toContain("--control-h: 44px");
    expect(css).toMatch(/\.btn \{[^}]*min-height: var\(--control-h\)/);
    expect(css).toMatch(/\.control,[\s\S]*?min-height: var\(--control-h\)/);
    expect(css).toMatch(/\.card,[\s\S]*?border: 1px solid var\(--card-border\)/);
  });

  it("keeps the utility shadow scale aliased to the token scale", () => {
    expect(css).toContain("--shadow-sm: var(--shadow-card)");
    expect(css).toContain("--shadow-md: var(--shadow-raised)");
    expect(css).toContain("--outline: var(--border)");
  });

  it("gives every interactive element a focus-visible style", () => {
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--focus\)/);
  });

  it("reserves bottom-nav clearance with the iOS safe area", () => {
    expect(css).toContain("env(safe-area-inset-bottom");
  });

  it("labels every data table cell for the stacked mobile view", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles()) {
      // Each `<table ...>` opening tag starts a segment; only segments that use
      // the responsive recipe need per-cell labels.
      for (const segment of text.split("<table").slice(1)) {
        const [openingTag] = segment.split(">", 1);
        if (!openingTag.includes('className="dataTable"')) continue;
        const body = segment.split("</table>")[0];
        const cells = body.match(/<td\b[^>]*/g) ?? [];
        if (cells.some((cell) => !cell.includes("data-label"))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
