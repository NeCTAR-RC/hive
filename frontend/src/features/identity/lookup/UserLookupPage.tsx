// User Details lookup for helpdesk roles: a manuka search by email or
// name, three characters or more (nectar_dashboard/user_info/lookup).
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button, SearchField } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import type { UserSearchResult } from "../../../lib/api/types/identity";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { userSearchQuery } from "../api";
import { UserLookupGate } from "./UserLookupGate";
import styles from "./UserLookupPage.module.scss";

const userLookupRoute = getRouteApi("/app/identity/user-lookup");

const MIN = 3;

/** The helpdesk's user search, for users allowed to look users up. */
export function UserLookupPage() {
  return (
    <UserLookupGate>
      <UserLookup />
    </UserLookupGate>
  );
}

/** The helpdesk's user search by email or name, linking to each record. */
function UserLookup() {
  const search = userLookupRoute.useSearch();
  const navigate = userLookupRoute.useNavigate();
  const q = search.q ?? "";
  const [draft, setDraft] = useState(q);
  const results = useQuery(userSearchQuery(q));
  const resultsTable = useQueryTable(results, {
    noun: "registered users",
    emptyTitle: `No registered users match "${q}"`,
    refresh: false,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    void navigate({
      search: value ? { q: value } : {},
      replace: true,
    });
  };

  const columns = useMemo<ColumnDef<UserSearchResult>[]>(
    () => [
      {
        id: "id",
        label: "User ID",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/identity/users/$userId"
            params={{ userId: String(row.id) }}
          >
            <code>{row.id}</code>
          </AppLink>
        ),
        sortValue: (row) => row.id,
      },
      {
        id: "name",
        label: "Name",
        cell: (row) => row.displayname,
        sortValue: (row) => row.displayname,
      },
      {
        id: "email",
        label: "Email",
        cell: (row) => row.email ?? "",
        sortValue: (row) => row.email ?? "",
      },
    ],
    [],
  );

  const tooShort = draft.trim().length > 0 && draft.trim().length < MIN;

  return (
    <>
      <PageHeader title="User details" crumbs={[{ label: "Identity" }]}>
        <form onSubmit={submit} className={styles.search} role="search">
          <div className={styles.field}>
            <SearchField
              aria-label="Search Nectar users"
              value={draft}
              onChange={setDraft}
              placeholder="Email or name (at least 3 characters)"
            />
          </div>
          <Button type="submit" isDisabled={draft.trim().length < MIN}>
            Search
          </Button>
        </form>
        {tooShort && (
          <p className={styles.hint} role="status">
            Enter at least {MIN} characters.
          </p>
        )}
      </PageHeader>
      {q.length >= MIN ? (
        <DataTable
          id="user-lookup"
          label="Matching Nectar users"
          columns={columns}
          getRowId={(row) => String(row.id)}
          {...resultsTable}
          defaultSort={{ column: "name", direction: "ascending" }}
        />
      ) : (
        <p className={styles.intro}>
          Search registered Nectar users by email address or name.
        </p>
      )}
    </>
  );
}
