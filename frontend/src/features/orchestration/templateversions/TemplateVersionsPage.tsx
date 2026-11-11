// Template versions (heat-dashboard template_versions panel), each linking
// to the functions it offers.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import type { TemplateVersion } from "../../../lib/api/types/orchestration";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { templateVersionsQuery } from "../api";

/** The template versions Heat supports, each linking to its functions. */
export function TemplateVersionsPage() {
  const projectId = useProjectId();
  const versions = useQuery(templateVersionsQuery(projectId));
  const versionsTable = useQueryTable(versions, {
    noun: "template versions",
    emptyTitle: "No template versions",
  });
  const columns = useMemo<ColumnDef<TemplateVersion>[]>(
    () => [
      {
        id: "version",
        label: "Version",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/orchestration/template-versions/$version"
            params={{ version: row.version }}
          >
            {row.version}
          </AppLink>
        ),
        sortValue: (row) => row.version,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => row.type,
        sortValue: (row) => row.type,
      },
      {
        id: "aliases",
        label: "Aliases",
        cell: (row) => (row.aliases ?? []).join(", "),
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Template versions"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
      />
      <DataTable
        id="template-versions"
        label="Template versions"
        columns={columns}
        getRowId={(row) => row.version}
        {...versionsTable}
        defaultSort={{ column: "version", direction: "ascending" }}
      />
    </>
  );
}
