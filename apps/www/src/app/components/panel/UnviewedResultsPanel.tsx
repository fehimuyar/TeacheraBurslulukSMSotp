import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canOperatePanelActions, isReadOnlyPanelRole } from './panelRoleAccess';
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
  requested?: number;
  enqueued?: number;
  skipped?: number;
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

export default function UnviewedResultsPanel({ active, role }: { active: boolean; role?: string }) {
  const [query, setQuery] = useState('');
  const [templateCode, setTemplateCode] = useState<(typeof TEMPLATE_OPTIONS)[number]>('WA_RESULT');
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
  const canOperate = canOperatePanelActions(role);
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
        `WhatsApp gönderimi tetiklendi. Requested: ${formatNumber(payload.requested)} • Enqueued: ${formatNumber(payload.enqueued)} • Skipped: ${formatNumber(payload.skipped)}`,
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
