// Create and edit listeners (octavia-dashboard workflow/listener).
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Accordion, AccordionItem } from "@ardc-ui/react";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { Listener, LoadBalancerTree } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  loadBalancerOptionsQuery,
  useCreateListener,
  useUpdateListener,
} from "./api";
import {
  createListenerSchema,
  editListenerBody,
  editListenerSchema,
  useProtocolDefaults,
  type CreateListenerValues,
  type EditListenerValues,
} from "./listenerForm";
import { defaultPort, poolProtocolFor, TLS_REF_HELP } from "./status";
import styles from "./LoadBalancers.module.scss";

function poolsFor(tree: LoadBalancerTree, protocol: string) {
  const wanted = poolProtocolFor(protocol);
  return tree.pools.filter((p) => p.protocol === wanted);
}

export function CreateListenerDialog({
  projectId,
  tree,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateListener(projectId);
  const used = tree.listeners.map((l) => l.protocol_port);
  const form = useForm<CreateListenerValues>({
    resolver: zodResolver(createListenerSchema),
    defaultValues: {
      name: "",
      description: "",
      protocol: "HTTP",
      // HTTP always has a default port.
      protocol_port: defaultPort("HTTP", used) as number,
      connection_limit: -1,
      allowed_cidrs: "",
      xff: false,
      xfp: false,
      xfproto: false,
      tls_ref: "",
      default_pool_id: "",
      admin_state_up: true,
    },
  });
  const protocol = useWatch({ control: form.control, name: "protocol" });
  useProtocolDefaults(form, used);
  const submit = form.handleSubmit((v) => {
    const cidrs = v.allowed_cidrs.split(/\s+/).filter(Boolean);
    create.mutate(
      {
        loadbalancer_id: tree.load_balancer.id,
        protocol: v.protocol,
        protocol_port: v.protocol_port,
        connection_limit: v.connection_limit,
        admin_state_up: v.admin_state_up,
        ...(v.name ? { name: v.name } : {}),
        ...(v.description ? { description: v.description } : {}),
        ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
        ...(["HTTP", "TERMINATED_HTTPS"].includes(v.protocol)
          ? {
              insert_headers: {
                "X-Forwarded-For": v.xff,
                "X-Forwarded-Port": v.xfp,
                "X-Forwarded-Proto": v.xfproto,
              },
            }
          : {}),
        ...(v.protocol === "TERMINATED_HTTPS"
          ? { default_tls_container_ref: v.tls_ref }
          : {}),
        ...(v.default_pool_id ? { default_pool_id: v.default_pool_id } : {}),
      },
      {
        onSuccess: () => {
          notify.success("A new listener is being created.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create listener"
      submitLabel="Create listener"
      size="lg"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      <SelectInput
        control={form.control}
        name="protocol"
        label="Protocol"
        options={(
          options.data?.listener_protocols ?? [
            "HTTP",
            "TCP",
            "TERMINATED_HTTPS",
            "HTTPS",
            "UDP",
            "SCTP",
          ]
        ).map((p) => ({ id: p, label: p }))}
        isRequired
      />
      <NumberInput
        control={form.control}
        name="protocol_port"
        label="Port"
        minValue={1}
        maxValue={65535}
        isRequired
      />
      {protocol === "TERMINATED_HTTPS" && (
        <TextInput
          control={form.control}
          name="tls_ref"
          label="TLS certificate reference"
          description={TLS_REF_HELP}
          isRequired
        />
      )}
      {["HTTP", "TERMINATED_HTTPS"].includes(protocol) && (
        <>
          <SwitchInput
            control={form.control}
            name="xff"
            label="Insert X-Forwarded-For header"
          />
          <SwitchInput
            control={form.control}
            name="xfp"
            label="Insert X-Forwarded-Port header"
          />
          <SwitchInput
            control={form.control}
            name="xfproto"
            label="Insert X-Forwarded-Proto header"
          />
        </>
      )}
      <SelectInput
        control={form.control}
        name="default_pool_id"
        label="Default pool"
        options={[
          { id: "", label: "None" },
          ...poolsFor(tree, protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        control={form.control}
        name="connection_limit"
        label="Connection limit"
        description="-1 for no limit."
        minValue={-1}
      />
      <TextAreaInput
        control={form.control}
        name="allowed_cidrs"
        label="Allowed CIDRs"
        description="One per line; empty allows all sources."
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

export function EditListenerDialog({
  projectId,
  tree,
  listener,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  listener: Listener;
  onClose: () => void;
}) {
  const update = useUpdateListener(projectId);
  const http = ["HTTP", "TERMINATED_HTTPS"].includes(listener.protocol);
  const tls = listener.protocol === "TERMINATED_HTTPS";
  const timeouts = !["UDP", "SCTP"].includes(listener.protocol);
  const form = useForm<EditListenerValues>({
    resolver: zodResolver(editListenerSchema),
    defaultValues: {
      name: listener.name ?? "",
      description: listener.description ?? "",
      connection_limit: listener.connection_limit ?? -1,
      allowed_cidrs: listener.allowed_cidrs.join("\n"),
      xff: listener.insert_headers["X-Forwarded-For"] === "true",
      xfp: listener.insert_headers["X-Forwarded-Port"] === "true",
      xfproto: listener.insert_headers["X-Forwarded-Proto"] === "true",
      default_pool_id: listener.default_pool_id ?? "",
      ...(listener.timeout_client_data !== null
        ? { timeout_client_data: listener.timeout_client_data }
        : {}),
      ...(listener.timeout_member_connect !== null
        ? { timeout_member_connect: listener.timeout_member_connect }
        : {}),
      ...(listener.timeout_member_data !== null
        ? { timeout_member_data: listener.timeout_member_data }
        : {}),
      ...(listener.timeout_tcp_inspect !== null
        ? { timeout_tcp_inspect: listener.timeout_tcp_inspect }
        : {}),
      tls_ref: listener.default_tls_container_ref ?? "",
      sni_refs: listener.sni_container_refs.join("\n"),
      tls_ciphers: listener.tls_ciphers ?? "",
      admin_state_up: listener.admin_state_up ?? true,
    },
  });
  const submit = form.handleSubmit((v) => {
    update.mutate(
      { id: listener.id, ...editListenerBody(listener, v) },
      {
        onSuccess: () => {
          notify.success("The listener has been updated.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Edit listener ${listener.name || listener.id}`}
      submitLabel="Save"
      size="lg"
      onSubmit={submit}
      isPending={update.isPending}
      error={update.error}
    >
      <p>
        {listener.protocol} on port {listener.protocol_port}. The protocol and
        port cannot be changed.
      </p>
      <TextInput control={form.control} name="name" label="Name" />
      <TextAreaInput
        control={form.control}
        name="description"
        label="Description"
        rows={2}
      />
      {http && (
        <>
          <SwitchInput
            control={form.control}
            name="xff"
            label="Insert X-Forwarded-For header"
          />
          <SwitchInput
            control={form.control}
            name="xfp"
            label="Insert X-Forwarded-Port header"
          />
          <SwitchInput
            control={form.control}
            name="xfproto"
            label="Insert X-Forwarded-Proto header"
          />
        </>
      )}
      <SelectInput
        control={form.control}
        name="default_pool_id"
        label="Default pool"
        options={[
          { id: "", label: "None" },
          ...poolsFor(tree, listener.protocol).map((p) => ({
            id: p.id,
            label: p.name || p.id,
          })),
        ]}
      />
      <NumberInput
        control={form.control}
        name="connection_limit"
        label="Connection limit"
        description="-1 for no limit."
        minValue={-1}
      />
      <TextAreaInput
        control={form.control}
        name="allowed_cidrs"
        label="Allowed CIDRs"
        description="One per line; empty allows all sources."
        rows={2}
      />
      {tls && (
        <>
          <TextInput
            control={form.control}
            name="tls_ref"
            label="TLS certificate reference"
            description={TLS_REF_HELP}
          />
          <TextAreaInput
            control={form.control}
            name="sni_refs"
            label="SNI certificate references"
            description="Barbican references of extra certificates, one per line, chosen by the client's server name."
            rows={2}
            monospace
          />
          <TextInput
            control={form.control}
            name="tls_ciphers"
            label="TLS ciphers"
            description="An OpenSSL cipher string; empty uses the Octavia default."
          />
        </>
      )}
      {timeouts && (
        <Accordion>
          <AccordionItem id="timeouts" title="Timeouts (milliseconds)">
            <div className={styles.fields}>
              <NumberInput
                control={form.control}
                name="timeout_client_data"
                label="Client data timeout"
                minValue={0}
              />
              <NumberInput
                control={form.control}
                name="timeout_member_connect"
                label="Member connect timeout"
                minValue={0}
              />
              <NumberInput
                control={form.control}
                name="timeout_member_data"
                label="Member data timeout"
                minValue={0}
              />
              <NumberInput
                control={form.control}
                name="timeout_tcp_inspect"
                label="TCP inspect timeout"
                minValue={0}
              />
            </div>
          </AccordionItem>
        </Accordion>
      )}
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}
