// Create a subnet on a network, or edit one.
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { OptionErrors } from "../../../../components/OptionErrors/OptionErrors";
import type {
  Network,
  SubnetDetail,
  SubnetFields as SubnetFieldsRequest,
} from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  networkOptionsQuery,
  useCreateSubnet,
  useUpdateSubnet,
} from "../../api";
import {
  emptySubnetForm,
  subnetFieldsFromForm,
  subnetFormFromDetail,
  type SubnetFormValues,
} from "../subnetRules";
import { subnetSchema } from "./schema";
import { SubnetFields } from "./SubnetFields";

/**
 * The subnet dialog: creates a subnet on `network`, or edits `subnet`
 * when one is given. An edit sends only what changed, and the address
 * cannot change.
 */
export function SubnetDialog({
  network,
  subnet,
  onClose,
}: {
  network: Pick<Network, "id" | "name">;
  /** Present when editing. */
  subnet?: SubnetDetail | undefined;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const isCreate = subnet === undefined;
  const options = useQuery(networkOptionsQuery(projectId));
  const create = useCreateSubnet();
  const update = useUpdateSubnet();
  const enableIpv6 = options.data?.enable_ipv6 ?? false;
  const previous = useMemo(
    () => (subnet ? subnetFormFromDetail(subnet) : undefined),
    [subnet],
  );
  const schema = useMemo(
    () => subnetSchema(isCreate, enableIpv6, previous),
    [isCreate, enableIpv6, previous],
  );
  // A new subnet takes the default name servers once the options arrive;
  // fields the user has already changed keep their values.
  const defaultDns = options.data?.default_dns_nameservers;
  const initial = useMemo(
    () => previous ?? emptySubnetForm(defaultDns ?? []),
    [previous, defaultDns],
  );
  // Creating and editing share one form: one save that sends the subnet
  // fields to whichever endpoint fits, so the dialog has one pending state
  // and error.
  const save = useMutation({
    mutationFn: (fields: SubnetFieldsRequest) =>
      subnet
        ? update.mutateAsync({ subnetId: subnet.id, ...fields })
        : create.mutateAsync({ network_id: network.id, ...fields }),
  });
  const { form, dialog } = useMutationForm({
    schema,
    values: initial,
    mutation: save,
    toVariables: (values) => {
      if (!previous) return subnetFieldsFromForm(values);
      const fields = subnetFieldsFromForm(values, previous);
      return Object.keys(fields).length === 0 ? null : fields;
    },
    successMessage: (saved) =>
      subnet
        ? `Subnet ${saved.name || saved.id} updated.`
        : `Created subnet ${saved.name || saved.cidr || saved.id} on ${network.name}.`,
    onDone: onClose,
  });
  const addressSource = useWatch({
    control: form.control,
    name: "address_source",
  });
  const noGateway = useWatch({ control: form.control, name: "no_gateway" });
  const cidr = useWatch({ control: form.control, name: "cidr" });
  const ipVersion = useWatch({ control: form.control, name: "ip_version" });

  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={
        subnet
          ? `Edit subnet ${subnet.name || subnet.cidr || subnet.id}`
          : `Create subnet on ${network.name}`
      }
      submitLabel={subnet ? "Save" : "Create subnet"}
      size="lg"
    >
      <OptionErrors errors={options.data?.errors} />
      <SubnetFields<SubnetFormValues>
        prefix=""
        options={options.data}
        isCreate={isCreate}
        watch={{
          address_source: addressSource,
          no_gateway: noGateway,
          cidr,
          ip_version: ipVersion,
        }}
      />
    </FormDialog>
  );
}
