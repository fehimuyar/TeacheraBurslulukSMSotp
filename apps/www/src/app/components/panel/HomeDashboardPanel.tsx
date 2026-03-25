import { useMemo } from 'react';
import { Link } from 'react-router';
import type {
  AuditSummary,
  CandidateSummary,
  DashboardPayload,
  DashboardRecentActionItem,
  NotificationSummary,
  SettingItem,
  UnviewedSummary,
} from './panelTypes';
import {
  buildDashboardHref,
  formatDateTime,
  formatNumber,
  formatPercent,
  toDisplayString,
} from './panelTypes';
import { SETTINGS_KEYS } from './panelNavigationConfig';
import {
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from './panelUi';

/* ── Tiny sub-components ── */

function statusChipClassName(tone: 'critical' | 'watch' | 'healthy' | 'neutral') {
  if (tone === 'critical') return 'border-[#C59292] bg-[#6B333A] text-white';
  if (tone === 'watch') return 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]';
  if (tone === 'healthy') return 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]';
  return 'border-[#DED4C5] bg-[#FBF7F0] text-[#6F675D]';
}

function KpiCard({
  title,
  value,
  helper,
  pending = false,
  sourceLabel,
  trend,
}: {
  title: string;
  value: string;
  helper: string;
  pending?: boolean;
  sourceLabel?: string;
  trend?: 'up' | 'down' | 'flat';
}) {
  return (
    <div
      className={`${panelStatCardClassName} ${
        pending ? 'border-[#E4DBCF] bg-[#FAF5EE] text-[#756C60]' : 'border-[#E4DBCF] bg-[rgba(255,253,249,0.9)] text-[#1B2B24]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">{title}</p>
        {pending && (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] ${statusChipClassName('neutral')}`}>
            Yakında
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <p className={`font-['Neutraface_2_Text:Bold',sans-serif] ${pending ? 'text-[18px]' : 'text-[24px]'} leading-[1.1]`}>
          {value}
        </p>
        {trend && !pending && (
          <span className={`text-[12px] font-['Neutraface_2_Text:Demi',sans-serif] ${trend === 'up' ? 'text-[#2C5447]' : trend === 'down' ? 'text-[#8A433C]' : 'text-[#7A7063]'}`} aria-label={trend === 'up' ? 'Artış' : trend === 'down' ? 'Azalış' : 'Sabit'}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.55] text-[#6C7269]">{helper}</p>
      {pending && sourceLabel && (
        <p className="mt-3 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] leading-[1.45] text-[#8A7F71]">{sourceLabel}</p>
      )}
    </div>
  );
}

function CriticalStripCard({
  title,
  value,
  helper,
  tone,
}: {
  title: string;
  value: string;
  helper: string;
  tone: 'critical' | 'watch' | 'healthy';
}) {
  return (
    <div className={`rounded-[20px] border px-4 py-3 ${tone === 'healthy' ? 'border-[#D7E2DA] bg-[#F3F9F4] text-[#2C5447]' : tone === 'watch' ? 'border-[#E4D6C1] bg-[#FBF5EB] text-[#7A5E39]' : 'border-[#E5CDC6] bg-[#FFF7F5] text-[#8A433C]'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em]">{title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] ${statusChipClassName(tone)}`}>
          {tone === 'critical' ? 'Kritik' : tone === 'watch' ? 'İzle' : 'Temiz'}
        </span>
      </div>
      <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] leading-[1.1]">{value}</p>
      <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.5] opacity-80">{helper}</p>
    </div>
  );
}

function SnapshotCard({
  title,
  helper,
  items,
}: {
  title: string;
  helper: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <section className={`${panelSurfaceClassName} border-[#E6DDCF] bg-[rgba(255,252,247,0.88)]`}>
      <p className={panelEyebrowClassName}>{title}</p>
      <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.6] text-[#657068]">{helper}</p>
      <div className="mt-4 divide-y divide-[#ECE2D5] overflow-hidden rounded-[18px] border border-[#ECE2D5] bg-[#FFFCF8]">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="flex items-center justify-between gap-4 px-4 py-3">
            <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] uppercase tracking-[0.14em] text-[#8A7F71]">
              {item.label}
            </p>
            <p className="break-words text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] leading-[1.35] text-[#1B2B24]">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatRecentActionTime(value: string | undefined) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

const DASHBOARD_ACTION_LABELS: Record<string, string> = {
  PANEL_SETTINGS_UPDATE: 'Ayar Güncelleme',
  PANEL_PASSWORD_RESET: 'Şifre Sıfırlama',
  PANEL_RESULTS_OVERRIDE: 'Sonuç Düzenleme',
  PANEL_RESULTS_PUBLISH: 'Sonuç Yayınlama',
  PANEL_UNVIEWED_RESULTS_WA_SEND: 'Sonuç WhatsApp',
  PANEL_BOT_FOLLOWUP_SCAN: 'Bot Taraması',
  PANEL_EXAM_REMINDER_BROADCAST_RUN: 'Sınav Hatırlatma',
  PANEL_CANDIDATE_NOTE_ADD: 'Not Eklendi',
  PANEL_CANDIDATE_APPOINTMENT_BOOKED: 'Randevu Alındı',
  PANEL_CANDIDATE_APPOINTMENT_ATTENDED: 'Randevu Gerçekleşti',
  PANEL_CANDIDATE_APPOINTMENT_NO_SHOW: 'No-show',
  PANEL_CANDIDATE_SMS_RETRY: 'SMS Tekrar Gönder',
  PANEL_CANDIDATE_WA_SEND: 'WhatsApp Gönder',
  PANEL_NOTIFICATIONS_CANCEL: 'Bildirim İptali',
  PANEL_NOTIFICATIONS_RETRY: 'Bildirim Tekrar Dene',
  PANEL_NOTIFICATIONS_REQUEUE_DLQ: 'DLQ Yeniden Kuyrukla',
  PANEL_DLQ_ASSIGN: 'DLQ Atama',
  PANEL_DLQ_CLOSE: 'DLQ Kapat',
  PANEL_DLQ_RETRY: 'DLQ Tekrar Dene',
  PANEL_DLQ_CHANGE_TEMPLATE: 'DLQ Şablon Değiştir',
  PANEL_CRM_EXPORT_ENQUEUE: 'CRM Kuyruğa Alma',
  PANEL_CRM_EXPORT_RETRY: 'CRM Tekrar Dene',
  PANEL_CRM_EXPORT_CANCEL: 'CRM İptali',
};

function formatRecentActionLabel(action: string | undefined) {
  if (!action) return 'Panel İşlemi';
  if (DASHBOARD_ACTION_LABELS[action]) return DASHBOARD_ACTION_LABELS[action];
  return action
    .replace(/^PANEL_/, '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatRecentActionDetail(item: DashboardRecentActionItem) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : null;
  const detailParts: string[] = [];
  const templateCode = typeof metadata?.templateCode === 'string' ? metadata.templateCode.trim() : '';
  const followUpType = typeof metadata?.followUpType === 'string' ? metadata.followUpType.trim() : '';
  const note = typeof metadata?.note === 'string' ? metadata.note.trim() : '';
  if (templateCode) detailParts.push(templateCode);
  if (followUpType) detailParts.push(followUpType);
  if (note) detailParts.push('Operatör notu');
  if (item.target_type) detailParts.push(String(item.target_type).replace(/_/g, ' '));
  if (item.target_id) detailParts.push(String(item.target_id).slice(0, 8));
  return detailParts.filter(Boolean).join(' • ') || 'Panel işlemi';
}

/* ── Pending performance metrics ── */

const PENDING_PERFORMANCE_METRICS: Array<{ title: string; statusLabel: string; sourceLabel: string; description: string }> = [
  {
    title: 'Kayıt',
    statusLabel: 'Veri bekleniyor',
    sourceLabel: 'Kaynak: enrollment / kesin kayıt kontratı',
    description: 'Randevu sonrası kesin kayıt statüsü backend summary kontratına eklenecek.',
  },
  {
    title: 'Dönüşüm Oranı',
    statusLabel: 'Veri bekleniyor',
    sourceLabel: 'Kaynak: appointment + enrollment birleşik metriği',
    description: 'Başvurudan randevuya ve kayda dönüşüm oranı burada hesaplanacak.',
  },
];

/* ── Main Component ── */

export default function HomeDashboardPanel({
  dashboard,
  candidateSummary,
  notificationSummary,
  unviewedSummary,
  auditSummary,
  settingsItems,
  appliedCampaign,
  role,
}: {
  dashboard: DashboardPayload | null;
  candidateSummary: CandidateSummary;
  notificationSummary: NotificationSummary;
  unviewedSummary: UnviewedSummary;
  auditSummary: AuditSummary;
  settingsItems: SettingItem[];
  appliedCampaign: string;
  role?: string;
}) {
  const isAdmin = role ? String(role).toUpperCase() === 'SUPER_ADMIN' : false;
  const settingsLookup = useMemo(
    () => Object.fromEntries(settingsItems.map((item) => [item.key, item.value])),
    [settingsItems],
  );
  const campaignCodeValue = toDisplayString(settingsLookup[SETTINGS_KEYS.campaignCode]).trim() || appliedCampaign || 'Tanımsız';
  const examOpenAtValue = toDisplayString(settingsLookup[SETTINGS_KEYS.examOpenAt]).trim();
  const examCloseAtValue = toDisplayString(settingsLookup[SETTINGS_KEYS.examCloseAt]).trim();
  const panelAllowedRolesValue = toDisplayString(settingsLookup[SETTINGS_KEYS.panelAllowedRoles]).trim() || 'Tanımlı değil';

  const activeAlertCount =
    (Number(dashboard?.operations?.open_dlq_jobs || 0) > 0 ? 1 : 0) +
    (Number(dashboard?.operations?.last_30m_failures || 0) > 0 ? 1 : 0) +
    (Number(notificationSummary.failed_jobs || 0) > 0 ? 1 : 0) +
    (Number(unviewedSummary.total_unviewed || 0) > 0 ? 1 : 0);

  const homeStatusTitle = activeAlertCount > 0 ? 'Bugün takip isteyen konular var' : 'Operasyon akışı dengeli görünüyor';
  const homeStatusDescription =
    activeAlertCount > 0
      ? `${formatNumber(activeAlertCount)} alanda takip gerekiyor. Önce kritik şeridi, ardından kurum performansı kartlarını kontrol et.`
      : 'Kritik blokaj görünmüyor. Yine de funnel ve iletişim kartları üzerinden genel sağlığı kontrol et.';

  const criticalStripItems = useMemo(
    () => [
      { title: 'Açık DLQ', value: formatNumber(dashboard?.operations?.open_dlq_jobs), helper: 'Anında müdahale gerektiren açık kuyruk kaydı', tone: Number(dashboard?.operations?.open_dlq_jobs || 0) > 0 ? 'critical' as const : 'healthy' as const },
      { title: 'Son 30dk Hata', value: formatNumber(dashboard?.operations?.last_30m_failures), helper: 'Yakın dönem operasyon kırılması', tone: Number(dashboard?.operations?.last_30m_failures || 0) > 0 ? 'critical' as const : 'healthy' as const },
      { title: 'Başarısız Bildirim', value: formatNumber(notificationSummary.failed_jobs), helper: 'Tekrar deneme veya kanal müdahalesi gerektirebilir', tone: Number(notificationSummary.failed_jobs || 0) > 0 ? 'critical' as const : 'healthy' as const },
      { title: 'Sonuç Görmeyen', value: formatNumber(unviewedSummary.total_unviewed), helper: 'Yayın sonrası takip bekleyen aday', tone: Number(unviewedSummary.total_unviewed || 0) > 0 ? 'watch' as const : 'healthy' as const },
    ],
    [dashboard?.operations?.open_dlq_jobs, dashboard?.operations?.last_30m_failures, notificationSummary.failed_jobs, unviewedSummary.total_unviewed],
  );

  const organizationMetrics = useMemo(
    () => [
      { title: 'Toplam Başvuru', value: formatNumber(dashboard?.summary?.total_applications), helper: 'Aktif kampanya hacmi', trend: 'up' as const },
      { title: 'İlk Giriş', value: formatPercent(dashboard?.summary?.first_login_rate), helper: 'Başvurudan girişe geçiş oranı', trend: 'up' as const },
      { title: 'Sınav Tamamlama', value: formatPercent(dashboard?.summary?.exam_completion_rate), helper: 'Sınava başlayan adayların tamamlanma oranı', trend: 'flat' as const },
      { title: 'Sonuç Görüntüleme', value: formatPercent(dashboard?.summary?.result_view_rate), helper: 'Yayınlanan sonucun görülme oranı', trend: 'up' as const },
    ],
    [dashboard?.summary?.total_applications, dashboard?.summary?.first_login_rate, dashboard?.summary?.exam_completion_rate, dashboard?.summary?.result_view_rate],
  );

  const appointmentMetrics = useMemo(
    () => [
      { title: 'Randevu', value: formatNumber(dashboard?.appointment_summary?.appointment_booked), helper: 'Randevu alan aday sayısı' },
      { title: 'Gerçekleşen', value: formatNumber(dashboard?.appointment_summary?.appointment_attended), helper: 'Görüşmeye gelen aday' },
      { title: 'No-show', value: formatNumber(dashboard?.appointment_summary?.appointment_no_show), helper: 'Randevusuna gelmeyen aday' },
    ],
    [
      dashboard?.appointment_summary?.appointment_attended,
      dashboard?.appointment_summary?.appointment_booked,
      dashboard?.appointment_summary?.appointment_no_show,
    ],
  );

  const recentCriticalActions = useMemo(
    () =>
      (dashboard?.recent_actions || []).map((item) => ({
        time: formatRecentActionTime(item.created_at),
        user: item.actor_name?.trim() || 'Sistem',
        action: formatRecentActionLabel(item.action),
        detail: formatRecentActionDetail(item),
      })),
    [dashboard?.recent_actions],
  );

  const communicationHealthMetrics = useMemo(
    () => [
      { title: 'Giriş SMS Başarısı', value: formatPercent(dashboard?.summary?.sms_success_rate), helper: 'Login başlangıcını etkileyen ilk kanal' },
      {
        title: 'WhatsApp Ulaşımı',
        value: Number.isFinite(dashboard?.summary?.wa_delivery_rate) ? formatPercent(dashboard?.summary?.wa_delivery_rate) : formatNumber(unviewedSummary.wa_reached),
        helper: 'Sonuç sonrası erişim görünürlüğü',
      },
      { title: 'WhatsApp Sorunu', value: formatNumber(unviewedSummary.wa_problematic), helper: 'Bot / WhatsApp follow-up gerektiren aday' },
      { title: 'Bekleyen Bildirim', value: formatNumber(Number(notificationSummary.dlq_jobs || 0) + Number(notificationSummary.failed_jobs || 0)), helper: 'Otomasyon merkezinde bekleyen iş yükü' },
    ],
    [dashboard?.summary?.sms_success_rate, dashboard?.summary?.wa_delivery_rate, notificationSummary.dlq_jobs, notificationSummary.failed_jobs, unviewedSummary.wa_problematic, unviewedSummary.wa_reached],
  );

  const moduleSnapshots = useMemo(
    () => [
      {
        title: 'Aday Operasyonu',
        helper: 'Aday tarafındaki akış ve problem özeti',
        items: [
          { label: 'Toplam Aday', value: formatNumber(candidateSummary.total_candidates) },
          { label: 'Tamamlanan', value: formatNumber(candidateSummary.exam_completed) },
          { label: 'WhatsApp Sorunu', value: formatNumber(candidateSummary.wa_problematic) },
        ],
      },
      {
        title: 'Bildirim ve DLQ',
        helper: 'Bildirim ve retry sağlığı',
        items: [
          { label: 'Başarısız', value: formatNumber(notificationSummary.failed_jobs) },
          { label: 'DLQ', value: formatNumber(notificationSummary.dlq_jobs) },
          { label: 'Başarılı', value: formatNumber(notificationSummary.successful_jobs) },
        ],
      },
      {
        title: 'Sonuç Takibi',
        helper: 'Sonuç sonrası temas ihtiyacı',
        items: [
          { label: 'Görmeyen', value: formatNumber(unviewedSummary.total_unviewed) },
          { label: 'WhatsApp Sorunu', value: formatNumber(unviewedSummary.wa_problematic) },
          { label: 'Ulaşıldı', value: formatNumber(unviewedSummary.wa_reached) },
        ],
      },
      {
        title: 'Güvenlik & Audit',
        helper: 'Panel hareketliliği ve zincir güncelliği',
        items: [
          { label: 'Panel İşlemi', value: formatNumber(auditSummary.panel_actions) },
          { label: 'Admin Olayı', value: formatNumber(auditSummary.admin_events) },
          { label: 'Zincir', value: formatDateTime(auditSummary.chain_updated_at) },
        ],
      },
      {
        title: 'Ayarlar / Kampanya',
        helper: 'Owner seviyesinde temel konfigürasyon durumu',
        items: [
          { label: 'Kampanya', value: campaignCodeValue },
          { label: 'Sınav Penceresi', value: examOpenAtValue && examCloseAtValue ? `${formatDateTime(examOpenAtValue)} - ${formatDateTime(examCloseAtValue)}` : 'Eksik' },
          { label: 'Roller', value: panelAllowedRolesValue },
        ],
      },
    ],
    [auditSummary, candidateSummary, campaignCodeValue, examOpenAtValue, examCloseAtValue, notificationSummary, panelAllowedRolesValue, unviewedSummary],
  );

  return (
    <div className="space-y-5">
      {/* SUPER_ADMIN: Yönetici Özeti */}
      {isAdmin && (
        <section className={`${panelSurfaceClassName} border-[#C8CAD8]`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.2em] text-[#4A4A6A]">Yönetici Özeti</p>
              <h2 className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">Sadece Süper Admin Görür</h2>
            </div>
            <span className="rounded-full border border-[#C8CAD8] bg-[#F0F0F6] px-2.5 py-0.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.12em] text-[#4A4A6A]">SA</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`${panelStatCardClassName} border-[#C8CAD8] bg-[#F0F0F6]`}>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#4A4A6A]">Aktif Kullanıcı</p>
              <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(dashboard?.admin_overview?.active_users)}</p>
            </div>
            <div className={`${panelStatCardClassName} border-[#C8CAD8] bg-[#F0F0F6]`}>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#4A4A6A]">Son 24s Admin İşlemi</p>
              <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(auditSummary.panel_actions)}</p>
            </div>
            <div className={`${panelStatCardClassName} border-[#C8CAD8] bg-[#F0F0F6]`}>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#4A4A6A]">Bekleyen Onay</p>
              <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(dashboard?.admin_overview?.pending_approvals)}</p>
              <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] leading-[1.45] text-[#6C7269]">Sonuç yayın onayı bekleyen kayıt</p>
            </div>
            <div className={`${panelStatCardClassName} border-[#C8CAD8] bg-[#F0F0F6]`}>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#4A4A6A]">Açık Uyarı</p>
              <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#875349]">{formatNumber(Number(dashboard?.operations?.open_dlq_jobs || 0) + Number(dashboard?.operations?.last_30m_failures || 0))}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[#E4DBCF] bg-[#FFFCF8] p-3">
            <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">Son Kritik İşlemler</p>
            <div className="mt-2 divide-y divide-[#ECE2D5]">
              {recentCriticalActions.length > 0 ? (
                recentCriticalActions.map((item) => (
                  <div key={`${item.time}-${item.action}-${item.detail}`} className="flex items-center gap-3 py-2">
                    <span className="w-[45px] shrink-0 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] text-[#1B2B24]">{item.time}</span>
                    <span className="w-[84px] shrink-0 truncate font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{item.user}</span>
                    <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] text-[#33463E]">{item.action}</span>
                    <span className="ml-auto max-w-[42%] truncate text-right font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">{item.detail}</span>
                  </div>
                ))
              ) : (
                <p className="py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Son kritik işlem bulunmuyor.</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={buildDashboardHref({ view: 'security' })} className={panelSecondaryButtonClassName}>Audit Trail</Link>
            <Link to={buildDashboardHref({ view: 'settings' })} className={panelSecondaryButtonClassName}>Ayarlar</Link>
            <Link to={buildDashboardHref({ view: 'users', focus: 'accounts' })} className={panelSecondaryButtonClassName}>Kullanıcılar</Link>
          </div>
        </section>
      )}

      {/* Status header */}
      <section className={`${panelSurfaceClassName} overflow-hidden`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className={panelEyebrowClassName}>Bugünün Özeti</p>
            <h2 className={panelLargeTitleClassName}>{homeStatusTitle}</h2>
            <p className={panelDescriptionClassName}>{homeStatusDescription}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[18px] border border-[#E4DBCF] bg-[#FFFCF8] px-4 py-3">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#8A7F71]">Aktif Kampanya</p>
              <p className="mt-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] text-[#1B2B24]">{campaignCodeValue}</p>
            </div>
            <div className="rounded-[18px] border border-[#E4DBCF] bg-[#FFFCF8] px-4 py-3">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#8A7F71]">Kritik Uyarı</p>
              <p className="mt-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] text-[#1B2B24]">{formatNumber(activeAlertCount)}</p>
            </div>
            <div className="rounded-[18px] border border-[#E4DBCF] bg-[#FFFCF8] px-4 py-3">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#8A7F71]">Audit Zinciri</p>
              <p className="mt-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] text-[#1B2B24]">{formatDateTime(auditSummary.chain_updated_at)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Critical strip */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Öncelik</p>
        <h3 className={panelTitleClassName}>Hemen bakılması gereken konular</h3>
        <p className={panelDescriptionClassName}>Alarm üreten alanları önce burada gör, sonra detay için ilgili modüle in.</p>
        <div className="mt-4 grid gap-3 xl:grid-cols-4">
          {criticalStripItems.map((item) => (
            <CriticalStripCard key={item.title} title={item.title} value={item.value} helper={item.helper} tone={item.tone} />
          ))}
        </div>
      </section>

      {/* Organization performance */}
      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={panelEyebrowClassName}>Kurum Performansı</p>
            <h2 className={panelLargeTitleClassName}>Başvurudan sonuca kadar genel görünüm</h2>
            <p className={panelDescriptionClassName}>Canlı kontratı olan metrikler gerçek veriyle gösterilir. Kayıt ve dönüşüm alanları veri kontratı tamamlanana kadar bekleyen metriklerde tutulur.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] ${statusChipClassName('watch')}`}>Canlı + Bekleyen</span>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          {organizationMetrics.map((item) => (
            <KpiCard key={item.title} title={item.title} value={item.value} helper={item.helper} trend={item.trend} />
          ))}
          {appointmentMetrics.map((item) => (
            <KpiCard key={item.title} title={item.title} value={item.value} helper={item.helper} />
          ))}
        </div>
        <details className="mt-4 rounded-[20px] border border-[#E8DFD2] bg-[#FFFCF8] p-3">
          <summary className="cursor-pointer font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.14em] text-[#7A7063]">
            Bekleyen Metrikler ({PENDING_PERFORMANCE_METRICS.length})
          </summary>
          <div className="mt-3 grid gap-3 xl:grid-cols-4">
            {PENDING_PERFORMANCE_METRICS.map((item) => (
              <KpiCard key={item.title} title={item.title} value={item.statusLabel} helper={item.description} sourceLabel={item.sourceLabel} pending />
            ))}
          </div>
        </details>
      </section>

      {/* Communication health */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Aday İletişimi</p>
        <h3 className={panelTitleClassName}>Mesaj ve takip akışının durumu</h3>
        <p className={panelDescriptionClassName}>Adaya ulaşma, sonucu hatırlatma ve otomasyon yükünü tek satırda takip et.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          {communicationHealthMetrics.map((item) => (
            <KpiCard key={item.title} title={item.title} value={item.value} helper={item.helper} />
          ))}
        </div>
      </section>

      {/* Module snapshots */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Operasyon Özeti</p>
        <h3 className={panelTitleClassName}>Hangi modülde sorun var, hangisi dengede</h3>
        <p className={panelDescriptionClassName}>Detay ekranına gitmeden önce modüllerin bugünkü kısa özetini burada gör.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {moduleSnapshots.map((snapshot) => (
            <SnapshotCard key={snapshot.title} title={snapshot.title} helper={snapshot.helper} items={snapshot.items} />
          ))}
        </div>
      </section>

      {/* Quick access */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Hızlı Erişim</p>
        <h3 className={panelTitleClassName}>Sık kullanılan işlemler</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={buildDashboardHref({ view: 'operations', focus: 'sms' })} className={panelSecondaryButtonClassName}>SMS Gönder</Link>
          <Link to={buildDashboardHref({ view: 'operations', focus: 'whatsapp-triggers' })} className={panelSecondaryButtonClassName}>WhatsApp Tetikle</Link>
          <Link to={buildDashboardHref({ view: 'reports', focus: 'sales' })} className={panelSecondaryButtonClassName}>Satış Raporu</Link>
          <Link to={buildDashboardHref({ view: 'scholarship' })} className={panelSecondaryButtonClassName}>Aday Listesi</Link>
        </div>
      </section>
    </div>
  );
}
