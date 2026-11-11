// One application credential (Horizon _detail_overview.html).
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
} from "@ardc-ui/react";
import { RowActionsMenu } from "../../../components/DataTable/RowActionsMenu";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { formatDateTime } from "../../../lib/format";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { appCredentialQuery } from "../api";
import { useApplicationCredentialActions } from "./ApplicationCredentialActions";
import styles from "./ApplicationCredentialsPage.module.scss";

const appCredentialRoute = getRouteApi(
  "/app/identity/application-credentials/$credentialId",
);

const CRUMBS = [
  { label: "Identity" },
  {
    label: "Application credentials",
    href: "/identity/application-credentials",
  },
];

/**
 * One application credential: its overview, roles and access rules, with
 * the list row's actions menu; a delete returns to the list.
 */
export function ApplicationCredentialDetailPage() {
  const { credentialId } = appCredentialRoute.useParams();
  const navigate = useNavigate();
  const credential = useQuery(appCredentialQuery(credentialId));
  const { rowActions, dialogs } = useApplicationCredentialActions(
    () => void navigate({ to: "/identity/application-credentials" }),
  );
  return (
    <>
      <DetailPage
        query={credential}
        noun="application credential"
        id={credentialId}
        scope="none"
        crumbs={CRUMBS}
        backTo={{
          label: "application credentials",
          href: "/identity/application-credentials",
        }}
        title={(data) => data.name}
        actions={(data) => <RowActionsMenu actions={rowActions(data)} />}
      >
        {(data) => (
          <div className={styles.stack}>
            <Panel title="Overview">
              <KeyValueList
                items={[
                  { label: "Name", value: data.name },
                  { label: "ID", value: <code>{data.id}</code> },
                  {
                    label: "Project ID",
                    value: <code>{data.project_id ?? ""}</code>,
                  },
                  {
                    label: "Description",
                    value: data.description,
                  },
                  {
                    label: "Expires",
                    value: data.expires_at
                      ? formatDateTime(data.expires_at)
                      : "Never",
                  },
                  {
                    label: "Unrestricted",
                    value: data.unrestricted ? "Yes" : "No",
                  },
                ]}
              />
            </Panel>
            <Panel title="Roles">
              {data.roles.length === 0 ? (
                <p>No roles recorded.</p>
              ) : (
                <ul className={styles.list}>
                  {data.roles.map((role) => (
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
              {data.access_rules.length === 0 ? (
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
                  <TableBody>
                    {data.access_rules.map((rule, index) => (
                      <Row key={index} id={index}>
                        <Cell>{rule.service ?? ""}</Cell>
                        <Cell>{rule.method ?? ""}</Cell>
                        <Cell>
                          <code>{rule.path ?? ""}</code>
                        </Cell>
                      </Row>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>
        )}
      </DetailPage>
      {dialogs}
    </>
  );
}
