import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const root = resolve(process.cwd());

/**
 * True when an App Router page would serve this URL.
 *
 * Route groups are invisible in the URL, so a manifest entry can point at a
 * route that never existed and nothing complains until someone long-presses the
 * installed app icon — which is exactly how `/portfolio` survived.
 */
function hasRoute(url: string) {
  const segments = url.replace(/^\//, "");
  const groups = ["", "(app)", "(auth)"];
  return groups.some((group) => existsSync(join(root, "app", group, segments, "page.tsx")));
}

describe("web app manifest", () => {
  it("points every shortcut at a route that exists", () => {
    const broken = (manifest().shortcuts ?? [])
      .filter((shortcut) => !hasRoute(shortcut.url))
      .map((shortcut) => `${shortcut.name} -> ${shortcut.url}`);

    expect(broken).toEqual([]);
  });

  it("starts on a route that exists", () => {
    expect(hasRoute(manifest().start_url ?? "/")).toBe(true);
  });
});
