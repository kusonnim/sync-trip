from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.models.place import SearchResponse
from app.services.errors import ClientInputError
from app.services.kakao_local import KakaoLocalService, get_kakao_local_service


router = APIRouter(prefix="/api", tags=["places"])


@router.get("/search", response_model=SearchResponse)
async def search_places(
    keyword: Annotated[str, Query(min_length=1)],
    service: Annotated[KakaoLocalService, Depends(get_kakao_local_service)],
) -> SearchResponse:
    clean_keyword = keyword.strip()
    if not clean_keyword:
        raise ClientInputError("keyword must not be blank")
    return SearchResponse(data=await service.search(clean_keyword))
