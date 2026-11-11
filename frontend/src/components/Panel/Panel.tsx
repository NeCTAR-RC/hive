import type { ReactNode } from "react";
import styles from "./Panel.module.scss";

/**
 * A titled block of content: the design system's sidebar block (the library
 * `sidebar-block` mixin) with a Heading/H4 title, as the CTA - Sidebar block
 * draws it. `actions` sit in a row under the title; the content follows.
 * The title takes the H4 style at either heading level, so a panel reads the
 * same wherever it sits in the page outline.
 */
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
      {title && <Heading className={styles.title}>{title}</Heading>}
      {actions && <div className={styles.actions}>{actions}</div>}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
