"""Public (unauthenticated) configuration for the SPA."""

from fastapi import APIRouter

from hive import __version__
from hive.deps import SettingsDep
from hive.schemas.responses.session import PublicConfig

router = APIRouter(tags=["config"])


@router.get("/config")
async def config(settings: SettingsDep) -> PublicConfig:
    return PublicConfig(
        site_name=settings.site_name,
        env=settings.env,
        version=__version__,
        login_url=settings.login_start_url("/"),
        login_base_url=settings.login_url,
        receiver_url=settings.receiver_url,
        horizon_url=settings.horizon_url,
        help_url=settings.help_url,
        outage_base_url=settings.outage_base_url,
        ga_id=settings.ga_id,
        freshworks_widget_id=settings.freshworks_widget_id,
        banner_url=settings.banner_url,
        trial_project_prefix=settings.trial_project_prefix,
    )
