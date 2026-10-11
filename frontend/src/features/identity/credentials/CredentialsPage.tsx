// Credentials: the project's EC2 key pair (Horizon API Access "View
// credentials" and "Recreate EC2 credentials") and the user's generic
// Keystone credentials (Horizon identity/credentials).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { CodeBlock } from "../../../components/CodeBlock/CodeBlock";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import { CopyButton } from "../../../components/CopyButton/CopyButton";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import type { Credential } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { meQuery } from "../../../lib/queries";
import { useProjectId } from "../../../lib/useProject";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { credentialsRoute } from "../../../app/router";
import {
  credentialsQuery,
  ec2Query,
  useDeleteCredential,
  useEnsureEc2,
  useRecreateEc2,
} from "../api";
import { CreateCredentialDialog } from "./CredentialDialogs";
import styles from "./CredentialsPage.module.scss";

export function CredentialsPage() {
  const projectId = useProjectId();
  const { data: me } = useQuery(meQuery);
  const search = credentialsRoute.useSearch();
  const navigate = useNavigate({ from: credentialsRoute.fullPath });
  const credentials = useQuery(credentialsQuery);
  const remove = useDeleteCredential(projectId);
  const [deleting, setDeleting] = useState<Credential[]>([]);
  const creating = search.create === true;
  const setCreating = (open: boolean) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous };
        if (open) next.create = true;
        else delete next.create;
        return next;
      },
      replace: true,
    });

  const projectNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of me?.projects ?? [])
      names.set(project.id, project.name);
    return names;
  }, [me]);

  const columns = useMemo<ColumnDef<Credential>[]>(
    () => [
      {
        id: "type",
        label: "Type",
        isRowHeader: true,
        cell: (row) => row.type.toUpperCase(),
        sortValue: (row) => row.type,
      },
      {
        id: "project",
        label: "Project",
        cell: (row) =>
          row.project_id
            ? (projectNames.get(row.project_id) ?? (
                <code>{row.project_id}</code>
              ))
            : "-",
        sortValue: (row) =>
          row.project_id
            ? (projectNames.get(row.project_id) ?? row.project_id)
            : "",
      },
      {
        id: "blob",
        label: "Data",
        cell: (row) => <code className={styles.blob}>{row.blob}</code>,
        hideBelow: "md",
      },
      {
        id: "id",
        label: "ID",
        cell: (row) => <code className={styles.blob}>{row.id}</code>,
        hideBelow: "lg",
        defaultHidden: true,
      },
    ],
    [projectNames],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((row) => remove.mutateAsync(row.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? "Credential deleted."
          : `${deleting.length} credentials deleted.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} credentials.`,
      );
    }
    setDeleting([]);
  };

  return (
    <>
      <PageHeader
        title="Credentials"
        crumbs={[{ label: "Identity" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create credential
          </Button>
        }
      />
      <div className={styles.stack}>
        <Ec2Panel projectId={projectId} projectName={me?.project.name ?? ""} />
        <DataTable
          id="credentials"
          label="Credentials"
          columns={columns}
          rows={credentials.data?.items}
          getRowId={(row) => row.id}
          isLoading={credentials.isPending}
          isFetching={credentials.isFetching}
          error={credentials.error}
          onRetry={() => void credentials.refetch()}
          onRefresh={() => void credentials.refetch()}
          emptyTitle="No credentials"
          emptyBody={
            <p>
              EC2 credentials appear here once created, as do TOTP and
              certificate credentials you add.
            </p>
          }
          defaultSort={{ column: "type", direction: "ascending" }}
          rowActions={(row) => [
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              onAction: () => setDeleting([row]),
            },
          ]}
          batchActions={[
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              onAction: (selected) => setDeleting(selected),
            },
          ]}
        />
      </div>
      <CreateCredentialDialog
        projects={me?.projects ?? []}
        currentProjectId={projectId}
        isOpen={creating}
        onOpenChange={setCreating}
      />
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? "Delete this credential?"
            : `Delete ${deleting.length} credentials?`
        }
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>Anything using the credential loses access immediately.</p>
      </ConfirmDialog>
    </>
  );
}

function Ec2Panel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const ec2 = useQuery(ec2Query(projectId));
  const ensure = useEnsureEc2(projectId);
  const recreate = useRecreateEc2(projectId);
  const [recreating, setRecreating] = useState(false);
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
            onPress={() => setRecreating(true)}
          >
            Recreate EC2 credentials
          </Button>
        ) : null
      }
    >
      <p className={styles.intro}>
        EC2 credentials let S3-compatible tools use the object store with an
        access key and secret key. Each project has its own pair.
      </p>
      {ec2.isPending ? (
        <SkeletonLines lines={2} />
      ) : ec2.isError ? (
        <ErrorState error={ec2.error} onRetry={() => ec2.refetch()} />
      ) : credential ? (
        <dl className={styles.keys}>
          <dt>Access key</dt>
          <dd>
            <span className={styles.copyable}>
              <code>{credential.access}</code>
              <CopyButton text={credential.access} label="Copy access key" />
            </span>
          </dd>
          <dt>Secret key</dt>
          <dd>
            <CodeBlock text={credential.secret} label="Secret key" wrap />
          </dd>
        </dl>
      ) : (
        <>
          <p>This project has no EC2 credentials yet.</p>
          {ensure.isError && (
            <ErrorState error={ensure.error} title="Could not create" />
          )}
          {ensure.isPending ? (
            <Button state="loading" loadingText="Creating..." isDisabled>
              Create EC2 credentials
            </Button>
          ) : (
            <Button
              onPress={() =>
                ensure.mutate(undefined, {
                  onSuccess: () => notify.success("EC2 credentials created."),
                })
              }
            >
              Create EC2 credentials
            </Button>
          )}
        </>
      )}
      <ConfirmDialog
        isOpen={recreating}
        onOpenChange={setRecreating}
        title="Recreate EC2 credentials?"
        confirmLabel="Recreate"
        isPending={recreate.isPending}
        error={recreate.error}
        onConfirm={() =>
          recreate.mutate(undefined, {
            onSuccess: () => {
              setRecreating(false);
              notify.success("EC2 credentials recreated.");
            },
          })
        }
      >
        <p>
          This action cannot be undone. The current EC2 credentials are deleted
          and cannot be recovered.
        </p>
      </ConfirmDialog>
    </Panel>
  );
}
