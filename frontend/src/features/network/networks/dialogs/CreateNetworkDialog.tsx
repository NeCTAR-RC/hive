// Create a network, with its first subnet, as Horizon's create network
// wizard does in one form.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { OptionErrors } from "../../../../components/OptionErrors/OptionErrors";
import { fieldsFor } from "../../../../components/Form/fields";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { networkOptionsQuery, useCreateNetwork } from "../../api";
import { emptySubnetForm } from "../subnetRules";
import { createNetworkRequest } from "./request";
import {
  createNetworkSchema,
  MTU_RANGE,
  type CreateNetworkValues,
} from "./schema";
import { SubnetFields } from "./SubnetFields";
import styles from "../../DialogGroups.module.scss";

/**
 * The create network dialog: name, admin state, port security (where the
 * cloud has the extension), zone hints and MTU, and the first subnet
 * unless the user turns it off.
 */
export function CreateNetworkDialog({ onClose }: { onClose: () => void }) {
  const projectId = useProjectId();
  const options = useQuery(networkOptionsQuery(projectId));
  const enableIpv6 = options.data?.enable_ipv6 ?? false;
  const schema = useMemo(() => createNetworkSchema(enableIpv6), [enableIpv6]);
  // The default name servers arrive with the options and fill the form
  // then; fields the user has already changed keep their values.
  const defaultDns = options.data?.default_dns_nameservers;
  const initial = useMemo<CreateNetworkValues>(
    () => ({
      name: "",
      admin_state_up: true,
      port_security_enabled: true,
      with_subnet: true,
      availability_zone_hints: [],
      mtu: "",
      subnet: emptySubnetForm(defaultDns ?? []),
    }),
    [defaultDns],
  );
  const { CheckboxesInput, SwitchInput, TextInput } =
    fieldsFor<CreateNetworkValues>();
  const portSecurity = options.data?.extensions?.port_security ?? false;
  const { form, dialog } = useMutationForm({
    schema,
    values: initial,
    mutation: useCreateNetwork(),
    toVariables: (values) => createNetworkRequest(values, portSecurity),
    successMessage: (network) =>
      `Created network ${network.name || network.id}.`,
    onDone: onClose,
  });
  const withSubnet = useWatch({ control: form.control, name: "with_subnet" });
  const addressSource = useWatch({
    control: form.control,
    name: "subnet.address_source",
  });
  const noGateway = useWatch({
    control: form.control,
    name: "subnet.no_gateway",
  });
  const cidr = useWatch({ control: form.control, name: "subnet.cidr" });
  const ipVersion = useWatch({
    control: form.control,
    name: "subnet.ip_version",
  });
  const zones = options.data?.availability_zones?.network ?? [];

  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title="Create network"
      submitLabel="Create network"
      size="lg"
    >
      <OptionErrors errors={options.data?.errors} />
      <div className={styles.groups}>
        <div className={styles.group}>
          <TextInput name="name" label="Network name" />
          <SwitchInput
            name="admin_state_up"
            label="Enable admin state (the network is up)"
          />
          {portSecurity && (
            <SwitchInput
              name="port_security_enabled"
              label="Enable port security (security groups and address checks on new ports)"
            />
          )}
          {zones.length > 0 && (
            <CheckboxesInput
              name="availability_zone_hints"
              label="Availability zone hints"
              options={zones.map((z) => ({ id: z, label: z }))}
              description="Zones where the DHCP agents may be scheduled. Leaving every box clear is the same as selecting them all."
            />
          )}
          <TextInput
            name="mtu"
            label="MTU"
            description={`Maximum transmission unit in bytes, from ${MTU_RANGE.min} (1280 for an IPv6 subnet) to ${MTU_RANGE.max}. Leave blank for the default.`}
          />
          <SwitchInput
            name="with_subnet"
            label="Create a subnet on the network"
          />
        </div>
        {withSubnet && (
          <div className={styles.group}>
            <h3 className={styles.heading}>Subnet</h3>
            <SubnetFields<CreateNetworkValues>
              prefix="subnet."
              options={options.data}
              isCreate
              watch={{
                address_source: addressSource,
                no_gateway: noGateway,
                cidr,
                ip_version: ipVersion,
              }}
            />
          </div>
        )}
      </div>
    </FormDialog>
  );
}
