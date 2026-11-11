import type { ReactNode } from "react";
import { ChevronRight } from "@ardc-ui/react";
import styles from "./RelatedList.module.scss";

/**
 * A list of links to related resources (an instance's security groups, a
 * server group's members, a volume's attachments), drawn as the
 * sidebar-blocks spec's "Related list - Sidebar": rows of `RelatedRow`.
 */
export function RelatedList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

/**
 * One row of a `RelatedList`: the purple chevron, then the link (an
 * `AppLink`, the library `Link` as shipped) or plain text when the target
 * cannot be linked, with an optional line of detail under it.
 */
export function RelatedRow({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className={styles.row}>
      <span className={styles.icon}>
        <ChevronRight />
      </span>
      <div className={styles.body}>
        {children}
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
    </li>
  );
}
