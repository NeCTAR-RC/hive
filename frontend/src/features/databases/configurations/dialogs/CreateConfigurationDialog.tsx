// Create configuration group (trove-dashboard database_configurations
// forms.py): a group for a datastore version.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { maxLength } from "../../../../lib/validation";
import { dbConfigurationsQuery, useCreateConfiguration } from "../../api";

const createSchema = z.object({
  name: maxLength(64).min(1, "Enter a name"),
  description: maxLength(255),
  datastore: z.string().min(1, "Select datastore type and version"),
});

/**
 * Creates a configuration group for one datastore version, preselecting the
 * only version once the list loads.
 */
export function CreateConfigurationDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const configurations = useQuery(dbConfigurationsQuery(projectId));
  const datastores = useMemo(
    () => configurations.data?.datastores ?? [],
    [configurations.data],
  );
  // The only datastore version is preselected once the list loads.
  const preselected = useMemo(
    () => ({
      name: "",
      description: "",
      datastore:
        datastores.length === 1
          ? `${datastores[0]?.datastore}/${datastores[0]?.version}`
          : "",
    }),
    [datastores],
  );
  const { SelectInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof createSchema>>();
  const { dialog } = useMutationForm({
    schema: createSchema,
    values: preselected,
    mutation: useCreateConfiguration(),
    toVariables: (values) => {
      const [datastore, version] = values.datastore.split("/", 2);
      return {
        name: values.name,
        datastore: datastore ?? "",
        version: version ?? "",
        ...(values.description ? { description: values.description } : {}),
      };
    },
    successMessage: (created) => `Created configuration group ${created.name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create configuration group"
      submitLabel="Create"
      isSubmitDisabled={!configurations.isSuccess}
    >
      {configurations.isPending ? (
        <SkeletonLines lines={3} />
      ) : configurations.isError ? (
        <ErrorState
          error={configurations.error}
          title="Could not load datastores"
          onRetry={() => void configurations.refetch()}
        />
      ) : (
        <>
          <TextInput name="name" label="Name" isRequired />
          <TextAreaInput name="description" label="Description" />
          <SelectInput
            name="datastore"
            label="Datastore"
            placeholder="Select datastore type and version"
            options={datastores.map((d) => ({
              id: `${d.datastore}/${d.version}`,
              label: d.label,
            }))}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}
