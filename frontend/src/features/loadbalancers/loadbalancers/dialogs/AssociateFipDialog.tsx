// The dialog that associates a floating IP with a load balancer's VIP.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { LoadBalancer } from "../../../../lib/api/types/loadbalancers";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { floatingIpsQuery, networkOptionsQuery } from "../../../network/api";
import { useAssociateLbFloatingIp } from "../../api";
import { fipChoiceTarget, preselectedFipChoice } from "./fipChoice";

const associateSchema = z.object({
  choice: z.string().min(1, "Choose a floating IP or a pool"),
});

const { SelectInput } = fieldsFor<z.infer<typeof associateSchema>>();

/**
 * Associates a free floating IP with the VIP of `lb`, or allocates a new one
 * from a pool and associates that. The backend releases a new address again
 * when the association fails, but the error does not say whether it was
 * allocated or released, so after a failed pool choice the dialog says to
 * check Floating IPs.
 */
export function AssociateFipDialog({
  lb,
  onClose,
}: {
  lb: LoadBalancer;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const fips = useQuery(floatingIpsQuery(projectId));
  const options = useQuery(networkOptionsQuery(projectId));
  const free = useMemo(
    () => (fips.data?.items ?? []).filter((f) => !f.port_id),
    [fips.data],
  );
  const pools = useMemo(
    () => options.data?.floating_networks ?? [],
    [options.data],
  );
  // The choice is preselected once both lists load; a choice the user has
  // already made survives refetches.
  const preselected = useMemo(
    () => ({ choice: preselectedFipChoice(free, pools) }),
    [free, pools],
  );
  const associate = useAssociateLbFloatingIp();
  const { form, dialog } = useMutationForm({
    schema: associateSchema,
    values: preselected,
    mutation: associate,
    toVariables: (values) => ({
      id: lb.id,
      ...fipChoiceTarget(values.choice),
    }),
    successMessage: "Associating floating IP with load balancer.",
    onDone: onClose,
  });
  const choice = useWatch({ control: form.control, name: "choice" });
  // The error stays only until the choice changes (useMutationForm).
  const allocationFailed = associate.isError && choice.startsWith("pool:");
  return (
    <FormDialog
      {...dialog}
      title="Associate floating IP"
      submitLabel="Associate"
    >
      {allocationFailed && (
        <Alert tone="warning" role="status">
          If a new floating IP was allocated before the association failed, it
          may still be in your project. Check Floating IPs before trying again.
        </Alert>
      )}
      {fips.isPending || options.isPending ? (
        <SkeletonLines lines={3} />
      ) : (
        <>
          <p>
            The floating IP is attached to the VIP {lb.vip_address} of{" "}
            {lb.name || lb.id}. Choose a free floating IP, or a pool to allocate
            a new one from.
          </p>
          {free.length === 0 && pools.length === 0 && (
            <Alert tone="warning" role="status">
              No free floating IPs and no pools to allocate from.
            </Alert>
          )}
          <SelectInput
            name="choice"
            label="Floating IP"
            options={[
              ...free.map((f) => ({
                id: `fip:${f.id}`,
                label: `${f.floating_ip_address} (${f.pool_name ?? "floating IP"})`,
              })),
              ...pools.map((p) => ({
                id: `pool:${p.id}`,
                label: `Allocate from ${p.name}`,
              })),
            ]}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}
