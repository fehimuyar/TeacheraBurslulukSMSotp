# Teachera - Premium Dil Eğitimi Platformu

Modern, minimal ve premium bir dil eğitimi web uygulaması. React, Motion (Framer Motion) ve Tailwind CSS kullanılarak geliştirilmiştir.

## ✨ Özellikler

### 🎨 Tasarım & UX
- **Premium Animasyonlar**: Motion (Framer Motion) ile smooth, profesyonel animasyonlar
- **Minimal & Modern**: Temiz, kullanıcı dostu arayüz
- **Responsive Tasarım**: Tüm cihazlarda mükemmel görünüm
- **Smooth Scroll**: Yumuşak sayfa geçişleri
- **Micro-interactions**: Hover effects, transitions ve delightful details

### 🚀 Teknik Özellikler
- **React 18**: Modern React hooks ve best practices
- **Motion/React**: Premium animasyon kütüphanesi
- **Tailwind CSS v4**: Utility-first CSS framework
- **TypeScript**: Type-safe kod
- **Lucide Icons**: Modern, özelleştirilebilir iconlar

### 📱 Bileşenler
- **LoadingScreen**: Animasyonlu yükleme ekranı
- **Navigation**: Sticky, animated navigation bar
- **MobileMenu**: Full-screen mobile menü
- **Hero**: Parallax effectli hero section
- **HowItWorks**: Feature kartları
- **Methodology**: Premium içerik gösterimi
- **Programs**: Dil programları grid
- **Gallery**: Masonry-style görsel galeri
- **FAQ**: Animated accordion FAQ
- **Footer**: Comprehensive footer

## 🎯 İyileştirmeler

### Orijinal Tasarımdan Yapılan İyileştirmeler

1. **Animasyonlar**
   - Loading screen animasyonu
   - Scroll-based parallax effects
   - Smooth section transitions
   - Hover micro-animations
   - Stagger animations for lists

2. **UX İyileştirmeleri**
   - Active section highlighting
   - Smooth scroll to section
   - Interactive FAQ accordion
   - Enhanced button states
   - Mobile-first responsive design

3. **Performance**
   - Optimized component structure
   - Lazy loading ready
   - Efficient re-renders
   - Modern CSS with Tailwind v4

4. **Accessibility**
   - Semantic HTML
   - ARIA labels
   - Keyboard navigation
   - Focus states

## 🛠 Geliştirme

### Kurulum
```bash
pnpm install
```

### Çalıştırma
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

## 🧱 Monorepo Runtime Split (Active)

Repo artık runtime-bazlı fiziksel ayrımı içerir:

- `apps/www` → `teachera.com.tr` (frontend)
- `apps/exam-api` → `exam-api.teachera.com.tr`
- `apps/panel-api` → `panel-api.teachera.com.tr`
- `apps/ops-api` → `ops-api.teachera.com.tr`
- `packages/shared/backend` → API runtime’ların ortak backend modülleri

Hızlı runtime doğrulama:
```bash
npm run runtime:verify
```

Shared backend tek kaynak doğrulaması:
```bash
npm run sync:shared-backend
npm run check:shared-backend-sync
```

Legacy root runtime mirror (read-only/deprecated) doğrulaması:
```bash
npm run sync:legacy-runtime
npm run check:legacy-runtime-sync
```

Not:
- `packages/shared/backend` canonical kaynaktır.
- `api/_lib` ve `apps/*/api/_lib` içerikleri otomatik üretilir; manuel düzenleme yapılmaz.
- `api/**` (entrypoint) dosyaları legacy/local compatibility mirror olarak `apps/*/api` kaynaklarından üretilir; manuel düzenleme yapılmaz.

App bazlı deploy komutları:
```bash
npm run deploy:www:prod
npm run deploy:exam-api:prod
npm run deploy:panel-api:prod
npm run deploy:ops-api:prod
```

Vercel multi-project link/bootstrap (aynı repodan 4 ayrı proje):
```bash
npm run vercel:setup:multi-project
```

Tek komutta domain attach + deploy + smoke:
```bash
npm run vercel:setup:multi-project:full
```

Domain + DNS + TLS doğrulama (DoD audit):
```bash
npm run domain:dns:tls:audit
```

Ek not: `ops-api` tarafında cron başlık doğrulaması (`CRON_SECRET`) için değerlerin whitespace içermemesi zorunludur.

## 🧩 Online Sınav Backend (V1)

Bu repo artık seviye tespit/bursluluk operasyonu için backend endpoint’lerini içerir.

### Migration
`db/migrations/*.sql` dosyaları aşağıdaki tabloları ve panel view’larını oluşturur/günceller:
- `campaigns`, `schools`, `guardians`, `candidates`, `applications`
- `consent_records` (KVKK versioned consent kayıtları)
- `exam_attempts`, `exam_answers`, `exam_session_tokens`, `results`
- `notification_jobs`, `notification_events`, `dlq_jobs`, `activity_events`, `app_settings`
- `notification_webhook_inbox` (webhook reconciliation için)
- panel performansı için `v_candidate_operations`, `v_notifications`, `v_unviewed_results` view’ları

Uygulama:
```bash
npm run db:migrate
```
`db:migrate` script’i `db/migrations/*.sql` dosyalarını sırayla uygular.

Panel admin bootstrap:
```bash
npm run panel:create-admin -- --email admin@teachera.com --name "Panel Admin" --password "StrongPassword!" --role SUPER_ADMIN --phone "+9053XXXXXXXX"
# opsiyonel legacy TOTP:
# npm run panel:create-admin -- --email admin@teachera.com --name "Panel Admin" --password "StrongPassword!" --role SUPER_ADMIN --totp-secret "<BASE32_SECRET>"
```

### API Uçları
- `POST /api/exam/session/start`
- `POST /api/exam/session/answer`
- `POST /api/exam/session/submit`
- `GET /api/exam/results/:attemptId`
- `GET /api/panel/dashboard`
- `GET /api/panel/candidates`
- `GET /api/panel/candidates/export`
- `POST /api/panel/candidates/actions`
- `GET /api/panel/notifications`
- `POST /api/panel/notifications/actions`
- `GET /api/panel/unviewed-results`
- `POST /api/panel/unviewed-results/actions`
- `GET /api/panel/dlq`
- `POST /api/panel/dlq/actions`
- `GET|PUT /api/panel/settings`
- `GET /api/panel/settings/release-gate`
- `POST /api/panel/auth/login`
- `GET /api/panel/auth/me`
- `POST /api/panel/auth/logout`
- `GET /api/panel/audit`
- `POST /api/notifications/worker`
- `POST /api/notifications/provider-webhook`
- `GET|POST /api/notifications/dlq-replay`
- `GET|POST /api/ops/observability/collect`
- `GET /api/health`

### Release Gate (Canonical Gate Keys)
- Aktivasyon niyeti sadece canonical gate key'lerle hesaplanır:
  - `bursluluk.exam_force_open` (`true` olduğunda aktivasyon niyeti oluşur)
  - `bursluluk.exam_open_at` (geçerli datetime olduğunda aktivasyon niyeti oluşur)
- Legacy gate key'ler (`exam.force_open`, `exam.open_at`, `bursluluk.campaign.exam_force_open`, `bursluluk.campaign.exam_open_at`) release-gate aktivasyon niyeti üretmez.
- Legacy gate key ile `PUT /api/panel/settings` çağrısı `400 legacy_gate_keys_not_supported` döner.
- `GET /api/panel/settings/release-gate` response gövdesi:
  - `campaign_code`
  - `release_gate.passed`, `release_gate.enabled`, `release_gate.checked_at`
  - `release_gate.checks[]` (`code`, `passed`, `metrics`, `thresholds`, `reasons`)
  - `release_gate.failed_checks[]`

### Hybrid Phase-2: Host Boundary Guard + Service Env Preflight
- API host + route boundary guard merkezi olarak aktiftir (`api/_lib/http.js`).
- Guard parametreleri:
  - `SERVICE_RUNTIME=exam-api|panel-api|ops-api`
  - `EXPECTED_SERVICE_HOST` (zorunlu, runtime canonical host)
  - `EXPECTED_SERVICE_HOSTS` (opsiyonel legacy allowlist; set edilirse `EXPECTED_SERVICE_HOST` içermeli)
  - `EXPECTED_EXAM_API_HOSTS`, `EXPECTED_PANEL_API_HOSTS`, `EXPECTED_OPS_API_HOSTS` (önerilen strict runtime host mapping)
  - `SERVICE_HOST_GUARD_MODE=off|warn|enforce`
  - `SERVICE_ROUTE_GUARD_MODE=off|warn|enforce` (default: SERVICE_HOST_GUARD_MODE)
- `SERVICE_RUNTIME` set edilmediğinde runtime path’ten infer edilir:
  - `/api/exam/*`, `/api/forms` → `exam-api`
  - `/api/panel/*` → `panel-api`
  - `/api/notifications/*`, `/api/ops/*` → `ops-api`
- Önerilen production ayarı: `SERVICE_HOST_GUARD_MODE=enforce`.

Service-level env preflight (fail-fast):
```bash
npm run service-env:preflight
npm run service-env:preflight:exam-api
npm run service-env:preflight:panel-api
npm run service-env:preflight:ops-api
npm run service-env:preflight:www
```

### Frontend Entegrasyonu
`src/app/components/PlacementExamPage.tsx` dosyası artık sınav oturumunu backend’den başlatır ve submit işlemini
`/api/exam/session/submit` ile tamamlar.

### Ölçekleme Notu (10.000 aday)
- DB sorguları sözleşme kolonlarına göre indekslenmiştir.
- Bildirimler `notification_jobs` + worker akışı ile asenkron işlenir.
- Queue-first runtime sözleşmesi: **otoritatif kuyruk `notification_jobs` (PostgreSQL)** tablosudur.
- `SQS_QUEUE_URL` tanımlı olsa bile bu sürümde SQS, runtime dequeue kaynağı değil; infra/ops entegrasyonu içindir.
- Retry/backoff politikası: `1m -> 5m -> 15m -> 60m -> 6h`, ardından DLQ.
- Eşleşmeyen provider callback’leri `notification_webhook_inbox` tablosuna alınır; worker her koşuda reconcile eder.
- Retry / DLQ yönetimi panel aksiyonlarıyla desteklenir.
- API’ler sayfalama (`page`, `per_page`) ve filtreli listeleme sözleşmesine uyumludur.
- Sonuç görüntüleme durumu yalnızca aday sonucu açtığında `VIEWED` olur (panel görüntülemesi işaretlemez).

### Worker / Cron
- `api/notifications/worker` artık `GET` ve `POST` kabul eder.
- `api/ops/exam-open-broadcast` ops scheduler uç noktasıdır; sınav açıldığında toplu `EXAM_OPEN_SMS` kuyruğa alınır.
- `api/ops/unviewed-results/auto-whatsapp` ops scheduler uç noktasıdır; sonucu görüntülemeyen adaylara gecikmeli WA kuyruğu üretir.
- `api/ops/campaign-season-sync` ops scheduler uç noktasıdır; kampanya sezon penceresine göre canonical gate key'lerini (`bursluluk.exam_force_open`, `bursluluk.exam_open_at`) otomatik günceller.
- Vercel cron her dakika worker’ı çağıracak şekilde `vercel.json` içinde tanımlıdır.
- Worker doğrudan DB queue (`notification_jobs`) tüketir; SQS yokluğu worker doğruluğunu bozmaz.
- Worker ownership `ops-api` runtime’a sabitlenmiştir (`SERVICE_RUNTIME=ops-api`, `NOTIFICATION_WORKER_RUNTIME=ops-api`).
- Duplicate tetiklemelere karşı process-level advisory lock uygulanır; aynı anda tek worker koşusu aktif olur.
- Güvenlik için `NOTIFICATION_WORKER_SECRET` veya `CRON_SECRET` set edilmelidir.
- Provider webhook endpoint’i HMAC-SHA256 signature doğrular (`NOTIFICATION_PROVIDER_WEBHOOK_SIGNING_SECRET`).
- Manuel tetikleme örneği:
```bash
curl -X POST "https://ops-api.teachera.com.tr/api/notifications/worker?limit=100&reconcile_limit=100&worker_secret=YOUR_SECRET"
curl -X POST "https://ops-api.teachera.com.tr/api/ops/exam-open-broadcast?limit=500&worker_secret=YOUR_SECRET"
curl -X POST "https://ops-api.teachera.com.tr/api/ops/unviewed-results/auto-whatsapp?limit=250&delay_minutes=30&worker_secret=YOUR_SECRET"
curl -X POST "https://ops-api.teachera.com.tr/api/ops/campaign-season-sync?worker_secret=YOUR_SECRET"
```

Campaign season automation settings (`app_settings`):
- `bursluluk.season.automation.enabled` (`true/false`)
- `bursluluk.season.automation.open_at` (ISO datetime)
- `bursluluk.season.automation.close_at` (ISO datetime)
- `bursluluk.season.automation.next_open_at` (opsiyonel ISO datetime, sezon kapanışı sonrası bir sonraki dönem)
- `bursluluk.season.automation.force_open_within_window` (opsiyonel, default `true`)

### Panel Auth (P0-6 Hardened)
- Panel uçları artık client-provided role/header ile yetkilendirme yapmaz.
- Kimlik doğrulama sadece server-signed session token ile yapılır (Bearer veya HttpOnly cookie).
- Session claim’leri: `sub`, `sid`, `role`, `mfa`, `iat`, `exp`.
- Token doğrulama sonrası DB’de `admin_sessions` + `admin_users` kontrolü yapılır.
- Varsayılan login akışı SMS OTP'dir:
  - adım-1: email+şifre ile OTP challenge üretilir ve SMS kuyruğuna yazılır
  - adım-2: OTP code + challenge ile oturum açılır
- Legacy TOTP fallback (`PANEL_LOGIN_ALLOW_TOTP=true`) opsiyoneldir.
- Session politikası (app-level):
  - HttpOnly + Secure + SameSite + Priority cookie bayrakları zorunlu
  - idle timeout (`PANEL_SESSION_IDLE_TIMEOUT_MINUTES`) ve absolute expiry (`PANEL_SESSION_TTL_MINUTES`) birlikte uygulanır
  - eşzamanlı aktif oturum limiti (`PANEL_MAX_ACTIVE_SESSIONS`) aşıldığında eski oturumlar revoke edilir
  - şifre reset sonrası session rotate edilir (yeni token + yeni `admin_sessions` kaydı)
- `PANEL_API_KEYS` modeli kaldırılmıştır.

### Anti-Abuse (P0-7)
- Kritik uçlarda Redis-backed rate limit fail-open değildir; Redis yoksa istek `503` ile reddedilir.
- App-level CORS allowlist enforce edilir (`CORS_GUARD_MODE=enforce`):
  - allowlist dışı origin istekleri `403 origin_not_allowed`
  - preflight (`OPTIONS`) allowlist + yöntem/header kuralları ile doğrulanır
- Brute-force koruması:
  - Panel login: IP + email bazlı fail counter/lock
  - Exam session auth: IP + token fingerprint bazlı fail counter/lock
  - Forms: IP + contact bazlı fail counter/lock
- Turnstile server doğrulaması zorunludur:
  - `TURNSTILE_SECRET_KEY` yoksa `/api/forms` istekleri `503 turnstile_not_configured` döner.
  - Geçersiz/eksik token `403 captcha_failed` döner.

### PII Protection + Audit (P0-8)
- PII alanları (öğrenci/veli ad-soyad, veli telefon/e-posta) artık şifreli kolonlarda tutulur:
  - `candidates.full_name_enc`, `candidates.full_name_hash`
  - `guardians.full_name_enc`, `guardians.phone_e164_enc`, `guardians.email_enc`, `guardians.phone_e164_hash`
- Şifreleme modeli KMS-backed data-key envelope yapısıdır:
  - `PII_KMS_ENCRYPTED_DATA_KEY_B64`, `PII_KMS_REGION`, `PII_KMS_KEY_ID`
  - lookup/dedupe için `PII_LOOKUP_HMAC_KEY`
- `PII_CRYPTO_STRICT=true` üretimde önerilen canonical moddur:
  - panel-api env setinde `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` zorunlu olmalıdır.
  - PII/KMS env değerleri literal `\n` ve çift-tırnak bozulması içermemelidir.
- Panelde PII erişimi role-scoped:
  - `SUPER_ADMIN`, `OPERATIONS`: full PII
  - `READ_ONLY`: masked PII
- Audit log append-only + hash-chain:
  - `audit_log_entries`, `audit_log_chain_head`
  - update/delete trigger ile engellenir
  - panel operasyonları actor-bound olarak zincire yazılır

Backfill (mevcut plain PII satırlarını şifreli alana taşı + redakte et):
```bash
npm run p0:backfill-pii -- --limit 1000
```

### P0-9 Speed Run (Infra Topology Audit)
- Time-saving quality bundle:
```bash
npm run p0:quick
```
- Consolidated topology audit (boundaries + managed infra evidence):
```bash
npm run p0:topology:audit -- --http --aws
```
- Autodiscover + audit (single command, fastest):
```bash
npm run p0:topology:autodiscover
```
- Required topology spec:
  - `guidelines/p0-9-target-topology-10k-15k.md`

### P0-10 Speed Run (Observability + SLO Alarms)
- Dashboard + alarm seti oluştur/güncelle:
```bash
npm run p0:observability:provision
```
- Collector endpoint + AWS kaynak doğrulama:
```bash
npm run p0:observability:audit -- --http --aws
```
- Tek komutlu hızlı P0-10 akışı:
```bash
npm run p0:observability:all
```
- Kılavuz:
  - `guidelines/p0-10-observability-slo.md`

Collector endpoint:
- `GET|POST /api/ops/observability/collect` (CRON_SECRET/Bearer auth)
- Vercel cron ile 5 dakikada bir tetiklenir (`vercel.json`).

### P0-11 Speed Run (Certified Load + Resilience)
- Tek komutta burst + outage + backlog recovery + signed report:
```bash
npm run p0:load-resilience:certify
```
- İmza doğrulama:
```bash
npm run p0:load-resilience:verify-signature
```
- Tek satır full akış:
```bash
npm run p0:load-resilience:all
```
- Üretilen dosyalar:
  - `guidelines/p0-11-load-resilience-report-latest.json`
  - `guidelines/p0-11-load-resilience-report-latest.md`
- Kılavuz:
  - `guidelines/p0-11-load-resilience-certification.md`

## 📂 Proje Yapısı

```
src/
├── app/
│   ├── components/
│   │   ├── LoadingScreen.tsx
│   │   ├── Navigation.tsx
│   │   ├── MobileMenu.tsx
│   │   ├── Hero.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── Methodology.tsx
│   │   ├── Programs.tsx
│   │   ├── Gallery.tsx
│   │   ├── FAQ.tsx
│   │   └── Footer.tsx
│   └── App.tsx
├── styles/
│   ├── fonts.css
│   ├── theme.css
│   └── index.css
└── imports/ (Figma assets)
```

## 🎨 Renk Paleti

- **Primary Red**: #E51E25
- **Dark Green**: #334E48
- **Black**: #09090F
- **Light Beige**: #F3EBD1
- **Off White**: #EEEBF5

## 🔤 Fontlar

- **Neutraface 2 Text**: Primary font family
- **Retro Signature**: Decorative headings
- **Luxury Diamond/Gold**: Special titles

## 📝 Notlar

- Tüm bileşenler modern React patterns kullanır
- Motion animasyonları performans için optimize edilmiştir
- Figma'dan import edilen assetler korunmuştur
- Custom font'lar CDN üzerinden yüklenir

## 🚀 Gelecek İyileştirmeler

- [ ] Dark mode support
- [ ] i18n (çoklu dil desteği)
- [ ] Blog section
- [ ] Student dashboard
- [ ] Booking system integration
- [ ] Real-time chat support
- [ ] Video testimonials
- [ ] Interactive level test

---

**Teachera** - Konuşarak Öğren 🗣️
`POST /api/exam/session/start` için versioned consent sözleşmesi:
- `consent.kvkkApproved = true` (zorunlu)
- `consent.consentVersion` (zorunlu, örn: `KVKK_v1_2026-03-13`)
- `consent.legalTextVersion` (opsiyonel, default: consentVersion)
- `consent.contactConsent` (opsiyonel)
- `consent.source` (opsiyonel)

### Env/Secret Segmentasyonu + Rotasyon (Prod)
Bu repo, 4 ayrı runtime için secret scope zorlamasını ve rotasyon kanıtını tek komutta denetler:

```bash
npm run env:secret:gate
```

Scope/rotation audit tek başına:
```bash
npm run env:secret-scope:audit
```

Forbidden/deprecated env temizliği (önce dry-run, sonra apply):
```bash
npm run env:secret-scope:cleanup:dry
npm run env:secret-scope:cleanup
```

Prod smoke tek başına:
```bash
npm run env:secret:smoke
```

Kaynak dosya:
- `config/secret-scope-matrix.json`

Notlar:
- Audit, Vercel production env listesini proje bazında okur (`apps/www`, `apps/exam-api`, `apps/panel-api`, `apps/ops-api`).
- Rotasyon doğrulaması için kritik key’lerin yanında `*_ROTATED_AT` marker env’leri zorunludur.
- `deprecated.global` listesi eski env adlarının tüm projelerden kaldırıldığını doğrular.

### P0-10 Servis Bazlı Dashboard + Alarm Ayrıştırması
Observability artık servis bazlı ayrışır:
- `www`
- `exam`
- `panel`
- `ops`

Provision:
```bash
npm run p0:observability:provision
```

Audit (collector + AWS):
```bash
npm run p0:observability:audit -- --http --aws
```

Notlar:
- Dashboard/alarm isimleri global env’den türetilir (`OBSERVABILITY_DASHBOARD_NAME`, `OBSERVABILITY_ALARM_PREFIX`) ve servis-scope suffix ile ayrılır.
- İstersen servis bazında override edebilirsin (`..._WWW`, `..._EXAM`, `..._PANEL`, `..._OPS`).
- `OBSERVABILITY_ALARM_ACTIONS_REQUIRED=true` (default) iken her servis alarmı için SNS action zorunludur.
