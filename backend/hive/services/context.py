"""What every service function needs: the HTTP client, settings, cache
and the current scoped token, plus the Nectar rule objects built from
settings."""

from collections.abc import Callable
from dataclasses import dataclass
from functools import cached_property
from typing import Any

import httpx

from hive.cache.policy import Policy
from hive.cache.redis import Cache, CacheResult, Fetch
from hive.clients.openstack import (
    CinderClient,
    GlanceClient,
    NeutronClient,
    NovaClient,
)
from hive.config import Settings
from hive.nectar.flavors import FlavorRules
from hive.nectar.images import ImageRules
from hive.nectar.networks import NetworkRules
from hive.nectar.volumes import VolumeRules
from hive.services.background import BackgroundWork
from hive.session.model import ScopedToken


@dataclass
class Context:
    http: httpx.AsyncClient
    settings: Settings
    cache: Cache
    scoped: ScopedToken
    background: BackgroundWork

    @property
    def project_id(self) -> str:
        return self.scoped.project.id

    def _scope(self, policy: Policy) -> str | None:
        return self.project_id if policy.scope == "project" else None

    async def cached(
        self,
        policy: Policy,
        fetch: Fetch,
        *parts: str,
        should_cache: Callable[[Any], bool] | None = None,
    ) -> CacheResult:
        """``fetch()`` through the cache under ``policy``; a project-scoped
        policy is keyed by the current project."""
        return await self.cache.get_or_fetch(
            policy,
            fetch,
            *parts,
            project_id=self._scope(policy),
            should_cache=should_cache,
        )

    async def forget(self, policy: Policy, *parts: str) -> None:
        await self.cache.invalidate(
            policy, *parts, project_id=self._scope(policy)
        )

    async def remember(self, policy: Policy, value: Any, *parts: str) -> None:
        await self.cache.set_json(
            policy, value, *parts, project_id=self._scope(policy)
        )

    async def recall(self, policy: Policy, *parts: str) -> Any:
        return await self.cache.get_json(
            policy, *parts, project_id=self._scope(policy)
        )

    @cached_property
    def nova(self) -> NovaClient:
        return NovaClient(self.http, self.settings, self.scoped)

    @cached_property
    def neutron(self) -> NeutronClient:
        return NeutronClient(self.http, self.settings, self.scoped)

    @cached_property
    def glance(self) -> GlanceClient:
        return GlanceClient(self.http, self.settings, self.scoped)

    @cached_property
    def cinder(self) -> CinderClient:
        return CinderClient(self.http, self.settings, self.scoped)

    @cached_property
    def network_rules(self) -> NetworkRules:
        s = self.settings
        return NetworkRules(
            s.classic_network_id,
            s.bootable_network_tag,
            s.floating_network_tag,
        )

    @cached_property
    def flavor_rules(self) -> FlavorRules:
        s = self.settings
        return FlavorRules(
            s.su_rate_extra_spec,
            s.preemptible_flavor_class,
            s.resize_hidden_flavor_classes,
            s.resize_hidden_flavor_prefixes,
            reservation_spec=s.reservation_flavor_extra_spec,
        )

    @cached_property
    def image_rules(self) -> ImageRules:
        s = self.settings
        return ImageRules(
            s.image_reserved_properties, s.image_default_visibility
        )

    @cached_property
    def volume_rules(self) -> VolumeRules:
        return VolumeRules(self.settings.volume_type_az_extra_spec)
