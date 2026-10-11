// User Details lookup for helpdesk roles: a manuka search by email or
// name, three characters or more (nectar_dashboard/user_info/lookup).
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { Button, SearchField } from "@ardc-ui/react";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import type { UserSearchResult } from "../../../lib/api/types";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { userLookupRoute } from "../../../app/router";
import { userSearchQuery } from "../api";
import styles from "./UserLookupPage.module.scss";

const MIN = 3;

export function UserLookupPage() {
  const search = userLookupRoute.useSearch();
  const navigate = useNavigate({ from: userLookupRoute.fullPath });
  const q = search.q ?? "";
  const [draft, setDraft] = useState(q);
  const results = useQuery(userSearchQuery(q));

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
          <RouterLink
            to="/identity/users/$userId"
            params={{ userId: row.id }}
            className={styles.link}
          >
            <code>{row.id}</code>
          </RouterLink>
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
      <PageHeader title="User Details" crumbs={[{ label: "Identity" }]}>
        <form onSubmit={submit} className={styles.form} role="search">
          <SearchField
            aria-label="Search Nectar users"
            value={draft}
            onChange={setDraft}
            placeholder="Email or name (at least 3 characters)"
            className={styles.field}
          />
          <Button
            type="submit"
            size="sm"
            isDisabled={draft.trim().length < MIN}
          >
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
          rows={results.data?.items}
          getRowId={(row) => row.id}
          isLoading={results.isPending}
          isFetching={results.isFetching}
          error={results.error}
          onRetry={() => void results.refetch()}
          emptyTitle={`No registered users match "${q}"`}
          defaultSort={{ column: "name", direction: "ascending" }}
        />
      ) : (
        <p className={styles.hint}>
          Search registered Nectar users by email address or name.
        </p>
      )}
    </>
  );
}
