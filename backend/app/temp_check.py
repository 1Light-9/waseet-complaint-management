import asyncio, binascii
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async def run():
    async with AsyncSessionLocal() as db:
        res = await db.execute(text("SELECT encode(content::bytea, 'hex') FROM document_chunks LIMIT 1"))
        hexx = res.scalar()
        print('Hex length:', len(hexx))
        print('Last 10 hex:', hexx[-10:])
        if hexx.endswith('d8'):
            print('CRITICAL: String physically ends with d8 in the database!!')

asyncio.run(run())
