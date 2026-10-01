import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { localDate } from "@/lib/date-terms";
import { daysBehind, describeGap, gapIsWorthMentioning } from "@/lib/logging-gap";

/**
 * Says, on the page opened most, when the record has fallen behind.
 *
 * Silent until the gap is worth mentioning, and silent before the first entry
 * — a new account has setup tasks for that, and nagging about a record that
 * has not started yet would be noise.
 */
export function LoggingGapBanner({ lastEntryDate }: { lastEntryDate: string | null | undefined }) {
  const days = daysBehind(lastEntryDate, localDate());
  if (!lastEntryDate || !gapIsWorthMentioning(days)) return null;

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning-soft px-4 py-3 text-sm text-on-surface"
      aria-label="Entries behind"
    >
      <p className="min-w-0">
        <strong className="font-semibold">{describeGap(lastEntryDate, days)}</strong>{" "}
        <span className="text-on-surface-soft">The sooner it is filled in, the less there is to remember.</span>
      </p>
      <Link href="/add/catch-up" className={buttonClass({ size: "sm" })}>
        Catch up
      </Link>
    </section>
  );
}
