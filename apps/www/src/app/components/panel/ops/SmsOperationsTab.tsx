import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../../api/panelApi';
import { canOperateNotifications, isReadOnlyPanelRole } from '../panelRoleAccess';
import {
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelModal,
  panelChipClassName,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type CandidateRow = {
  candidate_id: string;
  student_full_name: string | null;
  school_name: string | null;
  grade: number | null;
  credentials_sms_status: string | null;
  parent_phone_e164: string | null;
};

type CandidateListPayload = {
  items?: CandidateRow[];
  total?: number;
  message?: string;
  error?: string;
};

type CandidateActionPayload = {
  preview?: boolean;
  requested?: number;
  matched?: number;
  enqueueable?: number;
  enqueued?: number;
  skipped?: number;
  skipped_no_phone?: number;
  message?: string;
  error?: string;
  audit_log_id?: string | number | null;
  audit_log_seq?: number | null;
};

type NotificationRow = {
  job_id: string;
  template_code: string | null;
  recipient: string | null;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  error_code: string | null;
};

type NotificationListPayload = {
  items?: NotificationRow[];
  summary?: {
    total_jobs?: number;
    dlq_jobs?: number;
    failed_jobs?: number;
    successful_jobs?: number;
  };
  message?: string;
  error?: string;
};

type ReminderPayload = {
  preview?: boolean;
  campaign_code?: string;
  reminder_lead_minutes?: number;
  reminder_window_minutes?: number;
  scanned?: number;
  enqueueable?: number;
  enqueued?: number;
  skipped_no_phone?: number;
  skipped_no_exam_open_at?: number;
  skipped_outside_window?: number;
  skipped_errors?: number;
  skipped_reason?: string | null;
  message?: string;
  error?: string;
};

type CredentialPreviewState = {
  matched: number;
  enqueueable: number;
  skippedNoPhone: number;
  totalMatching: number;
  sampledCount: number;
  rows: CandidateRow[];
};

const CREDENTIAL_SCOPE_OPTIONS = [
  {
    id: 'issue_only',
    label: 'Sorunlu / Eksik',
    description: 'NOT_QUEUED, FAILED, RETRYING, DLQ',
  },
  {
    id: 'all_filtered',
    label: 'Tum Filtreli',
    description: 'Secilen filtreye uyan ilk limit kadar aday',
  },
] as const;

type CredentialScope = (typeof CREDENTIAL_SCOPE_OPTIONS)[number]['id'];

function formatNumber(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
}

function normalizeMessage(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function readAuditLabel(payload: CandidateActionPayload | null | undefined) {
  const auditId = payload?.audit_log_id;
  if (auditId === null || auditId === undefined || auditId === '') return '';
  const seq = Number(payload?.audit_log_seq);
  if (Number.isFinite(seq) && seq > 0) {
    return ` Audit #${String(auditId)} / Seq ${String(seq)}`;
  }
  return ` Audit #${String(auditId)}`;
}

function buildCandidatesPath({
  campaignCode,
  grade,
  schoolQuery,
  scope,
  page,
  perPage,
}: {
  campaignCode: string;
  grade: string;
  schoolQuery: string;
  scope: CredentialScope;
  page: number;
  perPage: number;
}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('sort_by', 'updated_at');
  params.set('sort_order', 'desc');
  const filters: Record<string, unknown> = {};
  if (campaignCode.trim()) filters.campaign_code = campaignCode.trim();
  if (grade.trim()) filters.grade = [grade.trim()];
  if (schoolQuery.trim()) filters.school_query = schoolQuery.trim();
  if (scope === 'issue_only') {
    filters.credentials_sms_status = ['NOT_QUEUED', 'FAILED', 'RETRYING', 'DLQ'];
  }
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }
  return `/api/panel/candidates?${params.toString()}`;
}

function buildSmsNotificationsPath(campaignCode: string, perPage = 12) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('per_page', String(perPage));
  params.set('sort_by', 'sent_at');
  params.set('sort_order', 'desc');
  params.set('filters', JSON.stringify({
    channel: ['SMS'],
    ...(campaignCode.trim() ? { campaign_code: campaignCode.trim() } : {}),
  }));
  return `/api/panel/notifications?${params.toString()}`;
}

function buildReminderBody({
  campaignCode,
  leadMinutes,
  windowMinutes,
  limit,
  force,
  preview,
}: {
  campaignCode: string;
  leadMinutes: number;
  windowMinutes: number;
  limit: number;
  force: boolean;
  preview: boolean;
}) {
  return {
    action: 'run_exam_reminder_broadcast',
    campaign_code: campaignCode.trim() || undefined,
    reminder_lead_minutes: leadMinutes,
    reminder_window_minutes: windowMinutes,
    limit,
    force,
    preview,
  };
}

function buildCredentialsPreviewMessage(preview: CredentialPreviewState) {
  return [
    'Credentials SMS dry-run sonucu',
    `Toplam eslesen: ${formatNumber(preview.totalMatching)}`,
    `Islenen orneklem: ${formatNumber(preview.sampledCount)}`,
    `Enqueueable: ${formatNumber(preview.enqueueable)}`,
    `No phone: ${formatNumber(preview.skippedNoPhone)}`,
    '',
    'Gonderim baslatilsin mi?',
  ].join('\n');
}

function buildReminderPreviewMessage(payload: ReminderPayload) {
  return [
    'Exam reminder dry-run sonucu',
    `Scanned: ${formatNumber(payload.scanned)}`,
    `Enqueueable: ${formatNumber(payload.enqueueable)}`,
    `No phone: ${formatNumber(payload.skipped_no_phone)}`,
    `No exam open: ${formatNumber(payload.skipped_no_exam_open_at)}`,
    `Outside window: ${formatNumber(payload.skipped_outside_window)}`,
    '',
    'Broadcast calistirilsin mi?',
  ].join('\n');
}

function formatStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toUpperCase();
  if (!normalized) return '-';
  if (normalized === 'DELIVERED') return 'Teslim';
  if (normalized === 'READ') return 'Okundu';
  if (normalized === 'FAILED') return 'Basarisiz';
  if (normalized === 'DLQ') return 'DLQ';
  if (normalized === 'QUEUED') return 'Kuyrukta';
  if (normalized === 'RETRYING') return 'Retry';
  if (normalized === 'SENT') return 'Gonderildi';
  return normalized;
}

function statusChipClassName(status: string | null | undefined) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'DELIVERED' || normalized === 'READ') return 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]';
  if (normalized === 'FAILED' || normalized === 'DLQ') return 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]';
  return 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]';
}

export default function SmsOperationsTab({
  role,
  permissions,
  seedCampaignCode = '',
}: {
  role?: string;
  permissions?: string[];
  seedCampaignCode?: string;
}) {
  const canOperate = canOperateNotifications(role, permissions);
  const readOnly = isReadOnlyPanelRole(role);

  const [campaignCode, setCampaignCode] = useState(seedCampaignCode);
  const [gradeFilter, setGradeFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [credentialScope, setCredentialScope] = useState<CredentialScope>('issue_only');
  const [credentialLimitInput, setCredentialLimitInput] = useState('200');

  const [leadMinutesInput, setLeadMinutesInput] = useState('30');
  const [windowMinutesInput, setWindowMinutesInput] = useState('2');
  const [reminderLimitInput, setReminderLimitInput] = useState('250');
  const [reminderForce, setReminderForce] = useState(false);

  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isPreviewRunning, setIsPreviewRunning] = useState(false);
  const [isReminderRunning, setIsReminderRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [credentialPoolCount, setCredentialPoolCount] = useState(0);
  const [credentialPreview, setCredentialPreview] = useState<CredentialPreviewState | null>(null);
  const [showCredentialPreview, setShowCredentialPreview] = useState(false);

  const [reminderPreview, setReminderPreview] = useState<ReminderPayload | null>(null);
  const [smsSummary, setSmsSummary] = useState<NotificationListPayload['summary']>({});
  const [recentSmsJobs, setRecentSmsJobs] = useState<NotificationRow[]>([]);

  useEffect(() => {
    setCampaignCode(seedCampaignCode);
  }, [seedCampaignCode]);

  const credentialLimit = useMemo(() => {
    const parsed = Number.parseInt(credentialLimitInput, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 1000) : 200;
  }, [credentialLimitInput]);

  const reminderConfig = useMemo(() => {
    const lead = Number.parseInt(leadMinutesInput, 10);
    const windowMinutes = Number.parseInt(windowMinutesInput, 10);
    const limit = Number.parseInt(reminderLimitInput, 10);
    return {
      leadMinutes: Number.isFinite(lead) ? Math.min(Math.max(lead, 1), 1440) : 30,
      windowMinutes: Number.isFinite(windowMinutes) ? Math.min(Math.max(windowMinutes, 1), 60) : 2,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 2000) : 250,
    };
  }, [leadMinutesInput, reminderLimitInput, windowMinutesInput]);

  const loadOverview = async () => {
    setIsLoadingOverview(true);
    setErrorMessage('');
    try {
      const [candidatesResponse, notificationsResponse] = await Promise.all([
        panelFetch(
          buildCandidatesPath({
            campaignCode,
            grade: gradeFilter,
            schoolQuery: schoolFilter,
            scope: credentialScope,
            page: 1,
            perPage: 1,
          }),
          { method: 'GET' },
        ),
        panelFetch(buildSmsNotificationsPath(campaignCode, 12), { method: 'GET' }),
      ]);
      const candidatesPayload = (await candidatesResponse.json()) as CandidateListPayload;
      const notificationsPayload = (await notificationsResponse.json()) as NotificationListPayload;
      if (!candidatesResponse.ok) {
        throw new Error(normalizeMessage(candidatesPayload, 'Candidate havuzu alinamadi.'));
      }
      if (!notificationsResponse.ok) {
        throw new Error(normalizeMessage(notificationsPayload, 'SMS job ozeti alinamadi.'));
      }
      setCredentialPoolCount(Number(candidatesPayload.total || 0));
      setSmsSummary(notificationsPayload.summary || {});
      setRecentSmsJobs(Array.isArray(notificationsPayload.items) ? notificationsPayload.items : []);
    } catch (error) {
      setCredentialPoolCount(0);
      setSmsSummary({});
      setRecentSmsJobs([]);
      setErrorMessage(error instanceof Error ? error.message : 'SMS operasyon verileri alinamadi.');
    } finally {
      setIsLoadingOverview(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [campaignCode, credentialScope, gradeFilter, schoolFilter]);

  const collectCredentialRows = async () => {
    const collected: CandidateRow[] = [];
    let page = 1;
    const perPage = 200;
    while (collected.length < credentialLimit) {
      const response = await panelFetch(
        buildCandidatesPath({
          campaignCode,
          grade: gradeFilter,
          schoolQuery: schoolFilter,
          scope: credentialScope,
          page,
          perPage,
        }),
        { method: 'GET' },
      );
      const payload = (await response.json()) as CandidateListPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Candidate batch okunamadi.'));
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length === 0) break;
      collected.push(...items);
      if (items.length < perPage) break;
      page += 1;
    }
    return collected.slice(0, credentialLimit);
  };

  const runCredentialPreview = async () => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin SMS aksiyonlari kapali.');
      return null;
    }
    setIsPreviewRunning(true);
    setErrorMessage('');
    setMessage('');
    try {
      const rows = await collectCredentialRows();
      if (rows.length === 0) {
        throw new Error('Secili filtrelerde credentials SMS adayi bulunamadi.');
      }
      const response = await panelFetch('/api/panel/candidates/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'sms_retry',
          candidate_ids: rows.map((row) => row.candidate_id),
          preview: true,
        }),
      });
      const payload = (await response.json()) as CandidateActionPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Credentials SMS dry-run basarisiz.'));
      }
      const nextPreview: CredentialPreviewState = {
        matched: Number(payload.matched || 0),
        enqueueable: Number(payload.enqueueable || 0),
        skippedNoPhone: Number(payload.skipped_no_phone || 0),
        totalMatching: credentialPoolCount,
        sampledCount: rows.length,
        rows,
      };
      setCredentialPreview(nextPreview);
      setShowCredentialPreview(true);
      return nextPreview;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Credentials SMS dry-run basarisiz.');
      return null;
    } finally {
      setIsPreviewRunning(false);
    }
  };

  const handleCredentialSend = async () => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin SMS aksiyonlari kapali.');
      return;
    }
    setErrorMessage('');
    setMessage('');
    try {
      const preview = await runCredentialPreview();
      if (!preview) return;
      const confirmed = window.confirm(buildCredentialsPreviewMessage(preview));
      if (!confirmed) return;
      const response = await panelFetch('/api/panel/candidates/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'sms_retry',
          candidate_ids: preview.rows.map((row) => row.candidate_id),
        }),
      });
      const payload = (await response.json()) as CandidateActionPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Credentials SMS gonderimi basarisiz.'));
      }
      setMessage(
        `Credentials SMS retry baslatildi. Requested ${formatNumber(payload.requested)} • Enqueued ${formatNumber(payload.enqueued)} • Skipped ${formatNumber(payload.skipped)}${readAuditLabel(payload)}`,
      );
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Credentials SMS gonderimi basarisiz.');
    }
  };

  const runReminderPreview = async () => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin SMS aksiyonlari kapali.');
      return null;
    }
    setIsReminderRunning(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch('/api/panel/notifications/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          buildReminderBody({
            campaignCode,
            force: reminderForce,
            preview: true,
            ...reminderConfig,
          }),
        ),
      });
      const payload = (await response.json()) as ReminderPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Exam reminder dry-run alinamadi.'));
      }
      setReminderPreview(payload);
      return payload;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Exam reminder dry-run alinamadi.');
      return null;
    } finally {
      setIsReminderRunning(false);
    }
  };

  const handleRunReminder = async () => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin SMS aksiyonlari kapali.');
      return;
    }
    setErrorMessage('');
    setMessage('');
    try {
      const preview = await runReminderPreview();
      if (!preview) return;
      const confirmed = window.confirm(buildReminderPreviewMessage(preview));
      if (!confirmed) return;
      const response = await panelFetch('/api/panel/notifications/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          buildReminderBody({
            campaignCode,
            force: reminderForce,
            preview: false,
            ...reminderConfig,
          }),
        ),
      });
      const payload = (await response.json()) as ReminderPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Exam reminder broadcast basarisiz.'));
      }
      const skippedReason = String(payload.skipped_reason || '').trim();
      if (skippedReason) {
        setMessage(
          `Exam reminder broadcast skip edildi (${skippedReason}). Campaign ${payload.campaign_code || '-'} • Lead ${formatNumber(payload.reminder_lead_minutes)} dk • Window ${formatNumber(payload.reminder_window_minutes)} dk`,
        );
      } else {
        setMessage(
          `Exam reminder broadcast tamamlandi. Scanned ${formatNumber(payload.scanned)} • Enqueued ${formatNumber(payload.enqueued)} • No phone ${formatNumber(payload.skipped_no_phone)} • Errors ${formatNumber(payload.skipped_errors)}`,
        );
      }
      await loadOverview();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Exam reminder broadcast basarisiz.');
    }
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod. SMS dry-run ve gonderim aksiyonlari kapali.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}
      {errorMessage && <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage>}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Credentials Havuzu</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{isLoadingOverview ? '...' : formatNumber(credentialPoolCount)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam SMS Job</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{isLoadingOverview ? '...' : formatNumber(smsSummary?.total_jobs)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Failed SMS</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#875349]">{isLoadingOverview ? '...' : formatNumber(smsSummary?.failed_jobs)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">DLQ SMS</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#875349]">{isLoadingOverview ? '...' : formatNumber(smsSummary?.dlq_jobs)}</p>
        </div>
      </div>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Credentials SMS Retry</p>
        <h3 className={panelTitleClassName}>Aday Bazli Giris Bilgisi Gonderimi</h3>
        <p className={panelDescriptionClassName}>
          Filtreye uyan adaylar icin `CREDENTIALS_SMS` retry dry-run ve toplu gonderim.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {CREDENTIAL_SCOPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setCredentialScope(option.id)}
              className={`${panelChipClassName} ${credentialScope === option.id ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Campaign code</label>
            <input value={campaignCode} onChange={(event) => setCampaignCode(event.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="Bos = tum campaign" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sinif</label>
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`}>
              <option value="">Tumu</option>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((grade) => (
                <option key={grade} value={String(grade)}>
                  {grade}. Sinif
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Okul</label>
            <input value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="Okul adi ara" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Islenecek limit</label>
            <input value={credentialLimitInput} onChange={(event) => setCredentialLimitInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="200" />
          </div>
          <div className="flex items-end">
            <div className="rounded-[16px] border border-[#E4DBCF] bg-[#FBF7F0] px-4 py-2">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Bulunan</p>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{isLoadingOverview ? '...' : formatNumber(credentialPoolCount)}</p>
            </div>
          </div>
        </div>

        <p className="mt-3 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
          {CREDENTIAL_SCOPE_OPTIONS.find((option) => option.id === credentialScope)?.description}. Gonderimde ilk {formatNumber(credentialLimit)} aday islenir.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {canOperate ? (
            <>
              <button type="button" onClick={() => void runCredentialPreview()} className={panelSecondaryButtonClassName} disabled={isPreviewRunning}>
                {isPreviewRunning ? 'Dry-run...' : 'Dry-run'}
              </button>
              <button type="button" onClick={() => void handleCredentialSend()} className={panelPrimaryButtonClassName} disabled={isPreviewRunning}>
                Gonder
              </button>
            </>
          ) : null}
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Exam Reminder Broadcast</p>
        <h3 className={panelTitleClassName}>Sinav Hatirlatma Taramasi</h3>
        <p className={panelDescriptionClassName}>
          `EXAM_REMINDER_SMS` icin canli dry-run ve manuel broadcast tetikleme. Window kontrolu backend tarafinda uygulanir.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Campaign code</label>
            <input value={campaignCode} onChange={(event) => setCampaignCode(event.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="Bos = DEFAULT" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Lead (dk)</label>
            <input value={leadMinutesInput} onChange={(event) => setLeadMinutesInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="30" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Window (dk)</label>
            <input value={windowMinutesInput} onChange={(event) => setWindowMinutesInput(event.target.value.replace(/\D/g, '').slice(0, 2))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="2" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Limit</label>
            <input value={reminderLimitInput} onChange={(event) => setReminderLimitInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="250" />
          </div>
          <label className="flex items-end gap-2 rounded-[18px] border border-[#E4DBCF] bg-[#FBF7F0] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">
            <input type="checkbox" checked={reminderForce} onChange={(event) => setReminderForce(event.target.checked)} />
            <span>Force send</span>
          </label>
        </div>

        {reminderPreview ? (
          <div className="mt-4 rounded-[18px] border border-[#D6E3DA] bg-[#EEF6F0] p-4">
            <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.12em] text-[#2C5447]">Son Dry-run</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#537466]">Scanned</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(reminderPreview.scanned)}</p>
              </div>
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#537466]">Enqueueable</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(reminderPreview.enqueueable)}</p>
              </div>
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#537466]">No phone</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#875349]">{formatNumber(reminderPreview.skipped_no_phone)}</p>
              </div>
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#537466]">Outside window</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#875349]">{formatNumber(reminderPreview.skipped_outside_window)}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {canOperate ? (
            <>
              <button type="button" onClick={() => void runReminderPreview()} className={panelSecondaryButtonClassName} disabled={isReminderRunning}>
                {isReminderRunning ? 'Dry-run...' : 'Dry-run'}
              </button>
              <button type="button" onClick={() => void handleRunReminder()} className={panelPrimaryButtonClassName} disabled={isReminderRunning}>
                Broadcast Calistir
              </button>
            </>
          ) : null}
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Son SMS Joblari</p>
        {isLoadingOverview ? (
          <PanelLoadingMessage>SMS job listesi yukleniyor...</PanelLoadingMessage>
        ) : recentSmsJobs.length === 0 ? (
          <PanelEmptyState message="Secili filtrelerde SMS job bulunamadi." />
        ) : (
          <div className={panelTableContainerClassName}>
            <table className="min-w-[700px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
              <thead>
                <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2">Sablon</th>
                  <th className="px-3 py-2">Alici</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Hata</th>
                </tr>
              </thead>
              <tbody>
                {recentSmsJobs.map((row) => (
                  <tr key={row.job_id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2">{formatDateTime(row.sent_at || row.delivered_at)}</td>
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{row.template_code || '-'}</td>
                    <td className="px-3 py-2">{row.recipient || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${statusChipClassName(row.status)}`}>
                        {formatStatus(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.error_code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PanelModal open={showCredentialPreview} onClose={() => setShowCredentialPreview(false)} title="Credentials SMS Dry-run" maxWidth="760px">
        {!credentialPreview ? (
          <PanelEmptyState message="Henüz dry-run çalıştırılmadı." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className={panelStatCardClassName}>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Toplam eslesen</p>
                <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(credentialPreview.totalMatching)}</p>
              </div>
              <div className={panelStatCardClassName}>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Orneklem</p>
                <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(credentialPreview.sampledCount)}</p>
              </div>
              <div className={panelStatCardClassName}>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Enqueueable</p>
                <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#2C5447]">{formatNumber(credentialPreview.enqueueable)}</p>
              </div>
              <div className={panelStatCardClassName}>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">No phone</p>
                <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#875349]">{formatNumber(credentialPreview.skippedNoPhone)}</p>
              </div>
            </div>

            <div className={panelTableContainerClassName}>
              <table className="min-w-[640px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
                <thead>
                  <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                    <th className="px-3 py-2">Aday</th>
                    <th className="px-3 py-2">Okul</th>
                    <th className="px-3 py-2 text-right">Sinif</th>
                    <th className="px-3 py-2">SMS Durumu</th>
                    <th className="px-3 py-2">Telefon</th>
                  </tr>
                </thead>
                <tbody>
                  {credentialPreview.rows.map((row) => (
                    <tr key={row.candidate_id} className="border-b border-[#F0E7DA]">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{row.student_full_name || row.candidate_id}</td>
                      <td className="px-3 py-2">{row.school_name || '-'}</td>
                      <td className="px-3 py-2 text-right">{row.grade || '-'}</td>
                      <td className="px-3 py-2">{row.credentials_sms_status || '-'}</td>
                      <td className="px-3 py-2">{row.parent_phone_e164 || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </PanelModal>
    </div>
  );
}
