// One application credential (Horizon _detail_overview.html).
import { useQuery } from "@tanstack/react-query";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { formatDateTime } from "../../../lib/format";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { appCredentialRoute } from "../../../app/router";
import { appCredentialQuery } from "../api";
import styles from "./ApplicationCredentialsPage.module.scss";

export function ApplicationCredentialDetailPage() {
  const { credentialId } = appCredentialRoute.useParams();
  const credential = useQuery(appCredentialQuery(credentialId));
  return (
    <>
      <PageHeader
        title={credential.data?.name ?? "Application credential"}
        crumbs={[
          { label: "Identity" },
          {
            label: "Application Credentials",
            href: "/identity/application-credentials",
          },
        ]}
      />
      <div className={styles.stack}>
        {credential.isPending ? (
          <SkeletonLines lines={8} />
        ) : credential.isError ? (
          <ErrorState
            error={credential.error}
            onRetry={() => credential.refetch()}
          />
        ) : (
          <>
            <Panel title="Overview">
              <KeyValueList
                items={[
                  { label: "Name", value: credential.data.name },
                  { label: "ID", value: <code>{credential.data.id}</code> },
                  {
                    label: "Project ID",
                    value: <code>{credential.data.project_id ?? ""}</code>,
                  },
                  {
                    label: "Description",
                    value: credential.data.description || "-",
                  },
                  {
                    label: "Expires",
                    value: credential.data.expires_at
                      ? formatDateTime(credential.data.expires_at)
                      : "Never",
                  },
                  {
                    label: "Unrestricted",
                    value: credential.data.unrestricted ? "Yes" : "No",
                  },
                ]}
              />
            </Panel>
            <Panel title="Roles">
              {credential.data.roles.length === 0 ? (
                <p>No roles recorded.</p>
              ) : (
                <ul className={styles.plainList}>
                  {credential.data.roles.map((role) => (
                    <li key={role.id ?? role.name}>
                      {role.name}{" "}
                      {role.id && (
                        <span className={styles.muted}>
                          <code>{role.id}</code>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Access rules">
              {credential.data.access_rules.length === 0 ? (
                <p>
                  No access rules: the credential may call any API its roles
                  allow.
                </p>
              ) : (
                <Table aria-label="Access rules">
                  <TableHeader>
                    <Column id="service" isRowHeader>
                      Service
                    </Column>
                    <Column id="method">Method</Column>
                    <Column id="path">Path</Column>
                  </TableHeader>
                  <TableBody
                    items={credential.data.access_rules.map((rule, index) => ({
                      ...rule,
                      key: String(index),
                    }))}
                  >
                    {(rule) => (
                      <Row id={rule.key}>
                        <Cell>{rule.service ?? ""}</Cell>
                        <Cell>{rule.method ?? ""}</Cell>
                        <Cell>
                          <code>{rule.path ?? ""}</code>
                        </Cell>
                      </Row>
                    )}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
