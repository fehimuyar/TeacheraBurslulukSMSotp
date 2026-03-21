# Panel Phased Rollout Plan (2026-03-21)

Bu plan, panel fonksiyonlarini kademeli olarak canliya alma stratejisini sabitler.

## Faz 1 - Read-only Gozlem

- Acik yetkiler:
  - `PANEL_DASHBOARD_READ`
  - `PANEL_CANDIDATES_READ`
  - `PANEL_NOTIFICATIONS_READ`
  - `PANEL_AUDIT_READ`
- Kapali yetkiler:
  - write/update/publish/override/CRM push
- Cikis kriteri:
  - panel-step-14/16/17/18/19 PASS
  - panel-step-20 freshness gate PASS

## Faz 2 - Danisman Operasyon Aksiyonlari

- Acilan yetkiler (OPERATIONS):
  - `PANEL_CANDIDATES_ACTION`
  - `PANEL_NOTIFICATIONS_ACTION`
  - `PANEL_UNVIEWED_ACTION`
  - `PANEL_DLQ_ACTION`
- Beklenen akis:
  - gunluk randevu, no-show, follow-up, not ekleme
  - SMS/WA retry aksiyonlari
- Cikis kriteri:
  - consultant overview + candidate actions smoke PASS
  - audit kayitlari gorunur ve tutarli

## Faz 3 - Kritik Yonetici Aksiyonlari

- Sadece `SUPER_ADMIN`:
  - `PANEL_RESULTS_OVERRIDE`
  - `PANEL_RESULTS_PUBLISH`
  - `PANEL_SETTINGS_WRITE`
  - `PANEL_CRM_PUSH`
  - `PANEL_IP_POLICY_WRITE`
- Beklenen akis:
  - result review/override/publish
  - CRM push (tekil/toplu/retry)
  - canonical release gate ayarlari
- Cikis kriteri:
  - panel-step-21 PASS
  - panel-step-20 PASS (step21 freshness dahil)
  - `npm run p0:go-live:package:audit` PASS

## Operasyonel Not

- Release pipeline gate: `panel:step20:final-closeout` + `p0:go-live:package:audit` PASS olmadan deploy blok.
- Rollback: Faz bazli permission geri cekimi (role_permissions) + cron gate kapatma ile uygulanir.
