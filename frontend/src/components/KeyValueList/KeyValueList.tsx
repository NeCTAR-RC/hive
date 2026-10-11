import type { ReactNode } from "react";
import styles from "./KeyValueList.module.scss";

export interface KeyValue {
  label: string;
  value: ReactNode;
}

/** A definition list laid out as label and value pairs. */
export function KeyValueList({ items }: { items: KeyValue[] }) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <dt className={styles.label}>{item.label}</dt>
          <dd className={styles.value}>
            {item.value === null ||
            item.value === undefined ||
            item.value === ""
              ? "—"
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
