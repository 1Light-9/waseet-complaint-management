import logging
import os
import io
import tiktoken
import unicodedata
from typing import List, Optional, Tuple, Any

from app.core.config import get_settings
from app.models.kb import DocumentChunk, Document
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, desc

# Try importing extraction libraries
try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import docx
except ImportError:
    docx = None

try:
    from openai import AsyncOpenAI, RateLimitError, APIStatusError
except ImportError:
    AsyncOpenAI = None
    RateLimitError = Exception
    APIStatusError = Exception


logger = logging.getLogger(__name__)
settings = get_settings()

def get_openai_client():
    if not settings.ai_enabled or not AsyncOpenAI or not settings.openai_api_key:
        return None
    return AsyncOpenAI(api_key=settings.openai_api_key)


def get_token_count(text_content: str, model_name: str = "gpt-4o") -> int:
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")
    return len(encoding.encode(text_content))

def sanitize_text(text: Any) -> str:
    """Ensures text is fully UTF-8 compliant and null-byte free."""
    if isinstance(text, bytes):
        text = text.decode("utf-8", errors="replace")
    else:
        text = str(text)

    # Remove null bytes which can break Postgres TEXT mapping
    text = text.replace("\x00", "")
    
    # Force encode/decode to replace any rogue surrogates or broken byte sequences
    text = text.encode("utf-8", errors="replace").decode("utf-8")
    
    return text

def chunk_text(text_content: str, max_tokens: int = 600, overlap_tokens: int = 150) -> List[str]:
    """Splits text into chunks of roughly max_tokens with overlap_tokens."""
    try:
        encoding = tiktoken.encoding_for_model(settings.llm_model)
    except Exception:
        encoding = tiktoken.get_encoding("cl100k_base")
        
    tokens = encoding.encode(text_content)
    chunks = []
    
    start = 0
    token_length = len(tokens)
    while start < token_length:
        end = min(start + max_tokens, token_length)
        chunk_tokens = tokens[start:end]
        chunks.append(encoding.decode(chunk_tokens))
        if end == token_length:
            break
        start += max_tokens - overlap_tokens
    
    return chunks

async def extract_and_chunk_document(doc: Document) -> List[dict]:
    """Extracts text from a document based on mime type, returning chunks with page numbers."""
    path = doc.storage_path
    if not path or not os.path.exists(path):
        logger.error(f"File not found for document {doc.id} at {path}")
        return []

    mime_ext = doc.mime_type or ""
    
    raw_chunks = []
    
    if ("pdf" in mime_ext or path.lower().endswith('.pdf')) and PdfReader:
        with open(path, "rb") as f:
            reader = PdfReader(f)
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    raw_chunks.append({"text": sanitize_text(page_text), "page": i + 1})
    elif ("word" in mime_ext or "officedocument" in mime_ext or path.lower().endswith('.docx')) and docx:
        doc_obj = docx.Document(path)
        full_text = "\n".join([para.text for para in doc_obj.paragraphs if para.text.strip()])
        if full_text:
             raw_chunks.append({"text": sanitize_text(full_text), "page": 1})
    else:
        try:
            with open(path, "rb") as f:
                raw_bytes = f.read()
                full_text = raw_bytes.decode("utf-8", errors="replace")
            if full_text:
                raw_chunks.append({"text": sanitize_text(full_text), "page": 1})
        except Exception as e:
            logger.error(f"Error reading text document {doc.id}: {e}")

    # Now we break raw_chunks into token-sized chunks
    final_chunks = []
    for rc in raw_chunks:
        # Stage 1: pre-chunk text must be a clean str
        pre_text = rc["text"]
        assert isinstance(pre_text, str), f"pre_text is {type(pre_text)}, not str!"
        pre_text = pre_text.replace("\x00", "")
        pre_text = pre_text.encode("utf-8", "replace").decode("utf-8")
        pre_text.encode("utf-8")  # must not raise
        
        sub_chunks = chunk_text(pre_text, max_tokens=700, overlap_tokens=150)
        for sc in sub_chunks:
            # Stage 2: per-chunk sanitization
            assert isinstance(sc, str), f"chunk is {type(sc)}, not str!"
            sc = sc.replace("\x00", "")
            sc = sc.encode("utf-8", "replace").decode("utf-8")
            sc.encode("utf-8")  # must not raise — this validates the final string
            final_chunks.append({
                "text": sc,
                "page": rc["page"],
                "tokens": get_token_count(sc)
            })
            
    return final_chunks


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generates embeddings for a list of texts using OpenAI."""
    client = get_openai_client()
    if not client:
        return [[0.0] * 1536 for _ in texts]  # Mock return if offline

    try:
        response = await client.embeddings.create(
            input=texts,
            model=settings.embeddings_model
        )
        return [data.embedding for data in response.data]
    except RateLimitError as e:
        logger.error(f"OpenAI RateLimitError (Embedding): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        return [[0.0] * 1536 for _ in texts]
    except APIStatusError as e:
        logger.error(f"OpenAI APIStatusError (Embedding): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        return [[0.0] * 1536 for _ in texts]
    except Exception as e:
        logger.error(f"Error generating embeddings: type={type(e).__name__}, message={str(e)}")
        return [[0.0] * 1536 for _ in texts]


async def retrieve_context(db: AsyncSession, query: str, top_k: int = 6) -> List[Tuple[DocumentChunk, float]]:
    """Retrieves top_k chunks for a query using cosine similarity."""
    client = get_openai_client()
    if not client:
        return []

    # Get query embedding
    try:
        query_emb_resp = await client.embeddings.create(input=[query], model=settings.embeddings_model)
        query_emb = query_emb_resp.data[0].embedding
    except RateLimitError as e:
        logger.error(f"OpenAI RateLimitError (Retrieve Context): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        raise e
    except APIStatusError as e:
        logger.error(f"OpenAI APIStatusError (Retrieve Context): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        raise e
    except Exception as e:
        logger.error(f"Error embedding query: type={type(e).__name__}, message={str(e)}")
        raise e

    # Task 1: pass raw List[float] directly — pgvector/SQLAlchemy adapter handles it.
    # Do NOT cast to str or json; that is what breaks the <=> operator.
    query_emb_list: List[float] = list(query_emb)  # ensure plain list, never a string

    similarity = 1 - DocumentChunk.embedding_vector.cosine_distance(query_emb_list)

    stmt = (
        select(DocumentChunk, similarity.label("similarity"))
        .join(DocumentChunk.document)
        .where(DocumentChunk.embedding_vector.is_not(None))
        .order_by(DocumentChunk.embedding_vector.cosine_distance(query_emb_list))
        .limit(top_k)
    )

    res = await db.execute(stmt)
    return [(row.DocumentChunk, row.similarity) for row in res.all()]


# ── In-process assistant ID cache (avoids creating a new assistant per restart) ──
_cached_assistant_id: str | None = None


async def _get_or_create_assistant(client) -> str:
    """Return assistant_id from env, cache, or create a new one and cache it."""
    global _cached_assistant_id

    # 1. Prefer env-configured ID
    if settings.openai_assistant_id:
        logger.info(f"Using configured assistant: {settings.openai_assistant_id}")
        return settings.openai_assistant_id

    # 2. Return cached ID from previous startup
    if _cached_assistant_id:
        return _cached_assistant_id

    # 3. Create a new assistant with file_search + vector store
    logger.info("No OPENAI_ASSISTANT_ID configured — creating assistant at runtime.")
    assistant = await client.beta.assistants.create(
        name="Complaints MIS Knowledge Assistant",
        instructions=(
            "You are a reliable internal AI assistant. "
            "Answer questions ONLY using information from the attached knowledge base files. "
            "If the answer is not in the files, clearly say you cannot find it."
        ),
        model=settings.llm_model,
        tools=[{"type": "file_search"}],
        tool_resources={
            "file_search": {
                "vector_store_ids": [settings.openai_vector_store_id]
            }
        },
    )
    _cached_assistant_id = assistant.id
    logger.info(f"Created assistant: {_cached_assistant_id}")
    return _cached_assistant_id


async def _ask_rag_cloud(question: str) -> dict:
    """Answer using OpenAI Assistants API with file_search (openai>=1.x compatible).

    Flow: get/create assistant → create thread → add user message
          → create run → poll until completed → extract answer + citations.
    """
    from openai import AsyncOpenAI
    from fastapi import HTTPException as _HTTPException

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        assistant_id = await _get_or_create_assistant(client)
    except Exception as e:
        logger.error(f"Failed to get/create assistant: {type(e).__name__}: {e}")
        raise _HTTPException(status_code=500, detail=f"Assistant setup failed: {e}")

    try:
        # 1. Create a fresh thread
        thread = await client.beta.threads.create()

        # 2. Add the user's question as a message
        await client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=question,
        )

        # 3. Run the assistant
        run = await client.beta.threads.runs.create(
            thread_id=thread.id,
            assistant_id=assistant_id,
        )

        # 4. Poll until terminal state (max ~90 s, 45 × 2 s)
        import asyncio as _asyncio
        for _ in range(45):
            run = await client.beta.threads.runs.retrieve(
                thread_id=thread.id,
                run_id=run.id,
            )
            logger.debug(f"Run {run.id} status: {run.status}")
            if run.status in ("completed", "failed", "cancelled", "expired"):
                break
            await _asyncio.sleep(2)
        else:
            raise _HTTPException(status_code=504, detail="OpenAI run timed out after 90 s.")

        if run.status != "completed":
            raise _HTTPException(
                status_code=500,
                detail=f"OpenAI run ended with status '{run.status}': {getattr(run, 'last_error', '')}",
            )

        # 5. Retrieve the assistant's reply
        messages = await client.beta.threads.messages.list(
            thread_id=thread.id,
            order="desc",
            limit=1,
        )
        if not messages.data:
            raise _HTTPException(status_code=500, detail="No messages returned from assistant run.")

        reply = messages.data[0]  # most recent = assistant reply

    except _HTTPException:
        raise  # re-raise our own errors as-is
    except Exception as e:
        logger.error(f"Assistants API error: {type(e).__name__}: {e}")
        raise _HTTPException(status_code=500, detail=f"OpenAI Assistants API error: {e}")

    # 6. Extract answer text and file_citation annotations
    answer_text = ""
    citations = []

    for block in getattr(reply, "content", []):
        if getattr(block, "type", None) == "text":
            answer_text = block.text.value
            for ann in getattr(block.text, "annotations", []):
                if getattr(ann, "type", None) == "file_citation":
                    fc = ann.file_citation
                    citations.append({
                        "document_title": getattr(fc, "file_id", "unknown"),
                        "page": None,
                        "chunk_index": None,
                        "snippet": getattr(fc, "quote", "")[:200],
                    })

    if not answer_text:
        raise _HTTPException(status_code=500, detail="Assistant returned an empty answer.")

    # 7. De-duplicate citations
    seen: set[str] = set()
    unique: list = []
    for c in citations:
        k = c["document_title"]
        if k not in seen:
            seen.add(k)
            unique.append(c)

    return {
        "answer": answer_text,
        "citations": unique,
        "confidence": "high",
        "refused": False,
    }



async def ask_rag(db: AsyncSession, question: str, top_k: int = None) -> dict:
    """Answers a question using RAG.

    If OPENAI_VECTOR_STORE_ID is configured: uses OpenAI File Search (cloud KB).
    Otherwise: falls back to local pgvector retrieval.
    """
    # ── Feature 4: Cloud KB path ─────────────────────────────────────────────
    if settings.cloud_kb_enabled:
        logger.info("Using cloud KB (OpenAI Vector Store) for ask_rag.")
        return await _ask_rag_cloud(question)
    # ────────────────────────────────────────────────────────────────────────

    top_k = top_k or settings.rag_top_k
    client = get_openai_client()
    if not client:
        return {
            "answer": "AI features are currently disabled. Please contact the administrator.",
            "citations": [],
            "confidence": "low",
            "refused": True
        }
    try:
        retrieved = await retrieve_context(db, question, top_k)
    except RateLimitError as e:
        logger.error(f"Error in retrieve_context (RateLimitError): message={e.message}")
        return {
            "answer": "An error occurred while contacting the AI provider.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": 429,
            "error_type": "rate_limit",
            "message": "OpenAI rate limit exceeded"
        }
    except APIStatusError as e:
        logger.error(f"Error in retrieve_context (APIStatusError): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        return {
            "answer": "An error occurred while contacting the AI provider.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": getattr(e, 'status_code', 500),
            "error_type": "api_error",
            "message": getattr(e, 'message', str(e))
        }
    except Exception as e:
        logger.error(f"Error in retrieve_context Database/Internal: type={type(e).__name__}, message={str(e)}")
        return {
            "answer": "An error occurred internally while searching documents.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": 500,
            "error_type": "db_error",
            "message": "A database or system error occurred."
        }
    
    if not retrieved:
        from app.models.kb import Document
        from sqlalchemy import func, select
        docs_count = await db.scalar(select(func.count(Document.id)))
        if not docs_count or docs_count == 0:
            ans = "The knowledge base is currently empty. Please upload and index documents from the admin panel."
        else:
            ans = "I do not have enough information in the knowledge base to answer this question. You can submit a complaint so the team can handle it."
            
        return {
            "answer": ans,
            "citations": [],
            "confidence": "low",
            "refused": True
        }
        
    best_sim = max([sim for _, sim in retrieved]) if retrieved else 0.0
    logger.info(f"RAG Best similarity for '{question}': {best_sim}")
    
    if best_sim < settings.rag_sim_threshold:
        return {
            "answer": "I do not have enough information in the knowledge base to answer this question. You can submit a complaint so the team can handle it.",
            "citations": [],
            "confidence": "low",
            "refused": True
        }

    # Prepare context for LLM
    import json as _json
    context_str = ""
    chunk_map = {}
    for i, (chunk, sim) in enumerate(retrieved):
        chunk_map[i + 1] = {
            "document_title": chunk.document.title,
            "page": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "text": chunk.content
        }
        context_str += f"[{i+1}] Doc: {chunk.document.title}, Page: {chunk.page_number}\n{chunk.content}\n\n"

    # Task 3: require strict JSON output so we can parse citations reliably.
    system_prompt = f"""You are a reliable internal AI assistant.
Answer the user question using ONLY the numbered context passages below.
You MUST respond with ONLY valid JSON — no extra text, no markdown.
JSON schema:
{{"answer": "<your answer here>", "citations_used": [<list of passage numbers you used, e.g. 1,2>]}}

If unsure, still respond with the JSON schema and set citations_used to the most relevant passage number.

Context passages:
{context_str}"""

    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": question}
            ],
            temperature=0.0
        )
        raw = response.choices[0].message.content.strip()
        logger.info(f"LLM raw response: {raw[:300]}")

        # Task 3: parse citations_used from JSON; fall back to [1] on any failure.
        try:
            parsed = _json.loads(raw)
            answer = parsed.get("answer", raw)
            used_indices = parsed.get("citations_used", [1])
            if not isinstance(used_indices, list) or not used_indices:
                used_indices = [1]
        except (_json.JSONDecodeError, Exception):
            logger.warning("LLM did not return valid JSON; falling back to answer=raw, citations_used=[1]")
            answer = raw
            used_indices = [1]

        # Task 2: build citations from used_indices — never refuse just because list is empty.
        citations = []
        for idx in used_indices:
            if idx in chunk_map:
                snippet_text = chunk_map[idx]["text"]
                snippet = " ".join(snippet_text.split()[:20]) + "..."
                citations.append({
                    "document_title": chunk_map[idx]["document_title"],
                    "page": chunk_map[idx]["page"],
                    "chunk_index": chunk_map[idx]["chunk_index"],
                    "snippet": snippet
                })

        # Fallback: if citations still empty (bad indices), include top chunk
        if not citations and chunk_map:
            top = chunk_map[1]
            snippet = " ".join(top["text"].split()[:20]) + "..."
            citations.append({
                "document_title": top["document_title"],
                "page": top["page"],
                "chunk_index": top["chunk_index"],
                "snippet": snippet
            })

        confidence = "high" if best_sim >= 0.85 else "medium"

        return {
            "answer": answer,
            "citations": citations,
            "confidence": confidence,
            "refused": False
        }
    except RateLimitError as e:
        logger.error(f"Error during LLM chat (RateLimitError): message={e.message}")
        return {
            "answer": "An error occurred while contacting the AI provider.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": 429,
            "error_type": "rate_limit",
            "message": "OpenAI rate limit exceeded"
        }
    except APIStatusError as e:
        logger.error(f"Error during LLM chat (APIStatusError): status_code={getattr(e, 'status_code', 'N/A')}, message={e.message}")
        return {
            "answer": "An error occurred while contacting the AI provider.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": getattr(e, 'status_code', 500),
            "error_type": "api_error",
            "message": getattr(e, 'message', str(e))
        }
    except Exception as e:
        logger.error(f"Error during LLM chat Internal/Parsing: type={type(e).__name__}, message={str(e)}")
        return {
            "answer": "An internal error occurred while generating the response.",
            "citations": [],
            "confidence": "low",
            "refused": True,
            "error_code": 500,
            "error_type": "internal_error",
            "message": "An internal or generation error occurred."
        }
