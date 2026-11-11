// Associate a floating IP with a port address (Horizon's
// floating_ips/workflows.py), from the Floating IPs panel or an instance's
// menu.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { FloatingIp } from "../../../../lib/api/types/network";
import { LOCALE } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  floatingIpTargetsQuery,
  floatingIpsQuery,
  networkOptionsQuery,
  useAssociateFloatingIp,
  type AssociateFloatingIpVariables,
} from "../../api";
import { quotaLeft } from "../../status";
import { targetOptions } from "./targets";

/** The floating IP choice that allocates a new address first. */
const NEW_IP = "__new__";

const associateSchema = z
  .object({
    floating_ip_id: z.string().min(1, "Choose a floating IP"),
    pool_id: z.string(),
    target_id: z.string().min(1, "Choose a port"),
  })
  .refine((v) => v.floating_ip_id !== NEW_IP || v.pool_id !== "", {
    message: "Choose a pool",
    path: ["pool_id"],
  });

type AssociateValues = z.infer<typeof associateSchema>;

/**
 * Pick a free floating IP and a port address to bind it to. From the
 * Floating IPs panel the IP is fixed and the target list covers every
 * instance; from an instance's menu the targets are that instance's ports,
 * and the IP is any free one or a new one allocated from a pool on the
 * way (preselected when the project holds no free IP).
 */
export function AssociateFloatingIpDialog({
  floatingIp,
  instance,
  onClose,
}: {
  floatingIp?: FloatingIp | undefined;
  instance?: { id: string; name: string } | undefined;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  // The IP list gives the free IPs to choose from, and tells which
  // targets already have a floating IP.
  const fips = useQuery(floatingIpsQuery(projectId));
  const targets = useQuery(floatingIpTargetsQuery(projectId, instance?.id));
  const options = useQuery({
    ...networkOptionsQuery(projectId),
    enabled: floatingIp === undefined,
  });
  const pools = useMemo(
    () => options.data?.floating_networks ?? [],
    [options.data],
  );
  const freeIps = useMemo(
    () =>
      (fips.data?.items ?? [])
        .filter((f) => !f.port_id && f.port_forwarding_count === 0)
        .sort((a, b) =>
          (a.floating_ip_address ?? "").localeCompare(
            b.floating_ip_address ?? "",
            LOCALE,
            { numeric: true },
          ),
        ),
    [fips.data],
  );
  const items = useMemo(() => targets.data?.items ?? [], [targets.data]);
  // A sole port or pool needs no choosing: it is preselected once the
  // lists load, and a choice the user has made survives later refetches.
  // Without a free IP the only way forward is a new one.
  const noFreeIp = fips.isSuccess && freeIps.length === 0;
  const initial = useMemo(
    () => ({
      floating_ip_id: floatingIp?.id ?? (noFreeIp ? NEW_IP : ""),
      pool_id: pools.length === 1 ? (pools[0]?.id ?? "") : "",
      target_id: items.length === 1 ? (items[0]?.id ?? "") : "",
    }),
    [floatingIp?.id, noFreeIp, pools, items],
  );
  const { SelectInput } = fieldsFor<AssociateValues>();
  const { form, dialog } = useMutationForm({
    schema: associateSchema,
    values: initial,
    mutation: useAssociateFloatingIp(),
    // The schema requires a target, and the options are `items`, so the
    // lookup only misses if the target vanished in a refetch.
    toVariables: (values): AssociateFloatingIpVariables | null => {
      const target = items.find((t) => t.id === values.target_id);
      if (!target) return null;
      const port = { portId: target.port_id, fixedIp: target.ip_address };
      return values.floating_ip_id === NEW_IP
        ? { ...port, allocateFrom: values.pool_id }
        : { ...port, floatingIpId: values.floating_ip_id };
    },
    successMessage: (fip, values) => {
      const target = items.find((t) => t.id === values.target_id);
      return `Floating IP ${fip.floating_ip_address ?? ""} associated with ${target?.name ?? ""}.`.replace(
        "  ",
        " ",
      );
    },
    onDone: onClose,
  });
  const allocating =
    useWatch({ control: form.control, name: "floating_ip_id" }) === NEW_IP;
  const quotaFull = !quotaLeft(options.data?.quota, "floatingip");
  const title = floatingIp
    ? `Associate ${floatingIp.floating_ip_address}`
    : instance
      ? `Associate a floating IP with ${instance.name}`
      : "Associate floating IP";
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? targets.error ?? fips.error ?? options.error}
      title={title}
      submitLabel="Associate"
    >
      {!floatingIp && (
        <SelectInput
          name="floating_ip_id"
          label="Floating IP"
          options={[
            ...freeIps.map((f) => ({
              id: f.id,
              label: `${f.floating_ip_address}${f.pool_name ? ` (${f.pool_name})` : ""}`,
            })),
            { id: NEW_IP, label: "Allocate a new floating IP" },
          ]}
          isRequired
          isDisabled={fips.isPending}
          placeholder={
            fips.isPending ? "Loading floating IPs..." : "Choose a floating IP"
          }
        />
      )}
      {allocating && (
        <>
          {quotaFull && (
            <Alert tone="warning" title="Quota exceeded">
              You are already using all of your available floating IPs.
            </Alert>
          )}
          <SelectInput
            name="pool_id"
            label="Pool"
            description="The new address comes from this pool and stays with the project until you release it."
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
        </>
      )}
      <SelectInput
        name="target_id"
        label="Port to associate"
        options={targetOptions(items, fips.data?.items ?? [], floatingIp?.id)}
        isRequired
        isDisabled={targets.isPending || items.length === 0}
        placeholder={
          targets.isPending
            ? "Loading ports..."
            : items.length === 0
              ? "No reachable ports"
              : "Choose a port"
        }
        description="Only addresses behind a router with a gateway to the floating network are listed."
      />
    </FormDialog>
  );
}
