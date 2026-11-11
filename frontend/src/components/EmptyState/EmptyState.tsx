import type { ReactNode } from "react";
import styles from "./EmptyState.module.scss";

/**
 * What a panel or page says when it has nothing to show, drawn as the
 * content of the CTA - Sidebar block: a Heading/H4 title, optional body
 * text, and an optional action under them. A `DataTable` does not use it:
 * the library table's own empty cell speaks there.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        {children && <div className={styles.body}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
