import type { ReactNode } from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { ChevronRight } from "@ardc-ui/react";
import styles from "./LinkRows.module.scss";

type LinkRowTarget =
  | { href: string; download?: boolean; onPress?: never }
  | { href?: never; download?: never; onPress: () => void };

export type LinkRowProps = LinkRowTarget & {
  children: ReactNode;
  /** Marks the row as the page being shown (`aria-current="page"`). */
  isCurrent?: boolean;
};

/**
 * One row of a related-links list (the sidebar-blocks spec's "Related list -
 * Sidebar"): a purple chevron before a bold label, the whole row one target.
 * A link with `href`, or a button with `onPress` for actions that sit among
 * links (request help, sign out). Render it inside a `LinkRowList`. The
 * navigation's page rows are the same row (Hakkim, 2026-10-21: the spec's
 * row, chevron included, rather than a plainer form of Hive's own).
 *
 * The library `Link` draws the same label but has no current state and cannot
 * be recoloured, so the row is drawn here from the spec.
 */
export function LinkRow({
  href,
  download,
  onPress,
  isCurrent = false,
  children,
}: LinkRowProps) {
  const content = (
    <>
      <span className={styles.icon}>
        <ChevronRight />
      </span>
      <span className={styles.label}>{children}</span>
    </>
  );
  return (
    <li>
      {href !== undefined ? (
        <AriaLink
          href={href}
          download={download}
          className={styles.row}
          aria-current={isCurrent ? "page" : undefined}
        >
          {content}
        </AriaLink>
      ) : (
        <AriaButton className={styles.row} onPress={onPress}>
          {content}
        </AriaButton>
      )}
    </li>
  );
}

/** The list a run of `LinkRow`s sits in. */
export function LinkRowList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

/**
 * A titled run of rows ("Compute", "Network"): the title over its list, as
 * the Info - Sidebar block pairs a title with its content, the rows
 * indented under it.
 */
export function LinkGroup({
  heading,
  headingLevel = 3,
  children,
}: {
  /** The group's title; a group without one is a bare list. */
  heading?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.group}>
      {heading && <Heading className={styles.heading}>{heading}</Heading>}
      <LinkRowList>{children}</LinkRowList>
    </div>
  );
}

/** A stack of `LinkGroup`s, 20px apart. */
export function LinkGroups({ children }: { children: ReactNode }) {
  return <div className={styles.groups}>{children}</div>;
}
