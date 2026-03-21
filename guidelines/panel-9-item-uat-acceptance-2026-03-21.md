# Panel 9-Item UAT Acceptance (2026-03-21)

Bu dokuman, panel-first planinda netlesen 9 operasyon maddesi icin kabul kriterlerini ve kanit baglantilarini sabitler.

## UAT Matrix

1. Release gate (SMS sifre + panel write/update olmadan aktivasyon yok)
- Kabul: `/api/panel/settings/release-gate` endpointi gate sonucu dondurur, legacy key ile aktivasyon 400 `legacy_gate_keys_not_supported`.
- Kanit: `guidelines/panel-step-21-settings-release-gate-smoke-latest.json`

2. Login sonrasi aday sadece kendi sinav akisini gorur (genel panel yok)
- Kabul: `/bursluluk/giris -> bekleme -> sinav -> sonuc` rotalari disinda panel route acilmaz.
- Kanit: `apps/www/src/app/components/BurslulukGirisPage.tsx`, `apps/www/src/app/components/BurslulukBeklemePage.tsx`

3. Yonetim paneli tum sonuclari adaydan once gorebilir
- Kabul: Panel `results review` listesi publish oncesi sonuclari listeler.
- Kanit: `apps/panel-api/api/panel/results/index.js`, `apps/www/src/app/components/panel/ResultReviewPanel.tsx`

4. SMS teslimat durumu panelde izlenebilir (queued/sent/delivered/failed)
- Kabul: Bildirim merkezi bu durumlari filtreleyip listeler.
- Kanit: `apps/panel-api/api/panel/notifications/index.js`, `apps/www/src/app/components/panel/NotificationCenterPanel.tsx`

5. Danisman on-yuz panel gorunumu mevcut
- Kabul: Danisman is panosu owner/follow-up/randevu odakli render edilir.
- Kanit: `apps/www/src/app/components/panel/ConsultantOverviewPanel.tsx`

6. Okul performansi gorunurlugu mevcut
- Kabul: Okul/sinif/sube dagilimi + follow-up ihtiyaci tek yuzeyde gorulur.
- Kanit: `v_school_performance` view, `ConsultantOverviewPanel` school performance tablolari

7. Aday yonetimi uctan uca gorunur
- Kabul: iletisim/sinav/sonuc/randevu/gorusme/CRM/bot alanlari panelde okunur.
- Kanit: `apps/panel-api/api/panel/candidates/index.js`, `apps/www/src/app/components/panel/CandidateOperationsPanel.tsx`

8. Bot aksiyonlari panelden izlenebilir kayit uretiyor
- Kabul: manual bot scan/tetikle aksiyonlari audit kaydi uretir.
- Kanit: `apps/ops-api/api/ops/follow-up/manual-scan.js`, `apps/panel-api/api/panel/unviewed-results/actions.js`, audit ekrani

9. Panel verileri CRM'e API ile push edilebilir
- Kabul: tekil/toplu push + retry + status gorunurlugu mevcut.
- Kanit: `apps/panel-api/api/panel/crm/index.js`, `apps/ops-api/api/ops/crm/worker.js`, `apps/www/src/app/components/panel/CrmExportPanel.tsx`

## Sonuc

- UAT karari: `PASS_9_OF_9`
- Tarih: `2026-03-21`
- Not: Bu dokuman operasyonel kabul kriteri setidir; prod smoke artifactleri step-20/step-21 zinciri ile dogrulanir.
