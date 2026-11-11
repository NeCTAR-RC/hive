// Rolling upgrade of a cluster to a newer Kubernetes version (magnum-ui
// rolling-upgrade).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { Cluster } from "../../../../lib/api/types/kubernetes";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { upgradeOptionsQuery, useUpgradeCluster } from "../../api";

const upgradeSchema = z.object({
  template_id: z.string().min(1, "Choose a Kubernetes version"),
});

/**
 * Upgrades a cluster to one of the template versions the backend offers
 * (its template's upgrade targets, the only ones Magnum accepts); nodes
 * are replaced one at a time. Upgrade stays disabled until there is a
 * version to choose.
 */
export function UpgradeClusterDialog({
  cluster,
  onClose,
}: {
  cluster: Cluster;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(upgradeOptionsQuery(projectId, cluster.id));
  const targets = useMemo(() => options.data?.targets ?? [], [options.data]);
  // The first target is preselected once the targets load; a
  // choice the user has already made survives refetches.
  const preselected = useMemo(
    () => ({ template_id: targets[0]?.template_id ?? "" }),
    [targets],
  );
  const { SelectInput } = fieldsFor<z.infer<typeof upgradeSchema>>();
  const { dialog } = useMutationForm({
    schema: upgradeSchema,
    values: preselected,
    mutation: useUpgradeCluster(),
    toVariables: (values) => ({
      clusterId: cluster.id,
      templateId: values.template_id,
    }),
    successMessage: `Cluster ${cluster.name} is being upgraded to the new Kubernetes version.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Upgrade ${cluster.name}`}
      submitLabel="Upgrade"
      isSubmitDisabled={targets.length === 0}
    >
      {options.isPending ? (
        <SkeletonLines lines={3} />
      ) : options.isError ? (
        <ErrorState
          error={options.error}
          title="Could not load the upgrade targets"
          onRetry={() => void options.refetch()}
        />
      ) : targets.length === 0 ? (
        <Alert tone="info" role="status">
          This cluster is already on the latest Kubernetes version.
        </Alert>
      ) : (
        <>
          <p>
            The cluster runs Kubernetes{" "}
            {options.data.current_version ?? "(unknown)"}. Nodes are replaced
            one at a time with the new version.
          </p>
          <SelectInput
            name="template_id"
            label="New Kubernetes version"
            options={targets.map((t) => ({
              id: t.template_id,
              label: t.kubernetes_version ?? t.name,
            }))}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}
