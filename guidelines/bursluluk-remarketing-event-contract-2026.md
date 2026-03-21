# Bursluluk 2026 Remarketing Event Contract

Bu sozlesme, basvuru funnel'i icin ziyaret/baslatma/tamamlama eventlerini ve kanal parametrelerini standardize eder.

## Required Channel Params

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term` (opsiyonel)
- `utm_content` (opsiyonel)
- `gclid` (Google Ads)
- `fbclid` (Meta)
- `msclkid` (Microsoft Ads)
- `landing_path`
- `landing_url`
- `referrer`

## Funnel Events

1. `page_view`
- Trigger: landing ekrani yuklendiginde.
- Payload: `page_path`, `page_title`, `attribution.*`

2. `form_start`
- Trigger: bursluluk basvuru formuna ilk odak.
- Payload: `form_id=bursluluk_2026_apply`, `attribution.*`

3. `lead_form_submit_attempt`
- Trigger: basvuru gonder tusuna basildiginda.
- Payload: `form_subject=bursluluk_apply`, `field_count`, `attribution.*`

4. `lead_form_submit_success`
- Trigger: `/api/exam/session/start` 200 dondugunde.
- Payload: `delivery_method=exam_session_start_api`, `campaign_code`, `attribution.*`

5. `lead_form_submit_failure`
- Trigger: basvuru API hata dondugunde.
- Payload: `error_message`, `attribution.*`

6. Backend persistence event: `ATTRIBUTION_CAPTURED`
- Trigger: `session/start` icinde attribution payload geldiginde.
- Storage: `activity_events.event_payload`
- Payload: UTM + click-id + landing/referrer degerleri.

## Channel Mapping Policy

- Konya billboard/QR ve AVM ekranlari:
  - `utm_source=konya_outdoor`
  - `utm_medium=qr`
  - `utm_campaign=<flight_code>`
  - `utm_content=billboard` veya `avm_screen`

- Sosyal medya:
  - `utm_source=instagram|facebook|youtube`
  - `utm_medium=paid_social`
  - `utm_campaign=<campaign_code>`

## Validation

- Smoke: `npm run p0:attribution:smoke`
- DB check: `activity_events` icinde `ATTRIBUTION_CAPTURED` satiri ve payload anahtarlari dogrulanir.
