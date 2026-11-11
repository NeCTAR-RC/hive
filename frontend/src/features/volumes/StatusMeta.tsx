// The status under a volume, snapshot or backup detail page's title.
import { StatusPill } from "../../components/StatusPill/StatusPill";
import { statusLabel, statusTone } from "./status";
import styles from "./Volumes.module.scss";

/** The record's status as a pill in the header, as the instance page has. */
export function StatusMeta({ status }: { status: string }) {
  return (
    <div className={styles.statusRow}>
      <StatusPill tone={statusTone(status)}>{statusLabel(status)}</StatusPill>
    </div>
  );
}
