// The edit security service dialog (manila-ui security_services/forms.py).
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { SecurityService } from "../../../../lib/api/types/shares";
import { useUpdateSecurityService } from "../../api";
import { updateSecurityServiceBody } from "../request";
import { securityServiceSchema } from "./schema";
import { SecurityServiceFields } from "./SecurityServiceFields";

/**
 * Edits a security service's fields except its type. The password fields
 * open empty, and a password is sent only when one is typed.
 */
export function EditSecurityServiceDialog({
  service,
  onClose,
}: {
  service: SecurityService;
  onClose: () => void;
}) {
  const { dialog } = useMutationForm({
    schema: securityServiceSchema,
    defaultValues: {
      name: service.name ?? "",
      type: service.type ?? "ldap",
      dns_ip: service.dns_ip ?? "",
      server: service.server ?? "",
      domain: service.domain ?? "",
      ou: service.ou ?? "",
      user: service.user ?? "",
      password: "",
      confirm_password: "",
      description: service.description ?? "",
    },
    mutation: useUpdateSecurityService(),
    toVariables: (values) => ({
      id: service.id,
      ...updateSecurityServiceBody(service, values),
    }),
    successMessage: (_updated, values) =>
      `Security service ${values.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${service.name || service.id}`}
      submitLabel="Save"
    >
      <SecurityServiceFields withType={false} />
    </FormDialog>
  );
}
