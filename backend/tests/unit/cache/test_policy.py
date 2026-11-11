"""The cache policy table: who shares an entry is part of the policy."""

import dataclasses

import pytest

from hive.cache import policy

POLICIES = [
    value
    for value in vars(policy).values()
    if isinstance(value, policy.Policy)
]

# Lists whose upstream answer depends on the caller's project or roles
# (BE-1): sharing one entry would show one project's private items to
# another.
PROJECT_DEPENDENT = [
    policy.FLAVORS,
    policy.VOLUME_TYPES,
    policy.SHARE_TYPES,
    policy.TROVE_FLAVORS,
    policy.TROVE_DATASTORES,
    policy.MAGNUM_TEMPLATES,
    policy.HEAT_RESOURCE_TYPES,
    policy.NETWORKS,
    policy.IMAGES_PROJECT,
    policy.RISKS,
    policy.ALLOCATION,
    policy.USAGE,
    policy.USAGE_INSTANCES,
    policy.USAGE_ALLOCATION,
    policy.LB_CHAIN,
]


@pytest.mark.parametrize("entry", PROJECT_DEPENDENT, ids=lambda p: p.name)
def test_project_dependent_lists_are_per_project(entry):
    assert entry.scope == "project"


def test_names_are_unique():
    names = [p.name for p in POLICIES]
    assert len(names) == len(set(names))


@pytest.mark.parametrize("entry", POLICIES, ids=lambda p: p.name)
def test_lifetimes_are_positive(entry):
    assert entry.ttl > 0
    assert entry.stale >= 0


def test_policies_are_immutable():
    with pytest.raises(dataclasses.FrozenInstanceError):
        policy.FLAVORS.ttl = 1  # type: ignore[misc]
