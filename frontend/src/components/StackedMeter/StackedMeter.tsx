import styles from "./StackedMeter.module.scss";

/**
 * A meter with two segments: what is already used and what the current
 * choice would add, against a limit. Over the limit, the whole bar turns to
 * the danger colour (Horizon's used + pending progress bars on the reserve
 * modal). Reads out as one meter with the combined value.
 */
export function StackedMeter({
  label,
  used,
  pending,
  max,
  valueText,
}: {
  label: string;
  used: number;
  pending: number;
  max: number;
  valueText: string;
}) {
  const total = used + pending;
  const over = max <= 0 || total > max;
  const usedPercent = over ? 0 : (Math.max(used, 0) / max) * 100;
  const pendingPercent = over ? 100 : (Math.max(pending, 0) / max) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, 0)}
      aria-valuenow={Math.min(Math.max(total, 0), Math.max(max, 0))}
      aria-valuetext={valueText}
      className={[styles.track, over ? styles.over : ""].join(" ").trim()}
    >
      <span className={styles.used} style={{ width: `${usedPercent}%` }} />
      <span
        className={styles.pending}
        style={{ width: `${pendingPercent}%` }}
      />
    </div>
  );
}
