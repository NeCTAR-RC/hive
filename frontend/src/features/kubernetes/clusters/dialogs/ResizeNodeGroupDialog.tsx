// Resize a node group (magnum-ui clusters/nodegroups resize).
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { NodeGroup } from "../../../../lib/api/types/kubernetes";
import { useResizeNodeGroup } from "../../api";

const resizeSchema = z.object({ node_count: z.number().int().min(0) });

/**
 * Sets a node group's node count. A control plane group takes only the
 * supported sizes 1, 3, 5 or 7; workers can be scaled to zero.
 */
export function ResizeNodeGroupDialog({
  clusterId,
  group,
  onClose,
}: {
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const master = group.role === "master";
  const { NumberInput } = fieldsFor<z.infer<typeof resizeSchema>>();
  const { dialog } = useMutationForm({
    schema: master
      ? resizeSchema.refine((v) => [1, 3, 5, 7].includes(v.node_count), {
          path: ["node_count"],
          message: "Supported control plane sizes are 1, 3, 5 or 7.",
        })
      : resizeSchema,
    defaultValues: { node_count: group.node_count ?? 1 },
    mutation: useResizeNodeGroup(),
    toVariables: (values) => ({
      clusterId,
      nodeGroupId: group.id,
      nodeCount: values.node_count,
    }),
    successMessage: `Node group ${group.name} is being resized.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title={`Resize ${group.name}`} submitLabel="Resize">
      <NumberInput
        name="node_count"
        label="Node count"
        description={
          master
            ? "Supported control plane sizes are 1, 3, 5 or 7."
            : "Workers can be scaled to zero."
        }
        minValue={0}
        isRequired
      />
    </FormDialog>
  );
}
