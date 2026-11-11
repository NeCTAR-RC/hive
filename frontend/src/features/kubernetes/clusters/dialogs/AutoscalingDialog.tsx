// Set a node group's autoscaling limits (magnum-ui clusters/nodegroups).
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { NodeGroup } from "../../../../lib/api/types/kubernetes";
import { useSetAutoscaling } from "../../api";

const autoscalingSchema = z
  .object({
    min_node_count: z.number().int().min(0),
    max_node_count: z.number().int().min(1),
  })
  .refine((v) => v.max_node_count >= v.min_node_count, {
    path: ["max_node_count"],
    message: "The maximum must be at least the minimum",
  });

/**
 * Sets the minimum and maximum node counts the autoscaler keeps a node
 * group between, starting from the group's current limits.
 */
export function AutoscalingDialog({
  clusterId,
  group,
  onClose,
}: {
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const { NumberInput } = fieldsFor<z.infer<typeof autoscalingSchema>>();
  const { dialog } = useMutationForm({
    schema: autoscalingSchema,
    defaultValues: {
      min_node_count: group.min_node_count ?? 0,
      max_node_count: group.max_node_count ?? group.node_count ?? 1,
    },
    mutation: useSetAutoscaling(),
    toVariables: (values) => ({
      clusterId,
      nodeGroupId: group.id,
      min: values.min_node_count,
      max: values.max_node_count,
    }),
    successMessage: `Autoscaling limits for ${group.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Autoscaling for ${group.name}`}
      submitLabel="Save"
    >
      <NumberInput
        name="min_node_count"
        label="Minimum nodes"
        minValue={0}
        isRequired
      />
      <NumberInput
        name="max_node_count"
        label="Maximum nodes"
        minValue={1}
        isRequired
      />
    </FormDialog>
  );
}
