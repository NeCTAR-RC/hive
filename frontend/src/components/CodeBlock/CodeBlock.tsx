import { CopyButton } from "../CopyButton/CopyButton";
import styles from "./CodeBlock.module.scss";

/** Preformatted text (keys, logs, config) with a copy control. */
export function CodeBlock({
  text,
  label,
  maxHeight,
  wrap = false,
}: {
  text: string;
  label: string;
  maxHeight?: string;
  wrap?: boolean;
}) {
  return (
    <div className={styles.block}>
      <div className={styles.bar}>
        <span className={styles.label}>{label}</span>
        <CopyButton text={text} />
      </div>
      {/* A scrollable region needs a tab stop (axe: scrollable-region-focusable). */}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
      <pre
        className={wrap ? styles.wrap : styles.pre}
        tabIndex={0}
        aria-label={label}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {text}
      </pre>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
    </div>
  );
}
