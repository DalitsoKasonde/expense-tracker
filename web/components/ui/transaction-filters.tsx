import { Field, Input, Select } from "./field";

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
  accounts?: Array<{ id: string; name: string; accountType?: string; currency?: string }>;
  categories?: Array<{ id: string; name: string }>;
}) {
  // Controls come from the shared Field/.control recipe rather than a local
  // class string, so the height, radius and focus ring match every other form
  // in the app instead of drifting from --focus-ring.
  return (
    <div className="grid min-w-0 w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="Transaction filters">
      <Field label="Search" className="xl:col-span-2">
        {(props) => (
          <Input
            {...props}
            value={value.query}
            onChange={(event) => onChange({ ...value, query: event.target.value })}
            placeholder="Note or entry type"
          />
        )}
      </Field>
      <Field label="From">
        {(props) => (
          <Input
            {...props}
            type="date"
            value={value.startDate ?? ""}
            onChange={(event) => onChange({ ...value, startDate: event.target.value })}
          />
        )}
      </Field>
      <Field label="To">
        {(props) => (
          <Input
            {...props}
            type="date"
            value={value.endDate ?? ""}
            onChange={(event) => onChange({ ...value, endDate: event.target.value })}
          />
        )}
      </Field>
      <Field label="Direction">
        {(props) => (
          <Select
            {...props}
            value={value.direction}
            onChange={(event) => onChange({ ...value, direction: event.target.value as TransactionFilterValue["direction"] })}
          >
            <option value="all">All activity</option>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
            <option value="pending">Pending</option>
          </Select>
        )}
      </Field>
      {accounts.length ? (
        <Field label="Account">
          {(props) => (
            <Select
              {...props}
              value={value.accountId ?? ""}
              onChange={(event) => onChange({ ...value, accountId: event.target.value })}
            >
              <option value="">All accounts</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {[item.name, item.accountType?.replaceAll("_", " "), item.currency].filter(Boolean).join(" · ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
      {categories.length ? (
        <Field label="Category">
          {(props) => (
            <Select
              {...props}
              value={value.categoryId ?? ""}
              onChange={(event) => onChange({ ...value, categoryId: event.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </div>
  );
}
