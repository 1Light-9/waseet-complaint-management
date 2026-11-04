# Waseet Server Light Version

This is a cleaned version prepared for VPS/server upload.

## What was removed

- `node_modules/`
- `.next/`, `dist/`, `build/`
- `.env` sensitive file
- macOS files such as `.DS_Store` and `__MACOSX`
- Python cache folders such as `__pycache__` and `.pytest_cache`
- TypeScript build cache files such as `*.tsbuildinfo`

## Before running on the server

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Edit `.env` and add your real values:

```bash
nano .env
```

3. Build and run with Docker:

```bash
docker compose up -d --build
```

4. Check containers:

```bash
docker compose ps
```

5. Check backend logs if needed:

```bash
docker compose logs backend --tail=100
```

## Important

Do not upload or share the real `.env` file publicly. It may contain API keys and database secrets.
