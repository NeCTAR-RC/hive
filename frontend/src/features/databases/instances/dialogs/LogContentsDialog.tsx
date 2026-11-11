// The viewer of a published guest log (trove-dashboard logs/views.py):
// the last lines or the whole log, refreshed or downloaded on demand.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  Label,
  Modal,
  Select,
  SelectItem,
  type Key,
} from "@ardc-ui/react";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { downloadUrl } from "../../../../lib/download";
import { formatBytes } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbLogContentsQuery, logDownloadUrl } from "../../api";
import styles from "../../Databases.module.scss";

const LINE_CHOICES = [
  { id: "50", label: "Last 50 lines", lines: 50 },
  { id: "200", label: "Last 200 lines", lines: 200 },
  { id: "1000", label: "Last 1000 lines", lines: 1000 },
  { id: "0", label: "Whole log", lines: 0 },
];

/**
 * Shows one published log, the last 50 lines first, with a choice of how
 * many lines to show and a download of the whole file.
 */
export function LogContentsDialog({
  instanceId,
  name,
  onClose,
}: {
  instanceId: string;
  name: string;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const [choice, setChoice] = useState("50");
  const lines = LINE_CHOICES.find((c) => c.id === choice)?.lines ?? 50;
  const contents = useQuery(
    dbLogContentsQuery(projectId, instanceId, name, lines),
  );
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog title={`Log ${name}`} closeLabel="Close">
        <div className={styles.dialogStack}>
          <div className={styles.actions}>
            <Select
              aria-label="Lines"
              labelPosition="side"
              selectedKey={choice}
              onSelectionChange={(key: Key | null) =>
                setChoice(key === null ? "50" : String(key))
              }
            >
              <Label>Lines</Label>
              {LINE_CHOICES.map((option) => (
                <SelectItem
                  key={option.id}
                  id={option.id}
                  textValue={option.label}
                >
                  {option.label}
                </SelectItem>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => void contents.refetch()}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() =>
                downloadUrl(
                  logDownloadUrl(instanceId, name),
                  `${instanceId}-${name}.log`,
                )
              }
            >
              Download
            </Button>
          </div>
          {contents.isPending ? (
            <SkeletonLines lines={8} />
          ) : contents.isError ? (
            <ErrorState
              error={contents.error}
              onRetry={() => contents.refetch()}
            />
          ) : (
            <>
              {contents.data.partial && (
                <p className={styles.muted}>
                  Showing the last {lines} lines of{" "}
                  {formatBytes(contents.data.published)} published. Choose
                  &quot;Whole log&quot; or download the file for everything.
                </p>
              )}
              {contents.data.truncated && (
                <p className={styles.muted}>
                  The viewer stops at 4 MB. Download the log for the rest.
                </p>
              )}
              <CodeBlock
                text={contents.data.text || "(empty)"}
                label={`${name} log`}
                maxHeight="60vh"
              />
            </>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
