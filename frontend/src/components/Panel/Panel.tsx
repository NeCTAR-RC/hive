import type { ReactNode } from "react";
import styles from "./Panel.module.scss";

/** The white content panel with an optional heading row, as in Horizon. */
export function Panel({
  title,
  headingLevel = 2,
  actions,
  children,
  className,
}: {
  title?: string;
  headingLevel?: 2 | 3;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section className={[styles.panel, className].filter(Boolean).join(" ")}>
      {title && (
        <div className={styles.head}>
          <Heading className={styles.title}>{title}</Heading>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
