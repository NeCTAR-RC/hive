import type { ReactNode } from "react";
import { Breadcrumb, Breadcrumbs } from "@ardc-ui/react";
import { useDocumentTitle } from "../../lib/hooks/useDocumentTitle";
import styles from "./PageHeader.module.scss";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The top of every page: library breadcrumbs ending in the page itself, the
 * page heading (the global h1 style) and an optional actions slot beside it.
 * The heading takes focus after each navigation (see AppLayout), and its text
 * becomes the document title, or `documentTitle` when the page gives one.
 *
 * A crumb without `href` (the dashboard and group names) leads nowhere, so
 * it is disabled: out of the tab order instead of a dead link (see the
 * DESIGN-NOTES gap "Breadcrumb that is not a link").
 */
export function PageHeader({
  title,
  documentTitle,
  crumbs,
  actions,
  children,
}: {
  title: string;
  documentTitle?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  useDocumentTitle(documentTitle ?? title);
  return (
    <header className={styles.header}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs>
          {crumbs.map((crumb, index) => (
            <Breadcrumb
              key={`${crumb.label}-${index}`}
              href={crumb.href}
              isDisabled={!crumb.href}
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
