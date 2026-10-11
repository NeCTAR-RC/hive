// Template versions (heat-dashboard template_versions panel) and the
// functions each version offers.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import type { TemplateFunction, TemplateVersion } from "../../lib/api/types";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { templateVersionRoute } from "../../app/router";
import { templateFunctionsQuery, templateVersionsQuery } from "./api";
import styles from "./Orchestration.module.scss";

export function TemplateVersionsPage() {
  const projectId = useProjectId();
  const versions = useQuery(templateVersionsQuery(projectId));
  const columns = useMemo<ColumnDef<TemplateVersion>[]>(
    () => [
      {
        id: "version",
        label: "Version",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/orchestration/template-versions/$version"
            params={{ version: row.version }}
            className={styles.nameLink}
          >
            {row.version}
          </RouterLink>
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
        title="Template Versions"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
      />
      <DataTable
        id="template-versions"
        label="Template versions"
        columns={columns}
        rows={versions.data?.items}
        getRowId={(row) => row.version}
        isLoading={versions.isPending}
        isFetching={versions.isFetching}
        error={versions.error}
        onRetry={() => void versions.refetch()}
        onRefresh={() => void versions.refetch()}
        emptyTitle="No template versions"
        defaultSort={{ column: "version", direction: "ascending" }}
      />
    </>
  );
}

export function TemplateVersionDetailPage() {
  const projectId = useProjectId();
  const { version } = templateVersionRoute.useParams();
  const functions = useQuery(templateFunctionsQuery(projectId, version));
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
    <>
      <PageHeader
        title={version}
        crumbs={[
          { label: "Project" },
          { label: "Orchestration" },
          {
            label: "Template Versions",
            href: "/orchestration/template-versions",
          },
        ]}
      />
      <DataTable
        id="template-functions"
        label="Template functions"
        columns={columns}
        rows={functions.data?.items}
        getRowId={(row) => row.functions}
        isLoading={functions.isPending}
        isFetching={functions.isFetching}
        error={functions.error}
        onRetry={() => void functions.refetch()}
        onRefresh={() => void functions.refetch()}
        emptyTitle="No functions"
        defaultSort={{ column: "name", direction: "ascending" }}
      />
    </>
  );
}
