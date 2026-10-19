// Edit a load balancer and associate a floating IP with its VIP.
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Loading } from "@ardc-ui/react";
import {
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { LoadBalancer } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { floatingIpsQuery, networkOptionsQuery } from "../network/api";
import { useAssociateLbFloatingIp, useUpdateLoadBalancer } from "./api";

const editSchema = z.object({
  name: z.string().trim().max(255),
  description: z.string().trim().max(255),
  admin_state_up: z.boolean(),
});

export function EditLoadBalancerDialog({
  projectId,
  lb,
  onClose,
}: {
  projectId: string;
  lb: LoadBalancer;
  onClose: () => void;
}) {
  const update = useUpdateLoadBalancer(projectId);
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: lb.name ?? "",
      description: lb.description ?? "",
      admin_state_up: lb.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      { id: lb.id, ...values },
      {
        onSuccess: () => {
          notify.success("The load balancer has been updated.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${lb.name || lb.id}`}
      submitLabel="Save"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const associateSchema = z.object({
  choice: z.string().min(1, "Choose a floating IP or a pool"),
});

export function AssociateFipDialog({
  projectId,
  lb,
  onClose,
}: {
  projectId: string;
  lb: LoadBalancer;
  onClose: () => void;
}) {
  const fips = useQuery(floatingIpsQuery(projectId));
  const options = useQuery(networkOptionsQuery(projectId));
  const associate = useAssociateLbFloatingIp(projectId);
  const free = (fips.data?.items ?? []).filter((f) => !f.port_id);
  const pools = options.data?.floating_networks ?? [];
  const form = useForm<z.infer<typeof associateSchema>>({
    resolver: zodResolver(associateSchema),
    values: {
      choice: free[0]
        ? `fip:${free[0].id}`
        : pools.length === 1
          ? `pool:${pools[0]?.id}`
          : "",
    },
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    const [kind, id] = values.choice.split(":", 2);
    associate.mutate(
      {
        id: lb.id,
        ...(kind === "fip" ? { floatingIpId: id ?? "" } : { poolId: id ?? "" }),
      },
      {
        onSuccess: () => {
          notify.success("Associating floating IP with load balancer.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Associate floating IP"
      submitLabel="Associate"
      onSubmit={submit}
      isPending={associate.isPending}
      error={associate.error}
    >
      {associate.isError && form.getValues("choice").startsWith("pool:") && (
        <Alert tone="warning" role="status">
          If a new floating IP was allocated before the association failed, it
          may still be in your project; check Floating IPs before trying again.
        </Alert>
      )}
      {fips.isPending || options.isPending ? (
        <Loading>Loading floating IPs...</Loading>
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
            control={form.control}
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
