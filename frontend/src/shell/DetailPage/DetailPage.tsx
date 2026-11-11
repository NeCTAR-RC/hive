import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AppLink } from "../../components/AppLink/AppLink";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { PageHeader, type Crumb } from "../PageHeader/PageHeader";
import { detailState } from "./detailState";
import styles from "./DetailPage.module.scss";

export interface DetailPageProps<TData, TItem> {
  /** The query that loads the record, or the list or tree holding it. */
  query: UseQueryResult<TData>;
  /**
   * Picks the record out of what `query` loaded, for a record that is one
   * item of a list or tree; `undefined` reads as not found. Without it the
   * loaded data is the record.
   */
  select?: (data: TData) => TItem | undefined;
  /** The record's kind in a sentence, such as "instance" or "key pair". */
  noun: string;
  /** The id from the URL, quoted when the record is not found. */
  id: string;
  /** The URL names the record (a key pair, a container), not an id. */
  idIsName?: boolean;
  /**
   * How the record relates to the project, which "not found" names: held
   * "in" it (the default), "visible" to it (a shared network, a public
   * image), or "none" for a record no project holds (a user, a user's
   * application credential).
   */
  scope?: "in" | "visible" | "none";
  crumbs: Crumb[];
  /** The page "Back to ..." links to: its label in a sentence and URL. */
  backTo: { label: string; href: string };
  /** The page title once the record is there. */
  title: (item: TItem) => string;
  /** The header's actions (a row actions menu, buttons). */
  actions?: (item: TItem) => ReactNode;
  /** What sits under the title, such as status pills. */
  meta?: (item: TItem) => ReactNode;
  /** The page body once the record is there. */
  children: (item: TItem) => ReactNode;
}

/** The end of the not-found sentence for each `scope`. */
const SCOPE_TEXT = {
  in: " in this project",
  visible: " visible to this project",
  none: "",
} as const;

/** The noun as the start of a title: "key pair" reads "Key pair". */
function titleCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

/**
 * The browser tab title of a loaded record: its name, a middle dot and its
 * kind ("web", "Load balancer"), so tabs holding records of different kinds
 * with similar names stay apart and a screen reader hears the kind.
 */
function documentTitle(name: string, noun: string): string {
  return `${name} \u00B7 ${titleCase(noun)}`;
}

/**
 * The frame of every detail page: the page header and, until the record is
 * there, the one state the page is in (loading, not found, service not
 * available, or failed with "Try again"), each with a link back to the
 * list. The header is the same element in every state, so the heading
 * that took focus after the navigation keeps it when the record arrives.
 */
export function DetailPage<TData, TItem = TData>({
  query,
  select,
  noun,
  id,
  idIsName = false,
  scope = "in",
  crumbs,
  backTo,
  title,
  actions,
  meta,
  children,
}: DetailPageProps<TData, TItem>) {
  const item =
    query.data === undefined
      ? undefined
      : select
        ? select(query.data)
        : // Without `select` the record is the data (TItem defaults to TData).
          (query.data as unknown as TItem);
  const state = detailState(query, item !== undefined);
  const back = <AppLink href={backTo.href}>Back to {backTo.label}</AppLink>;

  switch (state) {
    case "ready":
      // `state` is ready only when the record was found.
      return (
        <>
          <PageHeader
            title={title(item!)}
            documentTitle={documentTitle(title(item!), noun)}
            crumbs={crumbs}
            actions={actions?.(item!)}
          >
            {meta?.(item!)}
          </PageHeader>
          {children(item!)}
        </>
      );
    case "loading":
      return (
        <>
          <PageHeader title={titleCase(noun)} crumbs={crumbs} />
          <SkeletonLines />
        </>
      );
    case "missing":
      return (
        <>
          <PageHeader title={`${titleCase(noun)} not found`} crumbs={crumbs} />
          <p>
            There is no {noun} {idIsName ? "called" : "with id"}{" "}
            <code>{id}</code>
            {SCOPE_TEXT[scope]}. {back}
          </p>
        </>
      );
    case "unavailable":
      return (
        <>
          <PageHeader title="Service not available" crumbs={crumbs} />
          <p>This service is not available in this cloud. {back}</p>
        </>
      );
    case "failed":
      return (
        <>
          <PageHeader title={titleCase(noun)} crumbs={crumbs} />
          <div className={styles.failed}>
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
            />
            <p>{back}</p>
          </div>
        </>
      );
  }
}
