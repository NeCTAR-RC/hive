// Attach configuration group (trove-dashboard databases/forms.py with the Nectar patches):
// a group of the instance's datastore and version.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { DbInstance } from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbOptionsQuery, useAttachConfiguration } from "../../api";

const attachSchema = z.object({
  configuration_id: z.string().min(1, "Choose a configuration group"),
});

/**
 * Attaches a configuration group to the instance, offering only the groups
 * made for its datastore and version; Attach stays disabled until there is
 * a group to choose.
 */
export function AttachConfigurationDialog({
  instance,
  onClose,
}: {
  instance: DbInstance;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(dbOptionsQuery(projectId));
  const { SelectInput } = fieldsFor<z.infer<typeof attachSchema>>();
  const { dialog } = useMutationForm({
    schema: attachSchema,
    defaultValues: { configuration_id: "" },
    mutation: useAttachConfiguration(),
    toVariables: (values) => ({
      id: instance.id,
      configurationId: values.configuration_id,
    }),
    successMessage: `Configuration group attached to ${instance.name || instance.id}.`,
    onDone: onClose,
  });
  const groups = (options.data?.configurations ?? []).filter(
    (c) =>
      c.datastore === instance.datastore &&
      c.datastore_version === instance.datastore_version,
  );
  return (
    <FormDialog
      {...dialog}
      title={`Attach configuration group to ${instance.name || instance.id}`}
      submitLabel="Attach"
      isSubmitDisabled={groups.length === 0}
    >
      {options.isPending ? (
        <SkeletonLines lines={2} />
      ) : options.isError ? (
        <ErrorState
          error={options.error}
          title="Could not load configuration groups"
          onRetry={() => void options.refetch()}
        />
      ) : groups.length === 0 ? (
        <Alert tone="info" role="status">
          No configuration groups exist for {instance.datastore}{" "}
          {instance.datastore_version}.
        </Alert>
      ) : (
        <SelectInput
          name="configuration_id"
          label="Configuration group"
          options={groups.map((g) => ({ id: g.id, label: g.name || g.id }))}
          isRequired
        />
      )}
    </FormDialog>
  );
}
