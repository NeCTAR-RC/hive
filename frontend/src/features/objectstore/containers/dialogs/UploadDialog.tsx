// Upload files into the current folder of a container, with progress per
// file.
import { useRef, useState } from "react";
import { FileTrigger } from "react-aria-components";
import {
  Button,
  Dialog,
  Label,
  Modal,
  ProgressBar,
  Text,
} from "@ardc-ui/react";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { loadingProps } from "../../../../components/buttonState";
import { formatBytes } from "../../../../lib/format";
import { useInvalidate } from "../../../../lib/hooks/useInvalidate";
import { notify } from "../../../../lib/notify";
import { containerWriteKeys } from "../../api";
import { objectName, uploadFiles, type UploadItem } from "../../upload";
import styles from "../../ObjectStore.module.scss";

/**
 * Uploads the chosen files under `prefix` straight from the browser, large
 * files in parts (see `upload.ts`). A running upload keeps the dialog open
 * until it ends or is cancelled. A file whose name `taken` already holds
 * (the folder's listing) is marked before the upload, since Swift replaces
 * the object without asking.
 */
export function UploadDialog({
  container,
  prefix,
  taken,
  onClose,
}: {
  container: string;
  prefix: string;
  taken: ReadonlySet<string>;
  onClose: () => void;
}) {
  const invalidate = useInvalidate();
  const [files, setFiles] = useState<File[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abort = useRef<AbortController | null>(null);
  const finished =
    items.length > 0 &&
    items.every((i) => i.status === "done" || i.status === "error");
  // Before the upload starts, the chosen files as pending items.
  const rows: UploadItem[] = items.length
    ? items
    : files.map((file) => ({
        name: objectName(prefix, file),
        file,
        sent: 0,
        status: "pending",
      }));
  /** A file's line under its bar: its outcome, or its progress and
   * whether it will replace an object already in the folder. */
  const uploadNote = (item: UploadItem) => {
    if (item.status === "done") return "Done";
    if (item.status === "error") {
      return `Failed: ${item.error ?? "unknown error"}`;
    }
    const progress = `${formatBytes(item.sent)} of ${formatBytes(item.file.size)}`;
    return taken.has(item.name)
      ? `${progress}. Replaces an existing object.`
      : progress;
  };

  // A running upload keeps the dialog open; Cancel upload stops it first.
  const close = () => {
    if (!running) onClose();
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
      void invalidate(...containerWriteKeys(container));
    }
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && close()}
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
          {rows.length > 0 && (
            <ul className={styles.uploadList} aria-label="Files to upload">
              {rows.map((item) => (
                <li key={item.name}>
                  <ProgressBar
                    value={item.sent}
                    maxValue={Math.max(item.file.size, 1)}
                  >
                    <Label>{item.file.name}</Label>
                    <Text slot="description">{uploadNote(item)}</Text>
                  </ProgressBar>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
