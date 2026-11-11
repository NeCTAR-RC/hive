// One user's manuka record for the helpdesk (user_info/lookup/view.html).
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { formatDateTime } from "../../../lib/format";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { userDetailsQuery } from "../api";
import { UserLookupGate } from "./UserLookupGate";
import styles from "./UserLookupPage.module.scss";

const userDetailRoute = getRouteApi("/app/identity/users/$userId");

const CRUMBS = [
  { label: "Identity" },
  { label: "User details", href: "/identity/user-lookup" },
];

/** One user's record, for users allowed to look users up. */
export function UserDetailPage() {
  return (
    <UserLookupGate>
      <UserDetail />
    </UserLookupGate>
  );
}

/**
 * One user's manuka record for the helpdesk: the account details and the
 * external identities they log in with.
 */
function UserDetail() {
  const { userId } = userDetailRoute.useParams();
  const user = useQuery(userDetailsQuery(userId));
  return (
    <DetailPage
      query={user}
      noun="user"
      id={userId}
      scope="none"
      crumbs={CRUMBS}
      backTo={{ label: "user lookup", href: "/identity/user-lookup" }}
      title={(data) => data.displayname || data.email || "User"}
    >
      {(data) => (
        <div className={styles.stack}>
          <Panel title="Account">
            <KeyValueList
              items={[
                { label: "User ID", value: <code>{userId}</code> },
                { label: "Full name", value: data.displayname },
                { label: "Email", value: data.email },
                { label: "First name", value: data.first_name },
                { label: "Family name", value: data.surname },
                {
                  label: "Organisation",
                  value: data.organisation,
                },
                { label: "Affiliation", value: data.affiliation },
                { label: "ORCID", value: data.orcid },
                {
                  label: "Phone number",
                  value: data.phone_number,
                },
                {
                  label: "Mobile number",
                  value: data.mobile_number,
                },
                {
                  label: "Registered",
                  value: formatDateTime(data.registered_at),
                },
                {
                  label: "Last login",
                  value: formatDateTime(data.last_login),
                },
                {
                  label: "Terms accepted",
                  value: formatDateTime(data.terms_accepted_at),
                },
                {
                  label: "Expiry status",
                  value: data.expiry_status,
                },
              ]}
            />
          </Panel>
          <Panel title="External IDs">
            {data.external_ids.length ? (
              <ul className={styles.ids}>
                {data.external_ids.map((external, index) => (
                  <li key={index}>
                    <KeyValueList
                      items={[
                        { label: "IdP", value: external.idp },
                        {
                          label: "Last login",
                          value:
                            formatDateTime(external.last_login) || "Unknown",
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p>No external identities recorded.</p>
            )}
          </Panel>
        </div>
      )}
    </DetailPage>
  );
}
