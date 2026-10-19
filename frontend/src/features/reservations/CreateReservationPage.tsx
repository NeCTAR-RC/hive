// Create a reservation, laid out as warre-dashboard's create.html: the
// flavour class notes and limits on top, then the availability chart with
// its class and zone filters, and the feedback block at the foot.
import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Label,
  Select,
  SelectItem,
  TabItem,
  Tabs,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
} from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { Panel } from "../../components/Panel/Panel";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import type { ReservationOptions } from "../../lib/api/types";
import { formatCalendarDate, formatNumber } from "../../lib/format";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { createReservationRoute } from "../../app/router";
import { reservationOptionsQuery, slotsQuery } from "./api";
import { buildRows, ganttRange } from "./gantt";
import { ReserveDialog } from "./ReservationDialogs";
import { ReservationLimits } from "./ReservationLimits";
import { SlotGantt, type PickedSlot } from "./SlotGantt";
import { FEEDBACK_FORM } from "./status";
import styles from "./CreateReservationPage.module.scss";

const ALL = "__all";

/** The flavour class notes from create.html:36-55. */
const FLAVOR_CLASSES = [
  {
    id: "g1",
    title: "G1",
    heading: "G1 - Visualisation GPU",
    text: "G1 instances come with Nvidia A40s which brings state-of-the-art features for ray-traced rendering, simulation and virtual production.",
  },
  {
    id: "g2",
    title: "G2",
    heading: "G2 - Compute GPU",
    text: "G2 instances come with the latest generation Nvidia A100 GPUs and provide the highest performance for machine learning training and high performance computing in the cloud.",
  },
  {
    id: "h4",
    title: "H4",
    heading: "H4 - Large RAM",
    text: "H4 instances come with RAM starting from h4.xsmall with 180G to the h4.xxlarge with 1920G.",
  },
];

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function CreateReservationPage() {
  const projectId = useProjectId();
  const search = createReservationRoute.useSearch();
  const navigate = useNavigate({ from: createReservationRoute.fullPath });
  const options = useQuery(reservationOptionsQuery(projectId));
  const category = search.category ?? "";
  const zone = search.zone ?? "";
  const today = options.data?.today;
  const range = useMemo(() => (today ? ganttRange(today) : null), [today]);
  const slots = useQuery({
    ...slotsQuery(projectId, {
      ...(category ? { category } : {}),
      ...(zone ? { availability_zone: zone } : {}),
      ...(range ? { end: range.last } : {}),
    }),
    enabled: range !== null,
  });
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const classLabelId = useId();

  const setFilter = (patch: { category?: string; zone?: string }) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...patch };
        if (!next.category) delete next.category;
        if (!next.zone) delete next.zone;
        return next;
      },
      replace: true,
    });

  const rows = useMemo(() => {
    if (!range || !slots.data) return [];
    return buildRows(
      slots.data.flavors,
      slots.data.slots,
      options.data?.maintenance_windows ?? [],
      range,
    );
  }, [range, slots.data, options.data]);
  // Fully booked flavours keep their row (Horizon lists every flavour the
  // search returns); each says it has no free slot.
  const anyFree = rows.some((row) =>
    row.bars.some((bar) => bar.kind === "free"),
  );
  // The backend clamps the search end (today + 730 days); say so if it
  // stopped short of the chart.
  const searchedTo = slots.data?.end.slice(0, 10);
  const clamped = Boolean(range && searchedTo && searchedTo < range.last);

  const limits = options.data?.limits;
  const canCreate = limits?.can_create ?? true;

  return (
    <>
      <PageHeader
        title="Create reservation"
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Reservations", href: "/reservations" },
        ]}
        actions={
          <RouteLink variant="secondary" size="sm" to="/reservations">
            Back
          </RouteLink>
        }
      />
      <div className={styles.stack}>
        <div className={styles.columns}>
          <Panel>
            <p className={styles.lead}>
              To make a reservation, select an available time slot from the
              chart below. You can customise the reservation start and end dates
              within the available time slot. Reservations are specified in days
              and must be a minimum of 1 day. All flavours have a maximum number
              of days they can be reserved for, which is shown in the flavour
              details.
            </p>
            <h2 className={styles.subheading}>Available flavour classes</h2>
            <Tabs aria-label="Flavour classes" collapseBelow={false}>
              {FLAVOR_CLASSES.map((item) => (
                <TabItem key={item.id} id={item.id} title={item.title}>
                  <h3 className={styles.classHeading}>{item.heading}</h3>
                  <p className={styles.classText}>{item.text}</p>
                </TabItem>
              ))}
            </Tabs>
            <p className={styles.note}>
              <Badge>Note</Badge>{" "}
              <strong>GPU flavours are not available to Auckland users.</strong>
            </p>
            <Alert tone="info">
              Reservation days run in UTC. Your browser&apos;s time zone is{" "}
              <strong>{browserTimeZone()}</strong>.
            </Alert>
          </Panel>
          <div className={styles.stack}>
            <Panel title="Reservation limits">
              {options.isPending ? (
                <SkeletonLines lines={2} />
              ) : options.isError ? (
                <ErrorState
                  error={options.error}
                  onRetry={() => options.refetch()}
                />
              ) : limits ? (
                <ReservationLimits limits={limits} />
              ) : null}
            </Panel>
            <Panel title="Usage limit">
              {options.isPending ? (
                <SkeletonLines lines={1} />
              ) : options.data ? (
                <Usage options={options.data} />
              ) : null}
            </Panel>
          </div>
        </div>
        <Panel title="Select flavour availability">
          <div className={styles.toolbar}>
            <div className={styles.field}>
              <span id={classLabelId} className={styles.fieldLabel}>
                Flavour class
              </span>
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={new Set([category || ALL])}
                onSelectionChange={(keys) => {
                  const [key] = keys;
                  setFilter({
                    category:
                      key === undefined || key === ALL ? "" : String(key),
                  });
                }}
                aria-labelledby={classLabelId}
              >
                <ToggleButtonGroupItem id={ALL}>All</ToggleButtonGroupItem>
                {(options.data?.categories ?? []).map((item) => (
                  <ToggleButtonGroupItem key={item} id={item}>
                    {item}
                  </ToggleButtonGroupItem>
                ))}
              </ToggleButtonGroup>
            </div>
            <Select
              selectedKey={zone || ALL}
              onSelectionChange={(key) =>
                setFilter({ zone: key === ALL ? "" : String(key) })
              }
              className={styles.zone}
            >
              <Label>Availability zone</Label>
              <SelectItem id={ALL}>All</SelectItem>
              {(options.data?.availability_zones ?? []).map((item) => (
                <SelectItem key={item} id={item}>
                  {item}
                </SelectItem>
              ))}
            </Select>
          </div>
          {options.isError ? (
            <ErrorState
              error={options.error}
              onRetry={() => options.refetch()}
            />
          ) : options.data && !canCreate ? (
            <Alert tone="danger" role="status">
              You can&apos;t create a reservation because your project limits
              have been reached.
            </Alert>
          ) : slots.isPending || !range ? (
            <SkeletonLines lines={6} />
          ) : slots.isError ? (
            <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
          ) : rows.length === 0 ? (
            <Alert tone="warning" role="status">
              There are no flavours for this selection.
            </Alert>
          ) : (
            <div className={styles.stack}>
              {!anyFree && (
                <Alert tone="warning" role="status">
                  There are no available time slots for this selection.
                </Alert>
              )}
              {clamped && (
                <Alert tone="info" role="status">
                  Free time slots are shown up to{" "}
                  {formatCalendarDate(searchedTo)}.
                </Alert>
              )}
              <SlotGantt
                rows={rows}
                range={range}
                {...(searchedTo ? { searchedTo } : {})}
                daysLeft={limits?.days_left ?? null}
                canReserve={canCreate}
                onPick={setPicked}
              />
            </div>
          )}
        </Panel>
        <section
          className={styles.feedback}
          aria-labelledby="reservation-feedback"
        >
          <h2 id="reservation-feedback">We&apos;d love your feedback!</h2>
          <p>
            Thank you for using the Reservation System. Please let us know about
            your experience via the online feedback form.
          </p>
          <ExternalLink href={FEEDBACK_FORM}>Feedback form</ExternalLink>
        </section>
      </div>
      {picked && options.data && (
        <ReserveDialog
          projectId={projectId}
          picked={picked}
          options={options.data}
          onClose={() => setPicked(null)}
        />
      )}
    </>
  );
}

function Usage({ options }: { options: ReservationOptions }) {
  if (options.su_used === null) {
    return (
      <p className={styles.usage}>
        Service unit usage for this project is unavailable right now.
      </p>
    );
  }
  const budget =
    options.su_budget === null || options.su_budget < 0
      ? "Unlimited"
      : formatNumber(options.su_budget);
  return (
    <p className={styles.usage}>
      You have used{" "}
      <strong>
        {formatNumber(options.su_used)}/{budget} Service Units
      </strong>{" "}
      in this project allocation period.
    </p>
  );
}
