"""Application settings, read from ``HIVE_*`` environment variables.

Secrets arrive the same way as everything else: the helm chart sources a
Vault-rendered env file before exec, and ``make env`` writes a local ``.env``
for development.
"""

from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from pydantic import field_validator, SecretStr
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

ENV_PREFIX = "HIVE_"

# Comma-separated lists in the environment, e.g. HIVE_USER_LOOKUP_ROLES=a,b.
CommaList = Annotated[list[str], NoDecode]

# Reported, not enforced, until the third-party embeds are verified.
DEFAULT_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://www.googletagmanager.com "
    "https://*.freshworks.com https://ardc.edu.au; "
    "connect-src 'self' https://*.google-analytics.com "
    "https://*.freshworks.com https://ardc.edu.au; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; "
    "frame-src https://*.freshworks.com https://www.youtube-nocookie.com; "
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


class Settings(BaseSettings):
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
    login_url_nz: str | None = None
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
    image_reserved_properties: CommaList = [
        "os_hash_algo",
        "os_hash_value",
        "os_hidden",
    ]
    image_default_visibility: str = "private"
    volume_type_az_extra_spec: str = "RESKEY:availability_zones"
    # OPENSTACK_NEUTRON_NETWORK in the deployed Horizon: new subnets get
    # these name servers unless the user changes them, IPv6, HA and DVR
    # routers are not offered, and floating IP targets are checked for a
    # route to the external network.
    subnet_default_dns_nameservers: CommaList = ["1.1.1.1", "1.0.0.1"]
    network_enable_ipv6: bool = False
    network_fip_topology_check: bool = True
    # Image files stream through the backend to glance; cap the size and
    # allow a slow link the time it needs.
    image_upload_max_bytes: int = 20 * 1024**3
    image_upload_timeout: float = 3600.0
    # Object store: the browser uploads straight to Swift with backend-signed
    # TempURLs ("tempurl"), or streams through the backend ("proxy") where
    # the store cannot be reached from browsers or has no TempURL support.
    swift_upload_mode: Literal["tempurl", "proxy"] = "tempurl"
    swift_tempurl_ttl: int = 3600
    # Nectar's Ceph gateways accept HMAC-SHA1 TempURL signatures only
    # (checked on rctest, 10 Oct 2026); Swift proper also takes sha256.
    swift_tempurl_digest: Literal["sha1", "sha256", "sha512"] = "sha1"
    swift_segment_bytes: int = 1024**3
    swift_proxy_max_bytes: int = 5 * 1024**3

    # Upstream services
    nova_microversion: str = "2.90"
    cinder_microversion: str = "3.60"
    magnum_microversion: str = "1.14"
    manila_microversion: str = "2.65"
    # Protocols offered on the share create form (OPENSTACK_MANILA_FEATURES
    # enabled_share_protocols in the Horizon helm _local_settings.tpl:758-760).
    manila_share_protocols: CommaList = ["NFS", "CIFS", "CephFS"]
    upstream_connect_timeout: float = 3.0
    upstream_read_timeout: float = 15.0

    # Operations
    readyz_fail_on_keystone: bool = False
    sentry_dsn: SecretStr | None = None
    sentry_environment: str | None = None

    @field_validator(
        "websso_allowed_origins",
        "user_lookup_roles",
        "resize_hidden_flavor_prefixes",
        "resize_hidden_flavor_classes",
        "image_reserved_properties",
        mode="before",
    )
    @classmethod
    def _comma_lists(cls, value):
        return _split_commas(value)

    @field_validator("secret_key")
    @classmethod
    def _secret_key_long_enough(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 16:
            raise ValueError("HIVE_SECRET_KEY must be at least 16 characters")
        return value

    @property
    def receiver_url(self) -> str:
        """Absolute URL manuka POSTs the token to."""
        return self.public_url.rstrip("/") + self.receiver_path

    @property
    def keystone_public(self) -> str:
        return self.keystone_public_url or self.keystone_url

    def login_start_url(self, next_path: str = "", nz: bool = False) -> str:
        """Build the manuka login URL that returns the user to Hive.

        Mirrors the Horizon theme: ``<login_url>/?return-path=<receiver>``,
        with ``?next=`` folded into the receiver URL so it survives manuka's
        exact-match whitelist (the query string is ignored by the match).
        """
        receiver = self.receiver_url
        if next_path:
            receiver += "?next=" + quote(next_path, safe="")
        base = (
            self.login_url_nz if nz and self.login_url_nz else self.login_url
        )
        separator = "&" if "?" in base else "?"
        return f"{base}{separator}return-path={quote(receiver, safe='')}"
