// The security service form's fields, shared by the create and edit
// dialogs.
import { fieldsFor } from "../../../../components/Form/fields";
import { SECURITY_SERVICE_TYPES } from "../../status";
import type { SecurityServiceValues } from "../request";

/**
 * The security service fields, read from the form in context. The edit
 * dialog leaves out the type, which cannot change, and with it the DNS
 * IP, server and domain stop being required.
 */
export function SecurityServiceFields({ withType }: { withType: boolean }) {
  const { SelectInput, TextAreaInput, TextInput } =
    fieldsFor<SecurityServiceValues>();
  return (
    <>
      <TextInput name="name" label="Name" isRequired />
      {withType && (
        <SelectInput
          name="type"
          label="Type"
          options={SECURITY_SERVICE_TYPES}
          isRequired
        />
      )}
      <TextInput name="dns_ip" label="DNS IP" isRequired={withType} />
      <TextInput name="server" label="Server" isRequired={withType} />
      <TextInput name="domain" label="Domain" isRequired={withType} />
      <TextInput name="ou" label="Organisational unit" />
      <TextInput name="user" label="User" autoComplete="off" />
      <TextInput
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
      />
      <TextInput
        name="confirm_password"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
      />
      <TextAreaInput name="description" label="Description" />
    </>
  );
}
