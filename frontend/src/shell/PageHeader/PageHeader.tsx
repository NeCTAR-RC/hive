import type { ReactNode } from "react";
import { Breadcrumb, Breadcrumbs } from "@ardc-ui/react";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import styles from "./PageHeader.module.scss";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  crumbs,
  actions,
  children,
}: {
  title: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <header className={styles.header}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs>
          {crumbs.map((crumb, index) => (
            <Breadcrumb
              key={`${crumb.label}-${index}`}
              href={crumb.href}
              id={`${crumb.label}-${index}`}
            >
              {crumb.label}
            </Breadcrumb>
          ))}
          <Breadcrumb id="current">{title}</Breadcrumb>
        </Breadcrumbs>
      )}
      <div className={styles.row}>
        <h1 tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}
