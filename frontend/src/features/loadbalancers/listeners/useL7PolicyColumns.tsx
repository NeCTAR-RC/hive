// The columns of a listener's L7 policies table.
import { useMemo } from "react";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import type { L7Policy, Pool } from "../../../lib/api/types/loadbalancers";
import { humanise } from "../../../lib/status";
import { provisioningLabel, provisioningTone } from "../status";

/**
 * The policy columns; a redirect's target is its URL, its prefix, or its
 * pool named from `pools`.
 */
export function useL7PolicyColumns(
  pools: Pool[] | undefined,
): ColumnDef<L7Policy>[] {
  return useMemo<ColumnDef<L7Policy>[]>(
    () => [
      {
        id: "position",
        label: "Position",
        cell: (row) => row.position ?? "",
        sortValue: (row) => row.position ?? 0,
      },
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => row.name || row.id,
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "action",
        label: "Action",
        cell: (row) => humanise(row.action),
      },
      {
        id: "target",
        label: "Target",
        cell: (row) =>
          row.redirect_url ??
          row.redirect_prefix ??
          (row.redirect_pool_id
            ? pools?.find((p) => p.id === row.redirect_pool_id)?.name ||
              row.redirect_pool_id
            : ""),
        hideBelow: "md",
      },
      { id: "rules", label: "Rules", cell: (row) => row.rules.length },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
      },
    ],
    [pools],
  );
}
