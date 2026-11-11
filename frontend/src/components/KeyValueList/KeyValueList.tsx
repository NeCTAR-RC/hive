import type { ReactNode } from "react";
import styles from "./KeyValueList.module.scss";

export interface KeyValue {
  label: string;
  value: ReactNode;
}

/**
 * A definition list of label and value pairs, drawn as the Events - Sidebar
 * block's pairs: each label over its value, two pairs to a row where the
 * list is wide enough for them, one where it is not (a narrow column, a
 * phone). An empty value shows a dash.
 */
export function KeyValueList({ items }: { items: KeyValue[] }) {
  return (
    <div className={styles.frame}>
      <dl className={styles.list}>
        {items.map((item) => (
          <div key={item.label} className={styles.row}>
            <dt className={styles.label}>{item.label}</dt>
            <dd className={styles.value}>
              {item.value === null ||
              item.value === undefined ||
              item.value === ""
                ? "-"
                : item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
