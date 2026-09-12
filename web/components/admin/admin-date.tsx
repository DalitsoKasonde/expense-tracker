export function AdminDate({ value, empty = "Never" }: { value?: string | null; empty?: string }) {
  if (!value) return <span className="adminFaint">{empty}</span>;
  const date = new Date(value);
  return (
    <span className="adminDate">
      <span>{date.toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
      <span>{date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
    </span>
  );
}
