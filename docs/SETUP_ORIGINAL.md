# Waseet / Complaints MIS

Complaints management system built with Next.js, FastAPI, PostgreSQL, and pgvector.

## Local Run

Copy the example environment file first:

```bash
cp .env.example .env
```

Run everything from the repository root:

```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

## Default Local URLs

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend health: [http://localhost:8000/health](http://localhost:8000/health)
- Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

## Demo Accounts

- `admin@demo.com` / `DemoPass123!`
- `it.manager@demo.com` / `DemoPass123!`
- `it.agent@demo.com` / `DemoPass123!`
- `requester@demo.com` / `DemoPass123!`

## AI Environment Setup

Add these values to the root `.env` file to enable AI:

```env
AI_ENABLED=true
OPENAI_API_KEY=your_key_here
LLM_MODEL=gpt-4o-mini
EMBEDDINGS_MODEL=text-embedding-3-small
```

## Verification Commands

Run these from the repository root:

```bash
docker compose config
docker compose up -d --build
docker compose ps
curl http://localhost:8000/health
open http://localhost:8000/docs
open http://localhost:3000
# optional
docker compose exec backend pytest -q
```

## Troubleshooting

- `no configuration file provided` means you are not in the repository root.
- `backend cannot resolve db` means the stack was not started with `docker compose`, so the internal Docker network is missing.
- `OpenAI 429` usually means billing, quota, or project limits on the OpenAI side.
- `Failed to fetch` usually means the backend is down, `NEXT_PUBLIC_API_URL` is wrong, or there is a CORS/auth issue.

## Deployment Notes

- Use a VPS with Docker Compose.
- Do not expose PostgreSQL publicly.
- Use Nginx as a reverse proxy.
- Store secrets in the server `.env` only.

## Docker Notes

- `docker-compose.yml` is prepared for `db`, `backend`, and `frontend`.
- The backend reads environment variables from the root `.env`.
- The database host inside Docker Compose is `db`.
- Persistent volumes are configured for PostgreSQL data, complaint attachments, and knowledge-base uploads.
- The frontend reads `NEXT_PUBLIC_API_URL` from environment variables.
