"""Pydantic schemas for complaint comments."""
from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)
    is_internal: bool = False
