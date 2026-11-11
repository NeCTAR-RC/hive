// One reservation (warre-dashboard detail.html): status, flavour, and the
// launch, extend, calendar and delete actions.
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import { formatDateTime, formatMb, formatNumber } from "../../lib/format";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { useSearchPatch } from "../../lib/hooks/useSearchPatch";
import { DetailPage } from "../../shell/DetailPage/DetailPage";
import { reservationQuery } from "./api";
import { formatReservedDays } from "./days";
import { ExtendDialog } from "./dialogs/ExtendDialog";
import { HeaderActions } from "./HeaderActions";
import { useReservationActions } from "./ReservationActions";
import { StatusNotice } from "./StatusNotice";
import { flavorDisk, flavorRate, statusLabel, statusTone } from "./status";
import styles from "./ReservationsPage.module.scss";

const reservationRoute = getRouteApi("/app/reservations/$reservationId");

/**
 * One reservation: a notice for its status, its overview and flavour, and
 * the launch, extend, calendar and delete actions in the header. Extending
 * opens the extend dialog through the `extend` search flag.
 */
export function ReservationDetailPage() {
  const projectId = useProjectId();
  const { reservationId } = reservationRoute.useParams();
  const search = reservationRoute.useSearch();
  const navigate = reservationRoute.useNavigate();
  const patchSearch = useSearchPatch(reservationRoute);
  const reservation = useQuery(reservationQuery(projectId, reservationId));
  const { run, dialogs } = useReservationActions(
    () => void navigate({ to: "/reservations" }),
  );
  const extending = search.extend === true;
  const setExtending = (extend: boolean) => patchSearch({ extend });

  return (
    <>
      <DetailPage
        query={reservation}
        noun="reservation"
        id={reservationId}
        crumbs={[
          { label: "Project" },
          { label: "Compute" },
          { label: "Reservations", href: "/reservations" },
        ]}
        backTo={{ label: "reservations", href: "/reservations" }}
        title={() => `Reservation ${reservationId}`}
        actions={(data) => (
          <HeaderActions
            reservation={data}
            onExtend={() => setExtending(true)}
            onDelete={() => run("delete", [data])}
          />
        )}
      >
        {(data) => (
          <div className={styles.stack}>
            <StatusNotice reservation={data} />
            <div className={styles.grid}>
              <Panel title="Overview">
                <KeyValueList
                  items={[
                    { label: "ID", value: <code>{data.id}</code> },
                    {
                      label: "Status",
                      value: (
                        <StatusPill tone={statusTone(data.status)}>
                          {statusLabel(data.status)}
                        </StatusPill>
                      ),
                    },
                    {
                      label: "Reserved",
                      value: `${formatReservedDays(data.start, data.end)} (UTC days)`,
                    },
                    {
                      label: "Your local time",
                      value: `${formatDateTime(data.start)} to ${formatDateTime(data.end)}`,
                    },
                    {
                      label: "Created",
                      value: formatDateTime(data.created_at),
                    },
                    {
                      label: "Compute flavour",
                      value: data.compute_flavor ? (
                        <code>reservation:{data.compute_flavor}</code>
                      ) : null,
                    },
                  ]}
                />
              </Panel>
              <Panel title="Flavour">
                <KeyValueList
                  items={[
                    { label: "Name", value: data.flavor.name },
                    { label: "Class", value: data.flavor.category },
                    {
                      label: "Description",
                      value: data.flavor.description,
                    },
                    {
                      label: "Zone",
                      value: data.flavor.availability_zone,
                    },
                    {
                      label: "VCPUs",
                      value: formatNumber(data.flavor.vcpu),
                    },
                    {
                      label: "RAM",
                      value: formatMb(data.flavor.memory_mb),
                    },
                    { label: "Disk", value: flavorDisk(data.flavor) },
                    {
                      label: "Maximum length",
                      value: `${data.flavor.max_days} ${data.flavor.max_days === 1 ? "day" : "days"}`,
                    },
                    { label: "Usage rate", value: flavorRate(data.flavor) },
                    {
                      label: "Public",
                      value: data.flavor.is_public ? "Yes" : "No",
                    },
                  ]}
                />
              </Panel>
            </div>
          </div>
        )}
      </DetailPage>
      {extending && reservation.data && (
        <ExtendDialog
          reservation={reservation.data}
          onClose={() => setExtending(false)}
        />
      )}
      {dialogs}
    </>
  );
}
