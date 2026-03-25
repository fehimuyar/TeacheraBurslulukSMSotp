import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AppointmentsPanel from './AppointmentsPanel';
import ApplicationsInboxPanel from './ApplicationsInboxPanel';
import CandidateOperationsPanel from './CandidateOperationsPanel';
import DlqOperationsPanel from './DlqOperationsPanel';
import ExamBuilderPanel from './ExamBuilderPanel';
import HomeDashboardPanel from './HomeDashboardPanel';
import NotificationCenterPanel from './NotificationCenterPanel';
import OperationsCenterPanel from './OperationsCenterPanel';
import PanelAuditTrailPanel from './PanelAuditTrailPanel';
import ReportsPanel from './ReportsPanel';
import ResultsScholarshipPanel from './ResultsScholarshipPanel';
import SystemStatusPanel from './SystemStatusPanel';
import UserPermissionPanel from './UserPermissionPanel';
import PanelSidebar from './PanelSidebar';
import PanelTopbar from './PanelTopbar';
import SettingsOperationsPanel from './SettingsOperationsPanel';
import UnviewedResultsPanel from './UnviewedResultsPanel';
import { NAVIGATION_ITEMS } from './panelNavigationConfig';
import { normalizePanelRole } from './panelPermissions';
import type { CriticalActionDraft, PanelFocus, PanelView } from './panelTypes';
import { usePanelAuth } from './usePanelAuth';
import { usePanelData } from './usePanelData';
import {
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelSubNavTabs,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from './panelUi';

/* ── View/focus resolution ── */

function readView(raw: string | null, _focus: string | null): PanelView {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return 'home';
  /* Legacy compat redirects */
  if (normalized === 'inbox' || normalized === 'crm') return 'applications';
  if (normalized === 'tasks') return 'home';
  if (normalized === 'audit') return 'security';
  if (normalized === 'candidates') return 'scholarship';
  if (normalized === 'automation') return 'operations';
  /* Direct match against navigation items */
  const directMatch = NAVIGATION_ITEMS.find((item) => item.id === normalized);
  if (directMatch) return directMatch.id;
  return 'home';
}

function readFocus(raw: string | null): PanelFocus {
  const normalized = String(raw || '').trim().toLowerCase();
  const known: PanelFocus[] = [
    'tasks', 'candidates', 'unviewed', 'notifications', 'dlq', 'randevu', 'advisors',
    'exam-assign', 'whatsapp-triggers', 'sms', 'api-status', 'schools', 'programs', 'banks', 'exam-sessions', 'pipeline', 'automation-rules',
    'sales', 'school-reports', 'sms-reports', 'wp-reports', 'roles', 'accounts',
    'schedule', 'daily', 'advisor-list', 'advisor-perf',
  ];
  if (known.includes(normalized as PanelFocus)) return normalized as PanelFocus;
  return null;
}

function resolvePanelLoginHref() {
  if (typeof window === 'undefined') return '/panel/login?next=%2Fpanel%2Fdashboard';
  const nextPath = `${window.location.pathname}${window.location.search}` || '/panel/dashboard';
  return `/panel/login?next=${encodeURIComponent(nextPath)}`;
}

function statusChipClassName(tone: 'critical' | 'watch' | 'healthy' | 'neutral') {
  if (tone === 'critical') return 'border-[#C59292] bg-[#6B333A] text-white';
  if (tone === 'watch') return 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]';
  if (tone === 'healthy') return 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]';
  return 'border-[#DED4C5] bg-[#FBF7F0] text-[#6F675D]';
}

/* ── Planned module placeholder ── */

function PlannedModulePanel({ title, description }: { title: string; description: string }) {
  return (
    <section className={panelSurfaceClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={panelEyebrowClassName}>Yapım Aşamasında</p>
          <h2 className={panelLargeTitleClassName}>{title}</h2>
          <p className={panelDescriptionClassName}>{description}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] ${statusChipClassName('neutral')}`}>Yakında</span>
      </div>
    </section>
  );
}

/* ── Critical Action Modal ── */

function PanelCriticalActionModal({ draft, onClose, onComplete }: { draft: CriticalActionDraft | null; onClose: () => void; onComplete: (msg: string) => void }) {
  const [reason, setReason] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [mailCode, setMailCode] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => { if (draft) { setReason(''); setSmsCode(''); setMailCode(''); setLocalError(''); } }, [draft]);
  if (!draft) return null;
  const canComplete = Boolean(reason.trim()) && (smsCode.trim().length === 6 || mailCode.trim().length === 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2B24]/18 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-[760px] rounded-[30px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.98)_0%,rgba(252,247,240,0.96)_100%)] p-6 shadow-[0_28px_90px_rgba(76,58,35,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div><p className={panelEyebrowClassName}>Kritik İşlem Özeti</p><h3 className={panelTitleClassName}>{draft.title}</h3><p className={panelDescriptionClassName}>{draft.description}</p></div>
          <button type="button" onClick={onClose} className={panelSmallButtonClassName}>Kapat</button>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Neden</p>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bu kritik aksiyon neden gerekiyor?" className="mt-2 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]" />
          </div>
          <div className="space-y-3">
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>SMS OTP</p>
              <input value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 haneli kod" className={`mt-2 w-full ${panelCompactInputClassName}`} />
            </div>
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>Mail OTP (Fallback)</p>
              <input value={mailCode} onChange={(e) => setMailCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 haneli kod" className={`mt-2 w-full ${panelCompactInputClassName}`} />
            </div>
          </div>
        </div>
        {localError && <PanelFeedbackMessage className="mt-4" tone="error">{localError}</PanelFeedbackMessage>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={panelSecondaryButtonClassName}>Vazgeç</button>
          <button type="button" onClick={() => { if (!canComplete) { setLocalError('Neden + 6 haneli OTP gerekli.'); return; } onComplete(`${draft.title} tamamlandı.`); }} className={panelPrimaryButtonClassName}>Onayla</button>
        </div>
      </div>
    </div>
  );
}

/* ── Page Intro ── */

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <section className={panelSurfaceClassName}>
      <p className={panelEyebrowClassName}>{eyebrow}</p>
      <h2 className={panelLargeTitleClassName}>{title}</h2>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

/* ═══════════════════════════════════════
   MAIN DASHBOARD SHELL
   ═══════════════════════════════════════ */

export default function PanelDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeView = useMemo(() => readView(searchParams.get('view'), searchParams.get('focus')), [searchParams]);
  const activeFocus = useMemo(() => readFocus(searchParams.get('focus')), [searchParams]);
  const [campaignInput, setCampaignInput] = useState(() => String(searchParams.get('campaign') || '').trim());
  const [appliedCampaign, setAppliedCampaign] = useState(() => String(searchParams.get('campaign') || '').trim());
  const [appliedGlobalSearch, setAppliedGlobalSearch] = useState(() => String(searchParams.get('q') || '').trim());
  const [autoRefresh] = useState(() => searchParams.get('refresh') !== 'off');
  const [successMessage, setSuccessMessage] = useState('');
  const [criticalActionDraft, setCriticalActionDraft] = useState<CriticalActionDraft | null>(null);

  const { identity, isLoading: authLoading, authRequired, errorMessage: authError, isSigningOut, handleSignOut } = usePanelAuth();
  const { dashboard, candidateSummary, notificationSummary, unviewedSummary, auditSummary, settingsItems, settingsCount, isRefreshing, dataError, loadData } = usePanelData(appliedCampaign, appliedGlobalSearch, authRequired, autoRefresh);

  const errorMessage = authError || dataError;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const rc = String(searchParams.get('campaign') || '').trim();
    const rq = String(searchParams.get('q') || '').trim();
    if (rc !== appliedCampaign) { setAppliedCampaign(rc); setCampaignInput(rc); }
    if (rq !== appliedGlobalSearch) setAppliedGlobalSearch(rq);
  }, [searchParams, appliedCampaign, appliedGlobalSearch]);

  const showGlobalTopbarFilters = activeView !== 'applications';

  const handleSubTabSelect = (view: string, focus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', view);
      next.set('focus', focus);
      return next;
    });
  };

  /* Badge counts from data */
  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const pendingApps = (dashboard?.summary?.total_applications ?? 0) - (candidateSummary.exam_completed ?? 0);
    if (pendingApps > 0) counts.applications_pending = pendingApps;
    const alerts = (Number(dashboard?.operations?.open_dlq_jobs || 0) > 0 ? 1 : 0) + (Number(dashboard?.operations?.last_30m_failures || 0) > 0 ? 1 : 0);
    if (alerts > 0) counts.system_alerts = alerts;
    return counts;
  }, [dashboard, candidateSummary]);

  const renderCurrentView = () => {
    if (activeView === 'home') return <HomeDashboardPanel dashboard={dashboard} candidateSummary={candidateSummary} notificationSummary={notificationSummary} unviewedSummary={unviewedSummary} auditSummary={auditSummary} settingsItems={settingsItems} appliedCampaign={appliedCampaign} role={identity?.role} />;
    if (activeView === 'applications') return <ApplicationsInboxPanel role={identity?.role} />;
    if (activeView === 'scholarship' || activeView === 'candidates') return (
      <div className="space-y-5">
        <PageIntro eyebrow="Bursluluk Başvuruları" title="Aday operasyonu ve süreç takibi">
          <PanelSubNavTabs items={[{ label: 'Aday Listesi', focus: 'candidates' as const }, { label: 'Sonuç Görmeyenler', focus: 'unviewed' as const }]} activeFocus={(activeFocus || 'candidates') as string} onSelect={(f) => handleSubTabSelect('scholarship', f)} />
        </PageIntro>
        {(activeFocus || 'candidates') === 'unviewed'
          ? <UnviewedResultsPanel active role={identity?.role} permissions={identity?.permissions} />
          : <CandidateOperationsPanel active seedQuery={appliedGlobalSearch} seedCampaignCode={appliedCampaign} role={identity?.role} permissions={identity?.permissions} />}
      </div>
    );
    if (activeView === 'results') return <ResultsScholarshipPanel role={identity?.role} />;
    if (activeView === 'operations') return <OperationsCenterPanel role={identity?.role} permissions={identity?.permissions} focus={activeFocus || 'exam-assign'} campaignCode={appliedCampaign} />;
    if (activeView === 'reports') return <ReportsPanel role={identity?.role} focus={activeFocus || 'sales'} />;
    if (activeView === 'appointments') return <AppointmentsPanel role={identity?.role} focus={activeFocus || 'schedule'} />;
    if (activeView === 'exam-builder') return <ExamBuilderPanel role={identity?.role} />;
    if (activeView === 'system-status') return <SystemStatusPanel />;
    if (activeView === 'users') return <UserPermissionPanel role={identity?.role} permissions={identity?.permissions} focus={activeFocus || 'roles'} />;
    if (activeView === 'automation') return (
      <div className="space-y-5">
        <PageIntro eyebrow="Otomasyon" title="Bildirim ve DLQ">
          <PanelSubNavTabs items={[{ label: 'Bildirimler', focus: 'notifications' as const }, { label: 'DLQ', focus: 'dlq' as const }]} activeFocus={(activeFocus || 'notifications') as string} onSelect={(f) => handleSubTabSelect('automation', f)} />
        </PageIntro>
        {(activeFocus || 'notifications') === 'dlq'
          ? <DlqOperationsPanel active role={identity?.role} permissions={identity?.permissions} />
          : <NotificationCenterPanel active role={identity?.role} permissions={identity?.permissions} />}
      </div>
    );
    if (activeView === 'security') return (
      <div className="space-y-5">
        <PageIntro eyebrow="Güvenlik & Audit" title="Audit trail">
          <button type="button" onClick={() => setCriticalActionDraft({ id: 'sec', title: 'Güvenlik Aksiyonu', description: 'Step-up zorunlu.', impact: 'Güvenlik yüzeyini etkiler.' })} className={panelPrimaryButtonClassName}>Step-up Modalını Aç</button>
        </PageIntro>
        <PanelAuditTrailPanel active role={identity?.role} permissions={identity?.permissions} />
      </div>
    );
    if (activeView === 'settings') return (
      <div className="space-y-5">
        <PageIntro eyebrow="Ayarlar" title="Panel konfigürasyonu" />
        <SettingsOperationsPanel active role={identity?.role} permissions={identity?.permissions} initialCount={settingsCount} />
      </div>
    );
    return <PlannedModulePanel title="Modül" description="Henüz implement edilmedi." />;
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F5EFE4]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#F9F4EC_0%,#F2EBDD_48%,#ECE3D5_100%)]" />
      <div className="pointer-events-none absolute right-[8%] top-[10%] h-[360px] w-[360px] rounded-full bg-[#E8DBC1]/45 blur-3xl" />
      <div className="pointer-events-none absolute left-[10%] bottom-[6%] h-[260px] w-[260px] rounded-full bg-[#D9E0D4]/32 blur-3xl" />

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <PanelSidebar identity={identity} activeView={activeView} appliedCampaign={appliedCampaign} appliedGlobalSearch={appliedGlobalSearch} autoRefresh={autoRefresh} isSigningOut={isSigningOut} onSignOut={handleSignOut} badgeCounts={badgeCounts} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

        <div className="min-w-0 flex-1">
          <PanelTopbar activeView={activeView} activeFocus={activeFocus} campaignInput={campaignInput} onCampaignInputChange={setCampaignInput} onApplyFilters={() => setAppliedCampaign(campaignInput.trim())} onManualRefresh={() => loadData({ silent: true })} isRefreshing={isRefreshing} showGlobalFilters={showGlobalTopbarFilters} onMenuToggle={() => setMobileMenuOpen((p) => !p)} />

          <main className="px-4 py-5 sm:px-6 xl:px-8">
            {successMessage && <PanelFeedbackMessage className="mb-4 text-[14px]" tone="success">{successMessage}</PanelFeedbackMessage>}
            {errorMessage && <PanelFeedbackMessage className="mb-4 text-[14px]" tone="error">{errorMessage}</PanelFeedbackMessage>}
            {!authLoading && authRequired && (
              <div className={panelSurfaceClassName}>
                <p className={panelEyebrowClassName}>Panel Oturumu</p>
                <h2 className={panelLargeTitleClassName}>Tekrar giriş gerekiyor</h2>
                <p className={`${panelDescriptionClassName} text-[14px]`}>Oturum doğrulanamadı.</p>
                <div className="mt-4"><Link to={resolvePanelLoginHref()} className={panelPrimaryButtonClassName}>Giriş Ekranına Git</Link></div>
              </div>
            )}
            {authLoading && <PanelLoadingMessage>Panel verileri yükleniyor...</PanelLoadingMessage>}
            {!authLoading && !authRequired && renderCurrentView()}
          </main>
        </div>
      </div>

      <PanelCriticalActionModal draft={criticalActionDraft} onClose={() => setCriticalActionDraft(null)} onComplete={(msg) => { setSuccessMessage(msg); setCriticalActionDraft(null); }} />
    </section>
  );
}
