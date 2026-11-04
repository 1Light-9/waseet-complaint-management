"""SQLAlchemy 2 async engine, session factory, and dependency."""
import logging
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import event, text

from app.core.config import get_settings

log = logging.getLogger(__name__)
settings = get_settings()
is_postgres = settings.database_url.startswith("postgresql")

engine_kwargs = {
    "echo": settings.sql_echo,
    "pool_pre_ping": True,
}

if is_postgres:
    engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        connect_args={"server_settings": {"client_encoding": "UTF8"}},
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)

# Belt-and-suspenders: also SET client_encoding on every new raw connection
@event.listens_for(engine.sync_engine, "connect")
def set_utf8_on_connect(dbapi_connection, connection_record):
    """Force UTF-8 client encoding on every new connection."""
    if not is_postgres:
        return

    cursor = dbapi_connection.cursor()
    cursor.execute("SET client_encoding TO 'UTF8'")
    cursor.close()
    log.info("DB connect hook: SET client_encoding TO 'UTF8' executed.")

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

