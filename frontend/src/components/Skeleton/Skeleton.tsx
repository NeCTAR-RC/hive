// Placeholders shaped like the content they stand in for. Use them where
// the layout is known before the data: table rows (DataTable), page shells
// and detail panels, so the page does not jump when the data lands.
//
// For a dialog body or another small content area whose shape is not worth
// drawing, use the design system's Loading instead: a role="status" spinner
// with a message, e.g. <Loading>Loading flavours...</Loading> from
// @ardc-ui/react. Skeletons are aria-hidden; pair them with a live region
// (DataTable has one) or a Loading so assistive tech hears the wait.
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
