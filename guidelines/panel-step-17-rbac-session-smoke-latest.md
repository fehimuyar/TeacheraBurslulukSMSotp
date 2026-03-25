# Panel Step-17 RBAC + Session Smoke

- Timestamp: 2026-03-25T11:11:42.167Z
- overall_ready_for_step_17: **true**
- pass: 11, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| public_route_/panel/login | PASS | HTTP 200 |
| public_route_/panel/dashboard | PASS | HTTP 200 |
| public_route_/panel/password-reset | PASS | HTTP 200 |
| unauth_auth_me | PASS | HTTP 401 |
| login_role_based_redirect_markers | PASS | Found 3/3 role marker(s). |
| login_password_reset_flow_markers | PASS | Found 5/5 login flow marker(s). |
| panel_route_redirect_markers | PASS | Found 4/4 route redirect marker(s). |
| dashboard_session_guard_markers | PASS | Found 3/3 dashboard session guard marker(s). |
| preview_runtime_guard_markers | PASS | Found 4/4 preview guard marker(s) with no query bypass. |
| backend_auth_identity_enforced_markers | PASS | Found 3/3 backend auth marker(s). |
| backend_login_role_and_otp_markers | PASS | Found 6/6 backend login marker(s). |

