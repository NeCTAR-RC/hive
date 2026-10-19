// Create container, create folder, upload, details and copy dialogs for
// the Object Store panel.
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileTrigger } from "react-aria-components";
import {
  Alert,
  Button,
  Dialog,
  Loading,
  Modal,
  ProgressBar,
} from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import {
  SelectInput,
  SwitchInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import type { StoreObject, StorePolicy } from "../../lib/api/types";
import { formatBytes, formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import {
  objectQuery,
  swiftKey,
  useCopyObject,
  useCreateContainer,
  useCreateFolder,
} from "./api";
import { uploadFiles, type UploadItem } from "./upload";
import styles from "./ObjectStore.module.scss";

// The object store refuses "." and ".." as a name or a path segment.
const DOT_MESSAGE = 'A name or folder cannot be "." or ".."';
function noDotSegments(value: string): boolean {
  return !value.split("/").some((part) => part === "." || part === "..");
}

const containerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a container name")
    .max(255, "At most 255 characters")
    .regex(/^[^/]+$/, "Container names cannot contain a slash")
    .refine(noDotSegments, DOT_MESSAGE),
  is_public: z.boolean(),
  storage_policy: z.string(),
});

type ContainerForm = z.infer<typeof containerSchema>;

export function CreateContainerDialog({
  projectId,
  policies,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  policies: StorePolicy[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateContainer(projectId);
  const defaultPolicy =
    policies.find((p) => p.default)?.name ?? policies[0]?.name ?? "";
  const form = useForm<ContainerForm>({
    resolver: zodResolver(containerSchema),
    values: { name: "", is_public: false, storage_policy: defaultPolicy },
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        is_public: values.is_public,
        ...(values.storage_policy
          ? { storage_policy: values.storage_policy }
          : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Container ${values.name} created.`);
          form.reset();
          onOpenChange(false);
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
      title="Create container"
      submitLabel="Create container"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Container name"
        isRequired
      />
      {policies.length > 1 && (
        <SelectInput
          control={form.control}
          name="storage_policy"
          label="Storage policy"
          options={policies.map((p) => ({ id: p.name, label: p.name }))}
        />
      )}
      <SwitchInput
        control={form.control}
        name="is_public"
        label="Public access (anyone with the URL can read the objects)"
      />
    </FormDialog>
  );
}

const folderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a folder name")
    .max(255, "At most 255 characters")
    .regex(/^[^/](.*[^/])?$/, "The name cannot start or end with a slash")
    .refine(noDotSegments, DOT_MESSAGE),
});

export function CreateFolderDialog({
  projectId,
  container,
  prefix,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  container: string;
  prefix: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateFolder(projectId);
  const form = useForm<z.infer<typeof folderSchema>>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: "" },
  });
  const submit = form.handleSubmit((values) => {
    create.mutate(
      { container, path: `${prefix}${values.name}` },
      {
        onSuccess: () => {
          notify.success(`Folder ${values.name} created.`);
          form.reset();
          onOpenChange(false);
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
      title="Create folder"
      submitLabel="Create folder"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      <TextInput
        control={form.control}
        name="name"
        label="Folder name"
        description="Slashes create nested folders."
        isRequired
      />
    </FormDialog>
  );
}

export function UploadDialog({
  projectId,
  container,
  prefix,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  container: string;
  prefix: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  // The rows to show: the upload's progress once it starts, else the
  // chosen files as pending.
  const shown = useMemo<UploadItem[]>(
    () =>
      items.length
        ? items
        : files.map((file) => ({
            name: `${prefix}${file.name}`,
            file,
            sent: 0,
            status: "pending",
          })),
    [items, files, prefix],
  );
  const finished =
    items.length > 0 &&
    items.every((i) => i.status === "done" || i.status === "error");

  const reset = () => {
    setFiles([]);
    setItems([]);
    setError(null);
  };
  const close = (open: boolean) => {
    if (running) return;
    if (!open) reset();
    onOpenChange(open);
  };
  const start = async () => {
    setRunning(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const result = await uploadFiles({
        container,
        prefix,
        files,
        onProgress: setItems,
        signal: abort.current.signal,
      });
      const failed = result.filter((i) => i.status === "error").length;
      if (failed === 0) {
        notify.success(
          result.length === 1
            ? `Uploaded ${result[0]?.file.name}.`
            : `Uploaded ${result.length} files.`,
        );
      } else {
        notify.danger(
          `${failed} of ${result.length} files could not be uploaded.`,
        );
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: swiftKey(projectId) });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={close}
      size="lg"
      isDismissable={!running}
    >
      <Dialog
        title="Upload files"
        closeLabel="Close"
        actions={
          <>
            {running ? (
              <Button
                variant="secondary"
                onPress={() => abort.current?.abort()}
              >
                Cancel upload
              </Button>
            ) : (
              <Button variant="secondary" slot="close">
                {finished ? "Close" : "Cancel"}
              </Button>
            )}
            {!finished && (
              <Button
                onPress={() => void start()}
                isPending={running}
                isDisabled={!running && files.length === 0}
                {...loadingProps(running, "Uploading...")}
              >
                Upload{" "}
                {files.length > 0
                  ? `${files.length} ${files.length === 1 ? "file" : "files"}`
                  : ""}
              </Button>
            )}
          </>
        }
      >
        <div className={styles.uploadBody}>
          <p>
            Files go into{" "}
            <strong>{prefix ? `${container}/${prefix}` : container}</strong>.
            Large files are uploaded in parts straight from your browser to the
            object store.
          </p>
          {!running && !finished && (
            <FileTrigger
              allowsMultiple
              onSelect={(list) => setFiles(list ? [...list] : [])}
            >
              <Button variant="secondary" size="sm">
                {files.length ? "Choose different files" : "Choose files"}
              </Button>
            </FileTrigger>
          )}
          {error ? <ErrorState error={error} title="Upload failed" /> : null}
          {shown.length > 0 && (
            <ul className={styles.uploadList} aria-label="Files to upload">
              {shown.map((item) => (
                <li key={item.name} className={styles.uploadItem}>
                  <div className={styles.uploadRow}>
                    <span className={styles.uploadName}>{item.file.name}</span>
                    <span className={styles.muted}>
                      {item.status === "done"
                        ? "Done"
                        : item.status === "error"
                          ? `Failed: ${item.error ?? "unknown error"}`
                          : `${formatBytes(item.sent)} of ${formatBytes(item.file.size)}`}
                    </span>
                  </div>
                  <ProgressBar
                    value={item.status === "done" ? 1 : item.sent}
                    maxValue={
                      item.status === "done" ? 1 : Math.max(item.file.size, 1)
                    }
                    aria-label={`Upload progress for ${item.file.name}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}

export function ObjectDetailsDialog({
  projectId,
  container,
  object,
  onClose,
}: {
  projectId: string;
  container: string;
  object: StoreObject;
  onClose: () => void;
}) {
  const detail = useQuery(objectQuery(projectId, container, object.name));
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title={object.basename}
        closeLabel="Close"
        actions={
          <Button variant="secondary" slot="close">
            Close
          </Button>
        }
      >
        {detail.isPending ? (
          <Loading>Loading object details...</Loading>
        ) : detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : (
          <KeyValueList
            items={[
              { label: "Name", value: <code>{detail.data.name}</code> },
              { label: "Size", value: formatBytes(detail.data.bytes) },
              { label: "Content type", value: detail.data.content_type ?? "-" },
              { label: "Hash", value: <code>{detail.data.hash ?? "-"}</code> },
              {
                label: "Last modified",
                value: formatDateTime(detail.data.last_modified) || "-",
              },
              {
                label: "Large object",
                value: detail.data.is_slo ? "Yes (stored in segments)" : "No",
              },
              ...(detail.data.orig_filename
                ? [
                    {
                      label: "Original file name",
                      value: detail.data.orig_filename,
                    },
                  ]
                : []),
              ...Object.entries(detail.data.metadata).map(([key, value]) => ({
                label: `Metadata: ${key}`,
                value,
              })),
            ]}
          />
        )}
      </Dialog>
    </Modal>
  );
}

const copySchema = z.object({
  dest_container: z
    .string()
    .trim()
    .min(1, "Enter the destination container")
    .refine(noDotSegments, DOT_MESSAGE),
  dest_name: z
    .string()
    .trim()
    .min(1, "Enter the destination name")
    .refine(noDotSegments, DOT_MESSAGE),
});

export function CopyObjectDialog({
  projectId,
  container,
  object,
  onClose,
}: {
  projectId: string;
  container: string;
  object: StoreObject;
  onClose: () => void;
}) {
  const copy = useCopyObject(projectId);
  const form = useForm<z.infer<typeof copySchema>>({
    resolver: zodResolver(copySchema),
    defaultValues: { dest_container: container, dest_name: object.name },
  });
  const submit = form.handleSubmit((values) => {
    copy.mutate(
      { container, name: object.name, ...values },
      {
        onSuccess: () => {
          notify.success(
            `Copied to ${values.dest_container}/${values.dest_name}.`,
          );
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Copy ${object.basename}`}
      submitLabel="Copy"
      onSubmit={submit}
      isPending={copy.isPending}
      error={copy.error}
    >
      <Alert tone="info" role="status">
        The destination container must already exist and the destination name
        must be free.
      </Alert>
      <TextInput
        control={form.control}
        name="dest_container"
        label="Destination container"
        isRequired
      />
      <TextInput
        control={form.control}
        name="dest_name"
        label="Destination object name"
        description="Include folders in the name, such as backups/2026/file.txt."
        isRequired
      />
    </FormDialog>
  );
}
