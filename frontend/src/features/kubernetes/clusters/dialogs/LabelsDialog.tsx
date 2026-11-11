// Change a node group's labels and taints (Nectar magnum-ui node group
// labels and taints support).
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { NodeGroup } from "../../../../lib/api/types/kubernetes";
import { useSetNodeLabels } from "../../api";
import { formatLabels, formatTaints } from "../../status";
import { labelsField, taintsField } from "./schema";

const labelsSchema = z.object({
  node_labels: labelsField,
  node_taints: taintsField,
});

/**
 * Replaces a node group's labels and taints; empty fields remove them all.
 * The change rolls a new node in for every node of the group.
 */
export function LabelsDialog({
  clusterId,
  group,
  onClose,
}: {
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const { TextInput } = fieldsFor<z.infer<typeof labelsSchema>>();
  const { dialog } = useMutationForm({
    schema: labelsSchema,
    defaultValues: {
      node_labels: formatLabels(group.node_labels),
      node_taints: formatTaints(group.node_taints),
    },
    mutation: useSetNodeLabels(),
    toVariables: (values) => ({
      clusterId,
      nodeGroupId: group.id,
      labels: values.node_labels,
      taints: values.node_taints,
    }),
    successMessage: `Labels and taints for ${group.name} are being applied.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Labels and taints for ${group.name}`}
      submitLabel="Apply"
    >
      <Alert tone="warning" role="status">
        Changing node labels or taints replaces every node in the node group
        with a new node (a rolling replacement).
      </Alert>
      <TextInput
        name="node_labels"
        label="Kubernetes node labels"
        description="key=value pairs separated by commas. Leave empty to remove all labels."
      />
      <TextInput
        name="node_taints"
        label="Node taints"
        description="key=value:Effect pairs separated by commas. Leave empty to remove all taints."
      />
    </FormDialog>
  );
}
