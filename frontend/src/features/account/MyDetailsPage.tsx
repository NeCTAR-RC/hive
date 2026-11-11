// My Details: the manuka account record, the three fields the user may
// edit, and the ORCID link and unlink round trips through manuka
// (nectar_dashboard/user_info/update).
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { meQuery, profileQuery } from "../../lib/queries";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { DetailsForm } from "./DetailsForm";
import styles from "./MyDetailsPage.module.scss";
import { OrcidPanel } from "./OrcidPanel";

/**
 * The user's manuka account: the record from the identity provider, the
 * contact details form, and the ORCID panel beside them.
 */
export function MyDetailsPage() {
  const { data: me } = useQuery(meQuery);
  const profile = useQuery(profileQuery);

  return (
    <>
      <PageHeader title="My details" crumbs={[{ label: "Account" }]} />
      <div className={styles.layout}>
        <div className={styles.stack}>
          <Panel title="Account">
            {profile.isPending ? (
              <SkeletonLines lines={5} />
            ) : profile.isError ? (
              <ErrorState
                error={profile.error}
                onRetry={() => profile.refetch()}
              />
            ) : profile.data.partial ? (
              <Alert tone="warning" role="status">
                Your account details are unavailable at the moment
                {profile.data.message ? `: ${profile.data.message}` : "."}
              </Alert>
            ) : (
              <div className={styles.panelStack}>
                <p className={styles.note}>
                  Your name and email come from your institution&apos;s identity
                  provider. To correct them, contact your institution&apos;s IT
                  support and log in again.
                </p>
                <KeyValueList
                  items={[
                    {
                      label: "Full name",
                      value: profile.data.displayname,
                    },
                    {
                      label: "First name",
                      value: profile.data.first_name,
                    },
                    { label: "Family name", value: profile.data.surname },
                    { label: "Email", value: profile.data.email },
                    { label: "Username", value: me?.user.name },
                    {
                      label: "Organisation",
                      value: profile.data.organisation,
                    },
                  ]}
                />
              </div>
            )}
          </Panel>
          {profile.data && !profile.data.partial && (
            <DetailsForm profile={profile.data} />
          )}
        </div>
        <OrcidPanel profile={profile.data} isPending={profile.isPending} />
      </div>
    </>
  );
}
