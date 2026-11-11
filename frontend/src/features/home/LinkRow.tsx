// One row of the home page's related-links lists.
import { ChevronRight } from "@ardc-ui/react";
import type { ReactNode } from "react";
import styles from "./HomePage.module.scss";

/**
 * One row of a related-links list (the sidebar-blocks spec's "Related list
 * - Sidebar"), composed as the library's own sidebar-blocks pattern composes
 * it: the purple chevron, then the library `Link` (or a link `Button`) as
 * shipped. `meta` is a line of detail under the label.
 */
export function LinkRow({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: string;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.rowIcon}>
        <ChevronRight />
      </span>
      <div className={styles.rowBody}>
        {children}
        {meta && <span className={styles.rowMeta}>{meta}</span>}
      </div>
    </li>
  );
}
