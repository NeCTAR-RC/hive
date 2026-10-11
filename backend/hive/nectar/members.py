"""Project Members rules, as ``nectar_dashboard/project_members``.

The panel lists the project's role assignments and keeps only the
``member`` and ``tenantmanager`` roles, one row per (user, role) pair with
the id ``"{user_id}-{role_id}"`` (``views.py:27-37, 51-60``). A user
cannot remove their own rows and only those two roles can be removed
(``tables.py:47-53``). Adding a member resolves the email through manuka
first, so only registered Nectar accounts can be added (``forms.py:47-69``).
"""

MEMBER_ROLE_NAMES = ("member", "tenantmanager")


def member_rows(assignments: list[dict], current_user_id: str) -> list[dict]:
    rows = []
    for assignment in assignments:
        role = assignment.get("role") or {}
        user = assignment.get("user") or {}
        role_name = (role.get("name") or "").lower()
        if role_name not in MEMBER_ROLE_NAMES or not user.get("id"):
            continue
        rows.append(
            {
                "id": f"{user['id']}-{role.get('id')}",
                "user_id": user["id"],
                "name": user.get("name") or user["id"],
                "role_id": role.get("id"),
                "role_name": role_name,
                "is_self": user["id"] == current_user_id,
                "can_remove": user["id"] != current_user_id,
            }
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
    return any(choice["id"] == role_id for choice in choices)
