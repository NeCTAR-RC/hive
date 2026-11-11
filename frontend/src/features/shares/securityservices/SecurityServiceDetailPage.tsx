// One security service (manila-ui security_services panel): its details,
// with the edit dialog in the header.
import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { KeyValueList } from "../../../components/KeyValueList/KeyValueList";
import { Panel } from "../../../components/Panel/Panel";
import { formatDateTime } from "../../../lib/format";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { DetailPage } from "../../../shell/DetailPage/DetailPage";
import { securityServiceQuery } from "../api";
import { EditSecurityServiceDialog } from "./dialogs/EditSecurityServiceDialog";

const securityServiceRoute = getRouteApi(
  "/app/shares/security-services/$serviceId",
);

const SERVICE_CRUMBS = [
  { label: "Project" },
  { label: "Share" },
  { label: "Security services", href: "/shares/security-services" },
];

/** One security service's detail page; the password is never shown. */
export function SecurityServiceDetailPage() {
  const projectId = useProjectId();
  const { serviceId } = securityServiceRoute.useParams();
  const service = useQuery(securityServiceQuery(projectId, serviceId));
  const [editing, setEditing] = useState(false);
  return (
    <>
      <DetailPage
        query={service}
        noun="security service"
        id={serviceId}
        crumbs={SERVICE_CRUMBS}
        backTo={{
          label: "security services",
          href: "/shares/security-services",
        }}
        title={(data) => data.name || data.id}
        actions={() => (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => setEditing(true)}
          >
            Edit security service
          </Button>
        )}
      >
        {(data) => (
          <Panel title="Details" headingLevel={2}>
            <KeyValueList
              items={[
                { label: "Type", value: data.type_label },
                { label: "Description", value: data.description },
                { label: "DNS IP", value: data.dns_ip },
                { label: "Organisational unit", value: data.ou },
                { label: "Server", value: data.server },
                { label: "Domain", value: data.domain },
                { label: "User", value: data.user },
                {
                  label: "Created",
                  value: formatDateTime(data.created_at),
                },
                { label: "ID", value: <code>{data.id}</code> },
              ]}
            />
          </Panel>
        )}
      </DetailPage>
      {service.data && editing && (
        <EditSecurityServiceDialog
          service={service.data}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
