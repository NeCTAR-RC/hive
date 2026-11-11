import type { ReactNode } from "react";
import { Link as AriaLink } from "react-aria-components";
import styles from "./HomeLink.module.scss";

/**
 * The sidebar's Home row, over the sections: a house glyph before the
 * label, filled in Purple-500 while home is the page shown (Darcelle's
 * 15 Oct 2026 mockup). The library `Link` has no current state and cannot
 * be filled, so the row is drawn here, as the list rows are.
 */
export function HomeLink({
  href,
  isCurrent,
  children,
}: {
  href: string;
  /** Marks the row as the page being shown (`aria-current="page"`). */
  isCurrent: boolean;
  children: ReactNode;
}) {
  return (
    <AriaLink
      className={styles.home}
      href={href}
      aria-current={isCurrent ? "page" : undefined}
    >
      <HomeIcon />
      <span className={styles.label}>{children}</span>
    </AriaLink>
  );
}

/**
 * A house in a 24px frame, drawn inline because the library icon set has
 * none: a roof from the apex to eaves 3px in from either side, walls from
 * 5.5 to 18.5, and a 3px door cut into the foot. Filled in the label's
 * colour.
 */
function HomeIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3.5 21 11h-2.5v9h-5v-5.5h-3V20h-5v-9H3z"
        fill="currentColor"
      />
    </svg>
  );
}
