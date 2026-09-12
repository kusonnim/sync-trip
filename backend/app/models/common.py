from typing import Generic, Literal, TypeVar

from pydantic import BaseModel


DataT = TypeVar("DataT")


class SuccessResponse(BaseModel, Generic[DataT]):
    status: Literal["success"] = "success"
    data: DataT


class UnavailableResponse(BaseModel):
    status: Literal["unavailable"] = "unavailable"
    data: None = None


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    code: str
    message: str
