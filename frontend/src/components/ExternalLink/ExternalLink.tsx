import type { ReactNode } from "react";
import { ArrowUpRightFromSquare } from "@ardc-ui/react";
import styles from "./ExternalLink.module.scss";

/** A link that leaves the dashboard; the icon and hidden text say so. */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={[styles.link, className].filter(Boolean).join(" ")}
      rel="noopener"
    >
      {children}
      <ArrowUpRightFromSquare aria-hidden="true" />
      <span className="visually-hidden">(external site)</span>
    </a>
  );
}
