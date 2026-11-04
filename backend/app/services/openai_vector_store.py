"""OpenAI Vector Store service — upload, poll, delete.

Responsible for:
  - Uploading a local file to OpenAI Files API
  - Attaching the file to the configured Vector Store
  - Polling until the vector store file is processed
  - Deleting a file from the vector store + OpenAI Files
"""
import asyncio
import logging
from openai import AsyncOpenAI

from app.core.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings.openai_api_key)


async def upload_file_to_vector_store(local_path: str, filename: str) -> str:
    """Upload a local file to OpenAI Files API, attach to Vector Store, poll until ready.

    Returns the OpenAI file_id on success, raises on failure.
    """
    client = _client()
    store_id = settings.openai_vector_store_id

    # 1. Upload file to OpenAI Files
    with open(local_path, "rb") as fh:
        openai_file = await client.files.create(file=(filename, fh), purpose="assistants")
    log.info(f"OpenAI file created: {openai_file.id} ({filename})")

    # 2. Attach to the Vector Store
    vs_file = await client.beta.vector_stores.files.create(
        vector_store_id=store_id,
        file_id=openai_file.id,
    )
    log.info(f"Attached {openai_file.id} to vector store {store_id}; vs_file status={vs_file.status}")

    # 3. Poll until processing is complete (max ~60 s)
    for attempt in range(30):
        vs_file = await client.beta.vector_stores.files.retrieve(
            vector_store_id=store_id,
            file_id=openai_file.id,
        )
        if vs_file.status == "completed":
            log.info(f"Vector store file {openai_file.id} is ready.")
            break
        if vs_file.status == "failed":
            raise RuntimeError(f"OpenAI vector store processing failed for {openai_file.id}")
        await asyncio.sleep(2)
    else:
        log.warning(f"Vector store file {openai_file.id} still not completed after polling — continuing anyway.")

    return openai_file.id


async def delete_file_from_vector_store(openai_file_id: str) -> None:
    """Remove a file from the Vector Store and delete it from OpenAI Files.

    Errors are logged but not re-raised (safe to call on already-deleted files).
    """
    client = _client()
    store_id = settings.openai_vector_store_id

    # 1. Remove from vector store
    try:
        await client.beta.vector_stores.files.delete(
            vector_store_id=store_id,
            file_id=openai_file_id,
        )
        log.info(f"Removed {openai_file_id} from vector store {store_id}")
    except Exception as e:
        log.warning(f"Could not remove {openai_file_id} from vector store (may already be gone): {e}")

    # 2. Delete from OpenAI Files storage
    try:
        await client.files.delete(openai_file_id)
        log.info(f"Deleted OpenAI file {openai_file_id}")
    except Exception as e:
        log.warning(f"Could not delete OpenAI file {openai_file_id}: {e}")
