import { Loader } from "@ardc-ui/react";
import styles from "./StatusPill.module.scss";

export type StatusTone =
  "neutral" | "info" | "success" | "warning" | "danger" | "progress";

/** A status word with a tone. Never colour alone: the text is the signal. */
export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: string;
}) {
  return (
    <span className={`${styles.pill} ${styles[tone]}`} data-tone={tone}>
      {tone === "progress" && (
        <Loader aria-hidden="true" className={styles.spinner} />
      )}
      {children}
    </span>
  );
}
