import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { keyPairQuery } from "../api";
import styles from "./KeyPairDetailPage.module.scss";

const keyPairRoute = getRouteApi("/app/compute/key-pairs/$name");

const CRUMBS = [
  { label: "Project" },
  { label: "Compute" },
  { label: "Key pairs", href: "/compute/key-pairs" },
];

export function KeyPairDetailPage() {
  const projectId = useProjectId();
  const { name } = keyPairRoute.useParams();
  const keyPair = useQuery(keyPairQuery(projectId, name));

  return (
    <DetailPage
      query={keyPair}
      noun="key pair"
      id={name}
      idIsName
      crumbs={CRUMBS}
      backTo={{ label: "key pairs", href: "/compute/key-pairs" }}
      title={() => name}
    >
      {(data) => (
        <div className={styles.grid}>
          <Panel title="Key pair">
            <KeyValueList
              items={[
                { label: "Name", value: data.name },
                { label: "Type", value: data.type },
                {
                  label: "Fingerprint",
                  value: <code>{data.fingerprint}</code>,
                },
                {
                  label: "Created",
                  value: formatDateTime(data.created_at),
                },
              ]}
            />
          </Panel>
          {data.public_key && (
            <CodeBlock label="Public key" text={data.public_key} wrap />
          )}
        </div>
      )}
    </DetailPage>
  );
}
