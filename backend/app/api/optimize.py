from fastapi import APIRouter

from app.models.optimize import OptimizeRequest, OptimizeResponse
from app.optimizer.engine import optimize_trip


router = APIRouter(prefix="/api", tags=["optimization"])


@router.post(
    "/optimize",
    response_model=OptimizeResponse,
    response_model_exclude_none=True,
)
def optimize(request: OptimizeRequest) -> OptimizeResponse:
    return optimize_trip(request)
