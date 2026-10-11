// Node group create, resize, autoscaling and labels dialogs (magnum-ui
// clusters/nodegroups with the Nectar labels and taints support).
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { NodeGroup } from "../../lib/api/types";
import { formatMb } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  clusterOptionsQuery,
  useCreateNodeGroup,
  useResizeNodeGroup,
  useSetAutoscaling,
  useSetNodeLabels,
} from "./api";
import {
  formatLabels,
  formatTaints,
  LABELS_PATTERN,
  TAINTS_PATTERN,
} from "./status";

const labelsField = z
  .string()
  .trim()
  .refine(
    (v) => !v || LABELS_PATTERN.test(v),
    "Use key=value pairs separated by commas",
  );
const taintsField = z
  .string()
  .trim()
  .refine(
    (v) => !v || TAINTS_PATTERN.test(v),
    "Use key=value:Effect pairs separated by commas, with NoSchedule, PreferNoSchedule or NoExecute",
  );

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

export function CreateNodeGroupDialog({
  projectId,
  clusterId,
  onClose,
}: {
  projectId: string;
  clusterId: string;
  onClose: () => void;
}) {
  const options = useQuery(clusterOptionsQuery(projectId));
  const create = useCreateNodeGroup(projectId);
  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
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
  });
  const [autoscaling, bootVolume] = useWatch({
    control: form.control,
    name: ["autoscaling", "boot_volume"],
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
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
      },
      {
        onSuccess: (group) => {
          notify.success(`Node group ${group.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create node group"
      submitLabel="Create node group"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput control={form.control} name="name" label="Name" isRequired />
      <SelectInput
        control={form.control}
        name="flavor_id"
        label="Flavour"
        options={(options.data?.flavors ?? []).map((f) => ({
          id: f.name ?? "",
          label: `${f.name} (${f.vcpus ?? "?"} vCPU, ${formatMb(f.ram_mb) || "?"})`,
        }))}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="node_count"
        label="Node count"
        minValue={1}
        isRequired
      />
      <SwitchInput
        control={form.control}
        name="autoscaling"
        label="Enable autoscaling"
      />
      {autoscaling && (
        <>
          <NumberInput
            control={form.control}
            name="min_node_count"
            label="Minimum nodes"
            minValue={0}
          />
          <NumberInput
            control={form.control}
            name="max_node_count"
            label="Maximum nodes"
            minValue={1}
          />
        </>
      )}
      <SwitchInput
        control={form.control}
        name="boot_volume"
        label="Boot from a volume"
      />
      {bootVolume && (
        <>
          <NumberInput
            control={form.control}
            name="boot_volume_size"
            label="Boot volume size"
            addon="GB"
            minValue={1}
          />
          <TextInput
            control={form.control}
            name="boot_volume_type"
            label="Boot volume type"
            description="Leave blank for the default type."
          />
        </>
      )}
      <TextInput
        control={form.control}
        name="node_labels"
        label="Kubernetes node labels"
        description="key=value pairs separated by commas, such as tier=gpu,pool=a."
      />
      <TextInput
        control={form.control}
        name="node_taints"
        label="Node taints"
        description="key=value:Effect pairs separated by commas, such as gpu=true:NoSchedule."
      />
    </FormDialog>
  );
}

const resizeSchema = z.object({ node_count: z.number().int().min(0) });

export function ResizeNodeGroupDialog({
  projectId,
  clusterId,
  group,
  onClose,
}: {
  projectId: string;
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const resize = useResizeNodeGroup(projectId);
  const master = group.role === "master";
  const form = useForm<z.infer<typeof resizeSchema>>({
    resolver: zodResolver(
      master
        ? resizeSchema.refine((v) => [1, 3, 5, 7].includes(v.node_count), {
            path: ["node_count"],
            message: "Supported control plane sizes are 1, 3, 5 or 7.",
          })
        : resizeSchema,
    ),
    defaultValues: { node_count: group.node_count ?? 1 },
  });
  const submit = form.handleSubmit((values) => {
    resize.mutate(
      { clusterId, nodeGroupId: group.id, nodeCount: values.node_count },
      {
        onSuccess: () => {
          notify.success(`Node group ${group.name} is being resized.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Resize ${group.name}`}
      submitLabel="Resize"
      onSubmit={submit}
      isPending={resize.isPending}
      error={resize.error}
    >
      <NumberInput
        control={form.control}
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

const autoscalingSchema = z
  .object({
    min_node_count: z.number().int().min(0),
    max_node_count: z.number().int().min(1),
  })
  .refine((v) => v.max_node_count >= v.min_node_count, {
    path: ["max_node_count"],
    message: "The maximum must be at least the minimum",
  });

export function AutoscalingDialog({
  projectId,
  clusterId,
  group,
  onClose,
}: {
  projectId: string;
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const set = useSetAutoscaling(projectId);
  const form = useForm<z.infer<typeof autoscalingSchema>>({
    resolver: zodResolver(autoscalingSchema),
    defaultValues: {
      min_node_count: group.min_node_count ?? 0,
      max_node_count: group.max_node_count ?? group.node_count ?? 1,
    },
  });
  const submit = form.handleSubmit((values) => {
    set.mutate(
      {
        clusterId,
        nodeGroupId: group.id,
        min: values.min_node_count,
        max: values.max_node_count,
      },
      {
        onSuccess: () => {
          notify.success(`Autoscaling limits for ${group.name} updated.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Autoscaling for ${group.name}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={set.isPending}
      error={set.error}
    >
      <NumberInput
        control={form.control}
        name="min_node_count"
        label="Minimum nodes"
        minValue={0}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="max_node_count"
        label="Maximum nodes"
        minValue={1}
        isRequired
      />
    </FormDialog>
  );
}

const labelsSchema = z.object({
  node_labels: labelsField,
  node_taints: taintsField,
});

export function LabelsDialog({
  projectId,
  clusterId,
  group,
  onClose,
}: {
  projectId: string;
  clusterId: string;
  group: NodeGroup;
  onClose: () => void;
}) {
  const set = useSetNodeLabels(projectId);
  const form = useForm<z.infer<typeof labelsSchema>>({
    resolver: zodResolver(labelsSchema),
    defaultValues: {
      node_labels: formatLabels(group.node_labels),
      node_taints: formatTaints(group.node_taints),
    },
  });
  const submit = form.handleSubmit((values) => {
    set.mutate(
      {
        clusterId,
        nodeGroupId: group.id,
        labels: values.node_labels,
        taints: values.node_taints,
      },
      {
        onSuccess: () => {
          notify.success(
            `Labels and taints for ${group.name} are being applied.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Labels and taints for ${group.name}`}
      submitLabel="Apply"
      onSubmit={submit}
      isPending={set.isPending}
      error={set.error}
    >
      <Alert tone="warning" role="status">
        Changing node labels or taints replaces every node in the node group
        with a new node (a rolling replacement).
      </Alert>
      <TextInput
        control={form.control}
        name="node_labels"
        label="Kubernetes node labels"
        description="key=value pairs separated by commas. Leave empty to remove all labels."
      />
      <TextInput
        control={form.control}
        name="node_taints"
        label="Node taints"
        description="key=value:Effect pairs separated by commas. Leave empty to remove all taints."
      />
    </FormDialog>
  );
}
