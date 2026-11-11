"""Replies of the account panels: My Details, Reset Password and the
helpdesk User Details lookup. The profile fields are manuka's account
record (``nectar_dashboard/user_info``)."""

from typing import Literal

from hive.schemas.responses import ResponseModel


class ExternalId(ResponseModel):
    """An identity provider the account has logged in through."""

    idp: str | None
    last_login: str | None


class Affiliation(ResponseModel):
    """An affiliation the My Details form offers."""

    id: str
    label: str


class UserDetails(ResponseModel):
    """A manuka account as the helpdesk User Details lookup shows it.
    ``partial`` is always false here: the lookup fails instead."""

    partial: Literal[False]
    id: int | str
    first_name: str
    surname: str
    displayname: str
    email: str | None
    organisation: str | None
    affiliation: str | None
    phone_number: str | None
    mobile_number: str | None
    orcid: str | None
    registered_at: str | None
    last_login: str | None
    terms_accepted_at: str | None
    expiry_status: str | None
    expiry_next_step: str | None
    external_ids: list[ExternalId]
    orcid_url: str
    orcid_return_url: str


class Profile(UserDetails):
    """The user's own account on My Details, with the affiliations the
    form offers and the ORCID connect and disconnect targets (``None``
    when the dashboard has none configured)."""

    affiliations: list[Affiliation]
    orcid_link_url: str | None
    orcid_unlink_url: str | None


class ProfileUnavailable(ResponseModel):
    """My Details when manuka could not be reached: why, and the ORCID
    links, which need no account record."""

    partial: Literal[True]
    error: str
    message: str
    orcid_url: str
    orcid_link_url: str | None
    orcid_unlink_url: str | None
    orcid_return_url: str


class PasswordReset(ResponseModel):
    """The new API password, sent in this reply only, once."""

    password: str
    username: str


class UserSearchResult(ResponseModel):
    """A helpdesk lookup match. ``id`` is manuka's account id."""

    id: int | str
    displayname: str
    email: str | None
