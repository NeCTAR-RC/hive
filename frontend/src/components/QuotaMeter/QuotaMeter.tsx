import { Alert, Label, Meter, Text } from "@ardc-ui/react";
import { formatNumber } from "../../lib/format";
import styles from "./QuotaMeter.module.scss";

/** From this share of the limit the meter says how much is used. */
const NEAR_LIMIT = 0.8;

/**
 * The library `Meter`, as shipped, for "used of limit" figures. A null or
 * negative limit means unlimited: the bar is hidden and only the value shows.
 *
 * The readout states the count against its limit ("3 of 10", mirrored from
 * Horizon's "Used x of y"): `format` writes each figure in the quota's unit
 * (`formatMb` reads RAM as "4 GB of 50 GB"), and `unit` names what is
 * counted after the figures ("2 of 10 shares").
 *
 * The library meter has no warning colour (a gap raised in DESIGN-NOTES.md),
 * so the level is said in words: from 80% of the limit the description
 * reads "82% used", and over the limit it reads "Over quota" with a danger
 * `Alert` under the meter.
 *
 * The unlimited row is drawn as the meter's own header row (label and
 * readout), so it lines up with the meters around it.
 */
export function QuotaMeter({
  label,
  value,
  max,
  format = formatNumber,
  unit,
}: {
  label: string;
  value: number;
  max: number | null;
  format?: (value: number) => string;
  unit?: string;
}) {
  const suffix = unit ? ` ${unit}` : "";
  if (max === null || max < 0) {
    return (
      <p className={styles.unlimited}>
        <span className={styles.label}>{label}</span>{" "}
        <span className={styles.value}>
          {`${format(value)}${suffix} (unlimited)`}
        </span>
      </p>
    );
  }
  const over = value > max;
  const ratio = max === 0 ? 1 : value / max;
  const description = over
    ? "Over quota"
    : ratio >= NEAR_LIMIT
      ? `${Math.round(ratio * 100)}% used`
      : null;
  const readout = `${format(value)} of ${format(max)}${suffix}`;
  return (
    <div className={styles.quota}>
      <Meter
        value={Math.min(value, max)}
        minValue={0}
        maxValue={max}
        valueLabel={readout}
      >
        <Label>{label}</Label>
        {description && <Text slot="description">{description}</Text>}
      </Meter>
      {over && (
        <Alert tone="danger">
          Over quota for {label}: {readout}.
        </Alert>
      )}
    </div>
  );
}
