import type { ReactNode } from "react";
import styles from "./KeyValueList.module.scss";

/** What an empty value shows; import it to match elsewhere. */
export const EMPTY_VALUE = "-";

export interface KeyValue {
  label: string;
  value: ReactNode;
}

/** A definition list laid out as label and value pairs. Pass `onTint`
 * when the list sits on a tinted surface, so the labels keep 4.5:1. */
export function KeyValueList({
  items,
  onTint = false,
}: {
  items: KeyValue[];
  onTint?: boolean;
}) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <dt className={onTint ? styles.labelOnTint : styles.label}>
            {item.label}
          </dt>
          <dd className={styles.value}>
            {item.value === null ||
            item.value === undefined ||
            item.value === ""
              ? EMPTY_VALUE
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
