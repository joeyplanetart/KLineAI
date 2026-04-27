# Nginx deployment notes

This config matches your public mapping:

- `149.71.241.228:10436` -> frontend site + `/api` reverse proxy
- `149.71.241.228:10438` -> direct backend API proxy

## 1) Build frontend

```bash
cd /Users/joey/KLineAI/frontend
npm run build
```

## 2) Run backend (production mode)

```bash
cd /Users/joey/KLineAI
ENVIRONMENT=production uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 3) Install nginx config

```bash
sudo cp /Users/joey/KLineAI/deployment/nginx/klineai.conf /etc/nginx/conf.d/klineai.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 4) Frontend env recommendation

Set in `frontend/.env`:

```env
VITE_API_BASE_URL=/api/v1
```

Then rebuild frontend.
