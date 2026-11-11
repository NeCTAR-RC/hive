// Add an allowed address pair to a port (Horizon's
// AddAllowedAddressPairForm).
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Port } from "../../../../lib/api/types/network";
import { useSetAllowedAddressPairs } from "../../api";
import { checkPairAddress, checkPairMac, withPair } from "../addressPairs";

const pairSchema = z
  .object({
    ip_address: z.string().trim(),
    mac_address: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    const address = checkPairAddress(values.ip_address);
    if (address) {
      ctx.addIssue({ code: "custom", path: ["ip_address"], message: address });
    }
    const mac = checkPairMac(values.mac_address);
    if (mac) {
      ctx.addIssue({ code: "custom", path: ["mac_address"], message: mac });
    }
  });

/**
 * The add pair dialog: an address or range the port may also send from,
 * and optionally the MAC address it uses, sent with the port's other
 * pairs.
 */
export function AddAddressPairDialog({
  port,
  onClose,
}: {
  port: Port;
  onClose: () => void;
}) {
  const { TextInput } = fieldsFor<z.infer<typeof pairSchema>>();
  const { dialog } = useMutationForm({
    schema: pairSchema,
    defaultValues: { ip_address: "", mac_address: "" },
    mutation: useSetAllowedAddressPairs(),
    toVariables: (values) => ({
      portId: port.id,
      pairs: withPair(port.allowed_address_pairs, {
        ip_address: values.ip_address,
        mac_address: values.mac_address || null,
      }),
    }),
    successMessage: (_port, values) =>
      `Allowed ${values.ip_address} on port ${port.name || port.id}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Add allowed address pair to ${port.name || port.id}`}
      submitLabel="Add pair"
    >
      <TextInput
        name="ip_address"
        label="IP address or range"
        isRequired
        description="An address such as 10.0.0.50 (a shared virtual IP), or a range such as 10.0.1.0/24."
      />
      <TextInput
        name="mac_address"
        label="MAC address"
        description="Leave blank for the port's own MAC address."
      />
    </FormDialog>
  );
}
