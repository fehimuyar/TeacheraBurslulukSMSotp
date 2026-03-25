# P0 Exam Runtime Integrity Smoke

- Timestamp: 2026-03-25T06:10:07.263Z
- overall_pass: **true**
- pass: 8, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| start_session | PASS | HTTP 200 |
| status_runtime_fetch | PASS | HTTP 200 |
| status_runtime_contract | PASS | duration=2400 remaining=2397 |
| events_ingest | PASS | HTTP 200 |
| prepare_timeout_via_db | PASS | db_timeout_forced |
| status_runtime_after_prepare | PASS | HTTP 200 |
| status_runtime_timed_out | PASS | runtime.timed_out=true |
| timeout_answer_block | PASS | HTTP 409 error=attempt_time_limit_reached |

