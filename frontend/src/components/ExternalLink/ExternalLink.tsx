// A link that leaves the dashboard: the design system's Link with its
// external-link icon (the idiom nectar-eligibility uses). It opens in the
// same tab unless the caller passes a target; the DS adds rel for _blank.
import type { ReactNode } from "react";
import { Link } from "@ardc-ui/react";
import type { LinkSize } from "@ardc-ui/react";
import styles from "./ExternalLink.module.scss";

export interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Pass "_blank" to open a new tab; the hidden hint then says so. */
  target?: string;
  size?: LinkSize;
  /** Let a long label (a URL shown as its own link text) break across
   * lines instead of widening the page. */
  wrap?: boolean;
}

export function ExternalLink({
  href,
  children,
  className,
  target,
  size,
  wrap = false,
}: ExternalLinkProps) {
  const newTab = target === "_blank";
  const classes = [wrap ? styles.wrap : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Link
      variant="link"
      href={href}
      iconAfter="arrow-up-right-from-square"
      {...(target ? { target } : {})}
      {...(size ? { size } : {})}
      {...(classes ? { className: classes } : {})}
    >
      {children}
      <span className="visually-hidden">
        {newTab ? " (external site, opens in a new tab)" : " (external site)"}
      </span>
    </Link>
  );
}
