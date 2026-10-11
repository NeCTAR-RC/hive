// A ranked list of values with proportional bars: the accessible stand-in
// for the pie and bar charts on the usage pages. Each row is real text with
// the value and share, so nothing depends on colour or a canvas.
import { formatNumber } from "../../lib/format";
import styles from "./BarList.module.scss";

export interface BarListItem {
  id: string;
  label: string;
  value: number;
  muted?: boolean;
}

export interface BarListProps {
  items: BarListItem[];
  /** Unit shown after each value, such as "SU". */
  unit: string;
  "aria-label": string;
}

const PALETTE = 5;

export function BarList({ items, unit, "aria-label": label }: BarListProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const largest = items.reduce((max, item) => Math.max(max, item.value), 0);
  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item, index) => {
        const share = total > 0 ? (item.value / total) * 100 : 0;
        const width = largest > 0 ? (item.value / largest) * 100 : 0;
        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.row}>
              <span className={styles.label}>{item.label}</span>
              <span className={styles.value}>
                {formatNumber(item.value)} {unit}
                <span className={styles.share}>
                  {" "}
                  ({share < 1 && share > 0 ? "<1" : Math.round(share)}%)
                </span>
              </span>
            </div>
            <div className={styles.track} aria-hidden="true">
              <div
                className={
                  item.muted
                    ? styles.barOther
                    : styles[`bar${(index % PALETTE) + 1}`]
                }
                style={{ width: `${Math.max(width, 0.5)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
