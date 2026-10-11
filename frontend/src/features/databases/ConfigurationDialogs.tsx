// Configuration group dialogs (trove-dashboard database_configurations
// forms.py): create a group for a datastore version, add a parameter with
// a value checked against the datastore's parameter spec.
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { DbConfigurationDetail } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  dbConfigurationsQuery,
  useCreateConfiguration,
  useSetConfigurationValues,
} from "./api";

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(64),
  description: z.string().trim().max(255),
  datastore: z.string().min(1, "Select datastore type and version"),
});

export function CreateConfigurationDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const configurations = useQuery(dbConfigurationsQuery(projectId));
  const create = useCreateConfiguration(projectId);
  const datastores = configurations.data?.datastores ?? [];
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    values: {
      name: "",
      description: "",
      datastore:
        datastores.length === 1
          ? `${datastores[0]?.datastore}/${datastores[0]?.version}`
          : "",
    },
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    const [datastore, version] = values.datastore.split("/", 2);
    create.mutate(
      {
        name: values.name,
        datastore: datastore ?? "",
        version: version ?? "",
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: (created) => {
          notify.success(`Created configuration group ${created.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create configuration group"
      submitLabel="Create"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      {configurations.isPending ? (
        <SkeletonLines lines={3} />
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Name"
            isRequired
          />
          <TextAreaInput
            control={form.control}
            name="description"
            label="Description"
            rows={2}
          />
          <SelectInput
            control={form.control}
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

const parameterSchema = z.object({
  name: z.string().min(1, "Choose a parameter"),
  value: z.string().trim().min(1, "Enter a value"),
});

export function AddParameterDialog({
  projectId,
  configuration,
  onClose,
}: {
  projectId: string;
  configuration: DbConfigurationDetail;
  onClose: () => void;
}) {
  const setValues = useSetConfigurationValues(projectId);
  const form = useForm<z.infer<typeof parameterSchema>>({
    resolver: zodResolver(parameterSchema),
    defaultValues: { name: "", value: "" },
  });
  const chosen = useWatch({ control: form.control, name: "name" });
  const spec = configuration.parameters.find((p) => p.name === chosen);
  const hint = spec
    ? [
        spec.type ? `Type ${spec.type}` : null,
        spec.min !== null || spec.max !== null
          ? `range ${spec.min ?? "any"} to ${spec.max ?? "any"}`
          : null,
        spec.restart_required ? "restart required" : null,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;
  const submit = form.handleSubmit((values) => {
    const current = Object.fromEntries(
      Object.entries(configuration.values).map(([k, v]) => [
        k,
        typeof v === "string" ? v : JSON.stringify(v),
      ]),
    );
    setValues.mutate(
      {
        id: configuration.id,
        values: { ...current, [values.name]: values.value },
      },
      {
        onSuccess: () => {
          notify.success(`Set ${values.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Add parameter"
      submitLabel="Add parameter"
      onSubmit={submit}
      isPending={setValues.isPending}
      error={setValues.error}
    >
      <SelectInput
        control={form.control}
        name="name"
        label="Parameter"
        options={configuration.parameters.map((p) => ({
          id: p.name ?? "",
          label: p.name ?? "",
        }))}
        isRequired
      />
      <TextInput
        control={form.control}
        name="value"
        label="Value"
        isRequired
        {...(hint ? { description: hint } : {})}
      />
    </FormDialog>
  );
}
