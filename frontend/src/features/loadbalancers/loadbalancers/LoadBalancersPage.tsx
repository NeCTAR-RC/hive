// Load balancers (octavia-dashboard loadbalancers panel): the project's
// load balancers with their statuses and floating IPs.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { LoadBalancer } from "../../../lib/api/types/loadbalancers";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { loadBalancersQuery } from "../api";
import { useLoadBalancerActions } from "./LoadBalancerActions";
import {
  availableLoadBalancerActions,
  operatingLabel,
  operatingTone,
  provisioningLabel,
  provisioningTone,
} from "../status";
import styles from "../LoadBalancers.module.scss";

const loadBalancersRoute = getRouteApi("/app/load-balancers");

export function LoadBalancersPage() {
  const projectId = useProjectId();
  const lbs = useQuery(loadBalancersQuery(projectId));
  const search = useListSearch(loadBalancersRoute);
  const table = useQueryTable(lbs, {
    noun: "load balancers",
    search,
    placeholder: "Search load balancers",
  });
  const { run, dialogs, tableProps } = useLoadBalancerActions();

  const columns = useMemo<ColumnDef<LoadBalancer>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/load-balancers/$lbId"
            params={{ lbId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
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
              <span className={styles.note}> ({row.floating_ip.address})</span>
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

  return (
    <>
      <PageHeader
        title="Load balancers"
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
        getRowId={(row) => row.id}
        {...table}
        {...tableProps}
        emptyBody={
          <p>Create a load balancer to spread traffic across your instances.</p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableLoadBalancerActions(row), (id) =>
            run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            isDisabled: (selected) =>
              !selected.some((lb) =>
                allows(availableLoadBalancerActions(lb), "delete"),
              ),
            onAction: (selected) => run("delete", selected),
          },
        ]}
      />
      {dialogs}
    </>
  );
}
