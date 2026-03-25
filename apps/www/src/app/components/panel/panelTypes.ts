/* ── Panel Shared Types ── */

export type PanelView =
  | 'home'
  | 'applications'
  | 'scholarship'
  | 'results'
  | 'operations'
  | 'reports'
  | 'exam-builder'
  | 'system-status'
  | 'users'
  | 'appointments'
  /* legacy compat */
  | 'candidates'
  | 'automation'
  | 'crm'
  | 'integrations'
  | 'security'
  | 'settings';

export type PanelFocus =
  /* operations sub-tabs */
  | 'exam-assign'
  | 'whatsapp-triggers'
  | 'sms'
  | 'api-status'
  | 'schools'
  | 'programs'
  | 'banks'
  | 'exam-sessions'
  | 'pipeline'
  | 'automation-rules'
  /* reports sub-tabs */
  | 'sales'
  | 'school-reports'
  | 'sms-reports'
  | 'wp-reports'
  /* users sub-tabs */
  | 'roles'
  | 'accounts'
  /* appointments sub-tabs */
  | 'schedule'
  | 'daily'
  | 'advisor-list'
  | 'advisor-perf'
  /* legacy compat */
  | 'tasks'
  | 'candidates'
  | 'unviewed'
  | 'notifications'
  | 'dlq'
  | 'randevu'
  | 'advisors'
  | null;

export type PanelIdentity = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  mfa_verified: boolean;
  session_id: string;
  password_reset_required?: boolean;
};

export type DashboardErrorCodeItem = {
  error_code?: string;
  count?: number;
};

export type DashboardTrendItem = {
  hour?: string;
  application_count?: number;
};

export type DashboardChannelStatusItem = {
  channel?: string;
  status?: string;
  count?: number;
};

export type DashboardAdminOverview = {
  active_users?: number;
};

export type DashboardAppointmentSummary = {
  appointment_booked?: number;
  appointment_attended?: number;
  appointment_no_show?: number;
};

export type DashboardRecentActionItem = {
  id?: string;
  created_at?: string;
  actor_name?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown> | null;
};

export type DashboardPayload = {
  summary?: {
    total_applications?: number;
    sms_success_rate?: number;
    first_login_rate?: number;
    exam_completion_rate?: number;
    result_view_rate?: number;
    wa_delivery_rate?: number;
  };
  operations?: {
    open_dlq_jobs?: number;
    active_dlq_jobs?: number;
    last_30m_failures?: number;
    critical_error_codes?: DashboardErrorCodeItem[];
  };
  admin_overview?: DashboardAdminOverview;
  appointment_summary?: DashboardAppointmentSummary;
  recent_actions?: DashboardRecentActionItem[];
  hourly_application_trend?: DashboardTrendItem[];
  channel_status_distribution?: DashboardChannelStatusItem[];
};

export type SettingItem = {
  key: string;
  value: unknown;
  updated_by?: string | null;
  updated_at?: string | null;
};

export type SettingsPayload = {
  items?: SettingItem[];
};

export type CriticalActionDraft = {
  id: string;
  title: string;
  description: string;
  impact: string;
};

export type CandidateSummary = {
  total_candidates?: number;
  exam_completed?: number;
  result_viewed?: number;
  wa_problematic?: number;
};

export type NotificationSummary = {
  total_jobs?: number;
  dlq_jobs?: number;
  failed_jobs?: number;
  successful_jobs?: number;
};

export type UnviewedSummary = {
  total_unviewed?: number;
  wa_problematic?: number;
  wa_reached?: number;
};

export type AuditSummary = {
  total_entries?: number;
  admin_events?: number;
  panel_actions?: number;
  chain_last_hash?: string | null;
  chain_updated_at?: string | null;
};

export type ListSummaryPayload<T> = {
  summary?: T;
};

export type NavigationSection = 'ana-operasyon' | 'yonetim' | 'sistem';

export type NavigationItem = {
  id: PanelView;
  title: string;
  subtitle: string;
  live: boolean;
  section: NavigationSection;
  superAdminOnly?: boolean;
  defaultFocus?: PanelFocus;
  badgeKey?: string;
};

/* ── Formatting Helpers ── */

export function formatPercent(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return `%${Number(value).toFixed(1)}`;
}

export function formatNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDisplayString(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function buildDashboardHref(options: {
  view: PanelView;
  focus?: PanelFocus;
  campaign?: string;
  query?: string;
  autoRefresh?: boolean;
}) {
  const params = new URLSearchParams();
  params.set('view', options.view);
  if (options.focus) params.set('focus', options.focus);
  if (options.campaign?.trim()) params.set('campaign', options.campaign.trim());
  if (options.query?.trim()) params.set('q', options.query.trim());
  if (options.autoRefresh === false) params.set('refresh', 'off');
  return `/panel/dashboard?${params.toString()}`;
}

export function buildSummaryPath(basePath: string, filters: Record<string, unknown>) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('per_page', '1');
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }
  return `${basePath}?${params.toString()}`;
}
