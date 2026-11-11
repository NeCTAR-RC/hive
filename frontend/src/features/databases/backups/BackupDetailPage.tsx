// One database backup (trove-dashboard database_backups detail): its
// information and the instance it was taken from.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows } from "../../../lib/actions";
import type { DbBackup } from "../../../lib/api/types/databases";
import { formatDateTime, formatWithUnit } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { dbBackupQuery } from "../api";
import { useBackupActions } from "./BackupActions";
import {
  availableDbBackupActions,
  datastoreLabel,
  statusLabel,
  statusTone,
} from "../status";
import styles from "../Databases.module.scss";

const dbBackupRoute = getRouteApi("/app/databases/backups/$backupId");

const BACKUP_CRUMBS = [
  { label: "Project" },
  { label: "Database" },
  { label: "Backups", href: "/databases/backups" },
];

/** How long the backup took, in whole seconds, when Trove recorded both times. */
function backupDuration(backup: DbBackup): number | null {
  return backup.created && backup.updated
    ? Math.max(
        0,
        Math.round(
          (Date.parse(backup.updated) - Date.parse(backup.created)) / 1000,
        ),
      )
    : null;
}

/**
 * One backup's information and its source instance, with Restore and
 * Delete; a delete returns to the backups list.
 */
export function BackupDetailPage() {
  const projectId = useProjectId();
  const { backupId } = dbBackupRoute.useParams();
  const navigate = useNavigate();
  const backup = useQuery(dbBackupQuery(projectId, backupId));
  const { run, dialogs } = useBackupActions(
    () => void navigate({ to: "/databases/backups" }),
  );
  return (
    <>
      <DetailPage
        query={backup}
        noun="database backup"
        id={backupId}
        crumbs={BACKUP_CRUMBS}
        backTo={{ label: "database backups", href: "/databases/backups" }}
        title={(data) => data.name || data.id}
        actions={(data) => (
          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => run("restore", [data])}
              isDisabled={!allows(availableDbBackupActions(data), "restore")}
            >
              Restore
            </Button>
            <Button
              variant="secondary"
              tone="danger"
              size="sm"
              onPress={() => run("delete", [data])}
            >
              Delete
            </Button>
          </div>
        )}
      >
        {(data) => (
          <div className={styles.grid}>
            <Panel title="Information" headingLevel={2}>
              <KeyValueList
                items={[
                  {
                    label: "Status",
                    value: (
                      <StatusPill tone={statusTone(data.status_kind)}>
                        {statusLabel(data.status)}
                      </StatusPill>
                    ),
                  },
                  { label: "Description", value: data.description },
                  { label: "Datastore", value: datastoreLabel(data) },
                  {
                    label: "Backup file",
                    value: data.location ? <code>{data.location}</code> : null,
                  },
                  {
                    label: "Initial volume size",
                    value: formatWithUnit(data.size, "GB"),
                  },
                  {
                    label: "Created",
                    value: formatDateTime(data.created),
                  },
                  {
                    label: "Updated",
                    value: formatDateTime(data.updated),
                  },
                  {
                    label: "Duration",
                    value: formatWithUnit(backupDuration(data), "seconds"),
                  },
                  { label: "ID", value: <code>{data.id}</code> },
                ]}
              />
            </Panel>
            <Panel title="Database" headingLevel={2}>
              <KeyValueList
                items={[
                  {
                    label: "Instance",
                    value: data.instance_id ? (
                      <AppLink
                        to="/databases/instances/$instanceId"
                        params={{ instanceId: data.instance_id }}
                      >
                        {data.instance_name || data.instance_id}
                      </AppLink>
                    ) : null,
                  },
                  {
                    label: "Instance status",
                    value: data.instance_status
                      ? statusLabel(data.instance_status)
                      : null,
                  },
                  {
                    label: "Parent backup",
                    value: data.parent_id ? (
                      <AppLink
                        to="/databases/backups/$backupId"
                        params={{ backupId: data.parent_id }}
                      >
                        {data.parent_name || data.parent_id}
                      </AppLink>
                    ) : (
                      "None (full backup)"
                    ),
                  },
                ]}
              />
            </Panel>
          </div>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}
