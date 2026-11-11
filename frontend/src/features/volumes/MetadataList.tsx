// The metadata of a volume or a snapshot, as an overview row shows it.
import styles from "./Volumes.module.scss";

/**
 * The metadata pairs one to a line. The caller shows no list when there
 * are none, so the overview shows its empty value.
 */
export function MetadataList({
  metadata,
}: {
  metadata: Record<string, string>;
}) {
  return (
    <ul className={styles.metadata}>
      {Object.entries(metadata).map(([key, value]) => (
        <li key={key}>
          <code>{key}</code> = <code>{value}</code>
        </li>
      ))}
    </ul>
  );
}
