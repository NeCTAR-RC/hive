"""The ``/api/me`` payload: who is logged in, where, and what they can do."""

import time

from hive.config import Settings
from hive.session.model import ScopedToken, SessionData

# Keystone service type -> capability key the SPA's panel registry uses.
SERVICE_KEYS = {
    "compute": "compute",
    "volumev3": "volume",
    "network": "network",
    "image": "image",
    "object-store": "object-store",
    "container-infra": "container-infra",
    "load-balancer": "load-balancer",
    "orchestration": "orchestration",
    "dns": "dns",
    "sharev2": "share",
    "database": "database",
    "nectar-reservation": "reservation",
    "security": "security",
    "rating": "rating",
    "metric": "metric",
    "allocations": "allocations",
    "account": "account",
    "nectar-ops": "ops",
}


def services_from_catalog(catalog: list[dict]) -> dict[str, bool]:
    present = {s.get("type") for s in catalog}
    return {key: stype in present for stype, key in SERVICE_KEYS.items()}


def is_trial(project_name: str, settings: Settings) -> bool:
    return project_name.startswith(settings.trial_project_prefix)


def build_me(
    settings: Settings, data: SessionData, scoped: ScopedToken
) -> dict:
    roles = list(scoped.roles)
    role_set = set(roles)
    # The session store TTL slides; the token's own expiry is the hard cap
    # the SPA must plan around (no renewal, as in Horizon).
    expires_at = data.unscoped.expires_at.timestamp()
    return {
        "user": data.user.model_dump(),
        "project": {
            **scoped.project.model_dump(),
            "is_trial": is_trial(scoped.project.name, settings),
        },
        "roles": roles,
        "projects": [p.model_dump() for p in data.projects],
        "capabilities": {
            "tenantmanager": settings.tenantmanager_role_name in role_set,
            "user_lookup": bool(role_set & set(settings.user_lookup_roles)),
            "services": services_from_catalog(scoped.catalog),
        },
        "session": {
            "expires_at": expires_at,
            "server_time": time.time(),
        },
    }
