from typing import Annotated

from fastapi import APIRouter, Depends

from app.models.optimize import OptimizeRequest, OptimizeResponse
from app.optimizer.refine import optimize_trip_precise
from app.routing.router import RoutingService, get_routing_service


router = APIRouter(prefix="/api", tags=["optimization"])


@router.post(
    "/optimize",
    response_model=OptimizeResponse,
    response_model_exclude_none=True,
)
async def optimize(
    request: OptimizeRequest,
    routing: Annotated[RoutingService, Depends(get_routing_service)],
) -> OptimizeResponse:
    return await optimize_trip_precise(request, routing)
