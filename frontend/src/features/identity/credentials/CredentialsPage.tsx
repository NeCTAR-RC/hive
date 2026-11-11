// Credentials: the project's EC2 key pair (Horizon API Access "View
// credentials" and "Recreate EC2 credentials"), then the user's EC2 keys in
// their other projects (from Horizon identity/credentials, whose generic
// TOTP and certificate creator Hive leaves out: users sign in through AAF).
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { DataTable } from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { Panel } from "../../../components/Panel/Panel";
import type { Items } from "../../../lib/api/types/common";
import type { Credential } from "../../../lib/api/types/identity";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { meQuery } from "../../../lib/queries";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import {
  credentialWriteKeys,
  deleteCredential,
  userCredentialsQuery,
} from "../api";
import { Ec2Panel } from "./Ec2Panel";
import { ec2AccessKey, otherProjectKeys } from "./ec2";
import styles from "./CredentialsPage.module.scss";
import { useCredentialColumns } from "./useCredentialColumns";

/**
 * The user's EC2 credentials: the current project's key pair first, with
 * create, copy and recreate, then the keys the user holds in other
 * projects, by project and access key, with delete.
 */
export function CredentialsPage() {
  const projectId = useProjectId();
  const { data: me } = useQuery(meQuery);
  const selectOthers = useCallback(
    (data: Items<Credential>) => ({
      ...data,
      items: otherProjectKeys(data.items, projectId),
    }),
    [projectId],
  );
  const credentials = useQuery({
    ...userCredentialsQuery,
    select: selectOthers,
  });
  const credentialsTable = useQueryTable(credentials, {
    noun: "EC2 keys",
    emptyTitle: "No EC2 keys in other projects",
  });
  const remove = useBulkAction<Credential, "delete">({
    noun: { one: "EC2 key", many: "EC2 keys" },
    name: (credential) => ec2AccessKey(credential.blob) ?? credential.id,
    getId: (credential) => credential.id,
    invalidates: credentialWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (credential) => deleteCredential(credential.id),
        title: (credentials) =>
          credentials.length === 1
            ? "Delete this EC2 key?"
            : `Delete ${credentials.length} EC2 keys?`,
        body: <p>Anything using the key loses access immediately.</p>,
      },
    },
  });

  const projectNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of me?.projects ?? [])
      names.set(project.id, project.name);
    return names;
  }, [me]);

  const columns = useCredentialColumns(projectNames);

  return (
    <>
      <PageHeader title="Credentials" crumbs={[{ label: "Identity" }]} />
      <div className={styles.stack}>
        <Ec2Panel projectName={me?.project.name ?? ""} />
        <Panel title="EC2 keys in your other projects">
          <DataTable
            id="credentials"
            label="EC2 keys in your other projects"
            columns={columns}
            getRowId={(row) => row.id}
            {...credentialsTable}
            {...remove.tableProps}
            emptyBody={
              <p>
                Each project has its own EC2 key pair. Keys you create in your
                other projects are listed here.
              </p>
            }
            defaultSort={{ column: "project", direction: "ascending" }}
            rowActions={(row) => [
              {
                id: "delete",
                label: "Delete",
                tone: "danger",
                onAction: () => remove.run("delete", [row]),
              },
            ]}
            batchActions={[
              {
                id: "delete",
                label: "Delete",
                tone: "danger",
                onAction: (selected) => remove.run("delete", selected),
              },
            ]}
          />
        </Panel>
      </div>
      {remove.dialog}
    </>
  );
}
