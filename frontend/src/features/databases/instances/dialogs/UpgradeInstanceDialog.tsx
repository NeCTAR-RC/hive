// Upgrade instance (trove-dashboard databases/forms.py with the Nectar patches): a
// newer version of the instance's datastore.
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
import { dbUpgradeTargetsQuery, useUpgradeInstance } from "../../api";

const upgradeSchema = z.object({
  version_id: z.string().min(1, "Choose a version"),
});

/**
 * Upgrades the instance to a datastore version Trove offers as a target,
 * or says that none is available; Upgrade stays disabled until there is a
 * version to choose.
 */
export function UpgradeInstanceDialog({
  instance,
  onClose,
}: {
  instance: DbInstance;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const targets = useQuery(dbUpgradeTargetsQuery(projectId, instance.id));
  const { SelectInput } = fieldsFor<z.infer<typeof upgradeSchema>>();
  const { dialog } = useMutationForm({
    schema: upgradeSchema,
    defaultValues: { version_id: "" },
    mutation: useUpgradeInstance(),
    toVariables: (values) => ({
      id: instance.id,
      versionId: values.version_id,
    }),
    successMessage: `Upgrading ${instance.name || instance.id}.`,
    onDone: onClose,
  });
  const items = targets.data?.items ?? [];
  return (
    <FormDialog
      {...dialog}
      title={`Upgrade ${instance.name || instance.id}`}
      submitLabel="Upgrade"
      isSubmitDisabled={items.length === 0}
    >
      {targets.isPending ? (
        <SkeletonLines lines={2} />
      ) : targets.isError ? (
        <ErrorState
          error={targets.error}
          title="Could not load versions"
          onRetry={() => void targets.refetch()}
        />
      ) : (
        <>
          <p>
            The instance runs {instance.datastore}{" "}
            {targets.data?.current ?? instance.datastore_version}.
          </p>
          {items.length === 0 ? (
            <Alert tone="info" role="status">
              No new versions available.
            </Alert>
          ) : (
            <SelectInput
              name="version_id"
              label="New version"
              placeholder="Select a new version"
              options={items.map((t) => ({
                id: t.version_id ?? "",
                label: t.label,
              }))}
              isRequired
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
