// Every port forwarding rule of the project's unassociated floating IPs,
// or one IP's rules when `?floating_ip=` is given (Horizon's "show" view).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import type { PortForwarding } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { portForwardingsRoute } from "../../../app/router";
import {
  floatingIpsQuery,
  portForwardingsQuery,
  useDeletePortForwardings,
} from "../api";
import { PortForwardingDialog } from "./FloatingIpDialogs";
import styles from "./PortForwardingsPage.module.scss";

const CRUMBS = [
  { label: "Project" },
  { label: "Network" },
  { label: "Floating IPs", href: "/network/floating-ips" },
];

export function PortForwardingsPage() {
  const projectId = useProjectId();
  const search = portForwardingsRoute.useSearch();
  const navigate = useNavigate({ from: portForwardingsRoute.fullPath });
  const floatingIpId = search.floating_ip ?? "";
  const rules = useQuery(
    portForwardingsQuery(projectId, floatingIpId || undefined),
  );
  const fips = useQuery(floatingIpsQuery(projectId));
  const remove = useDeletePortForwardings(projectId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PortForwarding | null>(null);
  const [removing, setRemoving] = useState<PortForwarding[] | null>(null);

  const q = search.q ?? "";
  const setSearch = (patch: { q?: string; floating_ip?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.floating_ip) delete next.floating_ip;
        return next;
      },
      replace: true,
    });

  // Rules can only be added to IPs that are not associated with a port.
  const candidates = useMemo(
    () => (fips.data?.items ?? []).filter((f) => !f.port_id),
    [fips.data],
  );
  const selected = candidates.find((f) => f.id === floatingIpId);

  const columns = useMemo<ColumnDef<PortForwarding>[]>(
    () => [
      {
        id: "external",
        label: "External",
        isRowHeader: true,
        cell: (row) => (
          <code>
            {row.floating_ip_address}:{row.external_port}
          </code>
        ),
        sortValue: (row) => `${row.floating_ip_address} ${row.external_port}`,
        textValue: (row) => `${row.floating_ip_address} ${row.external_port}`,
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol.toUpperCase(),
        sortValue: (row) => row.protocol,
      },
      {
        id: "internal",
        label: "Internal",
        cell: (row) => (
          <code>
            {row.internal_ip_address}:{row.internal_port}
          </code>
        ),
        textValue: (row) => `${row.internal_ip_address} ${row.internal_port}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
        textValue: (row) => row.description,
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(rules.data?.items ?? [], q, columns),
    [rules.data, q, columns],
  );
  const confirmRemove = (targets: PortForwarding[]) => {
    const requests = targets.flatMap((r) =>
      r.floating_ip_id
        ? [{ floatingIpId: r.floating_ip_id, ruleId: r.id }]
        : [],
    );
    remove.mutate(requests, {
      onSuccess: () => {
        notify.success(
          requests.length === 1
            ? "Port forwarding rule deleted."
            : `${requests.length} port forwarding rules deleted.`,
        );
        setRemoving(null);
      },
    });
  };

  return (
    <>
      <PageHeader
        title={
          selected
            ? `Port forwarding rules for ${selected.floating_ip_address}`
            : "Port forwarding rules"
        }
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setAdding(true)}
            isDisabled={!selected}
          >
            Add rule
          </Button>
        }
      />
      <DataTable
        id="port-forwardings"
        label="Port forwarding rules"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={rules.isPending}
        isFetching={rules.isFetching}
        error={rules.error}
        onRetry={() => void rules.refetch()}
        onRefresh={() => void rules.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by address, port or description",
        }}
        resetKey={`${q}|${floatingIpId}`}
        filters={
          <Select
            aria-label="Floating IP"
            labelPosition="side"
            className={styles.ipFilter}
            selectedKey={floatingIpId}
            onSelectionChange={(key: Key | null) =>
              setSearch({ floating_ip: key === null ? "" : String(key) })
            }
          >
            <Label>Floating IP</Label>
            <SelectItem id="" textValue="All unassociated IPs">
              All unassociated IPs
            </SelectItem>
            {candidates.map((f) => (
              <SelectItem
                key={f.id}
                id={f.id}
                textValue={f.floating_ip_address ?? f.id}
              >
                {f.floating_ip_address ?? f.id}
              </SelectItem>
            ))}
          </Select>
        }
        emptyTitle={
          rules.data && rules.data.items.length > 0
            ? "No rules match"
            : "No port forwarding rules"
        }
        emptyBody={
          <p>
            A rule binds a port on an unassociated floating IP to a port on an
            internal address. Choose a floating IP above to add one.
          </p>
        }
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit rule",
            onAction: () => setEditing(row),
          },
          {
            id: "delete",
            label: "Delete rule",
            tone: "danger",
            onAction: () => setRemoving([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (chosen) => setRemoving(chosen),
          },
        ]}
      />
      {adding && selected && (
        <PortForwardingDialog
          projectId={projectId}
          floatingIp={selected}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && editing.floating_ip_id && (
        <PortForwardingDialog
          projectId={projectId}
          floatingIp={{
            id: editing.floating_ip_id,
            floating_ip_address: editing.floating_ip_address,
          }}
          rule={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          removing && removing.length > 1
            ? `Delete ${removing.length} rules?`
            : "Delete this port forwarding rule?"
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => removing && confirmRemove(removing)}
      >
        <p>This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}
