// Edit a router's name and admin state (Horizon's routers/forms.py).
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Router } from "../../../../lib/api/types/network";
import { useUpdateRouter } from "../../api";
import { updateRouterRequest } from "./request";
import { editRouterSchema, type EditRouterValues } from "./schema";

/**
 * The edit router dialog. The name field starts blank when the name is
 * just the id; only what changed is sent.
 */
export function EditRouterDialog({
  router,
  onClose,
}: {
  router: Router;
  onClose: () => void;
}) {
  const { SwitchInput, TextInput } = fieldsFor<EditRouterValues>();
  const { dialog } = useMutationForm({
    schema: editRouterSchema,
    defaultValues: {
      name: router.name === router.id ? "" : router.name,
      admin_state_up: router.admin_state_up ?? true,
    },
    mutation: useUpdateRouter(),
    toVariables: (values) => updateRouterRequest(router, values),
    successMessage: (updated) => `Router ${updated.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit router ${router.name}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Router name" />
      <SwitchInput
        name="admin_state_up"
        label="Enable admin state (the router is up)"
      />
    </FormDialog>
  );
}
