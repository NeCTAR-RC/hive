import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import type { Key } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { Network } from "../../../lib/api/types";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { networksRoute } from "../../../app/router";
import { networkQuotaQuery, panelNetworksQuery } from "../api";
import {
  adminStateLabel,
  availableNetworkActions,
  quotaLeft,
  statusLabel,
  statusTone,
} from "../status";
import { useNetworkActions } from "./NetworkActions";
import { CreateNetworkDialog } from "./NetworkDialogs";
import styles from "./NetworksPage.module.scss";

const SCOPES: { id: string; label: string }[] = [
  { id: "", label: "All networks" },
  { id: "project", label: "My project's networks" },
  { id: "shared", label: "Shared networks" },
  { id: "external", label: "External networks" },
];

const CRUMBS = [{ label: "Project" }, { label: "Network" }];

export function NetworksPage() {
  const projectId = useProjectId();
  const search = networksRoute.useSearch();
  const navigate = useNavigate({ from: networksRoute.fullPath });
  const networks = useQuery(panelNetworksQuery(projectId));
  const quota = useQuery(networkQuotaQuery(projectId));
  const { run, runDelete, dialogs } = useNetworkActions(projectId);

  const q = search.q ?? "";
  const scope = search.scope ?? "";
  const setSearch = (patch: { q?: string; scope?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.q) delete next.q;
        if (!next.scope) delete next.scope;
        return next;
      },
      replace: true,
    });
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        delete next.create;
        return open ? { ...next, create: true } : next;
      },
      replace: true,
    });

  const columns = useMemo<ColumnDef<Network>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/network/networks/$networkId"
            params={{ networkId: row.id }}
          >
            {row.name}
          </RouterLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "subnets",
        label: "Subnets",
        cell: (row) =>
          row.subnets.length === 0 ? (
            ""
          ) : (
            <ul className={styles.subnets}>
              {row.subnets.map((subnet) => (
                <li key={subnet.id}>
                  {subnet.name ? `${subnet.name} ` : ""}
                  <code>{subnet.cidr}</code>
                </li>
              ))}
            </ul>
          ),
        textValue: (row) =>
          row.subnets.map((s) => `${s.name ?? ""} ${s.cidr ?? ""}`).join(" "),
      },
      {
        id: "shared",
        label: "Shared",
        cell: (row) => (row.is_shared ? "Yes" : "No"),
        sortValue: (row) => (row.is_shared ? 1 : 0),
        hideBelow: "md",
      },
      {
        id: "external",
        label: "External",
        cell: (row) => (row.is_external ? "Yes" : "No"),
        sortValue: (row) => (row.is_external ? 1 : 0),
        hideBelow: "md",
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
        id: "admin_state",
        label: "Admin state",
        cell: (row) => adminStateLabel(row.admin_state_up),
        sortValue: (row) => (row.admin_state_up ? 1 : 0),
        hideBelow: "lg",
      },
      {
        id: "zones",
        label: "Availability zones",
        cell: (row) => row.availability_zones.join(", "),
        hideBelow: "lg",
        defaultHidden: true,
      },
    ],
    [],
  );

  const rows = useMemo(() => {
    let list = networks.data?.items ?? [];
    if (scope === "project") list = list.filter((n) => n.is_project);
    if (scope === "shared") list = list.filter((n) => n.is_shared);
    if (scope === "external") list = list.filter((n) => n.is_external);
    return filterRows(list, q, columns);
  }, [networks.data, scope, q, columns]);

  const canCreate = quotaLeft(quota.data, "network");
  return (
    <>
      <PageHeader
        title="Networks"
        crumbs={CRUMBS}
        actions={
          <Button
            variant="primary"
            size="sm"
            onPress={() => setCreating(true)}
            isDisabled={!canCreate}
          >
            {canCreate ? "Create network" : "Create network (quota exceeded)"}
          </Button>
        }
      />
      <DataTable
        id="networks"
        label="Networks"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={networks.isPending}
        isFetching={networks.isFetching}
        error={networks.error}
        onRetry={() => void networks.refetch()}
        onRefresh={() => void networks.refetch()}
        search={{
          value: q,
          onChange: (value) => setSearch({ q: value }),
          placeholder: "Search by name or subnet",
        }}
        resetKey={`${q}|${scope}`}
        filters={
          <Select
            aria-label="Show"
            labelPosition="side"
            className={styles.scopeFilter}
            selectedKey={scope}
            onSelectionChange={(key: Key | null) =>
              setSearch({ scope: key === null ? "" : String(key) })
            }
          >
            <Label>Show</Label>
            {SCOPES.map((option) => (
              <SelectItem
                key={option.id}
                id={option.id}
                textValue={option.label}
              >
                {option.label}
              </SelectItem>
            ))}
          </Select>
        }
        emptyTitle={
          networks.data && networks.data.items.length > 0
            ? "No networks match"
            : "No networks"
        }
        emptyBody={
          networks.data && networks.data.items.length === 0 ? (
            <p>Create a network to give your instances a private subnet.</p>
          ) : null
        }
        rowActions={(row) =>
          availableNetworkActions(row, quota.data).map((action) => ({
            id: action.id,
            label: action.label,
            onAction: () => run(row, action.id),
            isDisabled: action.isDisabled,
            ...(action.disabledReason
              ? { disabledReason: action.disabledReason }
              : {}),
            ...(action.tone ? { tone: action.tone } : {}),
          }))
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => runDelete(selected),
            isDisabled: (selected) => selected.some((row) => !row.is_project),
          },
        ]}
      />
      {dialogs}
      <CreateNetworkDialog
        key={search.create ? "open" : "closed"}
        projectId={projectId}
        isOpen={Boolean(search.create)}
        onOpenChange={setCreating}
      />
    </>
  );
}
