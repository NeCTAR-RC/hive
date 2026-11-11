// Allocate a floating IP from a pool (Horizon's floating_ips/forms.py).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import { QuotaMeter } from "../../../../components/QuotaMeter/QuotaMeter";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { networkOptionsQuery, useAllocateFloatingIp } from "../../api";
import { quotaLeft } from "../../status";
import { allocateFloatingIpRequest } from "./request";
import { allocateSchema, type AllocateValues } from "./schema";

/**
 * The allocate dialog: the floating IP quota, a pool, a description, the
 * DNS names where the cloud has DNS integration, and a chosen address only
 * where the deployment lets users pick one (Neutron's default policy keeps
 * that for admins, so Horizon hides it). It warns, without blocking, when
 * the floating IP quota is used up.
 */
export function AllocateFloatingIpDialog({ onClose }: { onClose: () => void }) {
  const projectId = useProjectId();
  const options = useQuery(networkOptionsQuery(projectId));
  const pools = useMemo(
    () => options.data?.floating_networks ?? [],
    [options.data],
  );
  // With a single pool there is nothing to choose; it is preselected once
  // the options load, and anything the user has typed survives.
  const initial = useMemo(
    () => ({
      floating_network_id: pools.length === 1 ? (pools[0]?.id ?? "") : "",
      floating_ip_address: "",
      description: "",
      dns_domain: "",
      dns_name: "",
    }),
    [pools],
  );
  const dns = options.data?.extensions?.dns_integration ?? false;
  const quotaFull = !quotaLeft(options.data?.quota, "floatingip");
  const quota = options.data?.quota?.["floatingip"];
  const chooseAddress = options.data?.floating_ip_address_allowed ?? false;
  const { SelectInput, TextAreaInput, TextInput } = fieldsFor<AllocateValues>();
  const { dialog } = useMutationForm({
    schema: allocateSchema,
    values: initial,
    mutation: useAllocateFloatingIp(),
    toVariables: (values) => allocateFloatingIpRequest(values, dns),
    successMessage: (fip) =>
      `Allocated floating IP ${fip.floating_ip_address}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title="Allocate floating IP"
      submitLabel="Allocate IP"
    >
      {quota && (
        <QuotaMeter
          label="Floating IPs"
          value={quota.used + quota.reserved}
          max={quota.limit}
        />
      )}
      {quotaFull && (
        <Alert tone="warning" title="Quota exceeded">
          You are already using all of your available floating IPs.
        </Alert>
      )}
      <SelectInput
        name="floating_network_id"
        label="Pool"
        options={pools.map((p) => ({ id: p.id, label: p.name }))}
        isRequired
        isDisabled={options.isPending || pools.length === 0}
        placeholder={
          options.isPending
            ? "Loading pools..."
            : pools.length === 0
              ? "No floating IP pools are available"
              : "Choose a pool"
        }
      />
      {chooseAddress && (
        <TextInput
          name="floating_ip_address"
          label="Floating IP address (optional)"
          description="A specific address inside the pool's range. Leave blank to be given the next free one."
        />
      )}
      <TextAreaInput name="description" label="Description" />
      {dns && (
        <>
          <TextInput name="dns_name" label="DNS name" />
          <TextInput name="dns_domain" label="DNS domain" />
        </>
      )}
    </FormDialog>
  );
}
