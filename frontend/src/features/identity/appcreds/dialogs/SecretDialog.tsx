// The one-time secret dialog of a new application credential, with its
// openrc and clouds.yaml downloads.
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Dialog, Modal } from "@ardc-ui/react";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import type { ApplicationCredentialCreated } from "../../../../lib/api/types/identity";
import { downloadText } from "../../../../lib/download";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { appCredentialOptionsQuery } from "../../api";
import { appCredCloudsYaml, appCredFilename, appCredOpenrc } from "../files";

/** The new credential's secret and its download files, shown once. */
export function SecretDialog({
  credential,
  onClose,
}: {
  credential: ApplicationCredentialCreated;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(appCredentialOptionsQuery(projectId));
  const secret = credential.secret ?? "";
  const fileInput = {
    id: credential.id,
    name: credential.name,
    secret,
    authUrl: options.data?.auth_url ?? "",
    region: options.data?.region ?? "",
  };
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title="Application credential created"
        closeLabel="Close"
        actions={
          <>
            <Button
              variant="secondary"
              onPress={() =>
                downloadText(
                  appCredFilename(fileInput.name, "-openrc.sh"),
                  appCredOpenrc(fileInput),
                  "text/x-shellscript",
                )
              }
              isDisabled={!options.data}
            >
              Download openrc file
            </Button>
            <Button
              variant="secondary"
              onPress={() =>
                downloadText(
                  "clouds.yaml",
                  appCredCloudsYaml(fileInput),
                  "application/x-yaml",
                )
              }
              isDisabled={!options.data}
            >
              Download clouds.yaml
            </Button>
            <Button slot="close">Close</Button>
          </>
        }
      >
        <Alert tone="warning" role="status">
          Copy the secret or download a file now. It will not be available after
          closing this dialog.
        </Alert>
        <KeyValueList
          items={[
            { label: "ID", value: <code>{credential.id}</code> },
            { label: "Name", value: credential.name },
            {
              label: "Secret",
              value: <CodeBlock text={secret} label="Secret" wrap />,
            },
          ]}
        />
      </Dialog>
    </Modal>
  );
}
