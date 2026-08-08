const adminNavigation = [
  { href: "#overview", label: "Overview", shortLabel: "Overview" },
  { href: "#users", label: "User access", shortLabel: "Users" },
  { href: "#feedback", label: "Beta feedback", shortLabel: "Feedback" },
  { href: "#administrators", label: "Administrators", shortLabel: "Admins" },
  { href: "#backups", label: "Database backups", shortLabel: "Backups" },
  { href: "#audit", label: "Audit trail", shortLabel: "Audit" },
] as const;

export function AdminNavigation() {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh border-r border-outline bg-surface px-5 py-6 lg:block print:hidden">
        <div className="border-b border-outline px-3 pb-5">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Operations</p>
          <p className="mt-1 text-sm text-on-surface-soft">System administration</p>
        </div>
        <nav className="mt-5 grid gap-2" aria-label="System administration navigation">
          {adminNavigation.map((item, index) => (
            <a key={item.href} href={item.href} className="group flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-on-surface-soft transition-colors hover:bg-primary-softer hover:text-primary">
              <span className="grid size-7 place-items-center rounded-md bg-surface-soft text-xs font-bold text-primary group-hover:bg-primary-soft" aria-hidden="true">{index + 1}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="mt-8 rounded-md border border-primary/20 bg-primary-softer p-3 text-xs leading-relaxed text-on-surface-soft">
          Financial records are intentionally unavailable to system administrators.
        </div>
      </aside>

      <nav className="sticky top-0 z-20 overflow-x-auto border-b border-outline bg-surface/95 px-4 py-2 backdrop-blur lg:hidden print:hidden" aria-label="System administration navigation">
        <div className="mx-auto flex min-w-max gap-2">
          {adminNavigation.map((item) => (
            <a key={item.href} href={item.href} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-on-surface-soft hover:bg-primary-softer hover:text-primary">
              {item.shortLabel}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
