# P0-12 Final Go-Live Operations Package (Teachera)

Bu doküman canlıya geçişte tek referans operasyon paketidir.
Amaç: kesintisiz cutover, hızlı geri dönüş, net sorumluluk, ölçülebilir SLA.

## Paket Metadata
- Version: `2026-03-12`
- Scope: `teachera.com.tr` (`www` + `exam-api` + `panel-api` + `ops-api`)
- Source of truth:
  - `guidelines/p0-12-final-go-live-operations-package.md`
  - `guidelines/p0-12-cutover-checklist.json`
  - `guidelines/p0-12-go-live-approval.json`

## Hızlı Konsolide Doğrulama (Zaman Kazandıran)
1. Tek komutlu paket audit:
```bash
npm run p0:go-live:package:audit -- --http
```
2. AWS tarafı da aynı koşuda doğrulansın istersen:
```bash
npm run p0:go-live:package:audit -- --http --aws
```

Not: Bu audit, ağır yük testlerini yeniden koşturmaz; P0-9/10/11 mevcut artefaktlarını ve canlı health gate’lerini konsolide kontrol eder.

3. Cutover + Hypercare + Rollback dry-run tatbikatı (kanıt üretir):
```bash
npm run p0:cutover:hypercare:drill -- --aws --hypercare_minutes 120 --sample_every_seconds 60
```

Çıktı artefaktları:
- `guidelines/p0-12-cutover-hypercare-rollback-latest.json`
- `guidelines/p0-12-cutover-hypercare-rollback-latest.md`

## 1) Runbook (Go-Live)
### T-24h
1. Deploy freeze başlat (feature freeze + sadece IC onaylı hotfix).
2. Prod env snapshot al:
   - `npx --yes vercel env pull .env.production.local --environment production`
   - Kritik AWS resource ID ve alarm durumlarını kaydet.
3. War-room bridge aç, rol atamalarını netleştir.

### T-2h
1. Health gates:
   - `https://exam-api.teachera.com.tr/api/health` (200)
   - `https://panel-api.teachera.com.tr/api/panel/auth/me` (401/403 beklenen)
   - `https://ops-api.teachera.com.tr/api/health` (200)
2. Worker + webhook path kontrolü:
   - scheduler tetikleme
   - signature-verified provider callback
   - queue runtime contract doğrulaması: worker `notification_jobs` kuyruğundan tüketiyor olmalı
3. Alarm kanalları (SNS/email) alarm-test ile doğrulanır.

### T-0 (Cutover)
1. Son deploy alınır (`npx --yes vercel --prod`).
2. Cutover checklist tüm kapılar DONE ise IC onayıyla live trafiğe geçilir.
3. İlk 30 dk war-room sürekli açık tutulur (5 dk aralıklarla durum raporu).

### T+24h
1. Freeze kaldırma kararı IC + Ops + Backend ortak onayı ile verilir.
2. Post-cutover raporu oluşturulur.

## 2) War-Room Roles
- Incident Commander (IC): karar, öncelik, final onay
- Ops Lead: AWS/infra, DB/Redis/SQS/CloudFront, alarm takibi
- Backend Lead: API/worker/webhook durumu ve düzeltmeler
- Frontend Lead: kullanıcı akışları ve panel UI doğrulaması
- QA Lead: smoke ve gatekeeper onayı
- Comms Owner: stakeholder bilgilendirmeleri

Rol atamaları ve primary/backup kişileri `guidelines/p0-12-go-live-approval.json` içinde tutulur.

## 3) Escalation SLA
- P0 (tam kesinti/veri kaybı riski):
  - 5 dk içinde bridge
  - 15 dk içinde mitigation plan
- P1 (kritik akış bozulması):
  - 10 dk içinde bridge
  - 30 dk içinde workaround
- P2 (degrade ama servis ayakta):
  - 30 dk içinde triage
  - 4 saat içinde kalıcı düzeltme planı

## 4) Deploy-Freeze Window
- Freeze başlangıç: `T-24 saat`
- Freeze bitiş: `T+24 saat` (stabilite koşulu ile)
- Freeze sırasında yalnızca IC onaylı hotfix

## 5) Rollback Plan
### Rollback Trigger (herhangi biri)
- P0 incident ve 15 dk içinde stabilize edilememe
- Hatalı deploy sonrası kritik akışta geri dönülemez bozulma
- DB/queue/worker tarafında operasyonel riskin artması

### Rollback Sequence
1. Son stabil deployment referansı hazır tutulur.
2. App alias/stable deployment geri dönüşü uygulanır.
3. Worker scheduler durdurulur (gerekirse).
4. Webhook fallback endpoint devreye alınır (gerekirse).
5. Rollback smoke set zorunlu:
   - health
   - exam start -> answer -> submit -> results
   - panel auth
   - worker noop/queue stabilization

## 6) Cutover Checklist (Approval Gates)
Machine-readable kaynak: `guidelines/p0-12-cutover-checklist.json`

Aşağıdaki kapılar `DONE` olmalı:
- P0-1..P0-11 audit raporları PASS
- P0-10 dashboard + alarm set aktif
- SNS alarm subscription confirmed
- Turnstile secret active ve forms captcha zorunlu
- Panel MFA zorunlu ve admin login doğrulandı
- Queue DLQ replay doğrulandı
- Queue çalışma modeli runbook ile uyumlu doğrulandı (`DB queue authoritative`, SQS infra optional)
- Panel final closeout freshness gate zorunlu çalıştırıldı:
  - `npm run panel:step20:final-closeout`
  - `npm run p0:panel:slot-visibility:smoke`
  - `npm run p0:appointment:schedule:smoke`
  - `PANEL_STEP20_ARTIFACT_MAX_AGE_HOURS` ve `PANEL_STEP20_STEP21_MAX_AGE_HOURS` eşikleri production env'de set
  - `PII_CRYPTO_STRICT=true` ve panel-api PII/AWS env seti doğrulandı
- Runbook ve rollback adımları dry-run edildi
- War-room rol ataması tamamlandı
- Final approval imzalandı

## 7) Approval (DoD için zorunlu)
Approval artefaktı: `guidelines/p0-12-go-live-approval.json`

Onay komutu:
```bash
npm run p0:go-live:approve -- \
  --incident-commander "Aliye Teachera" \
  --ops-lead "Ops Lead Name" \
  --backend-lead "Backend Lead Name" \
  --qa-lead "QA Lead Name" \
  --comms-owner "Comms Owner Name" \
  --change-ticket "GO-LIVE-2026-03-12"
```

## 8) Evidence Attachment List
- `guidelines/p0-9-target-topology-10k-15k.md`
- `guidelines/p0-10-observability-slo.md`
- `guidelines/p0-11-load-resilience-certification.md`
- `guidelines/p0-11-load-resilience-report-latest.json`
- `guidelines/p0-11-load-resilience-report-latest.md`
- `guidelines/p0-5-go-live-evidence-2026-03-11.md`
- `guidelines/p0-panel-prod-slot-visibility-smoke-latest.json`
- `guidelines/p0-panel-prod-slot-visibility-smoke-latest.md`
- `guidelines/p0-appointment-schedule-capacity-smoke-latest.json`
- `guidelines/p0-appointment-schedule-capacity-smoke-latest.md`
- `guidelines/p0-12-go-live-package-audit-latest.json`
- `guidelines/p0-12-go-live-approval.json`
