// The dialogs behind the Trunks panel: create a trunk from a parent port
// with optional subports, edit its details, and add subports later
// (Horizon's Angular trunks workflow).
import { useQuery } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@ardc-ui/react";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextInput,
} from "../../../components/Form/fields";
import type {
  Port,
  Trunk,
  TrunkCreateRequest,
  TrunkSubportRequest,
} from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import {
  trunkOptionsQuery,
  useAddSubports,
  useCreateTrunk,
  useUpdateTrunk,
} from "../api";
import styles from "./TrunkDialogs.module.scss";

const NAME = z.string().trim().max(255, "At most 255 characters");

const subportSchema = z.object({
  port_id: z.string().min(1, "Choose a port"),
  segmentation_type: z.enum(["vlan", "inherit"]),
  segmentation_id: z.number().int().min(1).max(4094).nullable(),
});

type SubportValues = z.infer<typeof subportSchema>;

function subportsBody(values: SubportValues[]): TrunkSubportRequest[] {
  return values.map((s) => ({
    port_id: s.port_id,
    segmentation_type: s.segmentation_type,
    ...(s.segmentation_type === "vlan" && s.segmentation_id !== null
      ? { segmentation_id: s.segmentation_id }
      : {}),
  }));
}

function portLabel(port: Port): string {
  const ips = port.fixed_ips.map((ip) => ip.ip_address).join(", ");
  return `${port.name || port.id}${port.network_name ? ` on ${port.network_name}` : ""}${ips ? ` (${ips})` : ""}`;
}

/** Repeating subport rows: port, segmentation type and VLAN id. */
function SubportRows<T extends { sub_ports: SubportValues[] }>({
  control,
  candidates,
  isLoading,
}: {
  control: Parameters<typeof SelectInput<T>>[0]["control"];
  candidates: Port[];
  isLoading: boolean;
}) {
  type Name = Parameters<typeof SelectInput<T>>[0]["name"];
  const { fields, append, remove } = useFieldArray({
    control,
    name: "sub_ports" as never,
  });
  const rows = useWatch({ control, name: "sub_ports" as Name }) as
    SubportValues[] | undefined;
  const chosen = new Set((rows ?? []).map((r) => r.port_id));
  return (
    <div className={styles.subports}>
      <h3 className={styles.subheading}>Subports</h3>
      {fields.length === 0 && (
        <p className={styles.muted}>
          No subports yet. A subport carries a VLAN of its own on the trunk.
        </p>
      )}
      {fields.map((field, index) => {
        const current = rows?.[index];
        return (
          <div key={field.id} className={styles.subport}>
            <SelectInput
              control={control}
              name={`sub_ports.${index}.port_id` as Name}
              label={`Subport ${index + 1}`}
              options={candidates
                .filter((p) => p.id === current?.port_id || !chosen.has(p.id))
                .map((p) => ({ id: p.id, label: portLabel(p) }))}
              isRequired
              isDisabled={isLoading}
              placeholder={isLoading ? "Loading ports..." : "Choose a port"}
            />
            <SelectInput
              control={control}
              name={`sub_ports.${index}.segmentation_type` as Name}
              label="Segmentation type"
              options={[
                { id: "vlan", label: "VLAN" },
                { id: "inherit", label: "Inherit" },
              ]}
            />
            {current?.segmentation_type !== "inherit" && (
              <NumberInput
                control={control}
                name={`sub_ports.${index}.segmentation_id` as Name}
                label="VLAN id"
                minValue={1}
                maxValue={4094}
                isRequired
              />
            )}
            <Button variant="secondary" size="xs" onPress={() => remove(index)}>
              Remove subport {index + 1}
            </Button>
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="xs"
        onPress={() =>
          append({
            port_id: "",
            segmentation_type: "vlan",
            segmentation_id: null,
          } as never)
        }
        isDisabled={candidates.length <= chosen.size}
      >
        Add subport
      </Button>
    </div>
  );
}

// --- create ------------------------------------------------------------------

const createSchema = z
  .object({
    name: NAME,
    description: NAME,
    admin_state_up: z.boolean(),
    port_id: z.string().min(1, "Choose the parent port"),
    sub_ports: z.array(subportSchema),
  })
  .superRefine((values, ctx) => {
    values.sub_ports.forEach((s, index) => {
      if (s.segmentation_type === "vlan" && s.segmentation_id === null) {
        ctx.addIssue({
          code: "custom",
          path: ["sub_ports", index, "segmentation_id"],
          message: "Enter the VLAN id",
        });
      }
      if (s.port_id === values.port_id) {
        ctx.addIssue({
          code: "custom",
          path: ["sub_ports", index, "port_id"],
          message: "The parent port cannot also be a subport",
        });
      }
    });
  });

export function CreateTrunkDialog({
  projectId,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const options = useQuery({
    ...trunkOptionsQuery(projectId),
    enabled: isOpen,
  });
  const create = useCreateTrunk(projectId);
  type Values = z.infer<typeof createSchema>;
  const form = useForm<Values>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      description: "",
      admin_state_up: true,
      port_id: "",
      sub_ports: [],
    },
  });
  const parents = options.data?.parents ?? [];
  const reset = () => {
    form.reset();
    create.reset();
  };
  const submit = form.handleSubmit((values) => {
    const body: TrunkCreateRequest = {
      admin_state_up: values.admin_state_up,
      port_id: values.port_id,
      sub_ports: subportsBody(values.sub_ports),
    };
    if (values.name) body.name = values.name;
    if (values.description) body.description = values.description;
    create.mutate(body, {
      onSuccess: (trunk) => {
        notify.success(`Created trunk ${trunk.name || trunk.id}.`);
        reset();
        onOpenChange(false);
      },
    });
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
      title="Create trunk"
      submitLabel="Create trunk"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error ?? options.error}
    >
      <TextInput control={form.control} name="name" label="Trunk name" />
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the trunk is up)"
      />
      <SelectInput
        control={form.control}
        name="port_id"
        label="Parent port"
        options={parents.map((p) => ({ id: p.id, label: portLabel(p) }))}
        isRequired
        isDisabled={options.isPending || parents.length === 0}
        placeholder={
          options.isPending
            ? "Loading ports..."
            : parents.length === 0
              ? "No port can be a parent"
              : "Choose a port"
        }
        description="A port that is up, free or attached to an instance, and not in a trunk yet."
      />
      <SubportRows<Values>
        control={form.control}
        candidates={options.data?.subports ?? []}
        isLoading={options.isPending}
      />
    </FormDialog>
  );
}

// --- edit --------------------------------------------------------------------

const editSchema = z.object({
  name: NAME,
  description: NAME,
  admin_state_up: z.boolean(),
});

export function EditTrunkDialog({
  projectId,
  trunk,
  onClose,
}: {
  projectId: string;
  trunk: Trunk;
  onClose: () => void;
}) {
  const update = useUpdateTrunk(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: trunk.name,
      description: trunk.description,
      admin_state_up: trunk.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof update.mutate>[0] = { trunkId: trunk.id };
    if (values.name !== trunk.name) body.name = values.name;
    if (values.description !== trunk.description) {
      body.description = values.description;
    }
    if (values.admin_state_up !== trunk.admin_state_up) {
      body.admin_state_up = values.admin_state_up;
    }
    if (Object.keys(body).length === 1) {
      onClose();
      return;
    }
    update.mutate(body, {
      onSuccess: (updated) => {
        notify.success(`Trunk ${updated.name || updated.id} updated.`);
        onClose();
      },
    });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit trunk ${trunk.name || trunk.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Trunk name" />
      <TextInput
        control={form.control}
        name="description"
        label="Description"
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Enable admin state (the trunk is up)"
      />
    </FormDialog>
  );
}

// --- add subports ------------------------------------------------------------

const addSubportsSchema = z
  .object({
    sub_ports: z.array(subportSchema).min(1, "Add at least one subport"),
  })
  .superRefine((values, ctx) => {
    values.sub_ports.forEach((s, index) => {
      if (s.segmentation_type === "vlan" && s.segmentation_id === null) {
        ctx.addIssue({
          code: "custom",
          path: ["sub_ports", index, "segmentation_id"],
          message: "Enter the VLAN id",
        });
      }
    });
  });

export function AddSubportsDialog({
  projectId,
  trunk,
  onClose,
}: {
  projectId: string;
  trunk: Trunk;
  onClose: () => void;
}) {
  const options = useQuery(trunkOptionsQuery(projectId));
  const add = useAddSubports(projectId);
  type Values = z.infer<typeof addSubportsSchema>;
  const form = useForm<Values>({
    resolver: zodResolver(addSubportsSchema),
    defaultValues: {
      sub_ports: [
        { port_id: "", segmentation_type: "vlan", segmentation_id: null },
      ],
    },
  });
  const submit = form.handleSubmit((values) => {
    add.mutate(
      { trunkId: trunk.id, subports: subportsBody(values.sub_ports) },
      {
        onSuccess: () => {
          notify.success(
            `Added ${values.sub_ports.length} subport${values.sub_ports.length === 1 ? "" : "s"} to ${trunk.name || trunk.id}.`,
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
      title={`Add subports to ${trunk.name || trunk.id}`}
      submitLabel="Add subports"
      size="lg"
      onSubmit={submit}
      isPending={add.isPending}
      error={add.error ?? options.error}
    >
      <SubportRows<Values>
        control={form.control}
        candidates={options.data?.subports ?? []}
        isLoading={options.isPending}
      />
    </FormDialog>
  );
}
