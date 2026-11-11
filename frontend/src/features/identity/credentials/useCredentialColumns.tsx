// The columns of the list of EC2 keys in other projects.
import { useMemo } from "react";
import type { ColumnDef } from "../../../components/DataTable/DataTable";
import type { Credential } from "../../../lib/api/types/identity";
import { ec2AccessKey } from "./ec2";

/**
 * The EC2 key list's columns: the project, named from `projectNames`
 * (project id to name) and falling back to its id, and the access key as
 * text. The secret is never shown here; it belongs to that project's page.
 */
export function useCredentialColumns(
  projectNames: ReadonlyMap<string, string>,
): ColumnDef<Credential>[] {
  return useMemo<ColumnDef<Credential>[]>(
    () => [
      {
        id: "project",
        label: "Project",
        isRowHeader: true,
        cell: (row) =>
          row.project_id
            ? (projectNames.get(row.project_id) ?? (
                <code>{row.project_id}</code>
              ))
            : "",
        sortValue: (row) =>
          row.project_id
            ? (projectNames.get(row.project_id) ?? row.project_id)
            : "",
      },
      {
        id: "access",
        label: "Access key",
        cell: (row) => <code>{ec2AccessKey(row.blob) ?? ""}</code>,
        sortValue: (row) => ec2AccessKey(row.blob) ?? "",
      },
      {
        id: "id",
        label: "ID",
        cell: (row) => <code>{row.id}</code>,
        hideBelow: "lg",
        defaultHidden: true,
      },
    ],
    [projectNames],
  );
}
