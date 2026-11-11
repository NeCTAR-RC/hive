// Create a node group in a cluster (magnum-ui clusters/nodegroups with the
// Nectar labels and taints support).
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { formatMb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { clusterOptionsQuery, useCreateNodeGroup } from "../../api";
import { labelsField, taintsField } from "./schema";

const createSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a name")
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_\-.]*$/,
        "Start with a letter; letters, numbers, dots, dashes and underscores",
      ),
    flavor_id: z.string().min(1, "Choose a flavour"),
    node_count: z.number().int().min(1, "At least one node"),
    autoscaling: z.boolean(),
    min_node_count: z.number().int().min(0).optional(),
    max_node_count: z.number().int().min(1).optional(),
    boot_volume: z.boolean(),
    boot_volume_size: z.number().int().min(1).optional(),
    boot_volume_type: z.string(),
    node_labels: labelsField,
    node_taints: taintsField,
  })
  .superRefine((values, ctx) => {
    if (values.autoscaling) {
      const min = values.min_node_count ?? 1;
      const max = values.max_node_count ?? values.node_count;
      if (max < min) {
        ctx.addIssue({
          code: "custom",
          path: ["max_node_count"],
          message: "The maximum must be at least the minimum",
        });
      }
      if (values.node_count < min || values.node_count > max) {
        ctx.addIssue({
          code: "custom",
          path: ["node_count"],
          message: "The node count must be between the minimum and the maximum",
        });
      }
    }
    if (values.boot_volume && !values.boot_volume_size) {
      ctx.addIssue({
        code: "custom",
        path: ["boot_volume_size"],
        message: "Enter the volume size in GB",
      });
    }
  });

type CreateForm = z.infer<typeof createSchema>;

/**
 * Creates a node group with an optional autoscaling range, boot volume and
 * node labels and taints; optional blocks are sent only when filled in.
 */
export function CreateNodeGroupDialog({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(clusterOptionsQuery(projectId));
  const { NumberInput, SelectInput, SwitchInput, TextInput } =
    fieldsFor<CreateForm>();
  const { form, dialog } = useMutationForm({
    schema: createSchema,
    defaultValues: {
      name: "",
      flavor_id: "",
      node_count: 1,
      autoscaling: false,
      min_node_count: 1,
      max_node_count: 1,
      boot_volume: false,
      boot_volume_type: "",
      node_labels: "",
      node_taints: "",
    },
    mutation: useCreateNodeGroup(),
    toVariables: (values) => ({
      clusterId,
      name: values.name,
      flavor_id: values.flavor_id,
      node_count: values.node_count,
      autoscaling: values.autoscaling,
      ...(values.autoscaling
        ? {
            min_node_count: values.min_node_count ?? 1,
            max_node_count: values.max_node_count ?? values.node_count,
          }
        : {}),
      ...(values.boot_volume && values.boot_volume_size
        ? {
            boot_volume_size: values.boot_volume_size,
            ...(values.boot_volume_type
              ? { boot_volume_type: values.boot_volume_type }
              : {}),
          }
        : {}),
      ...(values.node_labels ? { node_labels: values.node_labels } : {}),
      ...(values.node_taints ? { node_taints: values.node_taints } : {}),
    }),
    successMessage: (group) => `Node group ${group.name} is being created.`,
    onDone: onClose,
  });
  const [autoscaling, bootVolume] = useWatch({
    control: form.control,
    name: ["autoscaling", "boot_volume"],
  });
  return (
    <FormDialog
      {...dialog}
      title="Create node group"
      submitLabel="Create node group"
      size="lg"
    >
      <TextInput name="name" label="Name" isRequired />
      <SelectInput
        name="flavor_id"
        label="Flavour"
        options={(options.data?.flavors ?? []).map((f) => ({
          id: f.name ?? "",
          label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb) || "?"})`,
        }))}
        isRequired
      />
      <NumberInput
        name="node_count"
        label="Node count"
        minValue={1}
        isRequired
      />
      <SwitchInput name="autoscaling" label="Enable autoscaling" />
      {autoscaling && (
        <>
          <NumberInput
            name="min_node_count"
            label="Minimum nodes"
            minValue={0}
          />
          <NumberInput
            name="max_node_count"
            label="Maximum nodes"
            minValue={1}
          />
        </>
      )}
      <SwitchInput name="boot_volume" label="Boot from a volume" />
      {bootVolume && (
        <>
          <NumberInput
            name="boot_volume_size"
            label="Boot volume size"
            addon="GB"
            minValue={1}
          />
          <TextInput
            name="boot_volume_type"
            label="Boot volume type"
            description="Leave blank for the default type."
          />
        </>
      )}
      <TextInput
        name="node_labels"
        label="Kubernetes node labels"
        description="key=value pairs separated by commas, such as tier=gpu,pool=a."
      />
      <TextInput
        name="node_taints"
        label="Node taints"
        description="key=value:Effect pairs separated by commas, such as gpu=true:NoSchedule."
      />
    </FormDialog>
  );
}
