// Load balancers (octavia-dashboard loadbalancers panel): the project's
// load balancers with their statuses and floating IPs.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { LoadBalancer } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import {
  loadBalancersQuery,
  useDeleteLoadBalancer,
  useDisassociateLbFloatingIp,
} from "./api";
import {
  AssociateFipDialog,
  EditLoadBalancerDialog,
} from "./LoadBalancerDialogs";
import {
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "./status";
import styles from "./LoadBalancers.module.scss";

type Dialog = { kind: "edit" | "associate"; lb: LoadBalancer } | null;

export function LoadBalancersPage() {
  const projectId = useProjectId();
  const lbs = useQuery(loadBalancersQuery(projectId));
  const remove = useDeleteLoadBalancer(projectId);
  const disassociate = useDisassociateLbFloatingIp(projectId);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleting, setDeleting] = useState<LoadBalancer[]>([]);

  const columns = useMemo<ColumnDef<LoadBalancer>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/load-balancers/$lbId"
            params={{ lbId: row.id }}
            className={styles.nameLink}
          >
            {row.name || row.id}
          </RouterLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""}`,
      },
      {
        id: "vip",
        label: "IP address",
        cell: (row) => (
          <span>
            {row.vip_address}
            {row.floating_ip && (
              <span className={styles.muted}> ({row.floating_ip.address})</span>
            )}
          </span>
        ),
        sortValue: (row) => row.vip_address ?? "",
        textValue: (row) =>
          `${row.vip_address ?? ""} ${row.floating_ip?.address ?? ""}`,
      },
      {
        id: "zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
      {
        id: "operating",
        label: "Operating status",
        cell: (row) => (
          <StatusPill tone={operatingTone(row.operating_status)}>
            {operatingLabel(row.operating_status)}
          </StatusPill>
        ),
        sortValue: (row) => row.operating_status ?? "",
        hideBelow: "md",
      },
      {
        id: "provisioning",
        label: "Provisioning status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
        sortValue: (row) => row.provisioning_status ?? "",
      },
      {
        id: "admin",
        label: "Admin state",
        cell: (row) => (row.admin_state_up ? "Up" : "Down"),
        hideBelow: "lg",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(lbs.data?.items ?? [], query, columns),
    [lbs.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((lb) => remove.mutateAsync(lb.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting load balancer ${deleting[0]?.name || deleting[0]?.id}.`
          : `Deleting ${deleting.length} load balancers.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} load balancers.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Load Balancers"
        crumbs={[{ label: "Project" }, { label: "Network" }]}
        actions={
          <Link variant="primary" size="sm" href="/load-balancers/new">
            Create load balancer
          </Link>
        }
      />
      <DataTable
        id="load-balancers"
        label="Load balancers"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={lbs.isPending}
        isFetching={lbs.isFetching}
        error={lbs.error}
        onRetry={() => void lbs.refetch()}
        onRefresh={() => void lbs.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search load balancers",
        }}
        resetKey={query}
        emptyTitle={
          lbs.data?.items.length
            ? "No load balancers match"
            : "No load balancers yet"
        }
        emptyBody={
          lbs.data?.items.length === 0 ? (
            <p>
              Create a load balancer to spread traffic across your instances.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit",
            onAction: () => setDialog({ kind: "edit", lb: row }),
          },
          row.floating_ip
            ? {
                id: "disassociate",
                label: "Disassociate floating IP",
                onAction: () =>
                  disassociate.mutate(row.id, {
                    onSuccess: () =>
                      notify.success("Floating IP disassociated."),
                    onError: () =>
                      notify.danger("Could not disassociate the floating IP."),
                  }),
              }
            : {
                id: "associate",
                label: "Associate floating IP",
                isDisabled: !row.vip_port_id,
                disabledReason: "The load balancer has no VIP port yet.",
                onAction: () => setDialog({ kind: "associate", lb: row }),
              },
          {
            id: "delete",
            label: "Delete load balancer",
            tone: "danger",
            isDisabled: !row.can_delete,
            disabledReason: `Unable to delete the load balancer while it is ${provisioningLabel(row.provisioning_status).toLowerCase()}.`,
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) => selected.every((lb) => !lb.can_delete),
            onAction: (selected) =>
              setDeleting(selected.filter((lb) => lb.can_delete)),
          },
        ]}
      />
      {dialog?.kind === "edit" && (
        <EditLoadBalancerDialog
          projectId={projectId}
          lb={dialog.lb}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "associate" && (
        <AssociateFipDialog
          projectId={projectId}
          lb={dialog.lb}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete load balancer ${deleting[0]?.name || deleting[0]?.id}?`
            : `Delete ${deleting.length} load balancers?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Its listeners, pools, members, health monitors and policies are
          deleted with it. This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
