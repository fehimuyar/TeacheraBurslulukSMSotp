# Panel Step-16 Ops Grid Smoke

- Timestamp: 2026-03-21T07:10:02.813Z
- overall_ready_for_step_16: **true**
- pass: 49, fail: 0, warn: 0, skip: 0

## Checks

| id | status | detail |
| --- | --- | --- |
| public_route_/panel/dashboard?view=operations&focus=candidates | PASS | HTTP 200 |
| public_route_/panel/candidates | PASS | HTTP 200 |
| public_route_/panel/notifications | PASS | HTTP 200 |
| public_route_/panel/dlq | PASS | HTTP 200 |
| public_route_/panel/unviewed-results | PASS | HTTP 200 |
| unauth_get_/api/panel/candidates | PASS | HTTP 401 |
| unauth_get_/api/panel/candidates/export?format=csv | PASS | HTTP 401 |
| unauth_get_/api/panel/notifications | PASS | HTTP 401 |
| unauth_get_/api/panel/dlq | PASS | HTTP 401 |
| unauth_get_/api/panel/unviewed-results | PASS | HTTP 401 |
| unauth_post_/api/panel/candidates/actions | PASS | HTTP 401 |
| unauth_post_/api/panel/notifications/actions | PASS | HTTP 401 |
| unauth_post_/api/panel/dlq/actions | PASS | HTTP 401 |
| unauth_post_/api/panel/unviewed-results/actions | PASS | HTTP 401 |
| bundle_index_path | PASS | Found /assets/index-DZuxQwIn.js |
| bundle_dashboard_chunk | PASS | Found assets/PanelDashboardPage-BnJr58Vh.js |
| marker_focus_candidates_route | PASS | Marker found: /panel/candidates |
| marker_candidates_api | PASS | Marker found: /api/panel/candidates |
| marker_notifications_api | PASS | Marker found: /api/panel/notifications |
| marker_dlq_api | PASS | Marker found: /api/panel/dlq |
| marker_unviewed_api | PASS | Marker found: /api/panel/unviewed-results |
| marker_col_application | PASS | Marker found: Başvuru Alındı |
| marker_col_credentials_sms | PASS | Marker found: Credentials SMS Gönderildi |
| marker_col_sms_delivery | PASS | Marker found: SMS Teslim |
| marker_col_login | PASS | Marker found: Login |
| marker_col_exam_started | PASS | Marker found: Sınava Başladı |
| marker_col_exam_completed | PASS | Marker found: Sınavı Tamamladı |
| marker_col_result_published | PASS | Marker found: Sonuç Yayınlandı |
| marker_col_result_viewed | PASS | Marker found: Sonuç Görüntülendi |
| marker_col_wa_sent | PASS | Marker found: WA Sonucu Gönderildi |
| marker_col_wa_delivery_read | PASS | Marker found: WA Delivery/Read |
| marker_col_last_error_code | PASS | Marker found: Son Hata Kodu |
| marker_col_last_operation_time | PASS | Marker found: Son İşlem Zamanı |
| marker_col_operator_note | PASS | Marker found: Operatör Notu |
| marker_filter_school | PASS | Marker found: Okul filtresi |
| marker_filter_grade | PASS | Marker found: Sınıf (tümü) |
| marker_filter_sms | PASS | Marker found: SMS durumu (tümü) |
| marker_filter_login | PASS | Marker found: Login durumu (tümü) |
| marker_filter_exam | PASS | Marker found: Sınav durumu (tümü) |
| marker_filter_result_viewed | PASS | Marker found: Sonuç görüntüleme (tümü) |
| marker_filter_wa | PASS | Marker found: WhatsApp durumu (tümü) |
| marker_action_sms_resend | PASS | Marker found: Manual SMS Resend |
| marker_action_wa_single | PASS | Marker found: Tekil WA |
| marker_action_wa_bulk | PASS | Marker found: Toplu WhatsApp Gönder |
| marker_action_result_unseen_scan | PASS | Marker found: Sonuç Görmeyen Tara |
| marker_result_unseen_mode | PASS | Marker found: result_unseen |
| marker_result_unseen_delay | PASS | Marker found: result_unseen_delay_minutes |
| marker_action_csv_export | PASS | Marker found: CSV Export |
| marker_action_xls_export | PASS | Marker found: XLS Export |

