// The dialog that edits a load balancer's name, description and admin state.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { LoadBalancer } from "../../../../lib/api/types/loadbalancers";
import { maxLength } from "../../../../lib/validation";
import { useUpdateLoadBalancer } from "../../api";

const editSchema = z.object({
  name: maxLength(255),
  description: maxLength(255),
  admin_state_up: z.boolean(),
});

const { SwitchInput, TextAreaInput, TextInput } =
  fieldsFor<z.infer<typeof editSchema>>();

/** Edits `lb`; its values go to the update as they are. */
export function EditLoadBalancerDialog({
  lb,
  onClose,
}: {
  lb: LoadBalancer;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      name: lb.name ?? "",
      description: lb.description ?? "",
      admin_state_up: lb.admin_state_up ?? true,
    },
    mutation: useUpdateLoadBalancer(),
    toVariables: (values) => ({ id: lb.id, ...values }),
    successMessage: "The load balancer has been updated.",
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${lb.name || lb.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Name" />
      <TextAreaInput name="description" label="Description" />
      <SwitchInput name="admin_state_up" label="Admin state up" />
    </FormDialog>
  );
}
