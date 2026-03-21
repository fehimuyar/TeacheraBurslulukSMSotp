# P0 Attribution + Remarketing Smoke

- Timestamp: 2026-03-21T10:55:53.887Z
- overall_pass: **true**
- pass: 5, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| start_session | PASS | HTTP 200 |
| db_attribution_event_payload | PASS | utm_source=google utm_medium=cpc utm_campaign=p0_attr_1774090548197 |
| db_attribution_click_ids | PASS | gclid/fbclid/msclkid persisted. |
| frontend_default_consent_optout | PASS | Tag manager default consent denies ad/analytics storage. |
| frontend_tracking_respects_consent | PASS | Tracking defaults to opt-out and checks consent before event emit. |

