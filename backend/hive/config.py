"""Application settings, read from ``HIVE_*`` environment variables.

Secrets arrive the same way as everything else: the helm chart sources a
Vault-rendered env file before exec, and ``make env`` writes a local ``.env``
for development.
"""

import ipaddress
from pathlib import Path
from typing import Annotated, Literal, Self
from urllib.parse import quote, urlsplit

from pydantic import (
    BeforeValidator,
    field_validator,
    model_validator,
    SecretStr,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ENV_PREFIX = "HIVE_"

# Reported, not enforced, until the third-party embeds are verified.
# The SPA loads every third-party script from code, never inline: Google
# Analytics, the Freshworks widget, and the ARDC mega menu and footer web
# components. Those load from ardc.edu.au, fetch its manifest, inject
# <style> elements and load its Figtree fonts; the footer's sign-up form
# embeds a Cloudflare Turnstile challenge (script, iframe and verification
# requests).
DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://www.googletagmanager.com "
    "https://*.freshworks.com https://ardc.edu.au "
    "https://challenges.cloudflare.com; "
    "connect-src 'self' https://*.google-analytics.com "
    "https://*.freshworks.com https://ardc.edu.au "
    "https://challenges.cloudflare.com; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data: https://ardc.edu.au; "
    "frame-src https://*.freshworks.com https://www.youtube-nocookie.com "
    "https://challenges.cloudflare.com; "
    "frame-ancestors 'none'; base-uri 'self'; "
    # The ORCID unlink on My Details is a form POST to the manuka accounts
    # service, exactly as Horizon does it.
    "form-action 'self' https://accounts.rc.nectar.org.au "
    "https://accounts.test.rc.nectar.org.au"
)


def _split_commas(value):
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return list(value)


# Comma-separated lists in the environment, e.g. HIVE_USER_LOOKUP_ROLES=a,b.
CommaList = Annotated[list[str], NoDecode, BeforeValidator(_split_commas)]


class Settings(BaseSettings):
    """Every ``HIVE_*`` setting. Defaults suit development against rctest;
    ``env=prod`` turns on the checks in ``_production_ready``."""

    model_config = SettingsConfigDict(
        env_prefix=ENV_PREFIX,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    env: Literal["dev", "test", "prod"] = "dev"
    public_url: str = "http://localhost:5173"
    site_name: str = "Nectar Dashboard"
    docs_enabled: bool = False
    log_format: Literal["json", "console"] = "json"
    log_level: str = "INFO"
    web_static: Path | None = None
    csp: str = DEFAULT_CSP
    csp_enforce: bool = False

    # Keystone and the service catalog
    keystone_url: str = "https://identity.rctest.nectar.org.au/v3"
    keystone_public_url: str | None = None
    region: str = "Melbourne"
    endpoint_interface: str = "public"
    endpoint_overrides: dict[str, str] = {}

    # manuka (accounts) and the token receiver
    login_url: str = "https://accounts.test.rc.nectar.org.au/login"
    # Origins manuka posts the login form from. Empty rejects every login:
    # the receiver is CSRF-exempt, so the Origin check is its only guard.
    websso_allowed_origins: CommaList = []
    receiver_path: str = "/auth/websso/"

    # Sessions
    redis_url: str = "redis://localhost:6379/0"
    secret_key: SecretStr
    session_timeout: int = 21600
    session_cookie_name: str = "hive_session"
    csrf_cookie_name: str = "hive_csrf"
    cookie_secure: bool = True
    logout_revokes_tokens: bool = False

    # Links and site extras
    horizon_url: str = "https://dashboard.rctest.nectar.org.au"
    allocation_api_url: str | None = None
    outage_base_url: str = "https://status.rctest.nectar.org.au/outages/"
    help_url: str = "https://support.ehelp.edu.au/support/home"
    ga_id: str | None = None
    freshworks_widget_id: str | None = None
    rss_url: str = "https://ardc.edu.au/feed/latest-articles/"
    # The featured banner the Horizon home page fetches straight from Swift.
    banner_url: str | None = (
        "https://object-store.rc.nectar.org.au/v1/"
        "AUTH_2f6f7e75fc0f453d9c127b490b02e9e3/"
        "dashboard-featured-banner/banner.json"
    )
    trial_project_prefix: str = "pt-"

    # Roles
    role_member_id: str | None = None
    role_tenantmanager_id: str | None = None
    tenantmanager_role_name: str = "tenantmanager"
    user_lookup_roles: CommaList = [
        "allocationadmin",
        "cloud_admin",
        "helpdesk",
        "admin",
    ]

    # Account panels: ORCID linking is a browser round trip through manuka
    # (ORCID_LINK_URL / ORCID_UNLINK_URL in the Horizon settings); the
    # password reset uses the shared reset token as the "original password"
    # (PASSWORD_RESET_TOKEN) and re-authenticates after a short delay, as
    # Horizon does (nectar_dashboard/reset_password/views.py:36-56).
    orcid_url: str = "https://orcid.org"
    orcid_link_url: str | None = None
    orcid_unlink_url: str | None = None
    password_reset_token: SecretStr | None = None
    password_reset_delay: float = 5.0
    # New application credentials are prefilled to expire this many months
    # ahead (Horizon fork commit ccc1199e6).
    app_credential_expiry_months: int = 3
    # Usage Trend: SU data exists from this date on (the earliest the date
    # picker allows is two years back in Horizon; this is the hard floor).
    usage_data_from: str = "2022-01-01"

    # Nectar rules
    classic_network_id: str = "00000000-0000-0000-0000-000000000000"
    bootable_network_tag: str | None = "nectar:bootable"
    floating_network_tag: str | None = "nectar:floating"
    resize_hidden_flavor_prefixes: CommaList = ["p1.", "p3."]
    resize_hidden_flavor_classes: CommaList = []
    preemptible_flavor_class: str = "preemptible"
    su_rate_extra_spec: str = "nectar:rate"
    # The extra spec Blazar's flavour plugin puts on a reservation's flavour.
    reservation_flavor_extra_spec: str = (
        "aggregate_instance_extra_specs:reservation"
    )
    image_reserved_properties: CommaList = [
        "os_hash_algo",
        "os_hash_value",
        "os_hidden",
    ]
    image_default_visibility: str = "private"
    volume_type_az_extra_spec: str = "RESKEY:availability_zones"
    # OPENSTACK_NEUTRON_NETWORK as the Nectar Horizon fork ships it
    # (openstack_dashboard/defaults.py on nectar/2025.1; neither the fork
    # nor nectar-dashboard overrides it): new subnets get no name servers
    # unless the user adds some, so the cloud's resolvers apply; IPv6
    # subnets are offered; floating IP targets are checked for a route to
    # the external network.
    subnet_default_dns_nameservers: CommaList = []
    network_enable_ipv6: bool = True
    network_fip_topology_check: bool = True
    # Whether the allocate form offers a chosen floating IP address.
    # Neutron's default policy keeps create_floatingip:floating_ip_address
    # for admins, so Horizon hides the field from ordinary users; set it
    # where the cloud's policy lets members choose.
    floating_ip_address_allowed: bool = False
    # Image files stream through the backend to glance; cap the size and
    # allow a slow link the time it needs.
    image_upload_max_bytes: int = 20 * 1024**3
    image_upload_timeout: float = 3600.0
    # Object store: the browser uploads straight to Swift with backend-signed
    # TempURLs ("tempurl"), or streams through the backend ("proxy") where
    # the store cannot be reached from browsers or has no TempURL support.
    swift_upload_mode: Literal["tempurl", "proxy"] = "tempurl"
    swift_tempurl_ttl: int = 3600
    # Nectar's Melbourne object store is Swift 2.37 (the 2026.1 release) on
    # rctest and prod; its /info lists sha1, sha256 and sha512 with sha1
    # deprecated, so sha256 is the default (checked 12 Oct 2026). The
    # Auckland endpoint is a Ceph gateway, which Hive does not use
    # (HIVE_REGION selects Melbourne).
    swift_tempurl_digest: Literal["sha1", "sha256", "sha512"] = "sha256"
    swift_segment_bytes: int = 1024**3
    swift_proxy_max_bytes: int = 5 * 1024**3

    # Upstream services
    nova_microversion: str = "2.90"
    cinder_microversion: str = "3.60"
    magnum_microversion: str = "1.14"
    manila_microversion: str = "2.65"
    # Protocols offered on the share create form. Nectar's Horizon lists
    # NFS, CIFS and CephFS (OPENSTACK_MANILA_FEATURES enabled_share_protocols,
    # helm _local_settings.tpl:758-760), but Nectar's Manila is believed to
    # serve CephFS only (its share types are CephFS), so a share of another
    # protocol could not be mounted; Hive offers what the cloud serves.
    manila_share_protocols: CommaList = ["CephFS"]
    # Whether project members may make a share visible to every project.
    # Manila's default policy keeps create_public_share and
    # set_public_share for admins (manila/policies/shares.py), so the
    # switch would only lead to a refusal; turn on for a cloud that grants
    # them.
    manila_public_shares_allowed: bool = False
    upstream_connect_timeout: float = 3.0
    upstream_read_timeout: float = 15.0
    # JSON request bodies above this are refused (Heat's max_json_body_size).
    api_max_json_bytes: int = 1024 * 1024
    # Parallel calls one request may make to one upstream (per-item lookups).
    upstream_fan_out: int = 8
    # Pages one list may follow before it stops with a warning (a page is
    # up to 1000 items on most services).
    upstream_max_pages: int = 50

    # Operations
    readyz_fail_on_keystone: bool = False
    # Peers whose X-Forwarded-For/-Proto headers are trusted (the ingress).
    forwarded_allow_ips: CommaList = ["127.0.0.1"]
    # Networks that may read /metrics; everyone else gets a 404.
    metrics_allowed_networks: CommaList = ["127.0.0.1/32", "::1/128"]
    sentry_dsn: SecretStr | None = None
    sentry_environment: str | None = None

    @field_validator("secret_key")
    @classmethod
    def _secret_key_long_enough(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 16:
            raise ValueError("HIVE_SECRET_KEY must be at least 16 characters")
        return value

    @field_validator("metrics_allowed_networks")
    @classmethod
    def _networks_parse(cls, value: list[str]) -> list[str]:
        for network in value:
            ipaddress.ip_network(network, strict=False)
        return value

    @model_validator(mode="after")
    def _production_ready(self) -> Self:
        """Refuse to start in production with a development default that
        weakens security; every problem is reported at once."""
        if self.env != "prod":
            return self
        problems = []
        if not self.websso_allowed_origins:
            problems.append("HIVE_WEBSSO_ALLOWED_ORIGINS must list manuka")
        if not self.cookie_secure:
            problems.append("HIVE_COOKIE_SECURE must be true")
        if urlsplit(self.public_url).scheme != "https":
            problems.append("HIVE_PUBLIC_URL must be an https URL")
        if self.docs_enabled:
            problems.append("HIVE_DOCS_ENABLED must be false")
        if "keystone_url" not in self.model_fields_set:
            # The default points at rctest.
            problems.append("HIVE_KEYSTONE_URL must be set explicitly")
        if problems:
            raise ValueError("production settings: " + "; ".join(problems))
        return self

    @property
    def receiver_url(self) -> str:
        """Absolute URL manuka POSTs the token to."""
        return self.public_url.rstrip("/") + self.receiver_path

    @property
    def keystone_public(self) -> str:
        return self.keystone_public_url or self.keystone_url

    def login_start_url(self, next_path: str = "") -> str:
        """Build the manuka login URL that returns the user to Hive.

        Mirrors the Horizon theme: ``<login_url>/?return-path=<receiver>``,
        with ``?next=`` folded into the receiver URL so it survives manuka's
        exact-match whitelist (the query string is ignored by the match).
        manuka asks the user for their identity federation itself.
        """
        receiver = self.receiver_url
        if next_path:
            receiver += "?next=" + quote(next_path, safe="")
        separator = "&" if "?" in self.login_url else "?"
        return_path = quote(receiver, safe="")
        return f"{self.login_url}{separator}return-path={return_path}"
