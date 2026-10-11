"""Project Members: the project's member and tenantmanager assignments."""

from hive.clients.nectar import ManukaClient
from hive.clients.openstack import KeystoneIdentityClient
from hive.errors import BadRequest, Conflict, Forbidden, NotFound
from hive.nectar import members as rules
from hive.services.context import Context


class UserNotRegistered(NotFound):
    code = "user_not_found"


def _choices(ctx: Context) -> list[dict]:
    return rules.role_choices(
        ctx.settings.role_member_id, ctx.settings.role_tenantmanager_id
    )


async def list_members(ctx: Context, current_user_id: str) -> dict:
    keystone = KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)
    assignments = await keystone.role_assignments(ctx.project_id)
    return {
        "items": rules.member_rows(assignments, current_user_id),
        "roles": _choices(ctx),
    }


async def add_member(ctx: Context, email: str, role_id: str) -> dict:
    """Resolve the account through manuka, then grant the role
    (``project_members/forms.py:47-69``)."""
    choices = _choices(ctx)
    if not rules.removable_role(role_id, choices):
        raise BadRequest("Choose the member or tenantmanager role.")
    manuka = ManukaClient(ctx.http, ctx.settings, ctx.scoped)
    try:
        user = await manuka.user_by_name(email)
    except NotFound as exc:
        raise UserNotRegistered(
            "Unable to add user to project: there is no Nectar RC account"
            f' registered for "{email}".',
            service=exc.service,
        ) from exc
    except Conflict as exc:
        raise Conflict(
            f'More than one account matches "{email}"; contact support.',
            service=exc.service,
        ) from exc
    user_id = user.get("id")
    if not user_id:
        raise UserNotRegistered(
            "Unable to add user to project: there is no Nectar RC account"
            f' registered for "{email}".'
        )
    keystone = KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)
    await keystone.grant_project_role(ctx.project_id, user_id, role_id)
    role_name = next(c["name"] for c in choices if c["id"] == role_id)
    return {
        "id": f"{user_id}-{role_id}",
        "user_id": user_id,
        "name": user.get("name") or email,
        "role_id": role_id,
        "role_name": role_name,
    }


async def remove_member(
    ctx: Context, current_user_id: str, user_id: str, role_id: str
) -> None:
    if user_id == current_user_id:
        raise Forbidden("You cannot remove yourself from the project.")
    if not rules.removable_role(role_id, _choices(ctx)):
        raise BadRequest(
            "Only the member and tenantmanager roles can be removed."
        )
    keystone = KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)
    await keystone.revoke_project_role(ctx.project_id, user_id, role_id)
