# Panel Step-21 Settings + Release Gate Smoke

- Timestamp: 2026-03-20T20:58:13.036Z
- overall_ready_for_step_21: **true**
- pass: 11, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| static_settings_legacy_key_rejection_marker | PASS | Marker found. |
| static_settings_canonical_key_marker | PASS | Canonical gate markers found. |
| static_release_gate_endpoint_marker | PASS | Release-gate endpoint markers found. |
| unauth_release_gate_read | PASS | HTTP 401 |
| unauth_settings_write | PASS | HTTP 401 |
| auth_login | PASS | HTTP 200 |
| auth_me | PASS | HTTP 200 |
| release_gate_read_authenticated | PASS | HTTP 200 |
| settings_baseline_open_at | PASS | No baseline found; generated probe exam_open_at because release-gate is currently BLOCKED. |
| canonical_activation_attempt | PASS | HTTP 409 |
| legacy_key_rejection_authenticated | PASS | HTTP 400 |

