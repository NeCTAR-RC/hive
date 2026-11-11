// Where a stack resource lives in Hive: the page of the physical resource
// Heat made, for the resource types Hive has pages for (heat-dashboard
// links resources to their Horizon panels, believed: the plugin is not
// checked out here).

/** The Hive page of each resource type's physical resource, by its id. */
const PAGES: Readonly<Record<string, (id: string) => string>> = {
  "OS::Nova::Server": (id) => `/compute/instances/${id}`,
  "OS::Cinder::Volume": (id) => `/storage/volumes/${id}`,
  "OS::Neutron::Net": (id) => `/network/networks/${id}`,
  "OS::Neutron::Subnet": (id) => `/network/subnets/${id}`,
  "OS::Neutron::Port": (id) => `/network/ports/${id}`,
  "OS::Neutron::Router": (id) => `/network/routers/${id}`,
  "OS::Neutron::SecurityGroup": (id) => `/network/security-groups/${id}`,
  "OS::Octavia::LoadBalancer": (id) => `/load-balancers/${id}`,
};

/**
 * The page of a stack resource's physical resource, or null when Hive has
 * no page for its type or Heat has not made it yet.
 */
export function resourceHref(
  type: string | null,
  physicalId: string | null,
): string | null {
  const page = type ? PAGES[type] : undefined;
  return page && physicalId ? page(encodeURIComponent(physicalId)) : null;
}
