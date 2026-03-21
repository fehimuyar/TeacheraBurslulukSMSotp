# Requirements Verification Snapshot (2026-03-21)

## Scope

- Repo: `TeacheraBurslulukSMSotp`
- Verification date: `2026-03-21`
- Baseline:
  - 32-item implementation plan
  - 130-item full requirement list

## 32-Item Plan Status

- `32 / 32` tamamlandi (kod + migration + panel yuzeyi + smoke/artifact zinciri).

Kapanan kritik farklar:

1. `consultant_slots + appointments + appointment_events` migration uyumu eklendi.
2. `v_school_performance` ve `v_consultant_workboard` view’lari eklendi.
3. 9 panel maddesi UAT kabul kriter dokumani eklendi.
4. Kademeli canliya alma plani (read-only -> operations -> critical admin actions) dokumani eklendi.

Ilgili yeni dosyalar:

- `db/migrations/20260321_0020_consultant_workboard_views_appointments.sql`
- `guidelines/panel-9-item-uat-acceptance-2026-03-21.md`
- `guidelines/panel-phased-rollout-plan-2026-03-21.md`

Canli uygulama dogrulamasi:

- `npm run db:migrate` calistirildi (`20260321_0020` dahil).
- Olusan objeler:
  - `consultant_slots`
  - `appointments`
  - `appointment_events`
  - `v_consultant_workboard`
  - `v_school_performance`

## 130-Item Requirement Status

- `129 / 130` tamamlandi.
- `1 / 130` canli operasyon verisi nedeniyle tamamlanmadi.

### Tamamlanmayan Madde

1. Madde 3: Basvuru linkinin 130 okulun tamamina kanal bazli ulastigi dogrulama.

### Canli DB Snapshot (2026-03-21)

- `schools.total_schools = 36`
- `schools_with_apps = 34`
- `ATTRIBUTION_CAPTURED` event source kirilimi: `google/cpc` gorunuyor.

Not:
- Madde 4 ve 5 kod seviyesinde kapali: attribution parametreleri backendde kayit altina aliniyor ve event contract dokumani mevcut.
- Acik kalan tek kalem, 130 okul kapsama dogrulamasinin canli data ile kapanmasi.

## Already-PASS Evidence (secili)

- `guidelines/panel-step-20-final-closeout-smoke-latest.json`
- `guidelines/panel-step-21-settings-release-gate-smoke-latest.json`
- `guidelines/p0-candidate-credentials-smoke-latest.json`
- `guidelines/p0-exam-reminder-smoke-latest.json`
- `guidelines/p0-exam-runtime-integrity-smoke-latest.json`
- `guidelines/p0-appointment-schedule-capacity-smoke-latest.json`
- `guidelines/p1-landing-apply-confirm-login-smoke-latest.json`
- `guidelines/bursluluk-remarketing-event-contract-2026.md`
- `guidelines/p2-campaign-season-automation-smoke-latest.json`
- `guidelines/p2-hybrid-result-screen-smoke-latest.json`
- `guidelines/p2-menu-footer-polish-smoke-latest.json`
