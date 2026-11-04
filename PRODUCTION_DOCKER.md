# Waseet Production Docker

هذا الإعداد مخصص للإنتاج: يشغل الواجهة كـ Next standalone، والباكند بـ `uvicorn` بدون reload، ويضع PostgreSQL داخل شبكة Docker بدون فتح منفذ `5432` للعالم الخارجي.

## الملفات المهمة

- `docker-compose.prod.yml`: تشغيل الإنتاج.
- `backend/Dockerfile.prod`: صورة FastAPI للإنتاج.
- `frontend/Dockerfile.prod`: صورة Next.js للإنتاج.
- `infra/nginx.conf`: reverse proxy يوجه `/` للواجهة و`/api` للباكند.
- `.env.production.example`: قالب متغيرات الإنتاج بدون أسرار حقيقية.

## تشغيل الإنتاج على السيرفر

```bash
cp .env.production.example .env.production
```

عدل `.env.production` قبل التشغيل:

- غير `POSTGRES_PASSWORD` إلى كلمة قوية.
- غير `SECRET_KEY` إلى قيمة عشوائية قوية.
- اجعل `CORS_ORIGINS=https://waseetproject.com,https://www.waseetproject.com`.
- اترك `NEXT_PUBLIC_API_URL=/api` إذا كان الموقع والباكند على نفس الدومين.
- فعّل متغيرات OpenAI فقط إذا تريد ميزات الذكاء الاصطناعي وقاعدة المعرفة السحابية.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python -m app.seed
```

## الفحص بعد التشغيل

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 frontend
curl http://SERVER_IP/api/health
```

## تجهيز zip نظيف للرفع

لا ترفع `.env` أو `.env.production` ولا ترفع مجلدات البناء والتبعيات. استخدم:

```bash
zip -r waseet-production.zip . \
  -x ".env" ".env.local" ".env.production" \
  -x "frontend/node_modules/*" "frontend/.next/*" "frontend/tsconfig.tsbuildinfo" \
  -x "backend/__pycache__/*" "backend/**/__pycache__/*" "backend/.pytest_cache/*" \
  -x "backend/tests/*" "backend/test_*.py" "backend/debug_*.py" "backend/check_key.py" \
  -x "__MACOSX/*" ".DS_Store"
```

ثم أنشئ `.env.production` مباشرة على السيرفر من `.env.production.example`.

## قاعدة البيانات مغلقة

في ملف الإنتاج لا يوجد:

```yaml
ports:
  - "5432:5432"
```

لذلك لا يمكن الوصول إلى PostgreSQL من خارج السيرفر مباشرة. الوصول الإداري يكون من داخل الحاوية فقط:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec db psql -U waseet -d waseet_db
```

## رفع ملفات قاعدة المعرفة

رفع ملفات قاعدة المعرفة يبقى متاحًا من لوحة الإدارة عبر المسار الذي يمر من Nginx إلى الباكند:

```text
https://waseetproject.com/api/admin/docs/upload
```

تم ضبط `client_max_body_size 50m` في `infra/nginx.conf`. إذا تحتاج ملفات أكبر، ارفع القيمة هناك ثم أعد تشغيل nginx:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart nginx
```

ملفات الرفع محفوظة في Docker volumes:

- `docs_data`: مستندات قاعدة المعرفة.
- `uploads_data`: مرفقات الشكاوى.
- `postgres_data`: بيانات PostgreSQL.

## HTTPS

الإعداد الحالي يفتح HTTP على المنفذ `80`. للإنتاج الفعلي استخدم SSL/HTTPS عبر واحد من الخيارات:

- Nginx خارجي على السيرفر مع Certbot.
- Cloudflare أمام السيرفر.
- Caddy أو Traefik كطبقة أمامية.

بعد تفعيل HTTPS اجعل الدومين النهائي في `.env.production`:

```env
CORS_ORIGINS=https://waseetproject.com,https://www.waseetproject.com
NEXT_PUBLIC_API_URL=/api
```
