# P0 School Coverage Smoke

- Timestamp: 2026-03-25T14:07:15.263Z
- overall_pass: **true**
- csv_path: `/Users/aliye/Downloads/teachera-codex-push-all-20260323/guidelines/p0-school-target-130.csv`
- expected_school_count: 130
- date_tr: 2026-03-25
- campaign_code: 2026_BURSLULUK

- pass: 19
- fail: 0
- warn: 4
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
| db_total_schools_expected | PASS | db schools=863, expected>=130 |
| db_school_master_matches_csv | PASS | matched schools=130, expected>=130 |
| db_campaign_school_coverage | PASS | campaign schools=340, expected>=130 |
| db_same_day_target_app_school_count | PASS | same-day active target schools=4 |
| db_same_day_target_attr_event_coverage | PASS | All 4 active target schools have ATTRIBUTION_CAPTURED events. |
| db_same_day_target_effective_channel_coverage | WARN | Missing effective channels for active target schools: facebook, instagram, konya_avm, youtube |
| db_same_day_target_raw_channel_coverage | WARN | Raw utm_source is missing channels for active target schools: facebook, instagram, konya_avm, youtube |
| db_same_day_target_blank_effective_source | WARN | 6 attribution event(s) for active target schools have blank effective source. |
| db_same_day_target_capture_source_mix | PASS | Capture sources observed: exam_session_start=6 |
| db_same_day_target_landing_path_mix | PASS | Landing paths observed: /bursluluk-2026=6 |
| db_same_day_non_target_traffic_share | PASS | same-day campaign schools=278, target schools=4, non-target schools=274 |
| db_same_day_attr_school_coverage | PASS | legacy campaign-wide same-day attribution schools=278, expected>=130 |
| db_same_day_channel_coverage | WARN | Legacy campaign-wide raw utm_source view is missing channels: facebook, instagram, konya_avm, konya_outdoor, youtube |

