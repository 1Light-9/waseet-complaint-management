import os
import shutil
import logging
import unicodedata
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.core.config import get_settings
from app.core.database import get_db
from app.models.kb import Document, DocumentChunk
from app.core.deps import CurrentUser
from app.services.ai import extract_and_chunk_document, generate_embeddings

router = APIRouter(prefix="/admin/docs", tags=["Docs"])
log = logging.getLogger(__name__)
settings = get_settings()

BACKEND_DIR = Path(__file__).resolve().parents[2]
DOCS_DIR = Path(os.getenv("DOCS_DIR", str(BACKEND_DIR / "docs")))


def ensure_docs_dir():
    if not DOCS_DIR.exists():
        DOCS_DIR.mkdir(parents=True, exist_ok=True)


def _strict_utf8_gate(raw: str) -> str:
    """
    Strict UTF-8 sanitization gate — called immediately before every DB insert.
    Guarantees the returned string will never cause a Postgres TEXT encoding error.
    Steps:
      1. Force to str if bytes somehow arrive here.
      2. Strip null bytes (Postgres TEXT rejects \\x00).
      3. encode('utf-8','replace').decode('utf-8'): replaces surrogates/broken sequences.
      4. NFC normalize: folds combining characters.
      5. Final strict encode() — if still broken (impossible after step 3), logs and re-replaces.
    """
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    else:
        raw = str(raw)

    raw = raw.replace("\x00", "")
    raw = raw.encode("utf-8", errors="replace").decode("utf-8")
    raw = unicodedata.normalize("NFC", raw)

    try:
        raw.encode("utf-8", errors="strict")
    except (UnicodeEncodeError, UnicodeDecodeError) as e:
        log.error(f"[UTF-8 gate] Final encode STILL failed after sanitize: {e}. Forcing replace.")
        raw = raw.encode("utf-8", errors="replace").decode("utf-8")

    return raw


@router.post("/upload")
async def upload_document(
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")

    ensure_docs_dir()
    safe_filename = file.filename.replace(" ", "_").replace("/", "_")
    file_path = DOCS_DIR / safe_filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = file_path.stat().st_size

    doc = Document(
        title=file.filename,
        source_type="upload",
        filename=safe_filename,
        mime_type=file.content_type,
        file_size_bytes=file_size,
        storage_path=str(file_path),
        uploaded_by_id=current_user.id,
        openai_status="pending" if settings.cloud_kb_enabled else None,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # ── OpenAI Vector Store upload ───────────────────────────────────────────
    if settings.cloud_kb_enabled:
        try:
            from app.services.openai_vector_store import upload_file_to_vector_store
            file_id = await upload_file_to_vector_store(str(file_path), file.filename)
            doc.openai_file_id = file_id
            doc.openai_status = "indexed"
            log.info(f"Document {doc.id} indexed in OpenAI VS: {file_id}")
        except Exception as e:
            log.error(f"OpenAI VS upload failed for {doc.id}: {e}")
            doc.openai_status = "failed"
        await db.commit()
    # ─────────────────────────────────────────────────────────────────────────

    return {
        "id": str(doc.id),
        "title": doc.title,
        "openai_file_id": doc.openai_file_id,
        "openai_status": doc.openai_status,
        "message": "Document uploaded successfully",
        "size": file_size
    }


@router.post("/index")
async def index_documents(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")

    docs_result = await db.execute(select(Document).where(Document.is_active == True))
    docs = docs_result.scalars().all()

    indexed_docs = 0
    total_chunks_created = 0
    details = []

    for doc in docs:
        chunk_count_res = await db.execute(
            select(func.count()).where(DocumentChunk.document_id == doc.id)
        )
        chunk_count = chunk_count_res.scalar()

        if chunk_count > 0:
            continue  # Already indexed

        chunks_data = await extract_and_chunk_document(doc)
        if not chunks_data:
            details.append({
                "title": doc.title,
                "status": "failed",
                "reason": "No text extracted",
            })
            continue

        texts_to_embed = [c["text"] for c in chunks_data]
        char_length = sum(len(t) for t in texts_to_embed)
        num_pages = len(set(c["page"] for c in chunks_data))

        # ── Gate: only run local indexing when kb_provider == "local" ────────
        if not settings.kb_local_indexing_enabled and settings.kb_provider != "local":
            log.info(f"Skipping local embedding for '{doc.title}' (kb_provider={settings.kb_provider})")
            details.append({
                "title": doc.title,
                "status": "skipped_local",
                "reason": f"kb_provider={settings.kb_provider}; local indexing disabled",
                "chunks_created": 0,
            })
            continue
        # ─────────────────────────────────────────────────────────────────────

        all_embeddings = []
        batch_size = 50
        for i in range(0, len(texts_to_embed), batch_size):
            batch_texts = texts_to_embed[i:i + batch_size]
            batch_embs = await generate_embeddings(batch_texts)
            all_embeddings.extend(batch_embs)

        # Create chunks — STRICT UTF-8 GATE applied before every db.add()
        for idx, (cdata, emb) in enumerate(zip(chunks_data, all_embeddings)):
            safe_content = _strict_utf8_gate(cdata["text"])
            chunk = DocumentChunk(
                document_id=doc.id,
                chunk_index=idx,
                content=safe_content,
                page_number=cdata["page"],
                token_count=cdata["tokens"],
                embedding_vector=emb
            )
            db.add(chunk)

        preview = _strict_utf8_gate(chunks_data[0]["text"])[:200] if chunks_data else ""
        details.append({
            "title": doc.title,
            "status": "indexed",
            "extracted_chars": char_length,
            "pages_or_sections": num_pages,
            "chunks_created": len(chunks_data),
            "preview_200": preview
        })

        indexed_docs += 1
        total_chunks_created += len(chunks_data)

    await db.commit()

    return {
        "indexed_docs": indexed_docs,
        "total_chunks": total_chunks_created,
        "details": details,
        "message": "Indexing complete"
    }


@router.get("/{id}/chunks")
async def get_test_chunks(
    id: str,
    current_user: CurrentUser,
    limit: int = 3,
    db: AsyncSession = Depends(get_db)
):
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")

    stmt = select(DocumentChunk).where(DocumentChunk.document_id == id).order_by(DocumentChunk.chunk_index).limit(limit)
    res = await db.execute(stmt)
    chunks = res.scalars().all()

    return [
        {
            "chunk_index": c.chunk_index,
            "page_number": c.page_number,
            "content": c.content,
            "token_count": c.token_count
        }
        for c in chunks
    ]


@router.get("/")
async def list_documents(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")

    stmt = select(Document).order_by(Document.created_at.desc())
    res = await db.execute(stmt)
    docs = res.scalars().all()

    out = []
    for d in docs:
        cc_res = await db.execute(select(func.count()).where(DocumentChunk.document_id == d.id))
        cc = cc_res.scalar()
        out.append({
            "id": str(d.id),
            "title": d.title,
            "source_type": d.source_type,
            "created_at": d.created_at,
            "chunk_count": cc,
            "openai_file_id": d.openai_file_id,
            "openai_status": d.openai_status,
            "is_active": d.is_active,
        })

    return out


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Mark a document inactive and remove it from OpenAI Vector Store if applicable."""
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")

    res = await db.execute(select(Document).where(Document.id == doc_id))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove from OpenAI Vector Store if applicable
    if doc.openai_file_id:
        try:
            from app.services.openai_vector_store import delete_file_from_vector_store
            await delete_file_from_vector_store(doc.openai_file_id)
            log.info(f"Deleted {doc.openai_file_id} from OpenAI VS for document {doc_id}")
        except Exception as e:
            log.error(f"Failed to delete from OpenAI VS: {e}")

    # Soft-delete: mark inactive
    doc.is_active = False
    doc.openai_status = "deleted"
    await db.commit()

    return {"deleted": True, "doc_id": doc_id}
