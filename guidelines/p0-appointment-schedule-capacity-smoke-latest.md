# P0 Appointment Schedule Capacity Smoke

- Timestamp: 2026-03-21T07:10:51.020Z
- overall_pass: **true**
- pass: 10, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| start_session | PASS | HTTP 200 |
| candidate_login | PASS | HTTP 200 |
| answer_autosave | PASS | HTTP 200 |
| submit_exam | PASS | HTTP 200 |
| slots_fetch | PASS | HTTP 200 |
| slots_capacity_source_valid | PASS | source=consultant_schedule |
| slots_expect_consultant_schedule | PASS | expected=consultant_schedule actual=consultant_schedule |
| book_slot | PASS | HTTP 200 |
| book_capacity_source_valid | PASS | source=consultant_schedule |
| book_expect_consultant_schedule | PASS | expected=consultant_schedule actual=consultant_schedule |

