# P0 School Send Ops Execution - 24 March 2026

## 1) Send Files (Prepared)

- Master tracker: `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-ops-tracker-latest.csv`
- Message + link list: `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-message-link-list-latest.csv`
- Urgent list (today): `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-urgent-latest.csv`
- Batch summary: `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-batches-latest.md`

## 2) Batch Order (Run in Sequence)

- Batch 01 (33): `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-batch-01.csv`
- Batch 02 (33): `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-batch-02.csv`
- Batch 03 (33): `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-batch-03.csv`
- Batch 04 (31): `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-send-priority-batch-04.csv`

## 3) Non-Negotiable Rule

- Only send `apply_url` exactly as-is.
- Never use redirect/shortener (for example `scan.page`).
- Keep UTM params unchanged.

## 4) Tracker Columns to Fill per Row

- `send_owner`
- `send_channel_actual`
- `sent_at` (ISO datetime, example: `2026-03-24T10:15:00+03:00`)
- `delivery_proof` (message id or screenshot path)
- `status` (`READY|SENT|DELIVERED|FAILED`)

## 5) Validation Commands (Run After Each Batch)

```bash
cd "/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634"
set -a
source "/Users/aliye/Documents/git mergenden-öncde-03-24-26/TeacheraBurslulukSMSotp/.env.production.local"
set +a
npm run p0:attribution:quick-check
SCHOOL_COVERAGE_REQUIRE_DB=true SCHOOL_COVERAGE_STRICT_TRAFFIC=false npm run p0:school-coverage:smoke
```

## 6) Official Requirement #3 Closure (End-of-day Strict)

```bash
cd "/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634"
set -a
source "/Users/aliye/Documents/git mergenden-öncde-03-24-26/TeacheraBurslulukSMSotp/.env.production.local"
set +a
SCHOOL_COVERAGE_REQUIRE_DB=true SCHOOL_COVERAGE_STRICT_TRAFFIC=true npm run p0:school-coverage:smoke
```

Strict close criteria:
- `db_campaign_school_coverage` = PASS
- `db_same_day_attr_school_coverage` = PASS
- `db_same_day_channel_coverage` = PASS
