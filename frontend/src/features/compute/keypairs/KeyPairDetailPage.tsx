import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { keyPairRoute } from "../../../app/router";
import { keyPairQuery } from "../api";
import styles from "./KeyPairDetailPage.module.scss";

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Key Pairs", href: "/compute/key-pairs" },
];

export function KeyPairDetailPage() {
  const projectId = useProjectId();
  const { name } = keyPairRoute.useParams();
  const keyPair = useQuery(keyPairQuery(projectId, name));

  if (keyPair.isError) {
    const notFound =
      keyPair.error instanceof ApiError && keyPair.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? "Key pair not found" : name}
          crumbs={CRUMBS}
        />
        {notFound ? (
          <p>
            There is no key pair called <code>{name}</code> in this project.{" "}
            <RouterLink to="/compute/key-pairs">Back to key pairs</RouterLink>
          </p>
        ) : (
          <ErrorState
            error={keyPair.error}
            onRetry={() => void keyPair.refetch()}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={name} crumbs={CRUMBS} />
      <div className={styles.grid}>
        <Panel title="Key pair">
          {keyPair.isPending ? (
            <SkeletonLines lines={4} />
          ) : (
            <KeyValueList
              items={[
                { label: "Name", value: keyPair.data.name },
                { label: "Type", value: keyPair.data.type },
                {
                  label: "Fingerprint",
                  value: <code>{keyPair.data.fingerprint}</code>,
                },
                {
                  label: "Created",
                  value: formatDateTime(keyPair.data.created_at),
                },
              ]}
            />
          )}
        </Panel>
        {keyPair.data?.public_key && (
          <CodeBlock label="Public key" text={keyPair.data.public_key} wrap />
        )}
      </div>
    </>
  );
}
