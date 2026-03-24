import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canOperateDlq, isReadOnlyPanelRole } from './panelRoleAccess';
import {
  PanelFeedbackMessage,
  PanelLoadingMessage,
  panelDangerButtonClassName,
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

type DlqRow = {
  id: string;
  source_job_id: string | null;
  channel: string | null;
  campaign_code: string | null;
  candidate_id: string | null;
  error_code: string | null;
  retry_count: number | null;
  status: string | null;
  root_cause_note: string | null;
  assigned_to: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DlqSummary = {
  total_dlq?: number;
  open_dlq?: number;
  closed_dlq?: number;
};

type DlqListResponse = {
  items?: DlqRow[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: DlqSummary;
  message?: string;
  error?: string;
};

type DlqActionResponse = {
  action?: string;
  requested?: number;
  updated?: number;
  message?: string;
  error?: string;
};

type DlqFilters = {
  campaignCode: string;
  channel: '' | 'SMS' | 'WHATSAPP';
  status: string;
  errorCode: string;
  retryFrom: string;
  retryTo: string;
};

const defaultFilters: DlqFilters = {
  campaignCode: '',
  channel: '',
  status: '',
  errorCode: '',
  retryFrom: '',
  retryTo: '',
};

const STATUS_OPTIONS = ['OPEN', 'REQUEUED', 'CLOSED'] as const;
const CHANNEL_OPTIONS = ['SMS', 'WHATSAPP'] as const;
const TEMPLATE_OPTIONS = ['CREDENTIALS_SMS', 'EXAM_OPEN_SMS', 'WA_RESULT', 'WA_RESULT_REMINDER'] as const;

type DlqAction = 'retry' | 'change_template' | 'assign' | 'close';

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

function shortId(value: string | null | undefined) {
  if (!value) return '-';
  return value.slice(0, 8);
}

function normalizeMessage(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function buildFiltersPayload(filters: DlqFilters) {
  const payload: Record<string, unknown> = {};
  const campaignCode = filters.campaignCode.trim();
  if (campaignCode) payload.campaign_code = campaignCode;
  if (filters.channel) payload.channel = [filters.channel];
  if (filters.status) payload.status = [filters.status];
  if (filters.errorCode.trim()) payload.error_code = [filters.errorCode.trim()];
  if (filters.retryFrom.trim()) payload.retry_from = Number.parseInt(filters.retryFrom, 10);
  if (filters.retryTo.trim()) payload.retry_to = Number.parseInt(filters.retryTo, 10);
  return payload;
}

function buildDlqPath(query: string, filters: DlqFilters, page: number, perPage: number) {
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

  return `/api/panel/dlq?${params.toString()}`;
}

export default function DlqOperationsPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [query, setQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<DlqFilters>(defaultFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<DlqFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [items, setItems] = useState<DlqRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<DlqSummary>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignTo, setAssignTo] = useState('');
  const [templateCode, setTemplateCode] = useState<(typeof TEMPLATE_OPTIONS)[number]>('WA_RESULT');
  const [rootCauseNote, setRootCauseNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const canOperate = canOperateDlq(role, permissions);
  const isReadOnly = isReadOnlyPanelRole(role);

  const pageCount = useMemo(() => {
    const value = Math.ceil(total / perPage);
    return value > 0 ? value : 1;
  }, [perPage, total]);

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await panelFetch(buildDlqPath(appliedQuery, appliedFilters, page, perPage), {
          method: 'GET',
        });
        const payload = (await response.json()) as DlqListResponse;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'DLQ listesi alınamadı.'));
        }

        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
        setSelectedIds((prev) => prev.filter((id) => nextItems.some((item) => item.id === id)));
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setSummary({});
          setSelectedIds([]);
          setErrorMessage(error instanceof Error ? error.message : 'DLQ listesi alınamadı.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [active, appliedFilters, appliedQuery, page, perPage]);

  const runAction = async (action: DlqAction, dlqIds: string[]) => {
    if (!canOperate) {
      setErrorMessage('Bu rol için işlem aksiyonları kapalıdır (READ_ONLY).');
      return;
    }
    if (dlqIds.length === 0 || isActionRunning) return;

    setIsActionRunning(true);
    setErrorMessage('');
    setMessage('');

    try {
      const body: Record<string, unknown> = {
        action,
        dlq_ids: dlqIds,
      };

      if (action === 'assign') {
        body.assigned_to = assignTo.trim();
      }
      if (action === 'change_template') {
        body.template_code = templateCode;
      }
      if (action === 'close') {
        body.root_cause_note = rootCauseNote.trim();
      }

      const response = await panelFetch('/api/panel/dlq/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as DlqActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'DLQ aksiyonu başarısız.'));
      }

      const actionLabel =
        action === 'retry'
          ? 'Retry'
          : action === 'change_template'
            ? 'Template Change'
            : action === 'assign'
              ? 'Assign'
              : 'Close';
      setMessage(`${actionLabel} tamamlandı. Requested: ${formatNumber(payload.requested)} • Updated: ${formatNumber(payload.updated)}`);

      const refresh = await panelFetch(buildDlqPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as DlqListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
        setSelectedIds((prev) => prev.filter((id) => refreshedItems.some((item) => item.id === id)));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'DLQ aksiyonu tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <section className={panelWideSurfaceClassName}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={panelEyebrowClassName}>DLQ & Hata</p>
          <h3 className={panelTitleClassName}>DLQ Operasyon Ekranı</h3>
          <p className={panelDescriptionClassName}>
            Kanal, hata kodu ve retry bilgisine göre DLQ kayıtlarını filtreleyin; retry, template change, assign ve close işlemlerini yürütün.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Toplam DLQ</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.total_dlq ?? total)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Açık DLQ</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.open_dlq)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Kapalı DLQ</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.closed_dlq)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Error code / root cause ara"
          className={panelInputClassName}
        />
        <input
          value={draftFilters.campaignCode}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, campaignCode: event.target.value }))}
          placeholder="Campaign code"
          className={panelInputClassName}
        />
        <select
          value={draftFilters.channel}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, channel: event.target.value as DlqFilters['channel'] }))}
          className={panelInputClassName}
        >
          <option value="">Kanal (tümü)</option>
          {CHANNEL_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.status}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, status: event.target.value }))}
          className={panelInputClassName}
        >
          <option value="">Status (tümü)</option>
          {STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          value={draftFilters.errorCode}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, errorCode: event.target.value }))}
          placeholder="Error code"
          className={panelInputClassName}
        />
        <input
          value={draftFilters.retryFrom}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, retryFrom: event.target.value }))}
          placeholder="Retry min"
          className={panelInputClassName}
        />
        <input
          value={draftFilters.retryTo}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, retryTo: event.target.value }))}
          placeholder="Retry max"
          className={panelInputClassName}
        />
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

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          value={assignTo}
          onChange={(event) => setAssignTo(event.target.value)}
          placeholder="Operatöre ata (email/isim)"
          disabled={!canOperate}
          className={panelInputClassName}
        />
        <select
          value={templateCode}
          onChange={(event) => setTemplateCode(event.target.value as (typeof TEMPLATE_OPTIONS)[number])}
          disabled={!canOperate}
          className={panelInputClassName}
        >
          {TEMPLATE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          value={rootCauseNote}
          onChange={(event) => setRootCauseNote(event.target.value)}
          placeholder="Root cause note (close için zorunlu)"
          disabled={!canOperate}
          className={panelInputClassName}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isReadOnly ? (
          <PanelFeedbackMessage tone="info">READ_ONLY modu: DLQ aksiyonları kapalıdır.</PanelFeedbackMessage>
        ) : null}
        <button
          type="button"
          onClick={() => void runAction('retry', selectedIds)}
          disabled={!canOperate || isActionRunning || selectedIds.length === 0}
          className={panelSecondaryButtonClassName}
        >
          Retry ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('change_template', selectedIds)}
          disabled={!canOperate || isActionRunning || selectedIds.length === 0}
          className={panelSecondaryButtonClassName}
        >
          Şablon Değiştir ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('assign', selectedIds)}
          disabled={!canOperate || isActionRunning || selectedIds.length === 0 || assignTo.trim().length === 0}
          className={panelSecondaryButtonClassName}
        >
          Operatöre Ata ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('close', selectedIds)}
          disabled={!canOperate || isActionRunning || selectedIds.length === 0 || rootCauseNote.trim().length === 0}
          className={panelDangerButtonClassName}
        >
          Kapat (Root Cause) ({selectedIds.length})
        </button>
      </div>

      {message ? <PanelFeedbackMessage className="mt-3" tone="success">{message}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage className="mt-3" tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      {isLoading ? <PanelLoadingMessage>DLQ listesi yükleniyor...</PanelLoadingMessage> : null}

      {!isLoading ? (
        <div className={panelTableContainerClassName}>
          <table className="min-w-[1500px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      disabled={!canOperate}
                      onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds((prev) => Array.from(new Set([...prev, ...items.map((item) => item.id)])));
                      } else {
                        const pageIds = new Set(items.map((item) => item.id));
                        setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2">DLQ ID</th>
                <th className="px-2 py-2">Source Job</th>
                <th className="px-2 py-2">Kanal</th>
                <th className="px-2 py-2">Campaign</th>
                <th className="px-2 py-2">Error Code</th>
                <th className="px-2 py-2">Retry</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Assigned</th>
                <th className="px-2 py-2">Root Cause</th>
                <th className="px-2 py-2">Updated</th>
                <th className="px-2 py-2">Row Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={12} className={panelEmptyRowClassName}>
                    Filtreye uygun DLQ kaydı bulunamadı.
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#F0E7DA] align-top">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      disabled={!canOperate}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds((prev) => Array.from(new Set([...prev, item.id])));
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== item.id));
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{shortId(item.id)}</p>
                    <p className="text-[#7C7366]">{item.id}</p>
                  </td>
                  <td className="px-2 py-2">{shortId(item.source_job_id)}</td>
                  <td className="px-2 py-2">{item.channel || '-'}</td>
                  <td className="px-2 py-2">{item.campaign_code || '-'}</td>
                  <td className="px-2 py-2">{item.error_code || '-'}</td>
                  <td className="px-2 py-2">{formatNumber(item.retry_count ?? undefined)}</td>
                  <td className="px-2 py-2">{item.status || '-'}</td>
                  <td className="px-2 py-2">{item.assigned_to || '-'}</td>
                  <td className="max-w-[240px] px-2 py-2">
                    <p className="line-clamp-2">{item.root_cause_note || '-'}</p>
                  </td>
                  <td className="px-2 py-2">{formatDate(item.updated_at)}</td>
                  <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => void runAction('retry', [item.id])}
                        disabled={!canOperate || isActionRunning}
                        className={panelSmallButtonClassName}
                      >
                        Retry
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
