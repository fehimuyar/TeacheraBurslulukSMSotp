# P0 School Coverage Smoke

- Timestamp: 2026-03-25T09:14:58.572Z
- overall_pass: **true**
- csv_path: `/Users/aliye/Downloads/teachera-codex-push-all-20260323/guidelines/p0-school-target-130.csv`
- expected_school_count: 130
- date_tr: 2026-03-25
- campaign_code: 2026_BURSLULUK

- pass: 13
- fail: 0
- warn: 2
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
| frontend_apply_submit_includes_attribution | PASS | Landing apply submit forwards attribution into startExamSession payload. |
| db_connection | PASS | Connected to database. |
| db_upsert_school_master | SKIP | Upsert skipped (set SCHOOL_COVERAGE_UPSERT=true to enable). |
| db_total_schools_expected | PASS | db schools=705, expected>=130 |
| db_school_master_matches_csv | PASS | matched schools=130, expected>=130 |
| db_campaign_school_coverage | PASS | campaign schools=179, expected>=130 |
| db_same_day_attr_school_coverage | WARN | same-day attribution schools=113, expected>=130 |
| db_same_day_channel_coverage | WARN | Missing channels: facebook, instagram, konya_avm, konya_outdoor, youtube |

