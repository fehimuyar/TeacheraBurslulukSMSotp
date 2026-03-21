import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canPushCrm, isReadOnlyPanelRole } from './panelRoleAccess';

type CrmExportRow = {
  job_id: string;
  campaign_code: string | null;
  candidate_id: string | null;
  application_no: string | null;
  student_full_name: string | null;
  grade: number | null;
  school_name: string | null;
  status: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  http_status: number | null;
  external_reference: string | null;
  error_code: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CrmSummary = {
  total_jobs?: number;
  queued_jobs?: number;
  processing_jobs?: number;
  retrying_jobs?: number;
  succeeded_jobs?: number;
  failed_jobs?: number;
  dlq_jobs?: number;
  cancelled_jobs?: number;
  hard_fail_jobs?: number;
  retry_due_jobs?: number;
  error_breakdown?: Array<{ error_code?: string | null; count?: number }>;
};

type CrmListResponse = {
  items?: CrmExportRow[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: CrmSummary;
  message?: string;
  error?: string;
};

type CrmActionResponse = {
  requested?: number;
  updated?: number;
  message?: string;
  error?: string;
};

type CrmFilters = {
  campaignCode: string;
  status: string;
  problematicOnly: boolean;
  retryDueOnly: boolean;
};

const defaultFilters: CrmFilters = {
  campaignCode: '',
  status: '',
  problematicOnly: false,
  retryDueOnly: false,
};

const STATUS_OPTIONS = ['QUEUED', 'PROCESSING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'DLQ', 'CANCELLED'] as const;

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

function shortId(value: string | null | undefined) {
  if (!value) return '-';
  return value.slice(0, 8);
}

function buildFiltersPayload(filters: CrmFilters) {
  const payload: Record<string, unknown> = {};
  const campaignCode = filters.campaignCode.trim();
  if (campaignCode) payload.campaign_code = campaignCode;
  if (filters.status) payload.status = [filters.status];
  if (filters.problematicOnly) payload.problematic_only = true;
  if (filters.retryDueOnly) payload.retry_due_only = true;
  return payload;
}

function buildCrmPath(query: string, filters: CrmFilters, page: number, perPage: number) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('sort_by', 'created_at');
  params.set('sort_order', 'desc');
  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }
  const filtersPayload = buildFiltersPayload(filters);
  if (Object.keys(filtersPayload).length > 0) {
    params.set('filters', JSON.stringify(filtersPayload));
  }
  return `/api/panel/crm?${params.toString()}`;
}

export default function CrmExportPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [query, setQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<CrmFilters>(defaultFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<CrmFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [items, setItems] = useState<CrmExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<CrmSummary>({});
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const canOperate = canPushCrm(role, permissions);
  const isReadOnly = isReadOnlyPanelRole(role);

  const pageCount = useMemo(() => {
    const value = Math.ceil(total / perPage);
    return value > 0 ? value : 1;
  }, [perPage, total]);

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedJobIds.includes(item.job_id));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const loadCrmJobs = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await panelFetch(buildCrmPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
        const payload = (await response.json()) as CrmListResponse;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'CRM export listesi alınamadı.'));
        }
        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
        setSelectedJobIds((prev) => prev.filter((id) => nextItems.some((item) => item.job_id === id)));
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setSummary({});
          setSelectedJobIds([]);
          setErrorMessage(error instanceof Error ? error.message : 'CRM export listesi alınamadı.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCrmJobs();
    return () => {
      cancelled = true;
    };
  }, [active, appliedFilters, appliedQuery, page, perPage]);

  const runAction = async (action: 'retry' | 'cancel', jobIds: string[]) => {
    if (!canOperate) {
      setErrorMessage('Bu rol için CRM aksiyon yetkisi yok.');
      return;
    }
    if (jobIds.length === 0 || isActionRunning) return;

    setIsActionRunning(true);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/crm/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action,
          job_ids: jobIds,
        }),
      });
      const payload = (await response.json()) as CrmActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'CRM aksiyonu başarısız.'));
      }

      const actionLabel = action === 'retry' ? 'Retry' : 'Cancel';
      setMessage(`${actionLabel} tamamlandı. Requested: ${formatNumber(payload.requested)} • Updated: ${formatNumber(payload.updated)}`);

      const refresh = await panelFetch(buildCrmPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as CrmListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
        setSelectedJobIds((prev) => prev.filter((id) => refreshedItems.some((item) => item.job_id === id)));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CRM aksiyonu tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)] lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">CRM Export Queue</p>
          <h3 className="mt-2 text-[22px] font-semibold text-white">Tekil/Toplu CRM Aktarım Durumu</h3>
          <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
            Candidate push işlerinin queue durumu, retry, hata kodları ve işlem geçmişi bu panelde izlenir.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Toplam Job</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.total_jobs ?? total)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Queued/Retrying</p>
          <p className="mt-1 text-[22px] font-semibold text-white">
            {formatNumber((summary.queued_jobs || 0) + (summary.retrying_jobs || 0))}
          </p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Succeeded</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.succeeded_jobs)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Failed/DLQ</p>
          <p className="mt-1 text-[22px] font-semibold text-white">
            {formatNumber((summary.failed_jobs || 0) + (summary.dlq_jobs || 0))}
          </p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Retry Due</p>
          <p className="mt-1 text-[22px] font-semibold text-[#FFD2CE]">{formatNumber(summary.retry_due_jobs)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Hard Fail</p>
          <p className="mt-1 text-[22px] font-semibold text-[#FFD2CE]">{formatNumber(summary.hard_fail_jobs)}</p>
        </div>
      </div>

      {(summary.error_breakdown || []).length > 0 ? (
        <div className="mt-3 rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] uppercase tracking-[0.12em] text-white/56">Top Hata Kodlari</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(summary.error_breakdown || []).slice(0, 5).map((item) => (
              <span
                key={`${item.error_code || 'unknown'}-${item.count || 0}`}
                className="rounded-full border border-[#6F2824] bg-[#2B1214]/80 px-3 py-1 text-[11px] text-[#FFB8B1]"
              >
                {item.error_code || 'unknown'}: {formatNumber(Number(item.count || 0))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {isReadOnly ? (
        <p className="mt-3 rounded-lg border border-[#274063] bg-[#0A192B]/80 px-3 py-2 text-[12px] text-[#9FC7FF]">
          READ_ONLY rolünde CRM push aksiyonları kapalıdır.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Aday / başvuru no / hata kodu ara"
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <input
          value={draftFilters.campaignCode}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, campaignCode: event.target.value }))}
          placeholder="Campaign code"
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <select
          value={draftFilters.status}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, status: event.target.value }))}
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Durum (tümü)</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <label className="inline-flex h-[42px] items-center gap-2 rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 text-[12px] text-white/78">
          <input
            type="checkbox"
            checked={draftFilters.problematicOnly}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, problematicOnly: event.target.checked }))}
            className="h-3.5 w-3.5 accent-[#D92E27]"
          />
          <span>Problematic only</span>
        </label>
        <label className="inline-flex h-[42px] items-center gap-2 rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 text-[12px] text-white/78">
          <input
            type="checkbox"
            checked={draftFilters.retryDueOnly}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, retryDueOnly: event.target.checked }))}
            className="h-3.5 w-3.5 accent-[#D92E27]"
          />
          <span>Retry due only</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setAppliedQuery(query.trim());
              setAppliedFilters({ ...draftFilters });
              setPage(1);
              setMessage('');
              setErrorMessage('');
            }}
            className="h-[42px] flex-1 rounded-xl bg-[#D92E27] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f]"
          >
            Uygula
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
            className="h-[42px] flex-1 rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-[#2D4363]"
          >
            Temizle
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runAction('retry', selectedJobIds)}
          disabled={!canOperate || isActionRunning || selectedJobIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Retry Seçili ({selectedJobIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('cancel', selectedJobIds)}
          disabled={!canOperate || isActionRunning || selectedJobIds.length === 0}
          className="rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#FFB8B1] transition hover:border-[#8D3430] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Cancel Seçili ({selectedJobIds.length})
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-[#244B39] bg-[#0E261E] px-3 py-2 text-[12px] text-[#9FE4D0]">{message}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
      ) : null}

      {isLoading ? <p className="mt-3 text-[13px] text-white/65">CRM export listesi yükleniyor...</p> : null}

      {!isLoading ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1280px] text-left text-[12px] text-white/80">
            <thead>
              <tr className="border-b border-white/12 text-white/56">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    disabled={!canOperate}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedJobIds((prev) => Array.from(new Set([...prev, ...items.map((item) => item.job_id)])));
                      } else {
                        const pageIds = new Set(items.map((item) => item.job_id));
                        setSelectedJobIds((prev) => prev.filter((id) => !pageIds.has(id)));
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2">Job</th>
                <th className="px-2 py-2">Aday</th>
                <th className="px-2 py-2">Okul/Sınıf</th>
                <th className="px-2 py-2">Durum</th>
                <th className="px-2 py-2">Retry</th>
                <th className="px-2 py-2">Next Retry</th>
                <th className="px-2 py-2">HTTP/Ref</th>
                <th className="px-2 py-2">Hata</th>
                <th className="px-2 py-2">Processed</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-white/55">
                    Filtreye uygun CRM export işi bulunamadı.
                  </td>
                </tr>
              ) : null}
              {items.map((item) => {
                const status = String(item.status || '').toUpperCase();
                const isHardFail = status === 'FAILED' || status === 'DLQ';
                const nextRetryDate = item.next_retry_at ? new Date(item.next_retry_at) : null;
                const isRetryDue =
                  status === 'RETRYING'
                  && nextRetryDate
                  && Number.isFinite(nextRetryDate.getTime())
                  && nextRetryDate.getTime() <= Date.now();
                return (
                <tr
                  key={item.job_id}
                  className={`border-b border-white/6 align-top ${isHardFail || isRetryDue ? 'bg-[#2B1214]/40' : ''}`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedJobIds.includes(item.job_id)}
                      disabled={!canOperate}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedJobIds((prev) => Array.from(new Set([...prev, item.job_id])));
                        } else {
                          setSelectedJobIds((prev) => prev.filter((id) => id !== item.job_id));
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-semibold text-white">{shortId(item.job_id)}</p>
                    <p className="text-white/55">{item.campaign_code || '-'}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.student_full_name || '-'}</p>
                    <p className="text-white/55">{item.application_no || shortId(item.candidate_id)}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.school_name || '-'}</p>
                    <p className="text-white/55">Sınıf: {item.grade ? String(item.grade) : '-'}</p>
                  </td>
                  <td className="px-2 py-2">{item.status || '-'}</td>
                  <td className="px-2 py-2">{formatNumber(item.retry_count ?? undefined)}</td>
                  <td className="px-2 py-2">
                    <p>{formatDate(item.next_retry_at)}</p>
                    {isRetryDue ? <p className="text-[11px] text-[#FFB8B1]">Due</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.http_status ?? '-'}</p>
                    <p className="text-white/55">{item.external_reference || '-'}</p>
                  </td>
                  <td className="max-w-[260px] px-2 py-2">
                    <p>{item.error_code || '-'}</p>
                    <p className="text-[11px] text-white/55">{item.error_message || '-'}</p>
                  </td>
                  <td className="px-2 py-2">{formatDate(item.processed_at)}</td>
                  <td className="px-2 py-2">{formatDate(item.created_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => void runAction('retry', [item.job_id])}
                        disabled={!canOperate || isActionRunning}
                        className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction('cancel', [item.job_id])}
                        disabled={!canOperate || isActionRunning}
                        className="rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#FFB8B1] transition hover:border-[#8D3430] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-white/58">
          Toplam {formatNumber(total)} kayıt • Sayfa {page} / {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || isLoading}
            className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Önceki
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={page >= pageCount || isLoading}
            className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Sonraki
          </button>
        </div>
      </div>
    </section>
  );
}
