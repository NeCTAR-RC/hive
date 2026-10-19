// Configuration group dialogs (trove-dashboard database_configurations
// forms.py): create a group for a datastore version, add a parameter with
// a value checked against the datastore's parameter spec.
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loading } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  ComboboxInput,
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type {
  DbConfigurationDetail,
  DbParameterSpec,
} from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  dbConfigurationsQuery,
  useCreateConfiguration,
  useSetConfigurationValues,
} from "./api";
import { parameterKind, parameterValue } from "./status";

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
        <Loading>Loading datastores...</Loading>
      ) : configurations.isError ? (
        <ErrorState
          error={configurations.error}
          title="Could not load datastores"
          onRetry={() => void configurations.refetch()}
        />
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
  // The combobox clears to null.
  name: z
    .string()
    .nullable()
    .refine((v) => Boolean(v), "Choose a parameter"),
  text: z.string().trim(),
  number: z.number().optional(),
  flag: z.boolean(),
});

type ParameterForm = z.infer<typeof parameterSchema>;

/** Checks the field the parameter's type uses, as the backend's
 * coerce_parameter does (config_param_manager.py:155-186). */
function parameterResolver(parameters: readonly DbParameterSpec[]) {
  return zodResolver(
    parameterSchema.superRefine((v, ctx) => {
      const spec = parameters.find((p) => p.name === v.name);
      const kind = parameterKind(spec?.type);
      if (kind === "string" && !v.text) {
        ctx.addIssue({
          code: "custom",
          path: ["text"],
          message: "Enter a value",
        });
      }
      if (kind === "integer" || kind === "float") {
        if (v.number === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["number"],
            message: "Enter a number",
          });
          return;
        }
        if (kind === "integer" && !Number.isInteger(v.number)) {
          ctx.addIssue({
            code: "custom",
            path: ["number"],
            message: "Enter a whole number",
          });
        }
        if (spec?.min != null && v.number < spec.min) {
          ctx.addIssue({
            code: "custom",
            path: ["number"],
            message: `Must be at least ${spec.min}`,
          });
        }
        if (spec?.max != null && v.number > spec.max) {
          ctx.addIssue({
            code: "custom",
            path: ["number"],
            message: `Must be at most ${spec.max}`,
          });
        }
      }
    }),
  );
}

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
  const form = useForm<ParameterForm>({
    resolver: parameterResolver(configuration.parameters),
    defaultValues: { name: "", text: "", number: undefined, flag: false },
  });
  const chosen = useWatch({ control: form.control, name: "name" });
  const spec = configuration.parameters.find((p) => p.name === chosen);
  const kind = parameterKind(spec?.type);
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
        values: {
          ...current,
          [values.name ?? ""]: parameterValue(kind, values),
        },
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
      <ComboboxInput
        control={form.control}
        name="name"
        label="Parameter"
        options={configuration.parameters.map((p) => ({
          id: p.name ?? "",
          label: p.name ?? "",
        }))}
        isRequired
        {...(hint ? { description: hint } : {})}
      />
      {kind === "boolean" ? (
        <SwitchInput control={form.control} name="flag" label="Value" />
      ) : kind === "integer" || kind === "float" ? (
        <NumberInput
          control={form.control}
          name="number"
          label="Value"
          isRequired
          {...(spec?.min != null ? { minValue: spec.min } : {})}
          {...(spec?.max != null ? { maxValue: spec.max } : {})}
          {...(kind === "integer" ? { step: 1 } : {})}
        />
      ) : (
        <TextInput
          control={form.control}
          name="text"
          label="Value"
          isRequired
        />
      )}
    </FormDialog>
  );
}
