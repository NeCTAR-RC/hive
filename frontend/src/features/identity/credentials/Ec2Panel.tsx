// The EC2 credentials panel of the credentials page (Horizon API Access
// "View credentials" and "Recreate EC2 credentials").
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import type { Verb } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { CopyButton } from "../../../components/CopyButton/CopyButton";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { loadingProps } from "../../../components/buttonState";
import type { Ec2Credential } from "../../../lib/api/types/identity";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { notify } from "../../../lib/notify";
import {
  credentialWriteKeys,
  ec2Query,
  recreateEc2Credentials,
  useEnsureEc2,
} from "../api";
import styles from "./CredentialsPage.module.scss";

const RECREATE: Verb = {
  label: "Recreate",
  done: "Recreated",
  failed: "recreate",
};

/**
 * The project's EC2 key pair: its access key, its secret key behind "Show
 * secret key" (Horizon's "View credentials" keeps the secret off the page
 * until asked), a confirmed recreate, or a button to create the pair when
 * the project has none.
 */
export function Ec2Panel({ projectName }: { projectName: string }) {
  const projectId = useProjectId();
  const ec2 = useQuery(ec2Query(projectId));
  const ensure = useEnsureEc2();
  const recreate = useBulkAction<Ec2Credential, "recreate">({
    noun: { one: "EC2 credentials", many: "EC2 credentials" },
    name: () => `for ${projectName}`,
    getId: (pair) => pair.access,
    invalidates: credentialWriteKeys,
    actions: {
      recreate: {
        verb: RECREATE,
        request: () => recreateEc2Credentials(),
        title: () => "Recreate EC2 credentials?",
        body: (
          <p>
            This action cannot be undone. The current EC2 credentials are
            deleted and cannot be recovered.
          </p>
        ),
      },
    },
  });
  // The access key whose secret the user chose to show, so a recreated
  // pair starts hidden again.
  const [revealed, setRevealed] = useState<string | null>(null);
  const credential = ec2.data?.credential ?? null;
  return (
    <Panel
      title={`EC2 credentials for ${projectName}`}
      actions={
        credential ? (
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            onPress={() => recreate.run("recreate", [credential])}
          >
            Recreate EC2 credentials
          </Button>
        ) : null
      }
    >
      <div className={styles.panelStack}>
        <p className={styles.intro}>
          EC2 credentials let S3-compatible tools use the object store with an
          access key and secret key. Each project has its own pair.
        </p>
        {ec2.isPending ? (
          <SkeletonLines lines={2} />
        ) : ec2.isError ? (
          <ErrorState error={ec2.error} onRetry={() => void ec2.refetch()} />
        ) : credential ? (
          <KeyValueList
            items={[
              {
                label: "Access key",
                value: (
                  <span className={styles.copyable}>
                    <code>{credential.access}</code>
                    <CopyButton
                      text={credential.access}
                      label="Copy access key"
                    />
                  </span>
                ),
              },
              {
                label: "Secret key",
                value:
                  revealed === credential.access ? (
                    <CodeBlock
                      text={credential.secret}
                      label="Secret key"
                      wrap
                    />
                  ) : (
                    <Button
                      variant="secondary"
                      size="xs"
                      onPress={() => setRevealed(credential.access)}
                    >
                      Show secret key
                    </Button>
                  ),
              },
            ]}
          />
        ) : (
          <>
            <p>This project has no EC2 credentials yet.</p>
            {ensure.isError && (
              <ErrorState error={ensure.error} title="Could not create" />
            )}
            <div>
              <Button
                onPress={() =>
                  ensure.mutate(undefined, {
                    onSuccess: () => notify.success("EC2 credentials created."),
                  })
                }
                {...loadingProps(ensure.isPending, "Creating...")}
              >
                Create EC2 credentials
              </Button>
            </div>
          </>
        )}
      </div>
      {recreate.dialog}
    </Panel>
  );
}
