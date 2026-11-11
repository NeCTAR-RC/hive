// Sign a certificate signing request with a cluster's certificate
// authority.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import type { Cluster } from "../../../../lib/api/types/kubernetes";
import { downloadText } from "../../../../lib/download";
import { notify } from "../../../../lib/notify";
import { useSignCertificate } from "../../api";

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

/**
 * Signs a pasted PEM request, downloads the certificate and shows it in
 * the dialog, which stays open after the success.
 */
export function SignCertificateDialog({
  cluster,
  onClose,
}: {
  cluster: Cluster;
  onClose: () => void;
}) {
  const sign = useSignCertificate();
  const [pem, setPem] = useState<string | null>(null);
  const { TextAreaInput } = fieldsFor<z.infer<typeof signSchema>>();
  // Not useMutationForm: the dialog stays open after a success to show the
  // signed certificate, so a success must not close it.
  const form = useForm<z.infer<typeof signSchema>>({
    resolver: zodResolver(signSchema),
    defaultValues: { csr: "" },
  });
  const onValid = (values: z.infer<typeof signSchema>) => {
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
  };
  return (
    <FormDialog
      form={form}
      onValid={onValid}
      onClose={onClose}
      title={`Sign a certificate for ${cluster.name}`}
      submitLabel="Sign certificate"
      size="lg"
      isPending={sign.isPending}
      error={sign.error}
    >
      <p>
        Paste a PEM certificate signing request. The cluster&apos;s certificate
        authority signs it and the certificate downloads.
      </p>
      <TextAreaInput
        name="csr"
        label="Certificate signing request"
        isRequired
      />
      {pem && (
        <CodeBlock text={pem} label="Signed certificate" maxHeight="12rem" />
      )}
    </FormDialog>
  );
}
