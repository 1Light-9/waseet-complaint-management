"""Knowledge Base document and vector chunk models."""
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import IntBase, UUIDBase

# Embedding dimension — must match the embedding model used
EMBEDDING_DIM = 1536  # OpenAI text-embedding-3-small / ada-002
EMBEDDING_TYPE = JSON().with_variant(Vector(EMBEDDING_DIM), "postgresql")


class Document(UUIDBase):
    """An uploaded knowledge-base document (PDF, DOCX, TXT, etc.)."""

    __tablename__ = "documents"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. 'upload', 'url'
    filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    # OpenAI Vector Store fields (null when using local KB)
    openai_file_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    openai_status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # pending|indexed|failed

    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    # Relationships
    uploaded_by: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="uploaded_documents"
    )
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentChunk(IntBase):
    """A text chunk from a document with its pgvector embedding."""

    __tablename__ = "document_chunks"

    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding_vector: Mapped[list[float] | None] = mapped_column(
        EMBEDDING_TYPE, nullable=True
    )
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")
