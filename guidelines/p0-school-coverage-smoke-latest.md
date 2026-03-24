# P0 School Coverage Smoke

- Timestamp: 2026-03-24T07:00:56.308Z
- overall_pass: **false**
- csv_path: `/Users/aliye/Documents/New project/TeacheraBurslulukSMSotp-cc0439a-local-20260324-083634/guidelines/p0-school-target-130.csv`
- expected_school_count: 130
- date_tr: 2026-03-24
- campaign_code: 2026_BURSLULUK

- pass: 11
- fail: 3
- warn: 0
- skip: 1

## Checks

| id | status | detail |
| --- | --- | --- |
| csv_path_not_placeholder | PASS | CSV path looks valid. |
| csv_file_exists | PASS | CSV file found. |
| csv_headers_required | PASS | All required headers present (8). |
| csv_parse_valid_lines | PASS | All lines parsed. |
| csv_school_count_expected | PASS | unique schools=130, expected>=130 |
| csv_no_duplicate_school_names | PASS | No duplicate school names. |
| csv_channel_fields_complete | PASS | All rows have school/channel/source/medium fields. |
| csv_channel_mix_present | PASS | CSV channel sources: facebook, instagram, konya_avm, konya_outdoor, youtube |
| db_connection | PASS | Connected to database. |
| db_upsert_school_master | SKIP | Upsert skipped (set SCHOOL_COVERAGE_UPSERT=true to enable). |
| db_total_schools_expected | PASS | db schools=557, expected>=130 |
| db_school_master_matches_csv | PASS | matched schools=130, expected>=130 |
| db_campaign_school_coverage | FAIL | campaign schools=32, expected>=130 |
| db_same_day_attr_school_coverage | FAIL | same-day attribution schools=1, expected>=130 |
| db_same_day_channel_coverage | FAIL | Missing channels: facebook, instagram, konya_avm, konya_outdoor, youtube |

