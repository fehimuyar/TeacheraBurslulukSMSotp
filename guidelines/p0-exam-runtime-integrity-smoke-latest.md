# P0 Exam Runtime Integrity Smoke

- Timestamp: 2026-03-24T06:54:53.297Z
- overall_pass: **true**
- pass: 5, fail: 0, warn: 0, skip: 3

## Checks

| id | status | detail |
| --- | --- | --- |
| start_session | PASS | HTTP 200 |
| status_runtime_fetch | PASS | HTTP 200 |
| status_runtime_contract | PASS | duration=2400 remaining=2396 |
| events_ingest | PASS | HTTP 200 |
| prepare_timeout_via_db | SKIP | missing_database_url |
| status_runtime_after_prepare | PASS | HTTP 200 |
| status_runtime_timed_out | SKIP | runtime.timed_out=false (db_mutation) |
| timeout_answer_block | SKIP | timed_out state could not be produced in this run. |

