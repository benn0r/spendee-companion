export default function TransactionClearedStatus({
  cleared,
}: {
  cleared: boolean;
}) {
  return (
    <span
      className={`cleared-badge ${cleared ? "is-cleared" : "is-uncleared"}`}
    >
      <span aria-hidden="true">{cleared ? "✓" : "○"}</span>{" "}
      {cleared ? "Cleared" : "Uncleared"}
    </span>
  );
}
