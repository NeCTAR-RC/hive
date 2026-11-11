// Shares (manila-ui shares panel): the project's shares with quota, and
// the create, edit, resize, revert, snapshot, rules and delete actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { Share } from "../../../lib/api/types/shares";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { quotaPair } from "../../../lib/quota";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { sharesQuery } from "../api";
import { useShareActions } from "./ShareActions";
import { CreateShareDialog } from "./dialogs/CreateShareDialog";
import { availableShareActions, statusLabel, statusTone } from "../status";
import styles from "../Shares.module.scss";

const sharesRoute = getRouteApi("/app/shares/shares");

/**
 * The project's shares with their quota meters; the create dialog opens
 * from the header or from a snapshot's "create share" link.
 */
export function SharesPage() {
  const projectId = useProjectId();
  const shares = useQuery(sharesQuery(projectId));
  const search = useListSearch(sharesRoute);
  const table = useQueryTable(shares, {
    noun: "shares",
    search,
    placeholder: "Search shares",
  });
  const { run, dialogs, tableProps } = useShareActions();
  const creating = search.params.create === true;
  // Closing the dialog also forgets the snapshot a link preselected.
  const setCreating = (open: boolean) =>
    search.patch(
      open ? { create: true } : { create: false, snapshot: undefined },
    );

  const columns = useMemo<ColumnDef<Share>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/shares/shares/$shareId"
            params={{ shareId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""} ${row.protocol ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "size",
        label: "Size",
        cell: (row) => (row.size === null ? "" : `${row.size} GiB`),
        sortValue: (row) => row.size ?? 0,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol ?? "",
        sortValue: (row) => row.protocol ?? "",
        hideBelow: "md",
      },
      {
        id: "visibility",
        label: "Visibility",
        cell: (row) => (row.is_public ? "Public" : "Private"),
        hideBelow: "lg",
      },
      {
        id: "type",
        label: "Share type",
        cell: (row) => row.share_type ?? "",
        hideBelow: "lg",
      },
    ],
    [],
  );
  const quota = shares.data?.quota;
  const shareCount = quotaPair(quota, "maxTotalShares", "totalSharesUsed");
  const storage = quotaPair(
    quota,
    "maxTotalShareGigabytes",
    "totalShareGigabytesUsed",
  );

  return (
    <>
      <PageHeader
        title="Shares"
        crumbs={[{ label: "Project" }, { label: "Share" }]}
        actions={
          <Button
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={shares.data ? !shares.data.can_create : false}
          >
            Create share
          </Button>
        }
      >
        {shares.data && (
          <div className={styles.meters}>
            <QuotaMeter
              label="Shares"
              value={shareCount.used}
              max={shareCount.max}
              unit="shares"
            />
            <QuotaMeter
              label="Share storage"
              value={storage.used}
              max={storage.max}
              unit="GiB"
            />
            {!shares.data.can_create && shares.data.create_reason && (
              <p className={styles.muted}>{shares.data.create_reason}</p>
            )}
          </div>
        )}
      </PageHeader>
      <DataTable
        id="shares"
        label="Shares"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={
          <p>Create a share to mount a file system from several instances.</p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableShareActions(row), (id) => run(id, [row]))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((share) =>
                allows(availableShareActions(share), "delete"),
              ),
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {creating && (
        <CreateShareDialog
          snapshotId={search.params.snapshot ?? null}
          onClose={() => setCreating(false)}
        />
      )}
      {dialogs}
    </>
  );
}
