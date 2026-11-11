// Copy an object to another name or container.
import { useMemo } from "react";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { StoreObject } from "../../../../lib/api/types/objectstore";
import { useCopyObject } from "../../api";
import { copyName } from "../../copy";
import { DOT_SEGMENT_MESSAGE, hasNoDotSegments } from "../../names";

/**
 * The form; a copy into the same container must not land on a name the
 * loaded folder already holds (the backend refuses any taken name).
 */
function copySchema(container: string, taken: ReadonlySet<string>) {
  return z
    .object({
      dest_container: z
        .string()
        .trim()
        .min(1, "Enter the destination container")
        .refine(hasNoDotSegments, DOT_SEGMENT_MESSAGE),
      dest_name: z
        .string()
        .trim()
        .min(1, "Enter the destination name")
        .refine(hasNoDotSegments, DOT_SEGMENT_MESSAGE),
    })
    .superRefine((values, ctx) => {
      if (values.dest_container === container && taken.has(values.dest_name)) {
        ctx.addIssue({
          code: "custom",
          path: ["dest_name"],
          message: `${values.dest_name} already exists. Choose a free name.`,
        });
      }
    });
}

/**
 * Copies an object, starting from its own container and folder under a
 * free name ("todo (copy).txt"). The destination container must exist and
 * the name must be free; `taken` holds the full names in the object's
 * folder, as the page has listed them.
 */
export function CopyObjectDialog({
  container,
  object,
  taken,
  onClose,
}: {
  container: string;
  object: StoreObject;
  taken: ReadonlySet<string>;
  onClose: () => void;
}) {
  const schema = useMemo(
    () => copySchema(container, taken),
    [container, taken],
  );
  const { TextInput } = fieldsFor<z.infer<ReturnType<typeof copySchema>>>();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: {
      dest_container: container,
      dest_name: copyName(object.name, taken),
    },
    mutation: useCopyObject(),
    toVariables: (values) => ({ container, name: object.name, ...values }),
    successMessage: (_copied, values) =>
      `Copied to ${values.dest_container}/${values.dest_name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Copy ${object.basename}`}
      submitLabel="Copy"
    >
      <Alert tone="info" role="status">
        The destination container must already exist and the destination name
        must be free.
      </Alert>
      <TextInput
        name="dest_container"
        label="Destination container"
        isRequired
      />
      <TextInput
        name="dest_name"
        label="Destination object name"
        description="Include folders in the name, such as backups/2026/file.txt."
        isRequired
      />
    </FormDialog>
  );
}
