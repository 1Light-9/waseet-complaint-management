"""Cloud Knowledge Base endpoints — OpenAI Vector Stores.

Features:
  POST   /kb/upload         — upload a file to OpenAI + attach to vector store
  GET    /kb/files          — list files attached to the vector store
  DELETE /kb/file/{file_id} — remove a file from the store and delete it
"""
import logging
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException

from app.core.config import get_settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/kb", tags=["Knowledge Base"])
log = logging.getLogger(__name__)
settings = get_settings()


def _get_client():
    """Return an AsyncOpenAI client, or raise 503 if not configured."""
    if not settings.is_ai_active:
        raise HTTPException(status_code=503, detail="AI is not enabled or API key is missing.")
    if not settings.openai_vector_store_id:
        raise HTTPException(status_code=503, detail="OPENAI_VECTOR_STORE_ID is not configured.")
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.openai_api_key)
    except ImportError:
        raise HTTPException(status_code=503, detail="openai package is not installed.")


# ── Feature 1: Upload ────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_kb_file(
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """Upload a file to OpenAI Files API and attach it to the configured vector store."""
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only.")

    client = _get_client()
    store_id = settings.openai_vector_store_id

    # 1. Upload file to OpenAI Files API
    try:
        file_bytes = await file.read()
        openai_file = await client.files.create(
            file=(file.filename, file_bytes, file.content_type or "application/octet-stream"),
            purpose="assistants",
        )
        log.info(f"Uploaded to OpenAI Files: {openai_file.id} ({file.filename})")
    except Exception as e:
        log.error(f"Failed to upload file to OpenAI: {e}")
        raise HTTPException(status_code=500, detail=f"OpenAI file upload failed: {e}")

    # 2. Attach file to the vector store
    try:
        await client.beta.vector_stores.files.create(
            vector_store_id=store_id,
            file_id=openai_file.id,
        )
        log.info(f"Attached {openai_file.id} to vector store {store_id}")
    except Exception as e:
        log.error(f"Failed to attach file to vector store: {e}")
        raise HTTPException(status_code=500, detail=f"Vector store attachment failed: {e}")

    return {
        "filename": file.filename,
        "openai_file_id": openai_file.id,
        "vector_store_id": store_id,
        "status": "uploaded",
    }


# ── Feature 2: List Files ────────────────────────────────────────────────────

@router.get("/files")
async def list_kb_files(current_user: CurrentUser):
    """List all files attached to the configured vector store."""
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only.")

    client = _get_client()
    store_id = settings.openai_vector_store_id

    try:
        response = await client.beta.vector_stores.files.list(vector_store_id=store_id)
        vs_files = response.data
    except Exception as e:
        log.error(f"Failed to list vector store files: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list files: {e}")

    # Enrich with filename from Files API where available
    result = []
    for vsf in vs_files:
        filename = vsf.id  # fallback
        try:
            file_meta = await client.files.retrieve(vsf.id)
            filename = file_meta.filename
        except Exception:
            pass
        result.append({
            "file_id": vsf.id,
            "filename": filename,
            "status": vsf.status,
        })

    return result


# ── Feature 3: Delete File ───────────────────────────────────────────────────

@router.delete("/file/{file_id}")
async def delete_kb_file(file_id: str, current_user: CurrentUser):
    """Remove a file from the vector store and delete it from OpenAI Files."""
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only.")

    client = _get_client()
    store_id = settings.openai_vector_store_id

    # 1. Remove from vector store
    try:
        await client.beta.vector_stores.files.delete(
            vector_store_id=store_id,
            file_id=file_id,
        )
        log.info(f"Removed {file_id} from vector store {store_id}")
    except Exception as e:
        log.error(f"Failed to remove file from vector store: {e}")
        raise HTTPException(status_code=500, detail=f"Vector store removal failed: {e}")

    # 2. Delete from OpenAI Files storage
    try:
        await client.files.delete(file_id)
        log.info(f"Deleted OpenAI file {file_id}")
    except Exception as e:
        log.warning(f"File removed from store but OpenAI Files delete failed: {e}")

    return {"deleted": True, "file_id": file_id}
