import { useCallback, useEffect, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import type {
  AuditSummary,
  CandidateSummary,
  DashboardPayload,
  ListSummaryPayload,
  NotificationSummary,
  SettingItem,
  SettingsPayload,
  UnviewedSummary,
} from './panelTypes';
import { buildSummaryPath, readJsonSafe } from './panelTypes';
import { isPanelPreviewRuntimeEnabled, readPanelPreviewIdentity } from './panelPreviewSession';

type UsePanelDataReturn = {
  dashboard: DashboardPayload | null;
  candidateSummary: CandidateSummary;
  notificationSummary: NotificationSummary;
  unviewedSummary: UnviewedSummary;
  auditSummary: AuditSummary;
  settingsItems: SettingItem[];
  settingsCount: number;
  isRefreshing: boolean;
  dataError: string;
  loadData: (options?: { silent?: boolean }) => Promise<void>;
};

export function usePanelData(
  appliedCampaign: string,
  appliedGlobalSearch: string,
  authRequired: boolean,
  autoRefresh: boolean,
): UsePanelDataReturn {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [candidateSummary, setCandidateSummary] = useState<CandidateSummary>({});
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary>({});
  const [unviewedSummary, setUnviewedSummary] = useState<UnviewedSummary>({});
  const [auditSummary, setAuditSummary] = useState<AuditSummary>({});
  const [settingsItems, setSettingsItems] = useState<SettingItem[]>([]);
  const [settingsCount, setSettingsCount] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataError, setDataError] = useState('');

  const loadData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (readPanelPreviewIdentity() && isPanelPreviewRuntimeEnabled()) {
        setDashboard(null);
        setCandidateSummary({});
        setNotificationSummary({});
        setUnviewedSummary({});
        setAuditSummary({});
        setSettingsItems([]);
        setSettingsCount(0);
        setDataError('');
        setIsRefreshing(false);
        return;
      }

      if (options?.silent) {
        setIsRefreshing(true);
      }
      setDataError('');

      try {
        const dashboardFilters: Record<string, unknown> = {};
        if (appliedCampaign.trim()) dashboardFilters.campaign_code = appliedCampaign.trim();
        if (appliedGlobalSearch.trim()) dashboardFilters.q = appliedGlobalSearch.trim();

        const dashboardPath = Object.keys(dashboardFilters).length
          ? `/api/panel/dashboard?filters=${encodeURIComponent(JSON.stringify(dashboardFilters))}`
          : '/api/panel/dashboard';

        const listFilters: Record<string, unknown> = {};
        if (appliedCampaign.trim()) listFilters.campaign_code = appliedCampaign.trim();

        const [dashRes, settingsRes, candidatesRes, notificationsRes, unviewedRes, auditRes] = await Promise.all([
          panelFetch(dashboardPath, { method: 'GET' }),
          panelFetch('/api/panel/settings', { method: 'GET' }),
          panelFetch(buildSummaryPath('/api/panel/candidates', listFilters), { method: 'GET' }),
          panelFetch(buildSummaryPath('/api/panel/notifications', listFilters), { method: 'GET' }),
          panelFetch(buildSummaryPath('/api/panel/unviewed-results', listFilters), { method: 'GET' }),
          panelFetch('/api/panel/audit?page=1&per_page=1', { method: 'GET' }),
        ]);

        const dashPayload = await readJsonSafe<DashboardPayload>(dashRes);
        const settingsPayload = await readJsonSafe<SettingsPayload>(settingsRes);
        const candidatesPayload = await readJsonSafe<ListSummaryPayload<CandidateSummary>>(candidatesRes);
        const notificationsPayload = await readJsonSafe<ListSummaryPayload<NotificationSummary>>(notificationsRes);
        const unviewedPayload = await readJsonSafe<ListSummaryPayload<UnviewedSummary>>(unviewedRes);
        const auditPayload = await readJsonSafe<ListSummaryPayload<AuditSummary>>(auditRes);

        setDashboard(dashRes.ok ? dashPayload : null);
        setCandidateSummary(candidatesRes.ok ? candidatesPayload?.summary || {} : {});
        setNotificationSummary(notificationsRes.ok ? notificationsPayload?.summary || {} : {});
        setUnviewedSummary(unviewedRes.ok ? unviewedPayload?.summary || {} : {});
        setAuditSummary(auditRes.ok ? auditPayload?.summary || {} : {});
        setSettingsItems(Array.isArray(settingsPayload?.items) ? settingsPayload.items : []);
        setSettingsCount(Array.isArray(settingsPayload?.items) ? settingsPayload.items.length : 0);

        if (!dashRes.ok) {
          setDataError('Panel dashboard verileri şu anda yüklenemiyor. Ekran kısmi modda açıldı.');
        }
      } catch {
        setCandidateSummary({});
        setNotificationSummary({});
        setUnviewedSummary({});
        setAuditSummary({});
        setSettingsItems([]);
        setDataError('Panel verileri alınamadı. Lütfen tekrar deneyin.');
      } finally {
        setIsRefreshing(false);
      }
    },
    [appliedCampaign, appliedGlobalSearch],
  );

  /* Initial load */
  useEffect(() => {
    if (!authRequired) {
      void loadData();
    }
  }, [authRequired, loadData]);

  /* Auto-refresh every 15s */
  useEffect(() => {
    if (!autoRefresh || authRequired) return;
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [authRequired, autoRefresh, loadData]);

  return {
    dashboard,
    candidateSummary,
    notificationSummary,
    unviewedSummary,
    auditSummary,
    settingsItems,
    settingsCount,
    isRefreshing,
    dataError,
    loadData,
  };
}
