export const TIMEZONE = 'Europe/Istanbul';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS: 'OPERATIONS',
  READ_ONLY: 'READ_ONLY',
};

export const PANEL_PERMISSIONS = [
  'PANEL_DASHBOARD_READ',
  'PANEL_CANDIDATES_READ',
  'PANEL_CANDIDATES_EXPORT',
  'PANEL_CANDIDATES_ACTION',
  'PANEL_NOTIFICATIONS_READ',
  'PANEL_NOTIFICATIONS_ACTION',
  'PANEL_UNVIEWED_READ',
  'PANEL_UNVIEWED_ACTION',
  'PANEL_DLQ_READ',
  'PANEL_DLQ_ACTION',
  'PANEL_SETTINGS_READ',
  'PANEL_SETTINGS_WRITE',
  'PANEL_AUDIT_READ',
  'PANEL_AUDIT_EXPORT',
  'PANEL_RESULTS_REVIEW',
  'PANEL_RESULTS_OVERRIDE',
  'PANEL_RESULTS_PUBLISH',
  'PANEL_CRM_PUSH',
  'PANEL_IP_POLICY_READ',
  'PANEL_IP_POLICY_WRITE',
];

export const APPLICATION_STATUS = [
  'APPLIED',
  'DUPLICATE_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

export const CREDENTIALS_SMS_STATUS = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'RETRYING',
  'DLQ',
];

export const EXAM_STATUS = [
  'WAITING',
  'OPEN',
  'STARTED',
  'SUBMITTED',
  'TIMEOUT',
  'ABANDONED',
];

export const RESULT_STATUS = ['NOT_READY', 'PUBLISHED', 'VIEWED'];

export const WA_RESULT_STATUS = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RETRYING',
  'DLQ',
];

export const NOTIFICATION_CHANNELS = ['SMS', 'WHATSAPP'];

export const CRM_EXPORT_STATUS = [
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'RETRYING',
  'DLQ',
  'CANCELLED',
];

export const CANDIDATE_GRID_COLUMNS = [
  'candidate_id',
  'application_no',
  'student_full_name',
  'grade',
  'section',
  'school_name',
  'parent_full_name',
  'parent_phone_e164',
  'application_status',
  'credentials_sms_status',
  'first_login_at',
  'exam_status',
  'exam_started_at',
  'exam_submitted_at',
  'exam_scheduled_at',
  'exam_slot_label',
  'result_status',
  'result_score',
  'result_viewed_at',
  'wa_result_status',
  'appointment_status',
  'appointment_status_at',
  'appointment_booked_at',
  'crm_export_status',
  'crm_retry_count',
  'crm_processed_at',
  'crm_error_code',
  'last_error_code',
  'operator_note_at',
  'updated_at',
];

export const NOTIFICATION_GRID_COLUMNS = [
  'job_id',
  'channel',
  'template_code',
  'recipient',
  'status',
  'retry_count',
  'next_retry_at',
  'provider_message_id',
  'sent_at',
  'delivered_at',
  'read_at',
  'error_code',
];

export const CRM_EXPORT_GRID_COLUMNS = [
  'job_id',
  'campaign_code',
  'candidate_id',
  'application_no',
  'student_full_name',
  'grade',
  'school_name',
  'status',
  'retry_count',
  'next_retry_at',
  'http_status',
  'external_reference',
  'error_code',
  'processed_at',
  'created_at',
  'updated_at',
];

export const UNVIEWED_RESULTS_COLUMNS = [
  'candidate_id',
  'student_full_name',
  'school_name',
  'grade',
  'result_published_at',
  'last_login_at',
  'wa_result_status',
  'wa_last_sent_at',
];

export const JOB_STATUS = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RETRYING',
  'DLQ',
  'CANCELLED',
];
