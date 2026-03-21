# Online Bursluluk Sınav Backend Operasyon Notu

Bu doküman, `api/*` altında eklenen backend’in 10.000 aday hedefi için operasyonel çalıştırma özetidir.

## 1) Trafik ve ölçekleme
- Giriş trafiği: `POST /api/exam/session/start`
- Yoğun submit trafiği: `POST /api/exam/session/submit`
- Panel grid trafiği: `GET /api/panel/*` (sayfalama zorunlu)
- Bildirim işleme: `POST /api/notifications/worker` (queue worker)

Önerilen:
- API katmanını API Gateway/Lambda veya Vercel Functions arkasında autoscale çalıştırın.
- DB bağlantılarını pooler (PgBouncer/RDS Proxy) ile sınırlandırın.
- Worker endpoint’ini cron + paralel worker instance’larla çağırın.

## 2) Veritabanı
- Migration: `db/migrations/20260306_0001_exam_backend.sql`
- Versioned consent migration: `db/migrations/20260313_0008_kvkk_versioned_consent.sql`
- Kritik view’lar:
  - `v_candidate_operations`
  - `v_notifications`
  - `v_unviewed_results`
- Tüm panel endpoint’lerinde `page`/`per_page` zorunlu tutulur (`per_page <= 200`).
- KVKK açık rıza kayıtları `consent_records` tablosunda sürüm bazlı tutulur (`consent_version`, `legal_text_version`, `consented_at`).

## 3) Bildirim retry / DLQ
- Queue-first runtime contract:
  - Otoritatif kuyruk: `notification_jobs` (PostgreSQL)
  - Worker dequeue kaynağı: DB (`FOR UPDATE SKIP LOCKED`)
  - `SQS_QUEUE_URL` varsa: yalnız infra/ops (alarm/entegrasyon) amacıyla, runtime source-of-truth değildir
- İlk enqueue: `notification_jobs.status = QUEUED`
- Worker başarısızlığı: `RETRYING` + `next_retry_at`
- Backoff politikası: `1m -> 5m -> 15m -> 60m -> 6h`
- Retry limiti aşımı: `DLQ` + `dlq_jobs` kaydı
- Webhook race condition için: eşleşmeyen callback’ler `notification_webhook_inbox` tablosuna alınır.
- Reconciliation: worker her koşuda `notification_webhook_inbox` PENDING kayıtlarını da uygular.
- Panel aksiyonları:
  - `/api/panel/notifications/actions` -> retry/cancel/requeue
  - `/api/panel/dlq/actions` -> retry/change_template/assign/close
- Ops replay endpoint:
  - `/api/notifications/dlq-replay` -> DLQ kayıtlarını tekrar `QUEUED` durumuna alır

## 4) Güvenlik
- Panel auth: server-signed panel session token (`PANEL_SESSION_SECRET`)
- RBAC claim: token içindeki `role` claim’i DB session kaydı ile birlikte doğrulanır.
- MFA: panel login için TOTP zorunludur (`/api/panel/auth/login`).
- Anti-abuse: kritik uçlarda Redis-backed rate limit + brute-force lock fail-closed çalışır.
- Forms captcha: Turnstile server-side doğrulama zorunludur (`TURNSTILE_SECRET_KEY` olmadan forms kabul edilmez).
- Worker auth: `NOTIFICATION_WORKER_SECRET`
- Provider webhook signature: `NOTIFICATION_PROVIDER_WEBHOOK_SIGNING_SECRET`
- Signature freshness penceresi: `NOTIFICATION_PROVIDER_WEBHOOK_MAX_AGE_SECONDS`
- Sınav oturumu auth: `exam_session_tokens` (hash saklanır, raw token dönülür)

## 5) İzleme
- `GET /api/health` ile DB erişimi doğrulanır.
- Önerilen metrikler:
  - `exam_session_start_rate`
  - `exam_submit_success_rate`
  - `notification_dlq_count`
  - `panel_query_p95_ms`

## 6) Panel Auth Bootstrap
- TOTP secret üret:
  - `npm run panel:generate-totp-secret`
- Admin kullanıcı oluştur/güncelle:
  - `npm run panel:create-admin -- --email admin@teachera.com --name "Panel Admin" --password "StrongPassword!" --role SUPER_ADMIN --totp-secret "<BASE32_SECRET>"`
- Login endpoint:
  - `POST /api/panel/auth/login` body: `email`, `password`, `mfaCode`

## 7) Panel Final Closeout Freshness Gate
- Step-20 final closeout zinciri artık artifact tazeliğini zorunlu kontrol eder.
- Varsayılan operasyonel eşikler:
  - `PANEL_STEP20_ARTIFACT_MAX_AGE_HOURS=168` (step14/16/17/18/19 genel eşik)
  - `PANEL_STEP20_STEP21_MAX_AGE_HOURS=24` (step21 için daha sıkı eşik)
- Eşik aşılırsa `panel:step20:final-closeout` sonucu FAIL olur (`overall_ready_for_step_20=false`).
- Operasyon komutu:
  - `set -a; source ./.env.production.local; set +a; npm run panel:step20:final-closeout`
