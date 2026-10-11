// L7 policy and rule dialogs (octavia-dashboard workflow/l7policy and
// l7rule).
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  NumberInput,
  SelectInput,
  SwitchInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { L7Policy, LoadBalancerTree } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  loadBalancerOptionsQuery,
  useCreateL7Policy,
  useCreateL7Rule,
  useUpdateL7Policy,
} from "./api";

const policySchema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    action: z.string().min(1, "Choose an action"),
    redirect_url: z.string().trim(),
    redirect_pool_id: z.string(),
    redirect_prefix: z.string().trim(),
    position: z.number().int().min(1).optional(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (
      v.action === "REDIRECT_TO_URL" &&
      !/^https?:\/\//.test(v.redirect_url)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_url"],
        message: "Enter an http or https URL",
      });
    }
    if (v.action === "REDIRECT_TO_POOL" && !v.redirect_pool_id) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_pool_id"],
        message: "Choose a pool",
      });
    }
    if (
      v.action === "REDIRECT_PREFIX" &&
      !/^https?:\/\//.test(v.redirect_prefix)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["redirect_prefix"],
        message: "Enter an http or https prefix",
      });
    }
  });

export function L7PolicyDialog({
  projectId,
  tree,
  listenerId,
  policy,
  onClose,
}: {
  projectId: string;
  tree: LoadBalancerTree;
  listenerId: string;
  policy: L7Policy | null;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateL7Policy(projectId);
  const update = useUpdateL7Policy(projectId);
  const listener = tree.listeners.find((l) => l.id === listenerId);
  const pools = tree.pools.filter(
    (p) =>
      !listener ||
      p.protocol ===
        (listener.protocol === "TERMINATED_HTTPS" ? "HTTP" : listener.protocol),
  );
  const form = useForm<z.infer<typeof policySchema>>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: policy?.name ?? "",
      description: policy?.description ?? "",
      action: policy?.action ?? "REJECT",
      redirect_url: policy?.redirect_url ?? "",
      redirect_pool_id: policy?.redirect_pool_id ?? "",
      redirect_prefix: policy?.redirect_prefix ?? "",
      ...(policy?.position ? { position: policy.position } : {}),
      admin_state_up: policy?.admin_state_up ?? true,
    },
  });
  const action = useWatch({ control: form.control, name: "action" });
  const submit = form.handleSubmit((v) => {
    const body = {
      action: v.action,
      admin_state_up: v.admin_state_up,
      ...(v.name ? { name: v.name } : {}),
      ...(v.description ? { description: v.description } : {}),
      ...(v.position ? { position: v.position } : {}),
      ...(v.action === "REDIRECT_TO_URL"
        ? { redirect_url: v.redirect_url }
        : {}),
      ...(v.action === "REDIRECT_TO_POOL"
        ? { redirect_pool_id: v.redirect_pool_id }
        : {}),
      ...(v.action === "REDIRECT_PREFIX"
        ? { redirect_prefix: v.redirect_prefix }
        : {}),
    };
    const done = () => {
      notify.success(
        policy
          ? "The policy has been updated."
          : "A new L7 policy is being created.",
      );
      onClose();
    };
    if (policy) update.mutate({ id: policy.id, ...body }, { onSuccess: done });
    else
      create.mutate({ listener_id: listenerId, ...body }, { onSuccess: done });
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={
        policy ? `Edit policy ${policy.name || policy.id}` : "Create L7 policy"
      }
      submitLabel={policy ? "Save" : "Create policy"}
      onSubmit={submit}
      isPending={create.isPending || update.isPending}
      error={create.error ?? update.error}
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
        name="action"
        label="Action"
        options={(
          options.data?.l7_actions ?? [
            "REJECT",
            "REDIRECT_TO_URL",
            "REDIRECT_TO_POOL",
            "REDIRECT_PREFIX",
          ]
        ).map((a) => ({ id: a, label: a.replace(/_/g, " ") }))}
        isRequired
      />
      {action === "REDIRECT_TO_URL" && (
        <TextInput
          control={form.control}
          name="redirect_url"
          label="Redirect URL"
          type="url"
          isRequired
        />
      )}
      {action === "REDIRECT_PREFIX" && (
        <TextInput
          control={form.control}
          name="redirect_prefix"
          label="Redirect prefix"
          type="url"
          isRequired
        />
      )}
      {action === "REDIRECT_TO_POOL" && (
        <SelectInput
          control={form.control}
          name="redirect_pool_id"
          label="Redirect to pool"
          options={pools.map((p) => ({ id: p.id, label: p.name || p.id }))}
          isRequired
        />
      )}
      <NumberInput
        control={form.control}
        name="position"
        label="Position"
        description="Policies are evaluated in position order."
        minValue={1}
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}

const ruleSchema = z
  .object({
    type: z.string().min(1, "Choose a type"),
    compare_type: z.string().min(1, "Choose a comparison"),
    key: z.string().trim(),
    value: z.string().trim().min(1, "Enter a value"),
    invert: z.boolean(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (["HEADER", "COOKIE"].includes(v.type) && !v.key) {
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: "Enter the header or cookie name",
      });
    }
    if (
      v.type === "FILE_TYPE" &&
      !["REGEX", "EQUAL_TO"].includes(v.compare_type)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compare_type"],
        message: "File type rules use REGEX or EQUAL TO",
      });
    }
  });

export function L7RuleDialog({
  projectId,
  policy,
  onClose,
}: {
  projectId: string;
  policy: L7Policy;
  onClose: () => void;
}) {
  const options = useQuery(loadBalancerOptionsQuery(projectId));
  const create = useCreateL7Rule(projectId);
  const form = useForm<z.infer<typeof ruleSchema>>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      type: "PATH",
      compare_type: "STARTS_WITH",
      key: "",
      value: "",
      invert: false,
      admin_state_up: true,
    },
  });
  const type = useWatch({ control: form.control, name: "type" });
  const submit = form.handleSubmit((v) => {
    create.mutate(
      {
        policyId: policy.id,
        type: v.type,
        compare_type: v.compare_type,
        value: v.value,
        invert: v.invert,
        admin_state_up: v.admin_state_up,
        ...(v.key ? { key: v.key } : {}),
      },
      {
        onSuccess: () => {
          notify.success("A new rule is being created.");
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Add rule to ${policy.name || policy.id}`}
      submitLabel="Add rule"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <SelectInput
        control={form.control}
        name="type"
        label="Type"
        options={(
          options.data?.l7_rule_types ?? [
            "HOST_NAME",
            "PATH",
            "FILE_TYPE",
            "HEADER",
            "COOKIE",
          ]
        ).map((t) => ({ id: t, label: t.replace(/_/g, " ") }))}
        isRequired
      />
      <SelectInput
        control={form.control}
        name="compare_type"
        label="Comparison"
        options={(
          options.data?.l7_compare_types ?? [
            "REGEX",
            "EQUAL_TO",
            "STARTS_WITH",
            "ENDS_WITH",
            "CONTAINS",
          ]
        ).map((t) => ({ id: t, label: t.replace(/_/g, " ") }))}
        isRequired
      />
      {["HEADER", "COOKIE"].includes(type) && (
        <TextInput control={form.control} name="key" label="Key" isRequired />
      )}
      <TextInput control={form.control} name="value" label="Value" isRequired />
      <SwitchInput
        control={form.control}
        name="invert"
        label="Invert the match"
      />
      <SwitchInput
        control={form.control}
        name="admin_state_up"
        label="Admin state up"
      />
    </FormDialog>
  );
}
