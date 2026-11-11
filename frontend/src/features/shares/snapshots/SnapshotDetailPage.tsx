// One share snapshot (manila-ui share_snapshots panel): its details, and
// its export locations and access rules when the share supports mounting
// snapshots.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { formatDateTime, formatWithUnit } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { denySnapshotAccess, shareSnapshotQuery, shareWriteKeys } from "../api";
import { EditSnapshotDialog } from "./dialogs/EditSnapshotDialog";
import { SnapshotAccessDialog } from "./dialogs/SnapshotAccessDialog";
import { snapshotRuleColumns, type SnapshotRule } from "./snapshotRuleColumns";
import { statusLabel, statusTone } from "../status";
import styles from "../Shares.module.scss";

const shareSnapshotRoute = getRouteApi("/app/shares/snapshots/$snapshotId");

const SNAPSHOT_CRUMBS = [
  { label: "Project" },
  { label: "Share" },
  { label: "Share snapshots", href: "/shares/snapshots" },
];

/**
 * One share snapshot's detail page. Rules can be added only while the
 * snapshot is available or in use.
 */
export function SnapshotDetailPage() {
  const projectId = useProjectId();
  const { snapshotId } = shareSnapshotRoute.useParams();
  const snapshot = useQuery(shareSnapshotQuery(projectId, snapshotId));
  const [dialog, setDialog] = useState<"access" | "edit" | null>(null);
  const deny = useBulkAction<SnapshotRule, "delete">({
    noun: { one: "access rule", many: "access rules" },
    name: (rule) => rule.access_to,
    getId: (rule) => rule.id,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (rule) => denySnapshotAccess(snapshotId, rule.id),
        title: (rules) => {
          const [only] = rules;
          return rules.length === 1 && only
            ? `Delete the rule for ${only.access_to}?`
            : `Delete ${rules.length} access rules?`;
        },
        body: <p>Clients using this rule lose access to the snapshot.</p>,
      },
    },
  });
  return (
    <>
      <DetailPage
        query={snapshot}
        noun="share snapshot"
        id={snapshotId}
        crumbs={SNAPSHOT_CRUMBS}
        backTo={{ label: "share snapshots", href: "/shares/snapshots" }}
        title={(data) => data.name || data.id}
        actions={() => (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setDialog("edit")}
          >
            Edit
          </Button>
        )}
      >
        {(data) => (
          <div className={styles.stack}>
            <div className={styles.grid}>
              <Panel title="Details" headingLevel={2}>
                <KeyValueList
                  items={[
                    {
                      label: "Status",
                      value: (
                        <StatusPill tone={statusTone(data.status)}>
                          {statusLabel(data.status)}
                        </StatusPill>
                      ),
                    },
                    { label: "Size", value: formatWithUnit(data.size, "GiB") },
                    {
                      label: "Source share",
                      value: data.share_id ? (
                        <AppLink
                          to="/shares/shares/$shareId"
                          params={{ shareId: data.share_id }}
                        >
                          {data.share_name || data.share_id}
                        </AppLink>
                      ) : null,
                    },
                    { label: "Description", value: data.description },
                    {
                      label: "Created",
                      value: formatDateTime(data.created_at),
                    },
                    { label: "ID", value: <code>{data.id}</code> },
                  ]}
                />
              </Panel>
              {data.mount_snapshot_support && (
                <Panel title="Export locations" headingLevel={2}>
                  {(data.export_locations ?? []).length === 0 ? (
                    <p className={styles.muted}>None</p>
                  ) : (
                    <ul className={styles.list}>
                      {(data.export_locations ?? []).map((location) => (
                        <li key={location.id}>{location.path}</li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
            </div>
            {data.mount_snapshot_support && (
              <DataTable
                id="snapshot-rules"
                label="Snapshot access rules"
                columns={snapshotRuleColumns}
                rows={data.access_rules ?? []}
                getRowId={(row) => row.id}
                {...deny.tableProps}
                isLoading={false}
                isFetching={snapshot.isFetching}
                onRefresh={() => void snapshot.refetch()}
                toolbarActions={
                  <Button
                    size="xs"
                    onPress={() => setDialog("access")}
                    isDisabled={
                      !["available", "in-use"].includes(
                        (data.status ?? "").toLowerCase(),
                      )
                    }
                  >
                    Add rule
                  </Button>
                }
                emptyTitle="No snapshot access rules"
                rowActions={(row) => [
                  {
                    id: "delete",
                    label: "Delete rule",
                    tone: "danger",
                    onAction: () => deny.run("delete", [row]),
                  },
                ]}
              />
            )}
          </div>
        )}
      </DetailPage>
      {snapshot.data && dialog === "access" && (
        <SnapshotAccessDialog
          snapshot={snapshot.data}
          onClose={() => setDialog(null)}
        />
      )}
      {snapshot.data && dialog === "edit" && (
        <EditSnapshotDialog
          snapshot={snapshot.data}
          onClose={() => setDialog(null)}
        />
      )}
      {deny.dialog}
    </>
  );
}
