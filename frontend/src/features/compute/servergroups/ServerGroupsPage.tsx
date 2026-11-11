import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { z } from "zod";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { fieldsFor } from "../../../components/Form/fields";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../components/FormDialog/useMutationForm";
import { toRowActions } from "../../../lib/actions";
import type { ServerGroup } from "../../../lib/api/types/compute";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { serverGroupsQuery, useCreateServerGroup } from "../api";
import { POLICY_LABELS } from "./policies";
import { useServerGroupActions } from "./ServerGroupActions";
import { availableServerGroupActions } from "./status";
import { maxLength } from "../../../lib/validation";

const createSchema = z.object({
  name: maxLength(255).min(1, "Enter a name"),
  policy: z.enum([
    "affinity",
    "anti-affinity",
    "soft-affinity",
    "soft-anti-affinity",
  ]),
});

const serverGroupsRoute = getRouteApi("/app/compute/server-groups");

/** Creates a server group with a name and a scheduling policy. */
function CreateServerGroupDialog({ onClose }: { onClose: () => void }) {
  const { RadioInput, TextInput } = fieldsFor<z.infer<typeof createSchema>>();
  const { dialog } = useMutationForm({
    schema: createSchema,
    defaultValues: { name: "", policy: "anti-affinity" },
    mutation: useCreateServerGroup(),
    toVariables: (values) => values,
    successMessage: (group) => `Server group ${group.name} created.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create server group"
      submitLabel="Create server group"
    >
      <TextInput name="name" label="Name" isRequired />
      <RadioInput
        name="policy"
        label="Policy"
        options={Object.entries(POLICY_LABELS).map(([id, label]) => ({
          id,
          label,
        }))}
      />
    </FormDialog>
  );
}

export function ServerGroupsPage() {
  const projectId = useProjectId();
  const groups = useQuery(serverGroupsQuery(projectId));
  const search = useListSearch(serverGroupsRoute);
  const table = useQueryTable(groups, {
    noun: "server groups",
    search,
    placeholder: "Search server groups",
  });
  const [creating, setCreating] = useState(false);
  const actions = useServerGroupActions();

  const columns = useMemo<ColumnDef<ServerGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/compute/server-groups/$groupId"
            params={{ groupId: row.id }}
          >
            {row.name}
          </AppLink>
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

  return (
    <>
      <PageHeader
        title="Server groups"
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
        getRowId={(row) => row.id}
        {...table}
        {...actions.tableProps}
        emptyBody={
          <p>
            Server groups keep instances together or apart when they are
            scheduled.
          </p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(availableServerGroupActions(row), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (rows) => actions.run("delete", rows),
          },
        ]}
      />
      {creating && (
        <CreateServerGroupDialog onClose={() => setCreating(false)} />
      )}
      {actions.dialogs}
    </>
  );
}
