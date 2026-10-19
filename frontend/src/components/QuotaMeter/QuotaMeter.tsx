import { Label, Meter } from "@ardc-ui/react";
import styles from "./QuotaMeter.module.scss";

/**
 * A design-system Meter for "used of limit" figures. A null or negative
 * limit means unlimited: the bar is hidden and only the value shows. At 80%
 * the meter carries data-hive-tone="warning" and at 100% "danger"; the
 * recolour lives in src/styles/_ds-overrides.scss (designer question 55).
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
  const tone = ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : undefined;
  return (
    <Meter
      value={Math.min(value, max)}
      minValue={0}
      maxValue={max}
      valueLabel={valueText}
      className={styles.meter}
      {...(tone ? { "data-hive-tone": tone } : {})}
    >
      <Label>{label}</Label>
    </Meter>
  );
}
