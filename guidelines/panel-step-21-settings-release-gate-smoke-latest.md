# Panel Step-21 Settings + Release Gate Smoke

- Timestamp: 2026-03-27T09:11:36.360Z
- overall_ready_for_step_21: **true**
- pass: 7, fail: 0, warn: 0, skip: 5

## Checks

| id | status | detail |
| --- | --- | --- |
| static_settings_legacy_key_rejection_marker | PASS | Marker found. |
| static_settings_canonical_key_marker | PASS | Canonical gate markers found. |
| static_release_gate_endpoint_marker | PASS | Release-gate endpoint markers found. |
| unauth_release_gate_read | PASS | HTTP 401 |
| unauth_settings_write | PASS | HTTP 401 |
| auth_login | PASS | start:200 verify:200 |
| auth_me | PASS | HTTP 200 |
| role_super_admin_for_settings_write | SKIP | Role OPERATIONS cannot write settings. |
| release_gate_read_authenticated | SKIP | Skipped: Role OPERATIONS cannot write settings. |
| settings_baseline_open_at | SKIP | Skipped: Role OPERATIONS cannot write settings. |
| canonical_activation_attempt | SKIP | Skipped: Role OPERATIONS cannot write settings. |
| legacy_key_rejection_authenticated | SKIP | Skipped: Role OPERATIONS cannot write settings. |

