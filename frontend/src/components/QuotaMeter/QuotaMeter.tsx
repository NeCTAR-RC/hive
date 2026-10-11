import { Label, Meter } from "@ardc-ui/react";
import styles from "./QuotaMeter.module.scss";

/**
 * A design-system Meter for "used of limit" figures. A null or negative
 * limit means unlimited: the bar is hidden and only the value shows.
 */
export function QuotaMeter({
  label,
  value,
  max,
  valueText,
}: {
  label: string;
  value: number;
  max: number | null;
  valueText?: string;
}) {
  if (max === null || max < 0) {
    return (
      <p className={styles.unlimited}>
        <span className={styles.label}>{label}</span>{" "}
        <span>{valueText ?? `${value} (unlimited)`}</span>
      </p>
    );
  }
  const ratio = max === 0 ? 1 : value / max;
  const tone = ratio >= 1 ? styles.danger : ratio >= 0.8 ? styles.warning : "";
  return (
    <Meter
      value={Math.min(value, max)}
      minValue={0}
      maxValue={max}
      valueLabel={valueText}
      className={[styles.meter, tone].filter(Boolean).join(" ")}
    >
      <Label>{label}</Label>
    </Meter>
  );
}
