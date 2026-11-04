from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User
from app.core.deps import CurrentUser # Changed from app.routers.auth import get_current_user
from app.services.ai import ask_rag

router = APIRouter(prefix="/ai", tags=["AI"])
settings = get_settings()

class AskRequest(BaseModel):
    question: str
    top_k: int = 6

class SuggestRequest(BaseModel):
    text: str


@router.post("/ask")
async def ask_question(
    req: AskRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if not settings.is_ai_active:
        msg = "AI provider settings are incomplete. Please review the server settings."
        if not settings.ai_enabled:
            msg = "AI features are currently disabled in system settings."
        elif not settings.openai_api_key or not settings.openai_api_key.strip():
            msg = "AI features require an OpenAI API key on the server."
            
        return {
            "answer": msg,
            "citations": [],
            "confidence": "low",
            "refused": True
        }
        
    res = await ask_rag(db, req.question, req.top_k)
    return res


@router.get("/health")
async def ai_health(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.name != "Admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
        
    from app.models.kb import Document, DocumentChunk
    from sqlalchemy import func
    
    docs_count = await db.scalar(select(func.count(Document.id)))
    chunks_count = await db.scalar(select(func.count(DocumentChunk.id)))
    
    return {
        "ai_enabled": settings.ai_enabled,
        "has_key": bool(settings.openai_api_key),
        "models": {
            "llm": settings.llm_model,
            "embeddings": settings.embeddings_model
        },
        "docs": {
            "documents": docs_count or 0,
            "chunks": chunks_count or 0
        }
    }


@router.get("/debug")
async def ai_debug(
    current_user: CurrentUser,
):
    if current_user.role.name != "Admin":
        raise HTTPException(status_code=403, detail="Admin only")
        
    key = settings.openai_api_key or ""
    return {
        "ai_enabled": settings.ai_enabled,
        "llm_model": settings.llm_model,
        "embeddings_model": settings.embeddings_model,
        "openai_key_present": bool(key),
        "openai_key_length": len(key)
    }


@router.post("/complaint-suggest")
async def suggest_complaint_meta(
    req: SuggestRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    # Retrieve existing departments and categories to ground the LLM
    from app.models.organization import Department, Category
    deps_res = await db.execute(select(Department))
    deps = deps_res.scalars().all()
    
    # Simple static fallback for suggestions if AI disabled
    default_resp = {
        "department_id": deps[0].id if deps else 1,
        "category_id": 1,
        "priority": "MEDIUM",
        "summary": "Auto-suggested summary (AI Disabled)"
    }
    
    if not settings.is_ai_active:
        default_resp["ai_disabled"] = True
        return default_resp
        
    from app.services.ai import get_openai_client
    client = get_openai_client()
    if not client:
        return default_resp
        
    # We could do a smart extraction via function calling, but let's keep it simple JSON parsing
    CATS = []
    for d in deps:
        cats_res = await db.execute(select(Category).where(Category.department_id == d.id))
        for c in cats_res.scalars().all():
            CATS.append(f"Dep: {d.name} (ID: {d.id}), Cat: {c.name} (ID: {c.id})")
            
    cat_str = "\\n".join(CATS)
    
    system_prompt = f"""You are a Complaint Classifier. 
Given the user complaint, suggest a relevant Department ID, Category ID, Priority (LOW, MEDIUM, HIGH, URGENT), and a 1-sentence summary.
Valid Departments and Categories:
{cat_str}

Output JSON ONLY with keys: department_id (int), category_id (int), priority (str), summary (str).
"""
    try:
        response = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": req.text}
            ],
            response_format={ "type": "json_object" }
        )
        import json
        content = response.choices[0].message.content
        data = json.loads(content)
        
        # Provide defaults if missing
        if "department_id" not in data: data["department_id"] = default_resp["department_id"]
        if "category_id" not in data: data["category_id"] = default_resp["category_id"]
        if "priority" not in data: data["priority"] = default_resp["priority"]
        
        return data
        
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Suggest error: {e}")
        return default_resp
