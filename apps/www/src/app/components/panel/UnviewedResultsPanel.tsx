import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { notifyError, notifySuccess } from '../../lib/notifications';
import { canOperateUnviewed, isReadOnlyPanelRole } from './panelRoleAccess';
import {
  PanelFeedbackMessage,
  PanelLoadingMessage,
  panelDescriptionClassName,
  panelEmptyRowClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelStatCardClassName,
  panelTableContainerClassName,
  panelTitleClassName,
  panelWideSurfaceClassName,
} from './panelUi';

type UnviewedRow = {
  candidate_id: string;
  student_full_name: string | null;
  school_name: string | null;
  grade: number | null;
  result_published_at: string | null;
  last_login_at: string | null;
  wa_result_status: string | null;
  wa_last_sent_at: string | null;
};

type UnviewedSummary = {
  total_unviewed?: number;
  wa_problematic?: number;
  wa_reached?: number;
};

type UnviewedListResponse = {
  items?: UnviewedRow[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: UnviewedSummary;
  message?: string;
  error?: string;
};

type UnviewedActionResponse = {
  action?: string;
  campaign_code?: string;
  mode?: string;
  requested?: number;
  matched?: number;
  enqueued?: number;
  enqueueable?: number;
  skipped?: number;
  skipped_no_phone?: number;
  preview?: boolean;
  audit_log_id?: string | number | null;
  audit_log_seq?: number | null;
  result_unseen?: {
    scanned?: number;
    enqueued?: number;
    skipped_no_phone?: number;
  };
  viewed_no_appointment?: {
    scanned?: number;
    enqueued?: number;
    skipped_no_phone?: number;
  };
  appointment_no_show?: {
    scanned?: number;
    enqueued?: number;
    skipped_no_phone?: number;
  };
  totals?: {
    scanned?: number;
    enqueued?: number;
    skipped_no_phone?: number;
  };
  message?: string;
  error?: string;
};

type UnviewedFilters = {
  campaignCode: string;
  grade: string;
  waStatus: string;
  publishedFrom: string;
  publishedTo: string;
};

const defaultFilters: UnviewedFilters = {
  campaignCode: '',
  grade: '',
  waStatus: '',
  publishedFrom: '',
  publishedTo: '',
};

const WA_STATUS_OPTIONS = ['NOT_QUEUED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RETRYING', 'DLQ'] as const;
const GRADE_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 2));
const TEMPLATE_OPTIONS = ['WA_RESULT', 'WA_RESULT_REMINDER'] as const;
const FOLLOW_UP_SCAN_MODES = ['result_unseen', 'viewed_no_appointment', 'appointment_no_show'] as const;

function formatNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatDate(value: string | null | undefined) {
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

function readAuditLabel(payload: UnviewedActionResponse | null | undefined) {
  const auditId = payload?.audit_log_id;
  if (auditId === null || auditId === undefined || auditId === '') return '';
  const seq = Number(payload?.audit_log_seq);
  if (Number.isFinite(seq) && seq > 0) {
    return ' Audit #' + String(auditId) + ' / Seq ' + String(seq);
  }
  return ' Audit #' + String(auditId);
}

function buildBulkWhatsappPreviewMessage(payload: UnviewedActionResponse) {
  return 'Dry-run sonucu\nRequested: '
    + formatNumber(payload.requested)
    + '\nMatched: '
    + formatNumber(payload.matched)
    + '\nEnqueueable: '
    + formatNumber(payload.enqueueable)
    + '\nNo phone: '
    + formatNumber(payload.skipped_no_phone)
    + '\nSkipped: '
    + formatNumber(payload.skipped)
    + '\n\nİşlem uygulansın mı?';
}

function buildFollowupPreviewMessage(mode: string, payload: UnviewedActionResponse) {
  const totals = payload.totals || {};
  return 'Follow-up dry-run ('
    + mode
    + ')\nScanned: '
    + formatNumber(totals.scanned)
    + '\nEnqueueable: '
    + formatNumber(totals.enqueued)
    + '\nNo phone: '
    + formatNumber(totals.skipped_no_phone)
    + '\n\nTarama çalıştırılsın mı?';
}

function buildFiltersPayload(filters: UnviewedFilters) {
  const payload: Record<string, unknown> = {};
  const campaignCode = filters.campaignCode.trim();
  if (campaignCode) payload.campaign_code = campaignCode;
  if (filters.grade) payload.grade = [filters.grade];
  if (filters.waStatus) payload.wa_result_status = [filters.waStatus];
  if (filters.publishedFrom) payload.from = `${filters.publishedFrom}T00:00:00.000Z`;
  if (filters.publishedTo) payload.to = `${filters.publishedTo}T23:59:59.999Z`;
  return payload;
}

function buildUnviewedPath(query: string, filters: UnviewedFilters, page: number, perPage: number) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('sort_by', 'result_published_at');
  params.set('sort_order', 'desc');

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const filtersPayload = buildFiltersPayload(filters);
  if (Object.keys(filtersPayload).length > 0) {
    params.set('filters', JSON.stringify(filtersPayload));
  }

  return `/api/panel/unviewed-results?${params.toString()}`;
}

export default function UnviewedResultsPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [query, setQuery] = useState('');
  const [templateCode, setTemplateCode] = useState<(typeof TEMPLATE_OPTIONS)[number]>('WA_RESULT');
  const [followupCampaignCode, setFollowupCampaignCode] = useState('');
  const [followupLimit, setFollowupLimit] = useState('250');
  const [followupResultUnseenDelayMinutes, setFollowupResultUnseenDelayMinutes] = useState('30');
  const [followupViewedDelayMinutes, setFollowupViewedDelayMinutes] = useState('180');
  const [followupNoShowDelayMinutes, setFollowupNoShowDelayMinutes] = useState('30');
  const [draftFilters, setDraftFilters] = useState<UnviewedFilters>(defaultFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<UnviewedFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [items, setItems] = useState<UnviewedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<UnviewedSummary>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const canOperate = canOperateUnviewed(role, permissions);
  const isReadOnly = isReadOnlyPanelRole(role);

  const pageCount = useMemo(() => {
    const value = Math.ceil(total / perPage);
    return value > 0 ? value : 1;
  }, [perPage, total]);

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedIds.includes(item.candidate_id));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await panelFetch(buildUnviewedPath(appliedQuery, appliedFilters, page, perPage), {
          method: 'GET',
        });
        const payload = (await response.json()) as UnviewedListResponse;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'Sonuç görmeyen aday listesi alınamadı.'));
        }

        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
        setSelectedIds((prev) => prev.filter((id) => nextItems.some((item) => item.candidate_id === id)));
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setSummary({});
          setSelectedIds([]);
          setErrorMessage(error instanceof Error ? error.message : 'Sonuç görmeyen aday listesi alınamadı.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, appliedFilters, appliedQuery, page, perPage]);

  useEffect(() => {
    if (message) notifySuccess(message);
  }, [message]);

  useEffect(() => {
    if (errorMessage) notifyError(errorMessage);
  }, [errorMessage]);

  const sendWhatsapp = async (candidateIds: string[]) => {
    if (!canOperate) {
      setErrorMessage('Bu rol için işlem aksiyonları kapalıdır (READ_ONLY).');
      return;
    }
    if (candidateIds.length === 0 || isActionRunning) return;

    setIsActionRunning(true);
    setMessage('');
    setErrorMessage('');

    try {
      if (candidateIds.length > 1) {
        const previewResponse = await panelFetch('/api/panel/unviewed-results/actions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            action: 'send_whatsapp',
            candidate_ids: candidateIds,
            template_code: templateCode,
            preview: true,
          }),
        });

        const previewPayload = (await previewResponse.json()) as UnviewedActionResponse;
        if (!previewResponse.ok) {
          throw new Error(normalizeMessage(previewPayload, 'WhatsApp dry-run başarısız.'));
        }

        const confirmed = window.confirm(buildBulkWhatsappPreviewMessage(previewPayload));
        if (!confirmed) {
          return;
        }
      }

      const response = await panelFetch('/api/panel/unviewed-results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'send_whatsapp',
          candidate_ids: candidateIds,
          template_code: templateCode,
        }),
      });

      const payload = (await response.json()) as UnviewedActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'WhatsApp gönderimi başarısız.'));
      }

      setMessage(
        'WhatsApp gönderimi tetiklendi. Requested: '
          + formatNumber(payload.requested)
          + ' • Enqueued: '
          + formatNumber(payload.enqueued)
          + ' • Skipped: '
          + formatNumber(payload.skipped)
          + readAuditLabel(payload),
      );

      const refresh = await panelFetch(buildUnviewedPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as UnviewedListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
        setSelectedIds((prev) => prev.filter((id) => refreshedItems.some((item) => item.candidate_id === id)));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'WhatsApp gönderimi tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  const runFollowupScan = async (mode: (typeof FOLLOW_UP_SCAN_MODES)[number]) => {
    if (!canOperate) {
      setErrorMessage('Bu rol için işlem aksiyonları kapalıdır (READ_ONLY).');
      return;
    }
    if (isActionRunning) return;

    setIsActionRunning(true);
    setMessage('');
    setErrorMessage('');

    const limitValue = Number.parseInt(followupLimit, 10);
    const resultUnseenDelayValue = Number.parseInt(followupResultUnseenDelayMinutes, 10);
    const viewedDelayValue = Number.parseInt(followupViewedDelayMinutes, 10);
    const noShowDelayValue = Number.parseInt(followupNoShowDelayMinutes, 10);

    try {
      const requestBody = {
        action: 'run_followup_auto_whatsapp',
        mode,
        campaign_code: followupCampaignCode.trim() || undefined,
        limit: Number.isFinite(limitValue) ? limitValue : undefined,
        result_unseen_delay_minutes: Number.isFinite(resultUnseenDelayValue) ? resultUnseenDelayValue : undefined,
        viewed_no_appointment_delay_minutes: Number.isFinite(viewedDelayValue) ? viewedDelayValue : undefined,
        appointment_no_show_delay_minutes: Number.isFinite(noShowDelayValue) ? noShowDelayValue : undefined,
      };

      const previewResponse = await panelFetch('/api/panel/unviewed-results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...requestBody,
          preview: true,
        }),
      });

      const previewPayload = (await previewResponse.json()) as UnviewedActionResponse;
      if (!previewResponse.ok) {
        throw new Error(normalizeMessage(previewPayload, 'Bot follow-up dry-run başarısız.'));
      }

      const confirmed = window.confirm(buildFollowupPreviewMessage(mode, previewPayload));
      if (!confirmed) {
        return;
      }

      const response = await panelFetch('/api/panel/unviewed-results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as UnviewedActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Bot follow-up taraması başarısız.'));
      }

      const unseen = payload.result_unseen || {};
      const viewed = payload.viewed_no_appointment || {};
      const noShow = payload.appointment_no_show || {};
      const totals = payload.totals || {};

      setMessage(
        'Bot follow-up taraması tamamlandı ('
          + mode
          + '). ResultUnseen: '
          + formatNumber(unseen.scanned)
          + ' scanned / '
          + formatNumber(unseen.enqueued)
          + ' enqueued • ViewedNoAppointment: '
          + formatNumber(viewed.scanned)
          + ' scanned / '
          + formatNumber(viewed.enqueued)
          + ' enqueued • NoShow: '
          + formatNumber(noShow.scanned)
          + ' scanned / '
          + formatNumber(noShow.enqueued)
          + ' enqueued • Total: '
          + formatNumber(totals.scanned)
          + ' scanned / '
          + formatNumber(totals.enqueued)
          + ' enqueued.'
          + readAuditLabel(payload),
      );

      const refresh = await panelFetch(buildUnviewedPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as UnviewedListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
        setSelectedIds((prev) => prev.filter((id) => refreshedItems.some((item) => item.candidate_id === id)));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Bot follow-up taraması tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <section className={panelWideSurfaceClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={panelEyebrowClassName}>Sonuç Görmeyenler</p>
          <h3 className={panelTitleClassName}>Unviewed Results Operasyon Ekranı</h3>
          <p className={panelDescriptionClassName}>
            Sonuç yayını yapılmış ancak görüntülenmemiş adayları filtreleyin, tekil veya toplu WhatsApp sonucu gönderin.
          </p>
        </div>

        <div className="min-w-[220px]">
          <label className="mb-1 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.1em] text-[#7A7063]">WhatsApp Şablonu</label>
          <select
            value={templateCode}
            onChange={(event) => setTemplateCode(event.target.value as (typeof TEMPLATE_OPTIONS)[number])}
            disabled={!canOperate}
            className="h-[40px] w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          >
            {TEMPLATE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Toplam Unviewed</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.total_unviewed ?? total)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">WA Sorunlu</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.wa_problematic)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">WA Ulaştı</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.wa_reached)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#1A273A] bg-[#050f1f]/95 p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/54">Bot Follow-up Manuel Tetikleme (L1)</p>
        <p className="mt-1 text-[12px] text-white/62">
          Davranış bazlı bot taramasını panelden manuel çalıştırın: <span className="text-white/78">result_unseen</span>, <span className="text-white/78">viewed_no_appointment</span> ve <span className="text-white/78">appointment_no_show</span>.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={followupCampaignCode}
            onChange={(event) => setFollowupCampaignCode(event.target.value)}
            placeholder="Campaign code (boşsa DEFAULT_CAMPAIGN_CODE)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={1}
            max={2000}
            value={followupLimit}
            onChange={(event) => setFollowupLimit(event.target.value)}
            placeholder="Limit (1-2000)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={0}
            max={1440}
            value={followupResultUnseenDelayMinutes}
            onChange={(event) => setFollowupResultUnseenDelayMinutes(event.target.value)}
            placeholder="Unseen delay (dk)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={0}
            max={1440}
            value={followupViewedDelayMinutes}
            onChange={(event) => setFollowupViewedDelayMinutes(event.target.value)}
            placeholder="Viewed delay (dk)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={0}
            max={1440}
            value={followupNoShowDelayMinutes}
            onChange={(event) => setFollowupNoShowDelayMinutes(event.target.value)}
            placeholder="No-show delay (dk)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runFollowupScan('result_unseen')}
            disabled={!canOperate || isActionRunning}
            className="rounded-xl border border-[#2C3F5D] bg-[#111D32]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#C3D7FF] transition hover:border-[#3A5A86] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Sonuç Görmeyen Tara
          </button>
          <button
            type="button"
            onClick={() => void runFollowupScan('viewed_no_appointment')}
            disabled={!canOperate || isActionRunning}
            className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Viewed/Randevu Yok Tara
          </button>
          <button
            type="button"
            onClick={() => void runFollowupScan('appointment_no_show')}
            disabled={!canOperate || isActionRunning}
            className="rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#FFB8B1] transition hover:border-[#8D3430] disabled:cursor-not-allowed disabled:opacity-55"
          >
            No-show Tara
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Aday / okul ara"
          className={panelInputClassName}
        />
        <input
          value={draftFilters.campaignCode}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, campaignCode: event.target.value }))}
          placeholder="Campaign code"
          className={panelInputClassName}
        />
        <select
          value={draftFilters.grade}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, grade: event.target.value }))}
          className={panelInputClassName}
        >
          <option value="">Sınıf (tümü)</option>
          {GRADE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.waStatus}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, waStatus: event.target.value }))}
          className={panelInputClassName}
        >
          <option value="">WA durum (tümü)</option>
          {WA_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#6E6A62]">
          <span>Yayın başlangıç</span>
          <input
            type="date"
            value={draftFilters.publishedFrom}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, publishedFrom: event.target.value }))}
            className="h-[36px] rounded-[14px] border border-[#DDD4C6] bg-[#FFFCF7] px-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          />
        </label>
        <label className="flex items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#6E6A62]">
          <span>Yayın bitiş</span>
          <input
            type="date"
            value={draftFilters.publishedTo}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, publishedTo: event.target.value }))}
            className="h-[36px] rounded-[14px] border border-[#DDD4C6] bg-[#FFFCF7] px-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#16251F] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setAppliedQuery(query.trim());
            setAppliedFilters({ ...draftFilters });
            setPage(1);
            setMessage('');
            setErrorMessage('');
          }}
          className={panelPrimaryButtonClassName}
        >
          Filtreleri Uygula
        </button>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setDraftFilters(defaultFilters);
            setAppliedQuery('');
            setAppliedFilters(defaultFilters);
            setPage(1);
            setMessage('');
            setErrorMessage('');
          }}
          className={panelSecondaryButtonClassName}
        >
          Filtreleri Temizle
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isReadOnly ? (
          <PanelFeedbackMessage tone="info">READ_ONLY modu: WhatsApp gönderim aksiyonları kapalıdır.</PanelFeedbackMessage>
        ) : null}
        <button
          type="button"
          onClick={() => void sendWhatsapp(selectedIds)}
          disabled={!canOperate || isActionRunning || selectedIds.length === 0}
          className={panelSecondaryButtonClassName}
        >
          Toplu WhatsApp Gönder ({selectedIds.length})
        </button>
      </div>

      {message ? <PanelFeedbackMessage className="mt-3" tone="success">{message}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage className="mt-3" tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      {isLoading ? <PanelLoadingMessage>Sonuç görmeyen aday listesi yükleniyor...</PanelLoadingMessage> : null}

      {!isLoading ? (
        <div className={panelTableContainerClassName}>
          <table className="min-w-[1320px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      disabled={!canOperate}
                      onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((item) => item.candidate_id)])));
                      } else {
                        const pageIds = new Set(items.map((item) => item.candidate_id));
                        setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2">Aday</th>
                <th className="px-2 py-2">Okul</th>
                <th className="px-2 py-2">Sınıf</th>
                <th className="px-2 py-2">Son Giriş</th>
                <th className="px-2 py-2">Sonuç Yayın</th>
                <th className="px-2 py-2">WA Durum</th>
                <th className="px-2 py-2">WA Son Gönderim</th>
                <th className="px-2 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className={panelEmptyRowClassName}>
                    Filtreye uygun sonuç görmeyen aday bulunamadı.
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.candidate_id} className="border-b border-[#F0E7DA] align-top">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.candidate_id)}
                      disabled={!canOperate}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds((prev) => Array.from(new Set([...prev, item.candidate_id])));
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== item.candidate_id));
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.student_full_name || '-'}</td>
                  <td className="px-2 py-2">{item.school_name || '-'}</td>
                  <td className="px-2 py-2">{item.grade ? String(item.grade) : '-'}</td>
                  <td className="px-2 py-2">{formatDate(item.last_login_at)}</td>
                  <td className="px-2 py-2">{formatDate(item.result_published_at)}</td>
                  <td className="px-2 py-2">{item.wa_result_status || '-'}</td>
                  <td className="px-2 py-2">{formatDate(item.wa_last_sent_at)}</td>
                  <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void sendWhatsapp([item.candidate_id])}
                        disabled={!canOperate || isActionRunning}
                        className={panelSmallButtonClassName}
                      >
                        Tekil WA Gönder
                      </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
          Toplam {formatNumber(total)} kayıt • Sayfa {page} / {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || isLoading}
            className={panelSmallButtonClassName}
          >
            Önceki
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={page >= pageCount || isLoading}
            className={panelSmallButtonClassName}
          >
            Sonraki
          </button>
        </div>
      </div>
    </section>
  );
}
