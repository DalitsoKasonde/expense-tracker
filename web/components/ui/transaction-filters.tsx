export type TransactionFilterValue = {
  query: string;
  direction: "all" | "inflow" | "outflow" | "pending";
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryId?: string;
};

export function TransactionFilters({ value, onChange, accounts = [], categories = [] }: {
  value: TransactionFilterValue;
  onChange: (value: TransactionFilterValue) => void;
  accounts?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
}) {
  const field = "min-h-11 rounded-md border border-outline bg-surface px-3 text-sm text-on-surface outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Transaction filters">
      <label className="grid gap-1 text-xs font-semibold text-on-surface-soft xl:col-span-2">Search
        <input className={field} value={value.query} onChange={(event) => onChange({ ...value, query: event.target.value })} placeholder="Note or entry type" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface-soft">From
        <input className={field} type="date" value={value.startDate ?? ""} onChange={(event) => onChange({ ...value, startDate: event.target.value })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface-soft">To
        <input className={field} type="date" value={value.endDate ?? ""} onChange={(event) => onChange({ ...value, endDate: event.target.value })} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface-soft">Direction
        <select className={field} value={value.direction} onChange={(event) => onChange({ ...value, direction: event.target.value as TransactionFilterValue["direction"] })}>
          <option value="all">All activity</option><option value="inflow">Inflow</option><option value="outflow">Outflow</option><option value="pending">Pending</option>
        </select>
      </label>
      {accounts.length ? <label className="grid gap-1 text-xs font-semibold text-on-surface-soft">Account
        <select className={field} value={value.accountId ?? ""} onChange={(event) => onChange({ ...value, accountId: event.target.value })}><option value="">All accounts</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label> : null}
      {categories.length ? <label className="grid gap-1 text-xs font-semibold text-on-surface-soft">Category
        <select className={field} value={value.categoryId ?? ""} onChange={(event) => onChange({ ...value, categoryId: event.target.value })}><option value="">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label> : null}
    </div>
  );
}
