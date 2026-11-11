// The ORCID panel on My Details.
import { useRef, useState } from "react";
import { Button, Link } from "@ardc-ui/react";
import { AppLink } from "../../components/AppLink/AppLink";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { ProfileReply } from "../../lib/api/types/account";
import styles from "./MyDetailsPage.module.scss";

/**
 * The account's ORCID iD: the connected iD with a way to disconnect, or the
 * way to connect one. Both are round trips through manuka: connecting
 * follows its link, and disconnecting posts a hidden form to it once
 * confirmed.
 */
export function OrcidPanel({
  profile,
  isPending,
}: {
  profile: ProfileReply | undefined;
  isPending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const orcidUrl = profile?.orcid_url ?? "https://orcid.org";
  return (
    <Panel title="ORCID">
      <div className={styles.panelStack}>
        <p className={styles.note}>
          Linking your ORCID iD lets Nectar attribute cloud usage to your
          research outputs.
        </p>
        {isPending || !profile ? (
          <SkeletonLines lines={2} />
        ) : !profile.partial && profile.orcid ? (
          <>
            <p className={styles.connected}>
              <strong>Connected</strong> to{" "}
              <AppLink href={`${orcidUrl}/${profile.orcid}`} newTab>
                {orcidUrl}/{profile.orcid}
              </AppLink>
            </p>
            {profile.orcid_unlink_url ? (
              <>
                <form
                  ref={formRef}
                  method="post"
                  action={profile.orcid_unlink_url}
                  className={styles.hiddenForm}
                >
                  <input
                    type="hidden"
                    name="next"
                    value={profile.orcid_return_url}
                  />
                </form>
                <div>
                  <Button
                    variant="secondary"
                    tone="danger"
                    size="sm"
                    onPress={() => setConfirming(true)}
                  >
                    Disconnect ORCID
                  </Button>
                </div>
                <ConfirmDialog
                  isOpen={confirming}
                  onOpenChange={setConfirming}
                  title="Disconnect this ORCID iD?"
                  confirmLabel="Disconnect"
                  tone="danger"
                  onConfirm={() => formRef.current?.submit()}
                >
                  <p>
                    You will be taken to the Nectar accounts service to
                    disconnect, then returned here.
                  </p>
                </ConfirmDialog>
              </>
            ) : null}
          </>
        ) : (
          <>
            <p>No ORCID iD is connected to this account.</p>
            {profile.orcid_link_url ? (
              <div>
                <Link variant="primary" size="sm" href={profile.orcid_link_url}>
                  Connect to ORCID
                </Link>
              </div>
            ) : (
              <p className={styles.note}>
                ORCID linking is not configured on this dashboard.
              </p>
            )}
            <p className={styles.note}>
              Don&apos;t have an ORCID iD?{" "}
              <AppLink href={`${orcidUrl}/signin`} newTab size="xs">
                Register or sign in at ORCID
              </AppLink>
              .
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
