// The create security service dialog (manila-ui
// security_services/forms.py).
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useCreateSecurityService } from "../../api";
import { createSecurityServiceBody } from "../request";
import { createSecurityServiceSchema } from "./schema";
import { SecurityServiceFields } from "./SecurityServiceFields";

/** Creates a security service, an Active Directory one by default. */
export function CreateSecurityServiceDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: createSecurityServiceSchema,
    defaultValues: {
      name: "",
      type: "active_directory",
      dns_ip: "",
      server: "",
      domain: "",
      ou: "",
      user: "",
      password: "",
      confirm_password: "",
      description: "",
    },
    mutation: useCreateSecurityService(),
    toVariables: createSecurityServiceBody,
    successMessage: (_created, values) =>
      `Security service ${values.name} created.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Create security service"
      submitLabel="Create"
    >
      <SecurityServiceFields withType />
    </FormDialog>
  );
}
