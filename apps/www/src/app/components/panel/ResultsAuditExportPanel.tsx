import { useEffect, useMemo, useState } from 'react';
import { panelFetch, resolvePanelEndpoint } from '../../api/panelApi';
import { canExportAudit, canReadAudit } from './panelRoleAccess';

type HistoryItem = {
  history_id: string;
  action_type: 'OVERRIDE' | 'PUBLISH' | string;
  occurred_at: string | null;
  result_id: string;
  candidate_id: string;
  campaign_code: string | null;
  application_no: string | null;
  actor_id: string | null;
  actor_role: string | null;
  reason: string | null;
  previous_score: number | null;
  new_score: number | null;
  previous_percentage: number | null;
  new_percentage: number | null;
  previous_placement_label: string | null;
  new_placement_label: string | null;
  previous_cefr_band: string | null;
  new_cefr_band: string | null;
  previous_status: string | null;
  next_status: string | null;
  previous_published_at: string | null;
  next_published_at: string | null;
  publish_mode: string | null;
  enqueue_whatsapp: string | boolean | null;
  sms_job_id: string | null;
  sms_status: string | null;
  sms_queued_at: string | null;
  sms_sent_at: string | null;
  sms_delivered_at: string | null;
  sms_read_at: string | null;
  sms_error_code: string | null;
  sms_retry_count: number | null;
  wa_job_id: string | null;
  wa_status: string | null;
  wa_queued_at: string | null;
  wa_sent_at: string | null;
  wa_delivered_at: string | null;
  wa_read_at: string | null;
  wa_error_code: string | null;
  wa_retry_count: number | null;
  sms_fallback_expected: string | boolean | null;
  sms_fallback_triggered: string | boolean | null;
};

type HistoryPayload = {
  items?: HistoryItem[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: {
    total_events?: number;
    override_events?: number;
    publish_events?: number;
    republish_events?: number;
    distinct_results?: number;
    distinct_candidates?: number;
    sources?: {
      has_overrides?: boolean;
      has_publications?: boolean;
    };
  };
  message?: string;
  error?: string;
};

type ActionFilter = 'ALL' | 'OVERRIDE' | 'PUBLISH';

const ACTION_FILTER_OPTIONS: Array<{ label: string; value: ActionFilter }> = [
  { label: 'Tüm Action', value: 'ALL' },
  { label: 'OVERRIDE', value: 'OVERRIDE' },
  { label: 'PUBLISH', value: 'PUBLISH' },
];

function formatNumber(value: number | undefined) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
}

function normalizeError(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function shorten(value: string | null | undefined, size = 12) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= size) return raw;
  return `${raw.slice(0, size)}...`;
}

function formatScorePair(previousValue: number | null, nextValue: number | null) {
  const prev = Number.isFinite(previousValue) ? Number(previousValue).toFixed(2) : '-';
  const next = Number.isFinite(nextValue) ? Number(nextValue).toFixed(2) : '-';
  return `${prev} -> ${next}`;
}

function formatTextPair(previousValue: string | null, nextValue: string | null) {
  const prev = String(previousValue || '-').trim() || '-';
  const next = String(nextValue || '-').trim() || '-';
  return `${prev} -> ${next}`;
}

function normalizeBoolean(value: string | boolean | null | undefined) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized === 'true';
}

function formatTimelineStatus(value: string | null | undefined) {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  return raw || 'NOT_QUEUED';
}

function buildHistoryPath(params: {
  page: number;
  perPage: number;
  q: string;
  actionFilter: ActionFilter;
  campaignCode: string;
  from: string;
  to: string;
}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('per_page', String(params.perPage));
  query.set('sort_by', 'occurred_at');
  query.set('sort_order', 'desc');

  const q = params.q.trim();
  if (q) {
    query.set('q', q);
  }

  const filters: Record<string, unknown> = {};
  if (params.actionFilter !== 'ALL') filters.action_type = [params.actionFilter];
  if (params.campaignCode.trim()) filters.campaign_code = params.campaignCode.trim();
  if (params.from.trim()) filters.from = params.from.trim();
  if (params.to.trim()) filters.to = params.to.trim();
  if (Object.keys(filters).length > 0) {
    query.set('filters', JSON.stringify(filters));
  }

  return `/api/panel/results/history?${query.toString()}`;
}

function toExportPath(listPath: string, format: 'csv' | 'xls') {
  return `${listPath.replace('/api/panel/results/history?', '/api/panel/results/history/export?')}&format=${format}`;
}

function readExportFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback;
  const matched = /filename="?([^"]+)"?/i.exec(contentDisposition)?.[1];
  return matched || fallback;
}

export default function ResultsAuditExportPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [appliedActionFilter, setAppliedActionFilter] = useState<ActionFilter>('ALL');
  const [campaignCode, setCampaignCode] = useState('');
  const [appliedCampaignCode, setAppliedCampaignCode] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<HistoryPayload['summary']>({});
  const canRead = canReadAudit(role, permissions);
  const canExport = canExportAudit(role, permissions);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [perPage, total]);

  useEffect(() => {
    if (!active || !canRead) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await panelFetch(
          buildHistoryPath({
            page,
            perPage,
            q: appliedQ,
            actionFilter: appliedActionFilter,
            campaignCode: appliedCampaignCode,
            from: appliedFromDate,
            to: appliedToDate,
          }),
          { method: 'GET' },
        );
        const payload = (await response.json()) as HistoryPayload;
        if (!response.ok) {
          throw new Error(normalizeError(payload, 'Results history listesi alınamadı.'));
        }
        if (cancelled) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Results history listesi alınamadı.');
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
  }, [
    active,
    canRead,
    page,
    perPage,
    appliedQ,
    appliedActionFilter,
    appliedCampaignCode,
    appliedFromDate,
    appliedToDate,
  ]);

  const applyFilters = () => {
    setAppliedQ(q.trim());
    setAppliedActionFilter(actionFilter);
    setAppliedCampaignCode(campaignCode.trim());
    setAppliedFromDate(fromDate.trim());
    setAppliedToDate(toDate.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setQ('');
    setAppliedQ('');
    setActionFilter('ALL');
    setAppliedActionFilter('ALL');
    setCampaignCode('');
    setAppliedCampaignCode('');
    setFromDate('');
    setAppliedFromDate('');
    setToDate('');
    setAppliedToDate('');
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'xls') => {
    if (!canExport) {
      setErrorMessage('Bu rol icin results history export kapali (PANEL_AUDIT_EXPORT).');
      return;
    }
    if (isExporting) return;

    setIsExporting(true);
    setErrorMessage('');

    try {
      const listPath = buildHistoryPath({
        page: 1,
        perPage: 100000,
        q: appliedQ,
        actionFilter: appliedActionFilter,
        campaignCode: appliedCampaignCode,
        from: appliedFromDate,
        to: appliedToDate,
      });
      const exportPath = toExportPath(listPath, format);
      const response = await panelFetch(exportPath, {
        method: 'GET',
        headers: {
          Accept: format === 'xls' ? 'application/vnd.ms-excel' : 'text/csv',
        },
      });
      if (!response.ok) {
        let message = `Results history export başarısız (HTTP ${response.status}).`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          message = normalizeError(payload, message);
        } catch {
          // keep default message
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const filename = readExportFileName(
        response.headers.get('content-disposition'),
        `results-history-export.${format}`,
      );
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Results history export başarısız.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)] lg:col-span-2">
      <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Results History & Export</p>
      <h3 className="mt-2 text-[22px] font-semibold text-white">Override / Publish Timeline</h3>
      <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
        Sonuç override ve publish işlemlerinin timeline kaydı tek endpointten izlenir; filtreli export alınır.
      </p>

      {!canRead ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">
          Bu bolumu goruntulemek icin PANEL_AUDIT_READ izni gerekir.
        </p>
      ) : null}

      {!canRead ? null : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Toplam Event</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.total_events ?? total)}</p>
            </div>
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Override Event</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.override_events)}</p>
            </div>
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Publish Event</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.publish_events)}</p>
            </div>
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Republish</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.republish_events)}</p>
            </div>
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Distinct Result</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.distinct_results)}</p>
            </div>
            <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
              <p className="text-[12px] text-white/52">Distinct Candidate</p>
              <p className="mt-1 text-[20px] font-semibold text-white">{formatNumber(summary?.distinct_candidates)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_220px_180px_180px_180px_auto_auto]">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Result ID / candidate ID / actor / reason ara"
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
            />
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value as ActionFilter)}
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
            >
              {ACTION_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={campaignCode}
              onChange={(event) => setCampaignCode(event.target.value)}
              placeholder="Campaign code"
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
            />
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
            />
            <input
              type="datetime-local"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
            />
            <button
              type="button"
              onClick={applyFilters}
              className="h-[40px] rounded-xl bg-[#D92E27] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f]"
            >
              Uygula
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-[40px] rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-[#2D4363]"
            >
              Temizle
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => void handleExport('csv')}
              disabled={isExporting || !canExport}
              className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 font-semibold uppercase tracking-[0.11em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? 'Export...' : 'CSV Export'}
            </button>
            <button
              type="button"
              onClick={() => void handleExport('xls')}
              disabled={isExporting || !canExport}
              className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 font-semibold uppercase tracking-[0.11em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isExporting ? 'Export...' : 'XLS Export'}
            </button>
            <a
              href={resolvePanelEndpoint('/api/panel/results/history')}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#1A273A] bg-[#071021]/82 px-3 py-2 font-semibold uppercase tracking-[0.11em] text-white/72 transition hover:border-[#2D4363]"
            >
              Results History API
            </a>
          </div>

          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1380px] text-left text-[12px] text-white/80">
              <thead>
                <tr className="border-b border-white/12 text-white/56">
                  <th className="px-2 py-2">Tarih</th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Campaign</th>
                  <th className="px-2 py-2">Application</th>
                  <th className="px-2 py-2">Result/Candidate</th>
                  <th className="px-2 py-2">Actor</th>
                  <th className="px-2 py-2">Detay</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-white/60">
                      Results history kayıtları yükleniyor...
                    </td>
                  </tr>
                ) : null}
                {!isLoading && items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-white/60">
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : null}
                {!isLoading
                  ? items.map((item) => (
                      <tr key={item.history_id} className="border-b border-white/6 align-top">
                        <td className="px-2 py-2">{formatDateTime(item.occurred_at)}</td>
                        <td className="px-2 py-2">{item.action_type}</td>
                        <td className="px-2 py-2">{item.campaign_code || '-'}</td>
                        <td className="px-2 py-2">{item.application_no || '-'}</td>
                        <td className="px-2 py-2">
                          <p>R: {shorten(item.result_id)}</p>
                          <p>C: {shorten(item.candidate_id)}</p>
                        </td>
                        <td className="px-2 py-2">
                          <p>{item.actor_id || '-'}</p>
                          <p className="text-[11px] text-white/56">{item.actor_role || '-'}</p>
                        </td>
                        <td className="px-2 py-2">
                          <div className="space-y-2">
                            {item.action_type === 'OVERRIDE' ? (
                              <div className="space-y-1">
                                <p>Reason: {item.reason || '-'}</p>
                                <p>Score: {formatScorePair(item.previous_score, item.new_score)}</p>
                                <p>Percentage: {formatScorePair(item.previous_percentage, item.new_percentage)}</p>
                                <p>Placement: {formatTextPair(item.previous_placement_label, item.new_placement_label)}</p>
                                <p>CEFR: {formatTextPair(item.previous_cefr_band, item.new_cefr_band)}</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p>Mode: {item.publish_mode || '-'}</p>
                                <p>Status: {formatTextPair(item.previous_status, item.next_status)}</p>
                                <p>PublishedAt: {formatTextPair(item.previous_published_at, item.next_published_at)}</p>
                                <p>WA Queue: {normalizeBoolean(item.enqueue_whatsapp) ? 'true' : 'false'}</p>
                              </div>
                            )}

                            <div className="rounded-lg border border-[#1A273A] bg-[#020B19]/80 px-2 py-1.5 text-[11px] text-white/78">
                              <p className="font-semibold uppercase tracking-[0.08em] text-white/62">Delivery Timeline</p>
                              <p>
                                SMS: {formatTimelineStatus(item.sms_status)} | q:{' '}
                                {formatDateTime(item.sms_queued_at)} | s: {formatDateTime(item.sms_sent_at)} | d:{' '}
                                {formatDateTime(item.sms_delivered_at)} | r: {formatDateTime(item.sms_read_at)}
                              </p>
                              <p>
                                SMS retry/error: {formatNumber(item.sms_retry_count || 0)} / {item.sms_error_code || '-'}
                              </p>
                              <p>
                                WA: {formatTimelineStatus(item.wa_status)} | q: {formatDateTime(item.wa_queued_at)} | s:{' '}
                                {formatDateTime(item.wa_sent_at)} | d: {formatDateTime(item.wa_delivered_at)} | r:{' '}
                                {formatDateTime(item.wa_read_at)}
                              </p>
                              <p>
                                WA retry/error: {formatNumber(item.wa_retry_count || 0)} / {item.wa_error_code || '-'}
                              </p>
                              <p>
                                Fallback expected/triggered: {normalizeBoolean(item.sms_fallback_expected) ? 'true' : 'false'} /{' '}
                                {normalizeBoolean(item.sms_fallback_triggered) ? 'true' : 'false'}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-white/70">
            <span>
              Sayfa {page} / {pageCount} • Toplam kayıt: {formatNumber(total)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-55"
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                disabled={page >= pageCount}
                className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-55"
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
