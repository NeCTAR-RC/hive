// Resize instance (trove-dashboard databases/forms.py with the Nectar patches): a new
// flavour for the instance's datastore version.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { DbInstance } from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbResizeFlavorsQuery, useResizeInstance } from "../../api";
import { flavorLabel } from "../../status";

const flavorSchema = z.object({
  flavor: z.string().min(1, "Choose a flavour"),
});

/**
 * Moves the instance to another flavour its datastore version offers.
 * Resize stays disabled until there is a flavour to choose.
 */
export function ResizeInstanceDialog({
  instance,
  onClose,
}: {
  instance: DbInstance;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  // Only the flavours Trove associates with the instance's datastore
  // version, without the current one (the backend applies the same rule).
  const candidates = useQuery(dbResizeFlavorsQuery(projectId, instance.id));
  const { SelectInput } = fieldsFor<z.infer<typeof flavorSchema>>();
  const { dialog } = useMutationForm({
    schema: flavorSchema,
    defaultValues: { flavor: "" },
    mutation: useResizeInstance(),
    toVariables: (values) => ({ id: instance.id, flavor: values.flavor }),
    successMessage: `Resizing ${instance.name || instance.id}.`,
    onDone: onClose,
  });
  const flavors = candidates.data?.items ?? [];
  return (
    <FormDialog
      {...dialog}
      title={`Resize ${instance.name || instance.id}`}
      submitLabel="Resize instance"
      isSubmitDisabled={flavors.length === 0}
    >
      {candidates.isPending ? (
        <SkeletonLines lines={2} />
      ) : candidates.isError ? (
        <ErrorState
          error={candidates.error}
          title="Could not load flavours"
          onRetry={() => void candidates.refetch()}
        />
      ) : (
        <>
          <p>
            The current flavour is {instance.flavor_name ?? instance.flavor_id}.
            {flavors.length === 0
              ? ` No other flavour is available for ${instance.datastore ?? "this datastore"} ${instance.datastore_version ?? ""}.`
              : ""}
          </p>
          <SelectInput
            name="flavor"
            label="New flavour"
            options={flavors.map((f) => ({
              id: f.id ?? "",
              label: flavorLabel(f),
            }))}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}
