import { CopyIconButton } from "../CopyButton/CopyIconButton";
import styles from "./CodeBlock.module.scss";

/**
 * Text to read and copy (keys, logs, config), drawn as the design system's
 * "Cite this resource" block: the label on a grey block, the text on a white
 * panel inside it, and the copy glyph at the end of the panel. The text is
 * in the body face (the design system has no code face). Long lines scroll
 * sideways unless `wrap` is set; `maxHeight` overrides the default scroll
 * height.
 */
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
      <span className={styles.label}>{label}</span>
      <div className={styles.panel}>
        {/* A scrollable region needs a tab stop (axe: scrollable-region-focusable). */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
        <pre
          className={styles.text}
          data-wrap={wrap || undefined}
          tabIndex={0}
          aria-label={label}
          style={maxHeight ? { maxHeight } : undefined}
        >
          {text}
        </pre>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
        <CopyIconButton text={text} label={`Copy ${label}`} />
      </div>
    </div>
  );
}
