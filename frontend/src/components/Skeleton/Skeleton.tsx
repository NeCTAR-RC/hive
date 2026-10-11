import styles from "./Skeleton.module.scss";

export function Skeleton({
  width = "100%",
  height,
  variant = "text",
  className,
}: {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "block" | "circle";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      style={{ width, height }}
    />
  );
}

/** Several text lines, for paragraphs and list placeholders. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? "60%" : "100%"} />
      ))}
    </span>
  );
}
