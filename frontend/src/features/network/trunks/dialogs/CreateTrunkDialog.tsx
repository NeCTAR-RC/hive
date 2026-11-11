// Create a trunk from a parent port with optional subports (Horizon's
// Angular trunks workflow).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { trunkOptionsQuery, useCreateTrunk } from "../../api";
import { portLabel } from "./portLabel";
import { createTrunkRequest } from "./request";
import { createTrunkSchema, type CreateTrunkValues } from "./schema";
import { SubportRows } from "./SubportRows";
import groups from "../../DialogGroups.module.scss";

/**
 * The create trunk dialog: details and a parent port in one group, the
 * subport rows in the next. The chosen parent is never offered as a
 * subport.
 */
export function CreateTrunkDialog({ onClose }: { onClose: () => void }) {
  const projectId = useProjectId();
  const options = useQuery(trunkOptionsQuery(projectId));
  const { SelectInput, SwitchInput, TextInput } =
    fieldsFor<CreateTrunkValues>();
  const { form, dialog } = useMutationForm({
    schema: createTrunkSchema,
    defaultValues: {
      name: "",
      description: "",
      admin_state_up: true,
      port_id: "",
      sub_ports: [],
    },
    mutation: useCreateTrunk(),
    toVariables: createTrunkRequest,
    successMessage: (trunk) => `Created trunk ${trunk.name || trunk.id}.`,
    onDone: onClose,
  });
  const parents = options.data?.parents ?? [];
  const parentId = useWatch({ control: form.control, name: "port_id" });
  const subports = options.data?.subports;
  const candidates = useMemo(
    () => (subports ?? []).filter((port) => port.id !== parentId),
    [subports, parentId],
  );
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title="Create trunk"
      submitLabel="Create trunk"
      size="lg"
    >
      <div className={groups.groups}>
        <div className={groups.group}>
          <TextInput name="name" label="Trunk name" />
          <TextInput name="description" label="Description" />
          <SwitchInput
            name="admin_state_up"
            label="Enable admin state (the trunk is up)"
          />
          <SelectInput
            name="port_id"
            label="Parent port"
            options={parents.map((p) => ({ id: p.id, label: portLabel(p) }))}
            isRequired
            isDisabled={options.isPending || parents.length === 0}
            placeholder={
              options.isPending
                ? "Loading ports..."
                : parents.length === 0
                  ? "No port can be a parent"
                  : "Choose a port"
            }
            description="A port that is up, free or attached to an instance, and not in a trunk yet."
          />
        </div>
        <SubportRows candidates={candidates} isLoading={options.isPending} />
      </div>
    </FormDialog>
  );
}
