// Rolling upgrade (magnum-ui rolling-upgrade) and certificate signing
// dialogs.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Loading } from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { SelectInput, TextAreaInput } from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { Cluster } from "../../lib/api/types";
import { downloadText } from "../../lib/download";
import { notify } from "../../lib/notify";
import {
  upgradeOptionsQuery,
  useSignCertificate,
  useUpgradeCluster,
} from "./api";

const upgradeSchema = z.object({
  template_id: z.string().min(1, "Choose a Kubernetes version"),
});

export function UpgradeClusterDialog({
  projectId,
  cluster,
  onClose,
}: {
  projectId: string;
  cluster: Cluster;
  onClose: () => void;
}) {
  const options = useQuery(upgradeOptionsQuery(projectId, cluster.id));
  const upgrade = useUpgradeCluster(projectId);
  const targets = options.data?.targets ?? [];
  const form = useForm<z.infer<typeof upgradeSchema>>({
    resolver: zodResolver(upgradeSchema),
    values: { template_id: targets[0]?.template_id ?? "" },
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    upgrade.mutate(
      { clusterId: cluster.id, templateId: values.template_id },
      {
        onSuccess: () => {
          notify.success(
            `Cluster ${cluster.name} is being upgraded to the new Kubernetes version.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Upgrade ${cluster.name}`}
      submitLabel="Upgrade"
      onSubmit={submit}
      isPending={upgrade.isPending}
      isSubmitDisabled={targets.length === 0}
      error={upgrade.error}
    >
      {options.isPending ? (
        <Loading>Loading upgrade targets...</Loading>
      ) : options.isError ? (
        <ErrorState
          error={options.error}
          title="Could not load the upgrade targets"
          onRetry={() => void options.refetch()}
        />
      ) : targets.length === 0 ? (
        <Alert tone="info" role="status">
          This cluster is already on the latest Kubernetes version.
        </Alert>
      ) : (
        <>
          <p>
            The cluster runs Kubernetes{" "}
            {options.data.current_version ?? "(unknown)"}. Nodes are replaced
            one at a time with the new version.
          </p>
          <SelectInput
            control={form.control}
            name="template_id"
            label="New Kubernetes version"
            options={targets.map((t) => ({
              id: t.template_id,
              label: t.kubernetes_version ?? t.name,
            }))}
            isRequired
          />
        </>
      )}
    </FormDialog>
  );
}

const signSchema = z.object({
  csr: z
    .string()
    .trim()
    .min(1, "Paste a certificate signing request")
    .refine(
      (value) => value.includes("CERTIFICATE REQUEST"),
      "That is not a PEM certificate signing request",
    ),
});

export function SignCertificateDialog({
  cluster,
  onClose,
}: {
  cluster: Cluster;
  onClose: () => void;
}) {
  const sign = useSignCertificate();
  const [pem, setPem] = useState<string | null>(null);
  const form = useForm<z.infer<typeof signSchema>>({
    resolver: zodResolver(signSchema),
    defaultValues: { csr: "" },
  });
  const submit = form.handleSubmit((values) => {
    sign.mutate(
      { clusterId: cluster.id, csr: values.csr },
      {
        onSuccess: (result) => {
          setPem(result.pem);
          downloadText(
            `${cluster.name}_cert.pem`,
            result.pem,
            "application/x-pem-file",
          );
          notify.success("Certificate signed and downloaded.");
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Sign a certificate for ${cluster.name}`}
      submitLabel="Sign certificate"
      size="lg"
      onSubmit={submit}
      isPending={sign.isPending}
      error={sign.error}
    >
      <p>
        Paste a PEM certificate signing request. The cluster&apos;s certificate
        authority signs it and the certificate downloads.
      </p>
      <TextAreaInput
        control={form.control}
        name="csr"
        label="Certificate signing request"
        rows={8}
        monospace
        isRequired
      />
      {pem && (
        <CodeBlock text={pem} label="Signed certificate" maxHeight="12rem" />
      )}
    </FormDialog>
  );
}
