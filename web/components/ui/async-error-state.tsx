type AsyncErrorStateProps = {
  title: string;
  description: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function AsyncErrorState({
  title,
  description,
  onRetry,
  retrying = false,
}: AsyncErrorStateProps) {
  return (
    <div
      className="grid justify-items-start gap-3 rounded-lg border border-negative/30 bg-negative-soft p-5"
      role="alert"
    >
      <div>
        <h2 className="font-semibold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-soft">{description}</p>
      </div>
      <button type="button" className="ghostButton" disabled={retrying} onClick={onRetry}>
        {retrying ? "Trying again..." : "Try again"}
      </button>
    </div>
  );
}
