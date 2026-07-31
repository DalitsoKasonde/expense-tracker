/**
 * Joins class names, dropping falsy entries.
 *
 * Deliberately dependency-free: the app only needs conditional joining, not
 * Tailwind conflict resolution, so a helper beats another package.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
