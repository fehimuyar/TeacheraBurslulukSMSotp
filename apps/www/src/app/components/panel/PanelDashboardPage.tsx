import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { panelApiHref, panelFetch } from '../../api/panelApi';
import CandidateOperationsPanel from './CandidateOperationsPanel';
import ConsultantOverviewPanel from './ConsultantOverviewPanel';
import NotificationCenterPanel from './NotificationCenterPanel';
import UnviewedResultsPanel from './UnviewedResultsPanel';
import DlqOperationsPanel from './DlqOperationsPanel';
import SettingsOperationsPanel from './SettingsOperationsPanel';
import PanelAuditTrailPanel from './PanelAuditTrailPanel';
import ResultReviewPanel from './ResultReviewPanel';
import ResultsAuditExportPanel from './ResultsAuditExportPanel';
import CrmExportPanel from './CrmExportPanel';
import {
  canReadAudit,
  canReadCandidates,
  canReadDashboard,
  canReadDlq,
  canReadNotifications,
  canPushCrm,
  canReviewResults,
  canReadSettings,
  canReadUnviewed,
  resolvePanelRoleLabel,
} from './panelRoleAccess';

type PanelView = 'inbox' | 'operations' | 'tasks' | 'settings' | 'audit';
type PanelOpsFocus = 'candidates' | 'consultant' | 'notifications' | 'dlq' | 'unviewed' | 'results' | 'crm' | null;

type PanelIdentity = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  permissions?: string[];
  mfa_verified: boolean;
  session_id: string;
  password_reset_required?: boolean;
};

type DashboardErrorCodeItem = {
  error_code?: string;
  count?: number;
};

type DashboardTrendItem = {
  hour?: string;
  application_count?: number;
};

type DashboardChannelStatusItem = {
  channel?: string;
  status?: string;
  count?: number;
};

type DashboardSchoolPerformanceItem = {
  school_name?: string;
  total_applications?: number;
  class_distribution?: Record<string, number> | null;
  unviewed_results?: number;
  appointment_no_show?: number;
  crm_problematic?: number;
  follow_up_needed?: number;
};

type DashboardPayload = {
  summary?: {
    total_applications?: number;
    sms_success_rate?: number;
    first_login_rate?: number;
    exam_completion_rate?: number;
    result_view_rate?: number;
    wa_delivery_rate?: number;
    bot_followup_total_24h?: number;
    bot_followup_unviewed_24h?: number;
    bot_followup_viewed_no_appointment_24h?: number;
    bot_followup_no_show_24h?: number;
    bot_followup_problematic_24h?: number;
  };
  operations?: {
    open_dlq_jobs?: number;
    active_dlq_jobs?: number;
    last_30m_failures?: number;
    critical_error_codes?: DashboardErrorCodeItem[];
  };
  hourly_application_trend?: DashboardTrendItem[];
  channel_status_distribution?: DashboardChannelStatusItem[];
  school_performance?: DashboardSchoolPerformanceItem[];
};

type SettingsPayload = {
  items?: Array<{
    key: string;
    value: unknown;
  }>;
};

const VIEW_ITEMS: Array<{ id: PanelView; title: string; subtitle: string }> = [
  {
    id: 'inbox',
    title: 'CRM / Mobikob Inbox',
    subtitle: 'Danışman mesajları, geri dönüş talepleri ve kanal bildirimleri',
  },
  {
    id: 'operations',
    title: 'Bursluluk Operasyonu',
    subtitle: 'Sınav başvuru, tamamlama, sonuç ve bildirim KPI ekranı',
  },
  {
    id: 'tasks',
    title: 'Görevler',
    subtitle: 'Günlük operasyon takip listesi ve manuel aksiyon kuyruğu',
  },
  {
    id: 'settings',
    title: 'Ayarlar',
    subtitle: 'Panel konfigürasyonu, rol erişimi ve operasyon anahtarları',
  },
  {
    id: 'audit',
    title: 'Audit & Uyum',
    subtitle: 'İşlem log zinciri, actor-bound kayıtlar ve uyum doğrulama',
  },
];

const PANEL_VIEW_ROUTE_MAP: Record<PanelView, string> = {
  inbox: '/panel/inbox',
  operations: '/panel/operations',
  tasks: '/panel/tasks',
  settings: '/panel/settings',
  audit: '/panel/audit',
};

const defaultTasks: Array<{ label: string; to: string }> = [
  { label: 'Sonuç review/override/publish kuyruğunu kontrol et ve aksiyonları tamamla.', to: '/panel/results' },
  { label: 'CRM push kuyruğunu (status/error/retry) kontrol et ve aksiyonları tamamla.', to: '/panel/crm' },
  { label: 'DLQ kuyruğunu kontrol et ve gerekli retry/assign işlemlerini tamamla.', to: '/panel/dlq' },
  { label: 'Sonuç görüntülemeyen adaylara WhatsApp planını gözden geçir.', to: '/panel/unviewed-results' },
  { label: 'Yeni kampanya ayarlarının app_settings üzerinde aktif olduğunu doğrula.', to: '/panel/settings' },
  { label: 'Panel aday operasyon tablosunda kritik hataları tarayıp not al.', to: '/panel/candidates' },
];

function readView(raw: string | null): PanelView {
  const normalized = String(raw || '').toLowerCase();
  if (normalized === 'inbox' || normalized === 'operations' || normalized === 'tasks' || normalized === 'settings' || normalized === 'audit') {
    return normalized;
  }
  return 'inbox';
}

function readOpsFocus(raw: string | null): PanelOpsFocus {
  const normalized = String(raw || '').toLowerCase();
  if (
    normalized === 'candidates'
    || normalized === 'consultant'
    || normalized === 'notifications'
    || normalized === 'dlq'
    || normalized === 'unviewed'
    || normalized === 'results'
    || normalized === 'crm'
  ) {
    return normalized;
  }
  return null;
}

function canAccessView(view: PanelView, role?: string, permissions?: string[]) {
  if (view === 'operations') {
    return (
      canReadDashboard(role, permissions)
      || canReadCandidates(role, permissions)
      || canReadNotifications(role, permissions)
      || canReadUnviewed(role, permissions)
      || canReadDlq(role, permissions)
      || canReviewResults(role, permissions)
      || canPushCrm(role, permissions)
    );
  }
  if (view === 'inbox') {
    return canReadNotifications(role, permissions) || canReadUnviewed(role, permissions) || canPushCrm(role, permissions);
  }
  if (view === 'tasks') {
    return (
      canReadCandidates(role, permissions)
      || canReadDlq(role, permissions)
      || canReadSettings(role, permissions)
      || canReviewResults(role, permissions)
      || canPushCrm(role, permissions)
    );
  }
  if (view === 'settings') {
    return canReadSettings(role, permissions);
  }
  if (view === 'audit') {
    return canReadAudit(role, permissions);
  }
  return false;
}

function resolveAllowedView(requested: PanelView, role?: string, permissions?: string[]) {
  if (canAccessView(requested, role, permissions)) {
    return requested;
  }
  const fallbackOrder: PanelView[] = ['operations', 'inbox', 'tasks', 'settings', 'audit'];
  for (const candidate of fallbackOrder) {
    if (canAccessView(candidate, role, permissions)) {
      return candidate;
    }
  }
  return 'operations';
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatPercent(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function formatNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatHour(value: string | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatClassDistribution(value: Record<string, number> | null | undefined) {
  if (!value || typeof value !== 'object') return '-';
  const rows = Object.entries(value)
    .map(([label, count]) => ({ label: String(label), count: Number(count || 0) }))
    .filter((item) => item.label && Number.isFinite(item.count))
    .sort((a, b) => {
      const aGrade = Number.parseInt(a.label, 10);
      const bGrade = Number.parseInt(b.label, 10);
      const aNumeric = Number.isFinite(aGrade);
      const bNumeric = Number.isFinite(bGrade);
      if (aNumeric && bNumeric) return aGrade - bGrade;
      if (aNumeric) return -1;
      if (bNumeric) return 1;
      return a.label.localeCompare(b.label, 'tr');
    });
  if (rows.length === 0) return '-';
  return rows.map((item) => `${item.label}: ${formatNumber(item.count)}`).join(' • ');
}

function formatLiveClock(value: Date) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

const sectionClassName =
  'rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)]';

export default function PanelDashboardPage() {
  const [searchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<PanelView>(() => readView(searchParams.get('view')));
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [identity, setIdentity] = useState<PanelIdentity | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [settingsCount, setSettingsCount] = useState(0);
  const [campaignInput, setCampaignInput] = useState(() => String(searchParams.get('campaign') || '').trim());
  const [appliedCampaign, setAppliedCampaign] = useState(() => String(searchParams.get('campaign') || '').trim());
  const [globalSearchInput, setGlobalSearchInput] = useState(() => String(searchParams.get('q') || '').trim());
  const [appliedGlobalSearch, setAppliedGlobalSearch] = useState(() => String(searchParams.get('q') || '').trim());
  const [autoRefresh, setAutoRefresh] = useState(() => searchParams.get('refresh') !== 'off');
  const [liveClock, setLiveClock] = useState(() => new Date());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const activeOpsFocus = useMemo(() => readOpsFocus(searchParams.get('focus')), [searchParams]);
  const identityRole = identity?.role;
  const identityPermissions = identity?.permissions || [];
  const canAccessOperationsDashboard = canReadDashboard(identityRole, identityPermissions);
  const canAccessCandidates = canReadCandidates(identityRole, identityPermissions);
  const canAccessNotifications = canReadNotifications(identityRole, identityPermissions);
  const canAccessUnviewed = canReadUnviewed(identityRole, identityPermissions);
  const canAccessDlq = canReadDlq(identityRole, identityPermissions);
  const canAccessResults = canReviewResults(identityRole, identityPermissions);
  const canAccessCrmPush = canPushCrm(identityRole, identityPermissions);
  const canAccessSettings = canReadSettings(identityRole, identityPermissions);
  const canAccessAudit = canReadAudit(identityRole, identityPermissions);
  const visibleViews = useMemo(
    () =>
      identity
        ? VIEW_ITEMS.filter((item) => canAccessView(item.id, identity.role, identity.permissions || []))
        : VIEW_ITEMS,
    [identity],
  );

  const loadPanelData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (options?.silent) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage('');

      try {
        const meResponse = await panelFetch('/api/panel/auth/me', { method: 'GET' });

        if (meResponse.status === 401 || meResponse.status === 403) {
          window.location.assign('/panel/login?next=/panel/dashboard');
          return;
        }

        const mePayload = await readJsonSafe<{ identity?: PanelIdentity }>(meResponse);
        if (!meResponse.ok || !mePayload?.identity) {
          throw new Error('Panel oturumu doğrulanamadı.');
        }

        if (mePayload.identity.password_reset_required) {
          window.location.assign('/panel/password-reset');
          return;
        }
        const nextIdentity = mePayload.identity;
        const canReadDashboardData = canReadDashboard(nextIdentity.role, nextIdentity.permissions || []);
        const canReadSettingsData = canReadSettings(nextIdentity.role, nextIdentity.permissions || []);

        const dashboardFilters: Record<string, unknown> = {};
        if (appliedCampaign.trim()) {
          dashboardFilters.campaign_code = appliedCampaign.trim();
        }
        if (appliedGlobalSearch.trim()) {
          dashboardFilters.q = appliedGlobalSearch.trim();
        }
        const dashboardPath = Object.keys(dashboardFilters).length
          ? `/api/panel/dashboard?filters=${encodeURIComponent(JSON.stringify(dashboardFilters))}`
          : '/api/panel/dashboard';

        const [dashboardResponse, settingsResponse] = await Promise.all([
          canReadDashboardData ? panelFetch(dashboardPath, { method: 'GET' }) : Promise.resolve(null),
          canReadSettingsData ? panelFetch('/api/panel/settings', { method: 'GET' }) : Promise.resolve(null),
        ]);

        const dashboardPayload = dashboardResponse ? await readJsonSafe<DashboardPayload>(dashboardResponse) : null;
        const settingsPayload = settingsResponse ? await readJsonSafe<SettingsPayload>(settingsResponse) : null;

        setIdentity(nextIdentity);
        setDashboard(dashboardResponse?.ok ? dashboardPayload : null);
        setSettingsCount(Array.isArray(settingsPayload?.items) ? settingsPayload.items.length : 0);
        setLastRefreshedAt(new Date());

        if (dashboardResponse && !dashboardResponse.ok) {
          setErrorMessage('Panel dashboard verileri şu anda yüklenemiyor. Oturum doğrulandı, ekran kısmi modda açıldı.');
        }
      } catch {
        setErrorMessage('Panel verileri alınamadı. Lütfen tekrar deneyin.');
      } finally {
        if (options?.silent) {
          setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [appliedCampaign, appliedGlobalSearch],
  );

  useEffect(() => {
    const requestedView = readView(searchParams.get('view'));
    if (identity) {
      setActiveView(resolveAllowedView(requestedView, identity.role, identity.permissions || []));
    } else {
      setActiveView(requestedView);
    }
    const routeCampaign = String(searchParams.get('campaign') || '').trim();
    const routeQuery = String(searchParams.get('q') || '').trim();
    if (routeCampaign && routeCampaign !== appliedCampaign) {
      setCampaignInput(routeCampaign);
      setAppliedCampaign(routeCampaign);
    }
    if (routeQuery && routeQuery !== appliedGlobalSearch) {
      setGlobalSearchInput(routeQuery);
      setAppliedGlobalSearch(routeQuery);
    }
  }, [searchParams, appliedCampaign, appliedGlobalSearch, identity]);

  useEffect(() => {
    void loadPanelData();
  }, [loadPanelData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveClock(new Date());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadPanelData({ silent: true });
    }, 15000);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefresh, loadPanelData]);

  const viewMeta = useMemo(
    () => visibleViews.find((item) => item.id === activeView) || visibleViews[0] || VIEW_ITEMS[0],
    [activeView, visibleViews],
  );
  const criticalErrors = dashboard?.operations?.critical_error_codes || [];
  const trendRows = dashboard?.hourly_application_trend || [];
  const channelRows = dashboard?.channel_status_distribution || [];
  const schoolPerformanceRows = dashboard?.school_performance || [];
  const lastRefreshLabel = lastRefreshedAt ? formatLiveClock(lastRefreshedAt) : '-';
  const visibleTasks = useMemo(
    () =>
      defaultTasks.filter((task) => {
        if (task.to === '/panel/results') return canAccessResults;
        if (task.to === '/panel/crm') return canAccessCrmPush;
        if (task.to === '/panel/dlq') return canAccessDlq;
        if (task.to === '/panel/unviewed-results') return canAccessUnviewed;
        if (task.to === '/panel/settings') return canAccessSettings;
        if (task.to === '/panel/candidates') return canAccessCandidates;
        return true;
      }),
    [canAccessCandidates, canAccessCrmPush, canAccessDlq, canAccessResults, canAccessSettings, canAccessUnviewed],
  );

  const handleApplyGlobalFilters = () => {
    setAppliedCampaign(campaignInput.trim());
    setAppliedGlobalSearch(globalSearchInput.trim());
  };

  const handleResetGlobalFilters = () => {
    setCampaignInput('');
    setGlobalSearchInput('');
    setAppliedCampaign('');
    setAppliedGlobalSearch('');
  };

  const handleManualRefresh = () => {
    void loadPanelData({ silent: true });
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await panelFetch('/api/panel/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/panel/login');
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_18%,rgba(110,17,30,0.38),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(22,75,90,0.24),transparent_34%),linear-gradient(160deg,#00020B_0%,#000918_45%,#02122A_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.12)_0.7px,transparent_0.7px)] [background-size:13px_13px] opacity-[0.1]" />

      <div className="relative mx-auto w-full max-w-[1200px] space-y-5">
        <header className="rounded-[24px] border border-[#1A2535] bg-[#0A1323]/82 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-white/52">Teachera Panel</p>
                <h1 className="mt-2 text-[32px] font-semibold leading-[1.15] text-white sm:text-[38px]">Tek Operasyon Yüzeyi</h1>
                <p className="mt-2 text-[14px] text-white/58 sm:text-[16px]">
                  {viewMeta.title} • {viewMeta.subtitle}
                </p>
              </div>

              <div className="w-full max-w-[720px] rounded-2xl border border-[#1A273A] bg-[#071021]/82 p-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Global Filtre</p>
                <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
                  <input
                    value={campaignInput}
                    onChange={(event) => setCampaignInput(event.target.value)}
                    placeholder="Kampanya kodu (örn: 2026_BURSLULUK)"
                    className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
                  />
                  <input
                    value={globalSearchInput}
                    onChange={(event) => setGlobalSearchInput(event.target.value)}
                    placeholder="Global arama (aday, veli, tel, okul...)"
                    className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
                  />
                  <button
                    type="button"
                    onClick={handleApplyGlobalFilters}
                    className="h-[40px] rounded-xl bg-[#D92E27] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f]"
                  >
                    Uygula
                  </button>
                  <button
                    type="button"
                    onClick={handleResetGlobalFilters}
                    className="h-[40px] rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-[#2D4363]"
                  >
                    Temizle
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/68">
                <span className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-1">Saat (TR): {formatLiveClock(liveClock)}</span>
                <span className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-1">Son yenileme: {lastRefreshLabel}</span>
                <label className="inline-flex items-center gap-2 rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-1">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                    className="h-3.5 w-3.5 accent-[#D92E27]"
                  />
                  <span>15 sn otomatik yenileme</span>
                </label>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRefreshing ? 'Yenileniyor...' : 'Refresh'}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-[#1A273A] bg-[#071021]/82 px-4 py-3 text-right">
                  <p className="text-[12px] uppercase tracking-[0.14em] text-white/48">Oturum</p>
                  <p className="text-[14px] font-semibold text-white/85">{identity?.full_name || '-'}</p>
                  <p className="text-[12px] text-white/55">{resolvePanelRoleLabel(identity?.role)}</p>
                  <p className="text-[11px] text-white/45">Izin: {identityPermissions.length || 0}</p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="h-[46px] rounded-2xl border border-[#80312C] bg-[#561D1A] px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#FFC9C5] transition hover:bg-[#6B2420] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isSigningOut ? 'Çıkış...' : 'Çıkış'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {visibleViews.map((item) => {
              const active = item.id === activeView;
              return (
                <Link
                  key={item.id}
                  to={PANEL_VIEW_ROUTE_MAP[item.id]}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-[#D34840] bg-[#4B1817] text-white'
                      : 'border-[#1A273A] bg-[#071021]/82 text-white/72 hover:border-[#2D4363]'
                  }`}
                >
                  <p className="text-[13px] font-semibold uppercase tracking-[0.12em]">{item.title}</p>
                  <p className="mt-1 text-[12px] leading-[1.5] text-white/55">{item.subtitle}</p>
                </Link>
              );
            })}
          </div>
        </header>

        {errorMessage ? (
          <p className="rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[14px] text-[#FFB8B1]">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <div className={`${sectionClassName} text-[15px] text-white/72`}>Panel verileri yükleniyor...</div>
        ) : null}

        {!isLoading && activeView === 'inbox' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={sectionClassName}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">CRM / Mobikob Inbox</p>
              <h2 className="mt-2 text-[24px] font-semibold text-white">İletişim Kuyruğu</h2>
              <p className="mt-2 text-[14px] leading-[1.7] text-white/62">
                Danışmanlara atanmış görüşmeler, WhatsApp geri dönüşleri ve başvuru sonrası takip mesajları tek yerden izlenir.
              </p>
              <div className="mt-4 rounded-xl border border-[#1D3047] bg-[#0A192B]/82 p-4 text-[13px] text-white/70">
                Entegrasyon durumu: hazır yüzey. Canlı CRM/Mobikob API bağlantısı aktif olduğunda bu karta gerçek konuşma listesi bağlanır.
              </div>
              {canAccessCrmPush ? (
                <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/crm">
                    CRM Queue Paneli
                  </Link>
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/crm')} target="_blank" rel="noreferrer">
                    CRM API
                  </a>
                </div>
              ) : null}
            </section>

            <section className={sectionClassName}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Kanal Anlık Görünüm</p>
              <h2 className="mt-2 text-[24px] font-semibold text-white">SMS / WhatsApp Durumları</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[420px] text-left text-[12px] text-white/78">
                  <thead>
                    <tr className="border-b border-white/12 text-white/54">
                      <th className="px-2 py-2">Kanal</th>
                      <th className="px-2 py-2">Durum</th>
                      <th className="px-2 py-2 text-right">Adet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(channelRows.length > 0 ? channelRows.slice(0, 8) : [{ channel: '-', status: '-', count: 0 }]).map((row, index) => (
                      <tr key={`${row.channel || 'na'}-${row.status || 'na'}-${index}`} className="border-b border-white/6">
                        <td className="px-2 py-2">{row.channel || '-'}</td>
                        <td className="px-2 py-2">{row.status || '-'}</td>
                        <td className="px-2 py-2 text-right">{formatNumber(Number(row.count || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                {canAccessNotifications ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/notifications">
                    Bildirim Merkezine Git
                  </Link>
                ) : null}
                {canAccessUnviewed ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/unviewed-results">
                    Sonuç Görmeyenler
                  </Link>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {!isLoading && activeView === 'operations' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {canAccessOperationsDashboard ? (
              <section className={sectionClassName}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Bursluluk KPI</p>
                <h2 className="mt-2 text-[24px] font-semibold text-white">Operasyon Özeti</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                    <p className="text-[12px] text-white/52">Toplam Başvuru</p>
                    <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(dashboard?.summary?.total_applications)}</p>
                  </div>
                  <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                    <p className="text-[12px] text-white/52">SMS Başarı</p>
                    <p className="mt-1 text-[22px] font-semibold text-white">{formatPercent(dashboard?.summary?.sms_success_rate)}</p>
                  </div>
                  <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                    <p className="text-[12px] text-white/52">Sınav Tamamlama</p>
                    <p className="mt-1 text-[22px] font-semibold text-white">{formatPercent(dashboard?.summary?.exam_completion_rate)}</p>
                  </div>
                  <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                    <p className="text-[12px] text-white/52">Sonuç Görüntüleme</p>
                    <p className="mt-1 text-[22px] font-semibold text-white">{formatPercent(dashboard?.summary?.result_view_rate)}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                  <p className="text-[12px] uppercase tracking-[0.12em] text-white/54">Bot Otomasyon (Son 24 Saat)</p>
                  <div className="mt-2 grid gap-2 text-[12px] text-white/78 sm:grid-cols-2">
                    <p>Toplam: <span className="font-semibold text-white">{formatNumber(dashboard?.summary?.bot_followup_total_24h)}</span></p>
                    <p>Problemli: <span className="font-semibold text-white">{formatNumber(dashboard?.summary?.bot_followup_problematic_24h)}</span></p>
                    <p>Sonuç Görmedi: <span className="font-semibold text-white">{formatNumber(dashboard?.summary?.bot_followup_unviewed_24h)}</span></p>
                    <p>Gördü/Randevu Yok: <span className="font-semibold text-white">{formatNumber(dashboard?.summary?.bot_followup_viewed_no_appointment_24h)}</span></p>
                    <p>No-show: <span className="font-semibold text-white">{formatNumber(dashboard?.summary?.bot_followup_no_show_24h)}</span></p>
                  </div>
                </div>
              </section>
            ) : (
              <section className={sectionClassName}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Bursluluk KPI</p>
                <h2 className="mt-2 text-[24px] font-semibold text-white">Operasyon Özeti</h2>
                <p className="mt-3 text-[13px] text-white/64">Bu bolum icin PANEL_DASHBOARD_READ izni gerekir.</p>
              </section>
            )}

            <section className={sectionClassName}>
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Operasyon Sağlığı</p>
              <h2 className="mt-2 text-[24px] font-semibold text-white">DLQ ve Hata Takibi</h2>
              <ul className="mt-4 space-y-3 text-[14px] text-white/72">
                <li>• Açık DLQ işi: <span className="font-semibold text-white">{formatNumber(dashboard?.operations?.open_dlq_jobs)}</span></li>
                <li>• Aktif DLQ işi: <span className="font-semibold text-white">{formatNumber(dashboard?.operations?.active_dlq_jobs)}</span></li>
                <li>• Son 30 dk hata: <span className="font-semibold text-white">{formatNumber(dashboard?.operations?.last_30m_failures)}</span></li>
              </ul>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                  <p className="text-[12px] uppercase tracking-[0.12em] text-white/54">Kritik Hata Kodları</p>
                  <ul className="mt-2 space-y-1 text-[12px] text-white/78">
                    {(criticalErrors.length > 0 ? criticalErrors : [{ error_code: 'none', count: 0 }]).slice(0, 5).map((item, index) => (
                      <li key={`${item.error_code || 'none'}-${index}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{item.error_code || 'none'}</span>
                        <span className="font-semibold text-white">{formatNumber(Number(item.count || 0))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-[#1A273A] bg-[#071021]/82 p-3">
                  <p className="text-[12px] uppercase tracking-[0.12em] text-white/54">Saatlik Başvuru Trendi</p>
                  <ul className="mt-2 space-y-1 text-[12px] text-white/78">
                    {(trendRows.length > 0 ? trendRows : [{ hour: '-', application_count: 0 }]).slice(-6).map((row, index) => (
                      <li key={`${row.hour || 'none'}-${index}`} className="flex items-center justify-between gap-2">
                        <span>{formatHour(row.hour)}</span>
                        <span className="font-semibold text-white">{formatNumber(Number(row.application_count || 0))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                {canAccessCandidates ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/consultant">
                    Danisman Kartlari
                  </Link>
                ) : null}
                {canAccessCandidates ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/candidates">
                    Adaylar
                  </Link>
                ) : null}
                {canAccessNotifications ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/notifications">
                    Bildirimler
                  </Link>
                ) : null}
                {canAccessDlq ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/dlq">
                    DLQ
                  </Link>
                ) : null}
                {canAccessUnviewed ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/unviewed-results">
                    Sonuç Görmeyenler
                  </Link>
                ) : null}
                {canAccessResults ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/results">
                    Sonuç Review
                  </Link>
                ) : null}
                {canAccessCrmPush ? (
                  <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/crm">
                    CRM Queue
                  </Link>
                ) : null}
                {canAccessCandidates ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/candidates')} target="_blank" rel="noreferrer">
                    Aday API
                  </a>
                ) : null}
                {canAccessNotifications ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/notifications')} target="_blank" rel="noreferrer">
                    Bildirim API
                  </a>
                ) : null}
                {canAccessDlq ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/dlq')} target="_blank" rel="noreferrer">
                    DLQ API
                  </a>
                ) : null}
                {canAccessUnviewed ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/unviewed-results')} target="_blank" rel="noreferrer">
                    Unviewed API
                  </a>
                ) : null}
                {canAccessResults ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/results')} target="_blank" rel="noreferrer">
                    Results API
                  </a>
                ) : null}
                {canAccessCrmPush ? (
                  <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/crm')} target="_blank" rel="noreferrer">
                    CRM API
                  </a>
                ) : null}
              </div>
            </section>

            {canAccessOperationsDashboard ? (
              <section className={`${sectionClassName} lg:col-span-2`}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Okul Performansı</p>
                <h2 className="mt-2 text-[24px] font-semibold text-white">Okul Bazlı Başvuru ve Follow-up İhtiyacı</h2>
                <p className="mt-2 text-[13px] leading-[1.7] text-white/62">
                  Okul bazında başvuru yoğunluğu, sınıf hareketi ve manuel takip ihtiyacı tek tabloda izlenir.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[980px] text-left text-[12px] text-white/80">
                    <thead>
                      <tr className="border-b border-white/12 text-white/56">
                        <th className="px-2 py-2">Okul</th>
                        <th className="px-2 py-2 text-right">Başvuru</th>
                        <th className="px-2 py-2">Sınıf Hareketi</th>
                        <th className="px-2 py-2 text-right">Sonuç Görmeyen</th>
                        <th className="px-2 py-2 text-right">No-show</th>
                        <th className="px-2 py-2 text-right">CRM Sorunlu</th>
                        <th className="px-2 py-2 text-right">Follow-up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(schoolPerformanceRows.length > 0 ? schoolPerformanceRows : [{ school_name: '-', total_applications: 0 }]).slice(0, 12).map((row, index) => (
                        <tr key={`${row.school_name || 'na'}-${index}`} className="border-b border-white/6 align-top">
                          <td className="px-2 py-2">{row.school_name || '-'}</td>
                          <td className="px-2 py-2 text-right">{formatNumber(Number(row.total_applications || 0))}</td>
                          <td className="max-w-[360px] px-2 py-2">{formatClassDistribution(row.class_distribution || null)}</td>
                          <td className="px-2 py-2 text-right">{formatNumber(Number(row.unviewed_results || 0))}</td>
                          <td className="px-2 py-2 text-right">{formatNumber(Number(row.appointment_no_show || 0))}</td>
                          <td className="px-2 py-2 text-right">{formatNumber(Number(row.crm_problematic || 0))}</td>
                          <td className="px-2 py-2 text-right font-semibold text-[#FFD2CE]">{formatNumber(Number(row.follow_up_needed || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                  {canAccessCandidates ? (
                    <Link className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" to="/panel/candidates">
                      Aday Operasyonuna Git
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeOpsFocus === 'candidates' && canAccessCandidates ? (
              <CandidateOperationsPanel
                active
                seedQuery={appliedGlobalSearch}
                seedCampaignCode={appliedCampaign}
                role={identity?.role}
                permissions={identityPermissions}
              />
            ) : null}
            {activeOpsFocus === 'consultant' && canAccessCandidates ? (
              <ConsultantOverviewPanel
                active
                seedQuery={appliedGlobalSearch}
                seedCampaignCode={appliedCampaign}
                role={identity?.role}
                permissions={identityPermissions}
              />
            ) : null}
            {activeOpsFocus === 'notifications' && canAccessNotifications ? (
              <NotificationCenterPanel active role={identity?.role} permissions={identityPermissions} />
            ) : null}
            {activeOpsFocus === 'unviewed' && canAccessUnviewed ? (
              <UnviewedResultsPanel active role={identity?.role} permissions={identityPermissions} />
            ) : null}
            {activeOpsFocus === 'dlq' && canAccessDlq ? (
              <DlqOperationsPanel active role={identity?.role} permissions={identityPermissions} />
            ) : null}
            {activeOpsFocus === 'results' && canAccessResults ? (
              <>
                <ResultReviewPanel active role={identity?.role} permissions={identityPermissions} />
                <ResultsAuditExportPanel active role={identity?.role} permissions={identityPermissions} />
              </>
            ) : null}
            {activeOpsFocus === 'crm' && canAccessCrmPush ? (
              <CrmExportPanel active role={identity?.role} permissions={identityPermissions} />
            ) : null}
          </div>
        ) : null}

        {!isLoading && activeView === 'tasks' ? (
          <section className={sectionClassName}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Görevler</p>
            <h2 className="mt-2 text-[24px] font-semibold text-white">Operasyon Kontrol Listesi</h2>
            <ul className="mt-4 space-y-3 text-[14px] leading-[1.7] text-white/72">
              {visibleTasks.map((task) => (
                <li key={task.label} className="rounded-xl border border-[#1A273A] bg-[#071021]/82 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>• {task.label}</span>
                    <Link
                      to={task.to}
                      className="rounded-full border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-white/78 hover:border-[#2D4363]"
                    >
                      Aç
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {canAccessOperationsDashboard ? (
                <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/dashboard')} target="_blank" rel="noreferrer">
                  Dashboard API
                </a>
              ) : null}
              {canAccessSettings ? (
                <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/settings')} target="_blank" rel="noreferrer">
                  Settings API
                </a>
              ) : null}
              {canAccessCrmPush ? (
                <a className="rounded-full border border-[#1A273A] bg-[#071021]/82 px-3 py-2 text-white/72 hover:border-[#2D4363]" href={panelApiHref('/api/panel/crm')} target="_blank" rel="noreferrer">
                  CRM API
                </a>
              ) : null}
            </div>
          </section>
        ) : null}

        {!isLoading && activeView === 'settings' ? (
          <SettingsOperationsPanel active role={identity?.role} permissions={identityPermissions} initialCount={settingsCount} />
        ) : null}

        {!isLoading && activeView === 'audit' ? (
          <PanelAuditTrailPanel active role={identity?.role} permissions={identityPermissions} />
        ) : null}
      </div>
    </section>
  );
}
