// One user's manuka record for the helpdesk (user_info/lookup/view.html).
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "../../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { formatDateTime } from "../../../lib/format";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { userDetailRoute } from "../../../app/router";
import { userDetailsQuery } from "../api";
import styles from "./UserLookupPage.module.scss";

function dash(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

export function UserDetailPage() {
  const { userId } = userDetailRoute.useParams();
  const user = useQuery(userDetailsQuery(userId));
  const title = user.data?.displayname || user.data?.email || "User";
  return (
    <>
      <PageHeader
        title={title}
        crumbs={[
          { label: "Identity" },
          { label: "User Details", href: "/identity/user-lookup" },
        ]}
      />
      <div className={styles.stack}>
        {user.isPending ? (
          <SkeletonLines lines={8} />
        ) : user.isError ? (
          <ErrorState error={user.error} onRetry={() => user.refetch()} />
        ) : (
          <>
            <Panel title="Account">
              <KeyValueList
                items={[
                  { label: "User ID", value: <code>{userId}</code> },
                  { label: "Full name", value: dash(user.data.displayname) },
                  { label: "Email", value: dash(user.data.email) },
                  { label: "First name", value: dash(user.data.first_name) },
                  { label: "Family name", value: dash(user.data.surname) },
                  {
                    label: "Organisation",
                    value: dash(user.data.organisation),
                  },
                  { label: "Affiliation", value: dash(user.data.affiliation) },
                  { label: "ORCID", value: dash(user.data.orcid) },
                  {
                    label: "Phone number",
                    value: dash(user.data.phone_number),
                  },
                  {
                    label: "Mobile number",
                    value: dash(user.data.mobile_number),
                  },
                  {
                    label: "Registered",
                    value: dash(formatDateTime(user.data.registered_at)),
                  },
                  {
                    label: "Last login",
                    value: dash(formatDateTime(user.data.last_login)),
                  },
                  {
                    label: "Terms accepted",
                    value: dash(formatDateTime(user.data.terms_accepted_at)),
                  },
                  {
                    label: "Expiry status",
                    value: dash(user.data.expiry_status),
                  },
                ]}
              />
            </Panel>
            <Panel title="External IDs">
              {user.data.external_ids?.length ? (
                <ul className={styles.ids}>
                  {user.data.external_ids.map((external, index) => (
                    <li key={index}>
                      <strong>IdP:</strong> {dash(external.idp)}
                      <br />
                      <strong>Last login:</strong>{" "}
                      {formatDateTime(external.last_login) || "Unknown"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No external identities recorded.</p>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
