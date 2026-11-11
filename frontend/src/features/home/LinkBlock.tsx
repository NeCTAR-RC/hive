// A titled block of link rows on the home page.
import type { ReactNode } from "react";
import styles from "./HomePage.module.scss";

/**
 * A titled run of link rows in an "Info - Sidebar" block: the block's
 * Body/16/Bold title over its rows.
 */
export function LinkBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.block}>
      <div className={styles.pair}>
        <h3 className={styles.pairTitle}>{title}</h3>
        <ul className={styles.list}>{children}</ul>
      </div>
    </div>
  );
}
