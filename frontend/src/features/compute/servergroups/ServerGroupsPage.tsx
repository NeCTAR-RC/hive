import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { filterRows } from "../../../components/DataTable/filter";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { RadioInput, TextInput } from "../../../components/Form/fields";
import type { ServerGroup } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  serverGroupsQuery,
  useCreateServerGroup,
  useDeleteServerGroup,
} from "../api";
import { POLICY_LABELS } from "./policies";
import styles from "./ServerGroupsPage.module.scss";

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(255, "At most 255 characters"),
  policy: z.enum([
    "affinity",
    "anti-affinity",
    "soft-affinity",
    "soft-anti-affinity",
  ]),
});

export function ServerGroupsPage() {
  const projectId = useProjectId();
  const groups = useQuery(serverGroupsQuery(projectId));
  const create = useCreateServerGroup(projectId);
  const remove = useDeleteServerGroup(projectId);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ServerGroup[]>([]);

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", policy: "anti-affinity" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: (group) => {
        notify.success(`Server group ${group.name} created.`);
        form.reset();
        setCreating(false);
      },
    });
  });

  const columns = useMemo<ColumnDef<ServerGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/compute/server-groups/$groupId"
            params={{ groupId: row.id }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "policy",
        label: "Policy",
        cell: (row) => POLICY_LABELS[row.policy] ?? row.policy,
        sortValue: (row) => row.policy,
        textValue: (row) => row.policy,
      },
      {
        id: "members",
        label: "Members",
        cell: (row) => row.members.length,
        sortValue: (row) => row.members.length,
        hideBelow: "md",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(groups.data?.items ?? [], query, columns),
    [groups.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((g) => remove.mutateAsync(g.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Server group ${deleting[0]?.name} deleted.`
          : `${deleting.length} server groups deleted.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} server groups.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Server Groups"
        crumbs={[{ label: "Project" }, { label: "Compute" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create server group
          </Button>
        }
      />
      <DataTable
        id="server-groups"
        label="Server groups"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={groups.isPending}
        isFetching={groups.isFetching}
        error={groups.error}
        onRetry={() => void groups.refetch()}
        onRefresh={() => void groups.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search server groups",
        }}
        resetKey={query}
        emptyTitle={
          groups.data?.items.length
            ? "No server groups match"
            : "No server groups yet"
        }
        emptyBody={
          groups.data?.items.length === 0 ? (
            <p>
              Server groups keep instances together or apart when they are
              scheduled.
            </p>
          ) : null
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete server group",
            tone: "danger",
            onAction: () => setDeleting([row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => setDeleting(rows),
          },
        ]}
      />
      <FormDialog
        isOpen={creating}
        onOpenChange={(open) => {
          if (!open) form.reset();
          setCreating(open);
        }}
        title="Create server group"
        submitLabel="Create server group"
        onSubmit={submit}
        isPending={create.isPending}
        error={create.error}
      >
        <TextInput control={form.control} name="name" label="Name" isRequired />
        <RadioInput
          control={form.control}
          name="policy"
          label="Policy"
          options={Object.entries(POLICY_LABELS).map(([id, label]) => ({
            id,
            label,
          }))}
        />
      </FormDialog>
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete server group ${deleting[0]?.name}?`
            : `Delete ${deleting.length} server groups?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Instances in the group are not affected; only the grouping is removed.
        </p>
      </ConfirmDialog>
    </>
  );
}
