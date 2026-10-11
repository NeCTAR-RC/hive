"""Application and EC2 credential rules.

Application credentials follow Horizon's
``identity/application_credentials/forms.py``: the expiry is the date and
time combined, the date alone at midnight, the time alone on today's date,
or nothing (``forms.py:96-109``); roles are sent by name
(``forms.py:110-115``); access rules are a list (``forms.py:144-155``). The
Nectar fork prefills the expiry three months ahead (commit ccc1199e6,
``forms.py:36-39``) and warns that a credential without one never expires.

EC2 credentials are per project: API Access shows (and creates on demand)
the one whose ``tenant_id`` is the current project
(``project/api_access/views.py:42-69``).
"""

from datetime import date, datetime, time, UTC
import json

EXPIRES_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"
CREDENTIAL_TYPES = ("totp", "ec2", "cert")


def add_months(when: datetime, months: int) -> datetime:
    """``when`` plus ``months``, clamping the day to the month's length as
    ``dateutil.relativedelta`` does."""
    month = when.month - 1 + months
    year = when.year + month // 12
    month = month % 12 + 1
    last = _days_in_month(year, month)
    return when.replace(year=year, month=month, day=min(when.day, last))


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def default_expiry(now: datetime | None = None, months: int = 3) -> str:
    """The prefilled expiry date, ``YYYY-MM-DD``."""
    now = now or datetime.now(UTC)
    return add_months(now, months).strftime("%Y-%m-%d")


def expires_at(
    expiration_date: str | None,
    expiration_time: str | None,
    today: date | None = None,
) -> str | None:
    """Keystone's ``expires_at`` from the form's date and time fields."""
    if not expiration_date and not expiration_time:
        return None
    day = (
        date.fromisoformat(expiration_date)
        if expiration_date
        else (today or datetime.now(UTC).date())
    )
    clock = time.fromisoformat(expiration_time) if expiration_time else time()
    return datetime.combine(day, clock).strftime(EXPIRES_FORMAT)


def roles_payload(names: list[str]) -> list[dict] | None:
    cleaned = [name for name in names if name]
    return [{"name": name} for name in cleaned] or None


def parse_access_rules(text: str | None) -> list[dict] | None:
    """A JSON list of ``{service, method, path}`` rules, or ``None``."""
    if not text or not text.strip():
        return None
    try:
        rules = json.loads(text)
    except ValueError as exc:
        raise ValueError("Access rules must be a JSON list.") from exc
    if not isinstance(rules, list) or not all(
        isinstance(rule, dict) for rule in rules
    ):
        raise ValueError("Access rules must be a JSON list of objects.")
    return rules


def application_credential_body(
    *,
    name: str,
    description: str | None,
    secret: str | None,
    expiration_date: str | None,
    expiration_time: str | None,
    roles: list[str],
    access_rules: str | None,
    unrestricted: bool,
    today: date | None = None,
) -> dict:
    body: dict = {"name": name, "unrestricted": bool(unrestricted)}
    if description:
        body["description"] = description
    if secret:
        body["secret"] = secret
    expiry = expires_at(expiration_date, expiration_time, today)
    if expiry:
        body["expires_at"] = expiry
    role_list = roles_payload(roles)
    if role_list:
        body["roles"] = role_list
    rules = parse_access_rules(access_rules)
    if rules:
        body["access_rules"] = rules
    return body


def ec2_for_project(credentials: list[dict], project_id: str) -> dict | None:
    for credential in credentials:
        if credential.get("tenant_id") == project_id:
            return credential
    return None
