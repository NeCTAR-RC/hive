import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Dialog, Link, Modal } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { CopyButton } from "../../components/CopyButton/CopyButton";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { useQueryTable } from "../../components/DataTable/useQueryTable";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { ServiceEndpoint } from "../../lib/api/types/apiaccess";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { apiAccessCredentialsQuery, endpointsQuery } from "./api";
import styles from "./ApiAccessPage.module.scss";

export function ApiAccessPage() {
  const projectId = useProjectId();
  const endpoints = useQuery(endpointsQuery(projectId));
  const endpointsTable = useQueryTable(endpoints, {
    noun: "endpoints",
    emptyTitle: "No endpoints",
    refresh: false,
  });
  const [showCredentials, setShowCredentials] = useState(false);

  const columns = useMemo<ColumnDef<ServiceEndpoint>[]>(
    () => [
      {
        id: "name",
        label: "Service",
        isRowHeader: true,
        cell: (row) => row.name,
        sortValue: (row) => row.name,
      },
      {
        id: "type",
        label: "Type",
        cell: (row) => <code>{row.type}</code>,
        sortValue: (row) => row.type,
        hideBelow: "md",
      },
      {
        id: "url",
        label: "Endpoint",
        cell: (row) => (
          <span className={styles.endpoint}>
            <code>{row.url}</code>
            <CopyButton text={row.url} label="Copy" />
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="API access"
        crumbs={[{ label: "Project" }]}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setShowCredentials(true)}
            >
              View credentials
            </Button>
            <Link
              variant="secondary"
              size="sm"
              href="/api/api-access/clouds.yaml"
              download
            >
              Download clouds.yaml
            </Link>
            <Link
              variant="primary"
              size="sm"
              href="/api/api-access/openrc"
              download
            >
              Download OpenStack RC file
            </Link>
          </>
        }
      />
      <div className={styles.stack}>
        <Panel title="Using the API">
          <p>
            The OpenStack RC file and clouds.yaml configure the OpenStack
            command line tools and SDKs for this project. They use your Nectar
            username with the password set under{" "}
            <AppLink to="/account/reset-password">Reset password</AppLink>. EC2
            credentials for S3-compatible tools and application credentials are
            under <AppLink to="/identity/credentials">Credentials</AppLink> and{" "}
            <AppLink to="/identity/application-credentials">
              Application credentials
            </AppLink>
            .
          </p>
        </Panel>
        <DataTable
          id="api-endpoints"
          label="Service endpoints"
          columns={columns}
          getRowId={(row) => `${row.type}:${row.url}`}
          {...endpointsTable}
          defaultSort={{ column: "name", direction: "ascending" }}
          pageSizes={[50, 100]}
        />
      </div>
      {showCredentials && (
        <CredentialsDialog onClose={() => setShowCredentials(false)} />
      )}
    </>
  );
}

/** The user's credentials for this project, fetched when the dialog opens. */
function CredentialsDialog({ onClose }: { onClose: () => void }) {
  const projectId = useProjectId();
  const credentials = useQuery(apiAccessCredentialsQuery(projectId));
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title="User credentials"
        closeLabel="Close"
        actions={
          <Button variant="secondary" slot="close">
            Close
          </Button>
        }
      >
        {credentials.isPending ? (
          <SkeletonLines lines={5} />
        ) : credentials.isError ? (
          <p>Credentials are unavailable right now.</p>
        ) : (
          <KeyValueList
            items={[
              {
                label: "User name",
                value: <Copyable text={credentials.data.username} />,
              },
              {
                label: "User ID",
                value: <Copyable text={credentials.data.user_id} />,
              },
              {
                label: "Project name",
                value: <Copyable text={credentials.data.project_name} />,
              },
              {
                label: "Project ID",
                value: <Copyable text={credentials.data.project_id} />,
              },
              {
                label: "Authentication URL",
                value: <Copyable text={credentials.data.auth_url} />,
              },
              { label: "Region", value: credentials.data.region },
            ]}
          />
        )}
      </Dialog>
    </Modal>
  );
}

function Copyable({ text }: { text: string }) {
  return (
    <span className={styles.endpoint}>
      <code>{text}</code>
      <CopyButton text={text} />
    </span>
  );
}
