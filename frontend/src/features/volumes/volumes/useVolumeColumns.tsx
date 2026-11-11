// The columns of the volumes list.
import { useMemo } from "react";
import { AppLink } from "../../../components/AppLink/AppLink";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Volume } from "../../../lib/api/types/volumes";
import { formatGb, formatRelative } from "../../../lib/format";
import { attachmentLabel, statusLabel, statusTone } from "../status";
import styles from "./VolumesPage.module.scss";

/**
 * The volume list's columns. The attachments column names each instance
 * from `instanceNames` (instance id to name) and links to it, so its cells
 * and search text follow the instances list as it loads.
 */
export function useVolumeColumns(
  instanceNames: ReadonlyMap<string, string>,
): ColumnDef<Volume>[] {
  return useMemo<ColumnDef<Volume>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/storage/volumes/$volumeId"
            params={{ volumeId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name || row.id,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        textValue: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => formatGb(row.size_gb),
        sortValue: (row) => row.size_gb ?? 0,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.volume_type ?? "",
        sortValue: (row) => row.volume_type ?? "",
        hideBelow: "md",
      },
      {
        id: "attachments",
        label: "Attached to",
        cell: (row) =>
          row.attachments.length === 0 ? (
            ""
          ) : (
            <ul className={styles.attachments}>
              {row.attachments.map((attachment) => (
                <li key={attachment.id ?? attachment.server_id ?? ""}>
                  {attachment.server_id ? (
                    <AppLink
                      size="sm"
                      to="/compute/instances/$instanceId"
                      params={{ instanceId: attachment.server_id }}
                    >
                      {attachmentLabel(
                        attachment,
                        instanceNames.get(attachment.server_id),
                      )}
                    </AppLink>
                  ) : (
                    attachmentLabel(attachment, undefined)
                  )}
                </li>
              ))}
            </ul>
          ),
        textValue: (row) =>
          row.attachments
            .map((a) =>
              attachmentLabel(
                a,
                a.server_id ? instanceNames.get(a.server_id) : undefined,
              ),
            )
            .join(" "),
        hideBelow: "md",
      },
      {
        id: "availability_zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "bootable",
        label: "Bootable",
        cell: (row) => (row.bootable ? "Yes" : "No"),
        sortValue: (row) => (row.bootable ? 1 : 0),
        hideBelow: "lg",
      },
      {
        id: "encrypted",
        label: "Encrypted",
        cell: (row) => (row.encrypted ? "Yes" : "No"),
        hideBelow: "lg",
        defaultHidden: true,
      },
      {
        id: "created",
        label: "Age",
        cell: (row) =>
          row.created_at ? (
            <time dateTime={row.created_at} title={row.created_at}>
              {formatRelative(row.created_at)}
            </time>
          ) : (
            ""
          ),
        sortValue: (row) => row.created_at ?? "",
        hideBelow: "md",
      },
    ],
    [instanceNames],
  );
}
