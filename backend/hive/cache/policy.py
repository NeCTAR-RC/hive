"""How long each cached value lives and whom it is shared with: the one
place that answers "how stale can this page be".

``ttl`` is how long a value is fresh. For ``stale`` seconds more it is
still served at once while a background refresh replaces it. ``scope``
decides who shares an entry:

- ``global``: one entry for every user. Only for data that does not
  depend on the token's project or roles.
- ``project``: one entry per project. Most OpenStack lists answer with
  what the caller may see (Nova flavours and Cinder volume types include
  the private ones granted to the project, Neutron's ``shared`` flag
  follows RBAC, Heat filters resource types by role), so they are here.

``Cache`` builds every key from a policy, so a project-scoped list
always carries the project in its key.
"""

from dataclasses import dataclass
from typing import Literal

Scope = Literal["global", "project"]

MINUTE = 60
HOUR = 60 * MINUTE


@dataclass(frozen=True)
class Policy:
    """One cached value: ``name`` is its key stem and metrics label."""

    name: str
    ttl: int
    stale: int
    scope: Scope


# Compute
FLAVORS = Policy("flavors", 10 * MINUTE, HOUR, "project")
NOVA_AZS = Policy("nova-azs", 10 * MINUTE, HOUR, "global")
IMAGES_PUBLIC = Policy("images-public", 5 * MINUTE, 30 * MINUTE, "global")
IMAGES_COMMUNITY = Policy("images-community", HOUR, 6 * HOUR, "global")
# Private and shared images, by visibility.
IMAGES_PROJECT = Policy("images", MINUTE, 10 * MINUTE, "project")

# Volumes and shares
CINDER_AZS = Policy("cinder-azs", 10 * MINUTE, HOUR, "global")
VOLUME_TYPES = Policy("cinder-types", 10 * MINUTE, HOUR, "project")
SHARE_TYPES = Policy("share-types", 10 * MINUTE, HOUR, "project")
MANILA_AZS = Policy("manila-azs", 10 * MINUTE, HOUR, "global")

# Network, by purpose (boot, router, any, floating).
NETWORKS = Policy("networks", 5 * MINUTE, HOUR, "project")
NEUTRON_EXTENSIONS = Policy("neutron-extensions", HOUR, 6 * HOUR, "global")

# Object store
SWIFT_INFO = Policy("swift-info", HOUR, 6 * HOUR, "global")

# Databases, kubernetes, orchestration
TROVE_FLAVORS = Policy("trove-flavors", 10 * MINUTE, HOUR, "project")
TROVE_DATASTORES = Policy("trove-datastores", 10 * MINUTE, HOUR, "project")
MAGNUM_TEMPLATES = Policy("magnum-templates", 5 * MINUTE, HOUR, "project")
HEAT_RESOURCE_TYPES = Policy("heat-resource-types", HOUR, 6 * HOUR, "project")
HEAT_TEMPLATE_VERSIONS = Policy(
    "heat-template-versions", HOUR, 6 * HOUR, "global"
)

# Home page and usage
OUTAGES = Policy("outages", MINUTE, 10 * MINUTE, "global")
RISKS = Policy("risks", 2 * MINUTE, 15 * MINUTE, "project")
ALLOCATION = Policy("allocation", 10 * MINUTE, 2 * HOUR, "project")
NEWS = Policy("news", HOUR, 24 * HOUR, "global")
USAGE = Policy("usage", 30 * MINUTE, 3 * HOUR, "project")
USAGE_INSTANCES = Policy("usage-instances", 30 * MINUTE, 3 * HOUR, "project")
USAGE_ALLOCATION = Policy("usage-allocation", 30 * MINUTE, 3 * HOUR, "project")

# Not a cache: the state of a load balancer create chain, kept while the
# wizard's steps run (``services.loadbalancer``).
LB_CHAIN = Policy("lb-chain", 30 * MINUTE, 0, "project")
