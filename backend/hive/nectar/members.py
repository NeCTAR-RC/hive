"""Project Members rules, as ``nectar_dashboard/project_members``.

The panel lists the project's role assignments and keeps only the
``member`` and ``tenantmanager`` roles, one row per (user, role) pair with
the id ``"{user_id}-{role_id}"`` (``views.py:27-37, 51-60``). A user
cannot remove their own rows and only those two roles can be removed
(``tables.py:47-53``). Adding a member resolves the email through manuka
first, so only registered Nectar accounts can be added (``forms.py:47-69``).
"""

MEMBER_ROLE_NAMES = ("member", "tenantmanager")


def member_row(
    user_id: str,
    name: str | None,
    role_id: str | None,
    role_name: str,
    current_user_id: str,
) -> dict:
    """One user and role on the Members panel; nobody may remove
    themselves (``project_members/tables.py``)."""
    return {
        "id": f"{user_id}-{role_id}",
        "user_id": user_id,
        "name": name or user_id,
        "role_id": role_id,
        "role_name": role_name,
        "is_self": user_id == current_user_id,
        "can_remove": user_id != current_user_id,
    }


def member_rows(assignments: list[dict], current_user_id: str) -> list[dict]:
    """One row per user and role (``views.py:27-37, 51-60``)."""
    rows = []
    for assignment in assignments:
        role = assignment.get("role") or {}
        user = assignment.get("user") or {}
        role_name = (role.get("name") or "").lower()
        if role_name not in MEMBER_ROLE_NAMES or not user.get("id"):
            continue
        rows.append(
            member_row(
                user["id"],
                user.get("name"),
                role.get("id"),
                role_name,
                current_user_id,
            )
        )
    rows.sort(key=lambda row: (row["name"].lower(), row["role_name"]))
    return rows


def role_choices(
    member_role_id: str | None, tenantmanager_role_id: str | None
) -> list[dict]:
    """The two roles the form offers, member first (``forms.py:36-45``)."""
    choices = []
    if member_role_id:
        choices.append({"id": member_role_id, "name": "member"})
    if tenantmanager_role_id:
        choices.append({"id": tenantmanager_role_id, "name": "tenantmanager"})
    return choices


def removable_role(role_id: str, choices: list[dict]) -> bool:
    """Only member and tenantmanager (``tables.py:47-53``)."""
    return any(choice["id"] == role_id for choice in choices)
