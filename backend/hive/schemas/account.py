"""Request bodies for the account panels (My Details)."""

from typing import Literal

from pydantic import BaseModel, Field

# nectar_dashboard/user_info/update/forms.py:39-60
Affiliation = Literal[
    "faculty",
    "student",
    "staff",
    "employee",
    "member",
    "affiliate",
    "alum",
    "library-walk-in",
]

AFFILIATIONS: list[dict] = [
    {"id": "faculty", "label": "Faculty"},
    {"id": "student", "label": "Student"},
    {"id": "staff", "label": "Staff"},
    {"id": "employee", "label": "Employee"},
    {"id": "member", "label": "Member"},
    {"id": "affiliate", "label": "Affiliate"},
    {"id": "alum", "label": "Alumnus"},
    {"id": "library-walk-in", "label": "Library walk-in"},
]


class ProfileUpdate(BaseModel):
    affiliation: Affiliation
    phone_number: str | None = Field(default=None, max_length=64)
    mobile_number: str | None = Field(default=None, max_length=64)
