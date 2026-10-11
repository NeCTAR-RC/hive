"""All ``/api`` routers in one place."""

from fastapi import APIRouter

from hive.api import (
    account,
    api_access,
    compute,
    config,
    databases,
    dns,
    home,
    identity,
    kubernetes,
    loadbalancer,
    network,
    objectstore,
    orchestration,
    reservations,
    session,
    shares,
    usage,
    volumes,
)

api_router = APIRouter()
api_router.include_router(config.router)
api_router.include_router(session.router)
api_router.include_router(home.router)
api_router.include_router(account.router)
api_router.include_router(usage.router)
api_router.include_router(compute.router)
api_router.include_router(network.router)
api_router.include_router(volumes.router)
api_router.include_router(api_access.router)
api_router.include_router(identity.router)
api_router.include_router(reservations.router)
api_router.include_router(objectstore.router)
api_router.include_router(kubernetes.router)
api_router.include_router(loadbalancer.router)
api_router.include_router(orchestration.router)
api_router.include_router(dns.router)
api_router.include_router(shares.router)
api_router.include_router(databases.router)
