// The container page's side panel: counts, storage policy and the public
// access toggle with the public URL.
import { useState } from "react";
import { Switch } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import { CopyButton } from "../../../components/CopyButton/CopyButton";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import type { ContainerDetail } from "../../../lib/api/types/objectstore";
import { formatBytes } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useUpdateContainer } from "../api";
import styles from "../ObjectStore.module.scss";

/**
 * A container's object count, size and storage policy, and the switch that
 * makes it public or private. Making it public asks first, since every
 * object becomes readable by anyone with the link; making it private does
 * not. The public URL shows while it is public.
 */
export function ContainerSummary({
  container,
  data,
}: {
  container: string;
  data: ContainerDetail;
}) {
  const update = useUpdateContainer();
  const [confirming, setConfirming] = useState(false);
  const setPublic = (selected: boolean) =>
    update.mutate(
      { container, is_public: selected },
      {
        onSuccess: () =>
          notify.success(
            selected
              ? `${container} is now public.`
              : `${container} is now private.`,
          ),
        onSettled: () => setConfirming(false),
      },
    );
  return (
    <Panel title="Container">
      <KeyValueList
        items={[
          { label: "Objects", value: data.object_count },
          { label: "Size", value: formatBytes(data.bytes) },
          ...(data.storage_policy
            ? [
                {
                  label: "Storage policy",
                  value: data.storage_policy,
                },
              ]
            : []),
          {
            label: "Public access",
            value: (
              <span className={styles.valueStack}>
                <Switch
                  isSelected={data.is_public}
                  isDisabled={update.isPending}
                  onChange={(selected) =>
                    selected ? setConfirming(true) : setPublic(false)
                  }
                >
                  {data.is_public ? "Enabled" : "Disabled"}
                </Switch>
                {update.isError && (
                  <ErrorState
                    error={update.error}
                    title="Could not change access"
                  />
                )}
              </span>
            ),
          },
          ...(data.is_public
            ? [
                {
                  label: "Public URL",
                  value: (
                    <span className={styles.valueStack}>
                      <AppLink href={data.public_url} newTab>
                        {data.public_url}
                      </AppLink>
                      <CopyButton text={data.public_url} label="Copy URL" />
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={`Make ${container} public?`}
        confirmLabel="Make public"
        tone="primary"
        onConfirm={() => setPublic(true)}
        isPending={update.isPending}
      >
        <p>Anyone with the link can read every object in {container}.</p>
      </ConfirmDialog>
    </Panel>
  );
}
