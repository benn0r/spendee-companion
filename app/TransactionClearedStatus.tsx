import Ionicon from "@/app/Ionicon";

export default function TransactionClearedStatus({
  cleared,
}: {
  cleared: boolean;
}) {
  return (
    <span
      className={`cleared-badge ${cleared ? "is-cleared" : "is-uncleared"}`}
    >
      <Ionicon name={cleared ? "checkmark-circle" : "ellipse-outline"} />{" "}
      {cleared ? "Cleared" : "Uncleared"}
    </span>
  );
}
