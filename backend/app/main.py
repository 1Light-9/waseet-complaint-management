import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import engine
from app.routers import auth, admin, complaints, sla, reference_data, reports, docs, ai, kb

settings = get_settings()
log = logging.getLogger("uvicorn.error")

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"AI_ENABLED flag: {settings.ai_enabled}")
    has_key = bool(settings.openai_api_key and settings.openai_api_key.strip())
    log.info(f"OPENAI_API_KEY present: {has_key}")
    if settings.is_ai_active:
        log.info(f"AI features ACTIVE. Models: [LLM: {settings.llm_model}] [Embeddings: {settings.embeddings_model}]")
    else:
        log.warning("AI features are DISABLED system-wide (AI_ENABLED=false or missing OPENAI_API_KEY).")
        
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Internal Complaints Management Information System with AI-powered Knowledge Base assistant. "
        "Academic MIS Graduation Project."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(complaints.router)
app.include_router(sla.router)
app.include_router(reference_data.router)
app.include_router(reports.router)
app.include_router(docs.router)
app.include_router(ai.router)
app.include_router(kb.router)


# ── System endpoints ──────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.app_env,
    }


@app.get("/version", tags=["System"])
async def version():
    return {
        "version": settings.app_version,
        "app_name": settings.app_name,
        "ai_enabled": settings.is_ai_active,
        "environment": settings.app_env,
    }

from sqlalchemy import text
from app.core.database import get_db
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

@app.get("/db/debug", tags=["System"])
async def debug_db(db: AsyncSession = Depends(get_db)):
    if settings.database_url.startswith("sqlite"):
        return {
            "database": "sqlite",
            "path": settings.database_url,
        }

    res_client = await db.execute(text("SHOW client_encoding;"))
    res_server = await db.execute(text("SHOW server_encoding;"))
    return {
        "client_encoding": res_client.scalar(),
        "server_encoding": res_server.scalar()
    }
