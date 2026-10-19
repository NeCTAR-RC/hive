// User and database dialogs (trove-dashboard databases/forms.py): create a
// user with optional host and databases, manage a user's database access,
// create a database with optional character set and collation.
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Dialog, Loading, Modal, Switch } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { CheckboxesInput, TextInput } from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import type { DbUser } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import {
  dbDatabasesQuery,
  dbUserAccessQuery,
  useCreateDatabase,
  useCreateUser,
  useGrantAccess,
  useRevokeAccess,
} from "./api";
import styles from "./Databases.module.scss";

const userSchema = z.object({
  name: z.string().trim().min(1, "Enter a user name").max(128),
  password: z.string().min(1, "Enter a password").max(255),
  host: z.string().trim().max(255),
  databases: z.array(z.string()),
});

export function CreateUserDialog({
  projectId,
  instanceId,
  onClose,
}: {
  projectId: string;
  instanceId: string;
  onClose: () => void;
}) {
  const databases = useQuery(dbDatabasesQuery(projectId, instanceId));
  const create = useCreateUser(projectId);
  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", password: "", host: "", databases: [] },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        instanceId,
        name: values.name,
        password: values.password,
        ...(values.host ? { host: values.host } : {}),
        ...(values.databases.length ? { databases: values.databases } : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Created user ${values.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create user"
      submitLabel="Create user"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="User name"
        autoComplete="off"
        isRequired
      />
      <TextInput
        control={form.control}
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        isRequired
      />
      <TextInput
        control={form.control}
        name="host"
        label="Allowed host"
        description="Leave blank to allow the user from any host."
      />
      {databases.isPending ? (
        <Loading>Loading databases...</Loading>
      ) : (databases.data?.items.length ?? 0) > 0 ? (
        <CheckboxesInput
          control={form.control}
          name="databases"
          label="Initial access to databases"
          options={(databases.data?.items ?? []).map((d) => ({
            id: d.name ?? "",
            label: d.name ?? "",
          }))}
        />
      ) : null}
    </FormDialog>
  );
}

/** Grant and revoke, one switch per database, as trove-dashboard's
 * access table (databases/tables.py GrantDatabaseAccess and
 * RevokeDatabaseAccess); each change applies at once. */
export function UserAccessDialog({
  projectId,
  instanceId,
  user,
  onClose,
}: {
  projectId: string;
  instanceId: string;
  user: DbUser;
  onClose: () => void;
}) {
  const name = user.name ?? "";
  const access = useQuery(
    dbUserAccessQuery(projectId, instanceId, name, user.host),
  );
  const grant = useGrantAccess(projectId);
  const revoke = useRevokeAccess(projectId);
  const pending = grant.isPending || revoke.isPending;
  const error = grant.error ?? revoke.error;
  const items = access.data?.items ?? [];
  const toggle = (database: string, granted: boolean) => {
    grant.reset();
    revoke.reset();
    if (granted) {
      grant.mutate(
        { instanceId, name, host: user.host, databases: [database] },
        { onSuccess: () => notify.success(`Granted ${database} to ${name}.`) },
      );
    } else {
      revoke.mutate(
        { instanceId, name, host: user.host, database },
        {
          onSuccess: () => notify.success(`Revoked ${database} from ${name}.`),
        },
      );
    }
  };
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && !pending && onClose()}
      size="sm"
      isDismissable
    >
      <Dialog
        title={`Access for ${name}`}
        closeLabel="Close"
        actions={
          <Button slot="close" isDisabled={pending}>
            Done
          </Button>
        }
      >
        <div className={styles.stack}>
          {error ? (
            <ErrorState error={error} title="Could not change access" />
          ) : null}
          {access.isPending ? (
            <Loading>Loading access...</Loading>
          ) : access.isError ? (
            <ErrorState
              error={access.error}
              title="Could not load access"
              onRetry={() => void access.refetch()}
            />
          ) : items.length === 0 ? (
            <p>The instance has no databases yet.</p>
          ) : (
            items.map((db) => (
              <Switch
                key={db.name ?? ""}
                isSelected={db.granted}
                isDisabled={pending}
                onChange={(on) => toggle(db.name ?? "", on)}
              >
                {db.name ?? ""}
              </Switch>
            ))
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

const databaseSchema = z.object({
  name: z.string().trim().min(1, "Enter a database name").max(128),
  character_set: z.string().trim().max(64),
  collate: z.string().trim().max(64),
});

export function CreateDatabaseDialog({
  projectId,
  instanceId,
  onClose,
}: {
  projectId: string;
  instanceId: string;
  onClose: () => void;
}) {
  const create = useCreateDatabase(projectId);
  const form = useForm<z.infer<typeof databaseSchema>>({
    resolver: zodResolver(databaseSchema),
    defaultValues: { name: "", character_set: "", collate: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        instanceId,
        name: values.name,
        ...(values.character_set
          ? { character_set: values.character_set }
          : {}),
        ...(values.collate ? { collate: values.collate } : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Created database ${values.name}.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create database"
      submitLabel="Create database"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Database name"
        isRequired
      />
      <TextInput
        control={form.control}
        name="character_set"
        label="Character set"
        description="Optional, such as utf8mb4."
      />
      <TextInput
        control={form.control}
        name="collate"
        label="Collation"
        description="Optional, such as utf8mb4_general_ci."
      />
    </FormDialog>
  );
}
