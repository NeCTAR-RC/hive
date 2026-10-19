"""Sentry / GlitchTip error reporting, with credentials scrubbed."""

from hive.config import Settings

SENSITIVE_HEADERS = {"cookie", "set-cookie", "x-auth-token", "authorization"}


def _scrub(event, _hint):
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            for name in list(headers):
                if name.lower() in SENSITIVE_HEADERS:
                    headers[name] = "[Filtered]"
        request.pop("cookies", None)
        request.pop("data", None)
    return event


def init_sentry(settings: Settings, release: str) -> bool:
    if not settings.sentry_dsn:
        return False
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.sentry_environment or settings.env,
        release=f"hive@{release}",
        send_default_pii=False,
        # Frame locals hold tokens, session data and request bodies; never
        # ship them. TokenInfo also hides its token from repr().
        include_local_variables=False,
        auto_session_tracking=False,
        traces_sample_rate=0,
        before_send=_scrub,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    return True
