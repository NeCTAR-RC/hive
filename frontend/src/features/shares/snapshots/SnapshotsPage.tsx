// Share snapshots (manila-ui share_snapshots panel): the project's
// snapshots with their quota, and the edit, create share, rules and delete
// actions.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { allows, toRowActions } from "../../../lib/actions";
import type { ShareSnapshot } from "../../../lib/api/types/shares";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { quotaPair } from "../../../lib/quota";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { deleteSnapshot, shareSnapshotsQuery, shareWriteKeys } from "../api";
import { EditSnapshotDialog } from "./dialogs/EditSnapshotDialog";
import { snapshotColumns } from "./snapshotColumns";
import {
  availableShareSnapshotActions,
  type ShareSnapshotActionId,
} from "../status";
import styles from "../Shares.module.scss";

const snapshotsRoute = getRouteApi("/app/shares/snapshots");

/**
 * The project's share snapshots with their quota meters. A row's "create
 * share" opens the shares page's create dialog with the snapshot as source.
 */
export function SnapshotsPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const snapshots = useQuery(shareSnapshotsQuery(projectId));
  const search = useListSearch(snapshotsRoute);
  const table = useQueryTable(snapshots, {
    noun: "share snapshots",
    noMatchTitle: "No snapshots match",
    search,
    placeholder: "Search snapshots",
  });
  const [editing, setEditing] = useState<ShareSnapshot | null>(null);
  const remove = useBulkAction<ShareSnapshot, "delete">({
    noun: { one: "snapshot", many: "snapshots" },
    name: (snapshot) => snapshot.name || snapshot.id,
    getId: (snapshot) => snapshot.id,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (snapshot) => deleteSnapshot(snapshot.id),
        body: <p>Shares created from the snapshot are not affected.</p>,
        eligible: (snapshot) =>
          allows(availableShareSnapshotActions(snapshot), "delete"),
        skippedWhy: "they are busy",
      },
    },
  });

  /** Runs one row menu action on `snapshot`. */
  const runAction = (id: ShareSnapshotActionId, snapshot: ShareSnapshot) => {
    if (id === "edit") {
      setEditing(snapshot);
    } else if (id === "create-share") {
      void navigate({
        to: "/shares/shares",
        search: { create: true, snapshot: snapshot.id },
      });
    } else if (id === "rules") {
      void navigate({
        to: "/shares/snapshots/$snapshotId",
        params: { snapshotId: snapshot.id },
      });
    } else {
      remove.run("delete", [snapshot]);
    }
  };

  const quota = snapshots.data?.quota;
  const snapshotCount = quotaPair(
    quota,
    "maxTotalShareSnapshots",
    "totalShareSnapshotsUsed",
  );
  const storage = quotaPair(
    quota,
    "maxTotalSnapshotGigabytes",
    "totalSnapshotGigabytesUsed",
  );

  return (
    <>
      <PageHeader
        title="Share snapshots"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
      >
        {snapshots.data && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Snapshots"
              value={snapshotCount.used}
              max={snapshotCount.max}
              unit="snapshots"
            />
            <QuotaMeter
              label="Snapshot storage"
              value={storage.used}
              max={storage.max}
              unit="GiB"
            />
          </div>
        )}
      </PageHeader>
      <DataTable
        id="share-snapshots"
        label="Share snapshots"
        columns={snapshotColumns}
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        emptyBody={
          <p>
            Create a snapshot from a share's actions to keep a point-in-time
            copy.
          </p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableShareSnapshotActions(row), (id) =>
            runAction(id, row),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((snapshot) =>
                allows(availableShareSnapshotActions(snapshot), "delete"),
              ),
            onAction: (selected) => remove.run("delete", selected),
          },
        ]}
      />
      {editing && (
        <EditSnapshotDialog
          snapshot={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {remove.dialog}
    </>
  );
}
