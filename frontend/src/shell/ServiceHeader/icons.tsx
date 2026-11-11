import styles from "./ServiceHeader.module.scss";

/**
 * The navigation button's glyph ("Icon/List" in the spec's Mobile frame):
 * three 2px strokes at a quarter, half and three quarters of a 24px frame,
 * inset 15.62% from either side.
 */
export function ListIcon() {
  return (
    <svg
      className={styles.listIcon}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
