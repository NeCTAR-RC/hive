// The instance detail page's console log tab.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Label, Select, SelectItem } from "@ardc-ui/react";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { InstanceDetail } from "../../../../lib/api/types/compute";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { consoleOutputQuery } from "../../api";
import styles from "../InstanceDetailPage.module.scss";

const LOG_LENGTHS = [35, 100, 500, 2000];

/**
 * The last lines of the instance's console log, with a choice of how many,
 * a refresh, and a button that opens the console (`onConsole`).
 */
export function LogTab({
  instance,
  onConsole,
}: {
  instance: InstanceDetail;
  onConsole: () => void;
}) {
  const projectId = useProjectId();
  const [length, setLength] = useState(35);
  const log = useQuery(consoleOutputQuery(projectId, instance.id, length));
  return (
    <div className={styles.log}>
      <div className={styles.logBar}>
        <div className={styles.logLength}>
          <Select
            aria-label="Log length"
            labelPosition="side"
            selectedKey={String(length)}
            onSelectionChange={(key) => setLength(Number(key))}
          >
            <Label>Lines</Label>
            {LOG_LENGTHS.map((n) => (
              <SelectItem key={n} id={String(n)} textValue={String(n)}>
                {String(n)}
              </SelectItem>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="xs"
          onPress={() => void log.refetch()}
          isDisabled={log.isFetching}
        >
          Refresh
        </Button>
        <Button variant="primary" size="xs" onPress={onConsole}>
          Open console
        </Button>
      </div>
      {log.isPending ? (
        <SkeletonLines lines={6} />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : (
        <CodeBlock
          label="Console log"
          text={log.data.output || "(the console log is empty)"}
          maxHeight="var(--hive-code-max-height-tall)"
        />
      )}
    </div>
  );
}
