// The Root access tab of a database instance (trove-dashboard instance
// detail tabs): whether root was ever enabled, and the button that enables
// it or resets its password.
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../../components/Panel/Panel";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { DbInstanceDetail } from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbRootQuery } from "../../api";
import styles from "../../Databases.module.scss";

/**
 * The instance's root status. `onEnable` opens the page's enable root
 * dialog; `canEnable` follows the instance's status.
 */
export function RootTab({
  instance,
  canEnable,
  onEnable,
}: {
  instance: DbInstanceDetail;
  canEnable: boolean;
  onEnable: () => void;
}) {
  const projectId = useProjectId();
  const root = useQuery(dbRootQuery(projectId, instance.id));
  return (
    <Panel title="Root access">
      {root.isPending ? (
        <SkeletonLines lines={2} />
      ) : root.isError ? (
        <ErrorState error={root.error} onRetry={() => root.refetch()} />
      ) : (
        <div className={styles.panelStack}>
          <KeyValueList
            items={[
              { label: "Instance", value: instance.name || instance.id },
              {
                label: "Has root ever been enabled",
                value: root.data?.root_enabled ? "Yes" : "No",
              },
            ]}
          />
          <div>
            <Button size="sm" onPress={onEnable} isDisabled={!canEnable}>
              {root.data?.root_enabled ? "Reset root password" : "Enable root"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
