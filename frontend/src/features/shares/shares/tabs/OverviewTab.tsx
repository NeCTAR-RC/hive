// The share detail page's overview tab: details, export locations,
// capabilities and metadata (manila-ui share detail).
import { Alert } from "@ardc-ui/react";
import { CopyButton } from "../../../../components/CopyButton/CopyButton";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import type { ShareDetail } from "../../../../lib/api/types/shares";
import { formatDateTime, formatWithUnit } from "../../../../lib/format";
import { statusLabel, statusTone } from "../../status";
import styles from "../../Shares.module.scss";

/**
 * Everything known about one share, with a note when its snapshots stand
 * in the way of deleting it.
 */
export function OverviewTab({ share }: { share: ShareDetail }) {
  return (
    <div className={styles.stack}>
      {share.has_snapshot && (
        <Alert tone="info" role="status">
          This share has snapshots. Delete them before deleting the share.
        </Alert>
      )}
      <div className={styles.grid}>
        <Panel title="Details">
          <KeyValueList
            items={[
              {
                label: "Status",
                value: (
                  <StatusPill tone={statusTone(share.status)}>
                    {statusLabel(share.status)}
                  </StatusPill>
                ),
              },
              { label: "Size", value: formatWithUnit(share.size, "GiB") },
              { label: "Protocol", value: share.protocol },
              { label: "Share type", value: share.share_type },
              {
                label: "Availability zone",
                value: share.availability_zone,
              },
              {
                label: "Visibility",
                value: share.is_public ? "Public" : "Private",
              },
              { label: "Description", value: share.description },
              {
                label: "Created",
                value: formatDateTime(share.created_at),
              },
              { label: "ID", value: <code>{share.id}</code> },
            ]}
          />
        </Panel>
        <Panel title="Export locations">
          {share.export_locations.length === 0 ? (
            <p className={styles.muted}>
              Not available until the share is ready.
            </p>
          ) : (
            <ul className={styles.list}>
              {share.export_locations.map((location) => (
                <li key={location.id ?? location.path ?? ""}>
                  {location.path}
                  {location.preferred ? " (preferred)" : ""}{" "}
                  {location.path && <CopyButton text={location.path} />}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Capabilities">
          <KeyValueList
            items={[
              {
                label: "Snapshots",
                value: share.snapshot_support ? "Supported" : "Not supported",
              },
              {
                label: "Revert to snapshot",
                value: share.revert_to_snapshot_support
                  ? "Supported"
                  : "Not supported",
              },
              {
                label: "Mountable snapshots",
                value: share.mount_snapshot_support
                  ? "Supported"
                  : "Not supported",
              },
              { label: "Share group", value: share.share_group_id },
              { label: "Source snapshot", value: share.snapshot_id },
              { label: "Task state", value: share.task_state },
            ]}
          />
        </Panel>
        <Panel title="Metadata">
          {Object.keys(share.metadata).length === 0 ? (
            <p className={styles.muted}>None</p>
          ) : (
            <KeyValueList
              items={Object.entries(share.metadata).map(([key, value]) => ({
                label: key,
                value: <code>{value}</code>,
              }))}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}
