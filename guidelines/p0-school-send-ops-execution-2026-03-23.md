# P0 School Send Ops Execution - 23 March 2026

## 1) Dispatch Source Files

- Tracker (master): `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/p0-school-send-ops-tracker-latest.csv`
- Ready-only list: `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/p0-school-send-ops-ready-latest.csv`
- Message+link list: `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/p0-school-message-link-list-latest.csv`
- Urgent send list (today): `/Users/aliye/Downloads/TeacheraBurslulukSMSotp/guidelines/p0-school-send-priority-urgent-latest.csv`

## 2) Mandatory Tracker Fields

Fill these columns per school row:
- `send_owner`
- `send_channel_actual`
- `sent_at` (ISO date-time, example: `2026-03-23T16:10:00+03:00`)
- `delivery_proof` (screenshot path or message-id)
- `status` (`READY|SENT|DELIVERED|FAILED`)

## 3) Dispatch Rule

- Start with all `status=READY` rows.
- Use `message_sms` / `message_whatsapp` directly from the row.
- Do not change UTM params in `apply_url`.
- Use direct URL as-is. Do **not** pass through shorteners/redirectors (for example `scan.page`) because UTM attribution is lost.

## 3.1) UTM Integrity Quick Check (after first send batch)

```bash
cd /Users/aliye/Downloads/TeacheraBurslulukSMSotp
set -a
source ./.env.production.local
set +a
npm run p0:attribution:quick-check
```

Expected:
- `with_utm_source > 0`
- `observed_channels` starts filling (`facebook`, `instagram`, `konya_avm`, `konya_outdoor`, `youtube`)

## 4) Mid-day Evidence Check (DB, non-strict)

```bash
cd /Users/aliye/Downloads/TeacheraBurslulukSMSotp
set -a
source ./.env.production.local
set +a
SCHOOL_COVERAGE_REQUIRE_DB=true SCHOOL_COVERAGE_STRICT_TRAFFIC=false npm run p0:school-coverage:smoke
```

Target: overall PASS, traffic coverage checks can be WARN during rollout window.

## 5) End-of-day Official Closure (Strict)

```bash
cd /Users/aliye/Downloads/TeacheraBurslulukSMSotp
set -a
source ./.env.production.local
set +a
SCHOOL_COVERAGE_REQUIRE_DB=true SCHOOL_COVERAGE_STRICT_TRAFFIC=true npm run p0:school-coverage:smoke
```

Target for Requirement #3 closure:
- `db_campaign_school_coverage` = PASS
- `db_same_day_attr_school_coverage` = PASS
- `db_same_day_channel_coverage` = PASS

## 6) Current Baseline (23 March 2026)

Last non-strict DB run shows:
- campaign schools: `21 / 130` (WARN)
- same-day attribution schools: `3 / 130` (WARN)
- same-day channel coverage: missing expected channels (WARN)

This is expected before full dispatch + traffic ingestion.

## 7) Stop Condition

Requirement #3 is officially closed only when strict run is PASS.
