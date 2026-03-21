# Panel Step-14 Closeout Smoke

- Timestamp: 2026-03-21T07:09:59.596Z
- overall_ready_for_step_14: **true**
- pass: 21, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| public_route_/panel/login | PASS | HTTP 200 |
| public_route_/panel/dashboard | PASS | HTTP 200 |
| public_route_/panel/audit | PASS | HTTP 200 |
| unauth_/api/panel/auth/me | PASS | HTTP 401 |
| unauth_/api/panel/dashboard | PASS | HTTP 401 |
| unauth_/api/panel/candidates | PASS | HTTP 401 |
| unauth_/api/panel/notifications | PASS | HTTP 401 |
| unauth_/api/panel/dlq | PASS | HTTP 401 |
| unauth_/api/panel/unviewed-results | PASS | HTTP 401 |
| unauth_/api/panel/settings | PASS | HTTP 401 |
| unauth_/api/panel/audit | PASS | HTTP 401 |
| unauth_/api/panel/audit/export?format=csv | PASS | HTTP 401 |
| bundle_index_path | PASS | Found /assets/index-DZuxQwIn.js |
| bundle_dashboard_chunk | PASS | Found assets/PanelDashboardPage-BnJr58Vh.js |
| marker_audit_view | PASS | Marker found: Audit & Uyum |
| marker_audit_route | PASS | Marker found: /panel/audit |
| marker_audit_api | PASS | Marker found: /api/panel/audit |
| marker_audit_export_api | PASS | Marker found: audit/export |
| marker_csv_export_button | PASS | Marker found: CSV Export |
| marker_xls_export_button | PASS | Marker found: XLS Export |
| marker_read_only_lock | PASS | Marker found: READ_ONLY modu |

