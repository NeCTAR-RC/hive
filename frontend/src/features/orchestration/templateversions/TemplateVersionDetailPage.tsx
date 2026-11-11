// One template version (heat-dashboard template_versions detail): the
// functions it offers.
import { useMemo } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { TemplateFunction } from "../../../lib/api/types/orchestration";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { templateFunctionsQuery } from "../api";

const templateVersionRoute = getRouteApi(
  "/app/orchestration/template-versions/$version",
);

/** The intrinsic functions a template version offers, by name. */
export function TemplateVersionDetailPage() {
  const projectId = useProjectId();
  const { version } = templateVersionRoute.useParams();
  const functions = useQuery(templateFunctionsQuery(projectId, version));
  const functionsTable = useQueryTable(functions, {
    noun: "functions",
    emptyTitle: "No functions",
  });
  const columns = useMemo<ColumnDef<TemplateFunction>[]>(
    () => [
      {
        id: "name",
        label: "Function",
        isRowHeader: true,
        cell: (row) => <code>{row.functions}</code>,
        sortValue: (row) => row.functions,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description,
      },
    ],
    [],
  );
  return (
    <DetailPage
      query={functions}
      noun="template version"
      id={version}
      idIsName
      crumbs={[
        { label: "Project" },
        { label: "Orchestration" },
        {
          label: "Template versions",
          href: "/orchestration/template-versions",
        },
      ]}
      backTo={{
        label: "template versions",
        href: "/orchestration/template-versions",
      }}
      title={() => version}
    >
      {() => (
        <DataTable
          id="template-functions"
          label="Template functions"
          columns={columns}
          getRowId={(row) => row.functions}
          {...functionsTable}
          defaultSort={{ column: "name", direction: "ascending" }}
        />
      )}
    </DetailPage>
  );
}
