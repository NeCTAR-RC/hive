// The Static routes tab of a router's detail page.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import type {
  HostRoute,
  RouterDetail,
} from "../../../../lib/api/types/network";
import { routerRouteWriteKeys, setRouterRoutes } from "../../api";
import { AddRouteDialog } from "../dialogs/AddRouteDialog";
import { routeId, withoutRoutes } from "../staticRoutes";

/**
 * The router's static routes with Add static route. Deleting any number
 * of them is one request that sends the routes that remain.
 */
export function StaticRoutesTab({ router }: { router: RouterDetail }) {
  const [adding, setAdding] = useState(false);
  const bulk = useBulkAction<HostRoute, "delete">({
    noun: { one: "static route", many: "static routes" },
    name: (route) => `${route.destination} via ${route.nexthop}`,
    getId: routeId,
    invalidates: routerRouteWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        // Neutron keeps the routes as one list: one request sends the rest.
        batch: async (routes) => {
          await setRouterRoutes(
            router.id,
            withoutRoutes(router.routes, routes),
          );
          return { succeeded: routes, failed: [] };
        },
        title: (routes) =>
          routes.length === 1
            ? `Delete the route to ${routes[0]?.destination}?`
            : `Delete ${routes.length} static routes?`,
      },
    },
  });
  const columns = useMemo<ColumnDef<HostRoute>[]>(
    () => [
      {
        id: "destination",
        label: "Destination CIDR",
        isRowHeader: true,
        cell: (row) => <code>{row.destination}</code>,
        sortValue: (row) => row.destination,
      },
      {
        id: "nexthop",
        label: "Next hop",
        cell: (row) => <code>{row.nexthop}</code>,
        sortValue: (row) => row.nexthop,
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="router-routes"
        label="Static routes"
        columns={columns}
        rows={router.routes}
        getRowId={routeId}
        {...bulk.tableProps}
        emptyTitle="No static routes"
        emptyBody={
          <p>
            Static routes send traffic for a destination through a chosen next
            hop.
          </p>
        }
        toolbarActions={
          <Button variant="primary" size="xs" onPress={() => setAdding(true)}>
            Add static route
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete static route",
            tone: "danger",
            onAction: () => bulk.run("delete", [row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => bulk.run("delete", selected),
          },
        ]}
      />
      {adding && (
        <AddRouteDialog router={router} onClose={() => setAdding(false)} />
      )}
      {bulk.dialog}
    </>
  );
}
