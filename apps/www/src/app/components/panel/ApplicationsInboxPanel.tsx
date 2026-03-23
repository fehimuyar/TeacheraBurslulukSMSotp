import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { panelFetch } from '../../api/panelApi';
import { canOperatePanelActions, isReadOnlyPanelRole } from './panelRoleAccess';
import { readPanelPreviewIdentity } from './panelPreviewSession';
import {
  PanelFeedbackMessage,
  PanelLoadingMessage,
  panelChipClassName,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEmptyRowClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from './panelUi';

type ApplicationFormType =
  | 'CALLBACK'
  | 'FREE_TRIAL'
  | 'LEVEL_ASSESSMENT'
  | 'FORMAT_CONSULTATION'
  | 'CORPORATE_OFFER';

type CrmStatusUi = 'TRANSFERRED' | 'NOT_TRANSFERRED';

type ApplicationSummary = {
  total_forms?: number;
  crm_transferred?: number;
  crm_pending?: number;
  today_received?: number;
};

type ApplicationListItem = {
  id: string;
  form_type: ApplicationFormType;
  form_subject?: string;
  received_at?: string | null;
  full_name?: string | null;
  phone?: string | null;
  crm_status_ui?: CrmStatusUi;
  crm_transferred_at?: string | null;
  latest_note_excerpt?: string | null;
  form_source?: string | null;
};

type ApplicationFieldEntry = {
  label?: string;
  value?: string;
};

type ApplicationNote = {
  id: string;
  note?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type ApplicationDetailItem = {
  id: string;
  form_type: ApplicationFormType;
  form_subject?: string;
  received_at?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  form_source?: string | null;
  field_entries?: ApplicationFieldEntry[];
  crm_status_ui?: CrmStatusUi;
  crm_transfer_status_internal?: string | null;
  crm_transferred_at?: string | null;
  crm_last_error?: string | null;
  notes?: ApplicationNote[];
};

type ApplicationsListPayload = {
  items?: ApplicationListItem[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: ApplicationSummary;
};

type ApplicationDetailPayload = {
  item?: ApplicationDetailItem;
};

type ApplicationsActionPayload = {
  message?: string;
  processed?: number;
};

type DraftFilters = {
  formType: string;
  receivedFrom: string;
  receivedTo: string;
  crmStatus: string;
};

type SortBy = 'received_at' | 'form_type' | 'full_name' | 'phone' | 'crm_transferred_at';
type SortOrder = 'asc' | 'desc';

const FORM_TYPE_OPTIONS: Array<{ value: ApplicationFormType; label: string }> = [
  { value: 'CALLBACK', label: 'Geri Arama' },
  { value: 'FREE_TRIAL', label: 'Ücretsiz Deneme' },
  { value: 'LEVEL_ASSESSMENT', label: 'Seviye Tespit' },
  { value: 'FORMAT_CONSULTATION', label: 'Eğitim Formatı' },
  { value: 'CORPORATE_OFFER', label: 'Kurumsal Teklif' },
];

function formTypeLabel(value?: string | null) {
  return FORM_TYPE_OPTIONS.find((item) => item.value === value)?.label || 'Bilinmeyen Form';
}

function formTypeShortLabel(value?: string | null) {
  switch (value) {
    case 'CALLBACK':
      return 'GA';
    case 'FREE_TRIAL':
      return 'ÜD';
    case 'LEVEL_ASSESSMENT':
      return 'ST';
    case 'FORMAT_CONSULTATION':
      return 'EF';
    case 'CORPORATE_OFFER':
      return 'KT';
    default:
      return '--';
  }
}

function crmStatusLabel(value?: string | null) {
  return value === 'TRANSFERRED' ? 'Aktarıldı' : 'Aktarılmadı';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatShortTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value?: number | null) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function toDateRangeStart(value: string) {
  return value ? `${value}T00:00:00+03:00` : '';
}

function toDateRangeEnd(value: string) {
  return value ? `${value}T23:59:59.999+03:00` : '';
}

function buildFilters(filters: DraftFilters) {
  const payload: Record<string, string> = {};
  if (filters.formType) payload.form_type = filters.formType;
  if (filters.crmStatus) payload.crm_status = filters.crmStatus;
  if (filters.receivedFrom) payload.received_from = toDateRangeStart(filters.receivedFrom);
  if (filters.receivedTo) payload.received_to = toDateRangeEnd(filters.receivedTo);
  return payload;
}

function buildListPath(options: {
  page: number;
  perPage: number;
  q: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
  filters: DraftFilters;
}) {
  const params = new URLSearchParams();
  params.set('page', String(options.page));
  params.set('per_page', String(options.perPage));
  params.set('sort_by', options.sortBy);
  params.set('sort_order', options.sortOrder);
  if (options.q.trim()) {
    params.set('q', options.q.trim());
  }

  const filters = buildFilters(options.filters);
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }

  return `/api/panel/applications?${params.toString()}`;
}

function readJsonSafe<T>(response: Response): Promise<T | null> {
  return response
    .json()
    .then((payload) => payload as T)
    .catch(() => null);
}

function statusChipClassName(transferred: boolean) {
  return transferred
    ? 'border-[#C6D9CF] bg-[#EEF6F0] text-[#2C5447]'
    : 'border-[#E4D5C0] bg-[#FBF4E8] text-[#7D5C2E]';
}

function readPageCount(total: number, perPage: number) {
  return Math.max(1, Math.ceil(total / perPage));
}

function SortHeader({
  label,
  sortKey,
  activeSortBy,
  activeSortOrder,
  onToggle,
  align = 'left',
}: {
  label: string;
  sortKey: SortBy;
  activeSortBy: SortBy;
  activeSortOrder: SortOrder;
  onToggle: (nextKey: SortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = activeSortBy === sortKey;
  const marker = !active ? '↕' : activeSortOrder === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`flex w-full items-center gap-1.5 ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'} font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#7A7063] transition hover:text-[#2C5447]`}
    >
      <span>{label}</span>
      <span className="text-[9px]">{marker}</span>
    </button>
  );
}

type SummaryTone = 'neutral' | 'critical' | 'warning' | 'success';

const SUMMARY_TONE_CLASS_MAP: Record<SummaryTone, string> = {
  neutral: 'bg-[#C7B79B]',
  critical: 'bg-[#7A2E35]',
  warning: 'bg-[#A8792D]',
  success: 'bg-[#2C5447]',
};

function SummaryMetricCard({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: SummaryTone;
}) {
  return (
    <div className="rounded-[22px] border border-[#E4DBCF] bg-[#FFFDF9] p-4 shadow-[0_10px_24px_rgba(109,90,58,0.05)]">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${SUMMARY_TONE_CLASS_MAP[tone]}`} />
        <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#7A7063]">
          {label}
        </p>
      </div>
      <p className="mt-3 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] leading-none text-[#1B2B24]">
        {value}
      </p>
      <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.6] text-[#697067]">
        {helper}
      </p>
    </div>
  );
}

function FilterField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'xl:col-span-2' : ''}`}>
      <span className="mb-2 block font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#7A7063]">
        {label}
      </span>
      {children}
    </label>
  );
}

function DetailMetaCard({
  label,
  value,
  breakWords = false,
}: {
  label: string;
  value: string;
  breakWords?: boolean;
}) {
  return (
    <div className={panelSoftCardClassName}>
      <p className={panelEyebrowClassName}>{label}</p>
      <p
        className={`mt-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] leading-[1.55] text-[#1B2B24]${
          breakWords ? ' break-all' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CrmStatusIcon({ transferred }: { transferred: boolean }) {
  return (
    <span
      aria-label={transferred ? 'CRM aktarılmış' : 'CRM aktarılmamış'}
      title={transferred ? 'Aktarıldı' : 'Aktarılmadı'}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
        transferred
          ? 'border-[#C6D9CF] bg-[#EEF6F0] text-[#2C5447]'
          : 'border-[#DDD2C3] bg-[#FFF8EF] text-[#B39D7E]'
      }`}
    >
      {transferred ? (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2.2]">
          <path d="M4.5 10.5 8 14l7.5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span className="h-2.5 w-2.5 rounded-full border border-current" aria-hidden="true" />
      )}
    </span>
  );
}

export default function ApplicationsInboxPanel({ role }: { role?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const applicationId = String(searchParams.get('applicationId') || '').trim();
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const previewIdentity = readPanelPreviewIdentity();
  const perPage = 25;

  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [summary, setSummary] = useState<ApplicationSummary>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>('received_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [draftQuery, setDraftQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<DraftFilters>({
    formType: '',
    receivedFrom: '',
    receivedTo: '',
    crmStatus: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<DraftFilters>({
    formType: '',
    receivedFrom: '',
    receivedTo: '',
    crmStatus: '',
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<ApplicationDetailItem | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const loadList = useCallback(
    async (options?: { silent?: boolean }) => {
      if (previewIdentity) {
        setItems([]);
        setSummary({
          total_forms: 0,
          crm_transferred: 0,
          crm_pending: 0,
          today_received: 0,
        });
        setTotal(0);
        setListLoading(false);
        setListRefreshing(false);
        setErrorMessage('');
        return;
      }

      setErrorMessage('');
      if (options?.silent) {
        setListRefreshing(true);
      } else {
        setListLoading(true);
      }

      try {
        const response = await panelFetch(
          buildListPath({
            page,
            perPage,
            q: appliedQuery,
            sortBy,
            sortOrder,
            filters: appliedFilters,
          }),
          { method: 'GET' },
        );
        const payload = await readJsonSafe<ApplicationsListPayload>(response);
        if (!response.ok) {
          throw new Error('Başvuru listesi yüklenemedi.');
        }

        setItems(Array.isArray(payload?.items) ? payload.items : []);
        setSummary(payload?.summary || {});
        setTotal(Number(payload?.total || 0));
      } catch {
        setItems([]);
        setSummary({});
        setTotal(0);
        setErrorMessage('Başvuru inbox listesi şu anda yüklenemiyor.');
      } finally {
        if (options?.silent) {
          setListRefreshing(false);
        } else {
          setListLoading(false);
        }
      }
    },
    [appliedFilters, appliedQuery, page, previewIdentity, sortBy, sortOrder],
  );

  const loadDetail = useCallback(async () => {
    if (!applicationId) {
      setDetailItem(null);
      setNoteDraft('');
      return;
    }

    if (previewIdentity) {
      setDetailItem(null);
      setDetailLoading(false);
      setErrorMessage('');
      return;
    }

    setDetailLoading(true);
    setErrorMessage('');
    try {
      const response = await panelFetch(`/api/panel/applications/${encodeURIComponent(applicationId)}`, {
        method: 'GET',
      });
      const payload = await readJsonSafe<ApplicationDetailPayload>(response);
      if (!response.ok || !payload?.item) {
        throw new Error('Başvuru detayı alınamadı.');
      }

      setDetailItem(payload.item);
    } catch {
      setDetailItem(null);
      setErrorMessage('Başvuru detayı yüklenemedi.');
    } finally {
      setDetailLoading(false);
    }
  }, [applicationId, previewIdentity]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, appliedQuery, appliedFilters, sortBy, sortOrder]);

  const pageIds = useMemo(() => items.map((item) => item.id), [items]);
  const allSelectedOnPage = useMemo(
    () => pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id)),
    [pageIds, selectedIds],
  );
  const selectedTransferableIds = useMemo(
    () =>
      items
        .filter((item) => selectedIds.includes(item.id) && item.crm_status_ui !== 'TRANSFERRED')
        .map((item) => item.id),
    [items, selectedIds],
  );
  const pageCount = readPageCount(total, perPage);
  const hasActiveFilters = Boolean(
    appliedQuery || appliedFilters.formType || appliedFilters.crmStatus || appliedFilters.receivedFrom || appliedFilters.receivedTo,
  );
  const activeFilterCount = useMemo(
    () =>
      [appliedQuery, appliedFilters.formType, appliedFilters.crmStatus, appliedFilters.receivedFrom, appliedFilters.receivedTo].filter(Boolean)
        .length,
    [appliedFilters, appliedQuery],
  );

  const handleApplyFilters = () => {
    setAppliedQuery(draftQuery.trim());
    setAppliedFilters({ ...draftFilters });
    setPage(1);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleResetFilters = () => {
    const emptyFilters = {
      formType: '',
      receivedFrom: '',
      receivedTo: '',
      crmStatus: '',
    };
    setDraftQuery('');
    setAppliedQuery('');
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleToggleSort = (nextSortBy: SortBy) => {
    if (sortBy === nextSortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(nextSortBy);
    setSortOrder('asc');
  };

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('applicationId', id);
    setSearchParams(next);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('applicationId');
    setSearchParams(next);
    setSuccessMessage('');
    setErrorMessage('');
  };

  const runAction = async (action: 'crm_transfer' | 'add_note', ids: string[], note?: string) => {
    if (ids.length === 0) return;

    setActionLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await panelFetch('/api/panel/applications/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          ids,
          ...(note ? { note } : {}),
        }),
      });
      const payload = await readJsonSafe<ApplicationsActionPayload>(response);
      if (!response.ok) {
        throw new Error('Başvuru aksiyonu tamamlanamadı.');
      }

      setSuccessMessage(payload?.message || 'İşlem tamamlandı.');
      if (action === 'add_note') {
        setNoteDraft('');
      }

      await Promise.all([loadList({ silent: true }), loadDetail()]);
    } catch {
      setErrorMessage(
        action === 'add_note'
          ? 'Not eklenemedi. Lütfen tekrar deneyin.'
          : 'CRM aktarımı tamamlanamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const renderList = () => (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[620px]">
            <p className={panelEyebrowClassName}>Başvurular</p>
            <h2 className={panelLargeTitleClassName}>Website üzerinden gelen iletişim formları</h2>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetricCard
              label="Toplam Form"
              value={formatNumber(summary.total_forms)}
              helper="Lead inbox’a düşen uygun formlar"
              tone="neutral"
            />
            <SummaryMetricCard
              label="CRM’e Aktarılan"
              value={formatNumber(summary.crm_transferred)}
              helper="İşlem tamamlanan kayıtlar"
              tone="success"
            />
            <SummaryMetricCard
              label="CRM Bekleyen"
              value={formatNumber(summary.crm_pending)}
              helper="İşlem sırası bekleyen kayıtlar"
              tone="warning"
            />
            <SummaryMetricCard
              label="Bugün Gelen"
              value={formatNumber(summary.today_received)}
              helper="Gün içindeki yeni form akışı"
              tone="critical"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#ECE2D6] pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              aria-controls="applications-filter-panel"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#D8CDBD] bg-[#FFFDF9] text-[#41514B] transition hover:border-[#BFAE95] hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#EEE3CC]"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
                <path d="M3.5 5.5h13M6 10h8M8.5 14.5h3" strokeLinecap="round" />
              </svg>
              {activeFilterCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2C5447] px-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.5] text-[#7A7063]">
              {hasActiveFilters ? 'Filtrelenmiş kayıtlar gösteriliyor.' : 'Tüm uygun başvurular gösteriliyor.'}
            </p>
            {readOnly ? (
              <p className={panelReadOnlyNoticeClassName}>
                Bu rolde yalnız görüntüleme açık. CRM aktarımı ve not ekleme kapalı.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void runAction('crm_transfer', selectedTransferableIds)}
            disabled={!canOperate || actionLoading || selectedTransferableIds.length === 0}
            className={panelPrimaryButtonClassName}
          >
            Seçilenleri CRM’e Aktar ({selectedTransferableIds.length})
          </button>
        </div>

        {filtersOpen ? (
          <div
            id="applications-filter-panel"
            className="mt-3 rounded-[16px] border border-[#E4DBCF] bg-[#FBF7F0] p-3 shadow-[0_4px_14px_rgba(109,90,58,0.04)]"
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_170px_150px_150px_150px]">
              <FilterField label="Ara" wide>
                <input
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder="İsim, telefon veya not ara"
                  className={`${panelCompactInputClassName} w-full`}
                />
              </FilterField>

              <FilterField label="Tür">
                <select
                  value={draftFilters.formType}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      formType: event.target.value,
                    }))
                  }
                  className={`${panelCompactInputClassName} w-full`}
                >
                  <option value="">Tüm türler</option>
                  {FORM_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="CRM">
                <select
                  value={draftFilters.crmStatus}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      crmStatus: event.target.value,
                    }))
                  }
                  className={`${panelCompactInputClassName} w-full`}
                >
                  <option value="">Tümü</option>
                  <option value="NOT_TRANSFERRED">Aktarılmadı</option>
                  <option value="TRANSFERRED">Aktarıldı</option>
                </select>
              </FilterField>

              <FilterField label="Başlangıç">
                <input
                  type="date"
                  value={draftFilters.receivedFrom}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      receivedFrom: event.target.value,
                    }))
                  }
                  className={`${panelCompactInputClassName} w-full`}
                />
              </FilterField>

              <FilterField label="Bitiş">
                <input
                  type="date"
                  value={draftFilters.receivedTo}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({
                      ...prev,
                      receivedTo: event.target.value,
                    }))
                  }
                  className={`${panelCompactInputClassName} w-full`}
                />
              </FilterField>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E9DECF] pt-4">
              <button type="button" onClick={handleApplyFilters} className={panelPrimaryButtonClassName}>
                Filtreleri Uygula
              </button>
              <button type="button" onClick={handleResetFilters} className={panelSecondaryButtonClassName}>
                Temizle
              </button>
              <button
                type="button"
                onClick={() => void loadList({ silent: true })}
                disabled={listRefreshing}
                className={panelSecondaryButtonClassName}
              >
                {listRefreshing ? 'Yenileniyor...' : 'Yenile'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {successMessage ? <PanelFeedbackMessage tone="success">{successMessage}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      {listLoading ? <PanelLoadingMessage>Başvuru inbox listesi yükleniyor...</PanelLoadingMessage> : null}

      {!listLoading ? (
        <>
          <section className={`${panelSurfaceClassName} overflow-hidden p-0`}>
            <div className="flex flex-col gap-3 border-b border-[#ECE2D6] px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className={panelEyebrowClassName}>Kayıt Listesi</p>
                <h3 className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] leading-[1.2] text-[#1B2B24]">
                  Son gelen formlar
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${panelChipClassName} border-[#D8CEBF] bg-[#FFF8EF] text-[#5D625C]`}>
                  {formatNumber(total)} kayıt
                </span>
                <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
                  Sayfa {page} / {pageCount}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">
                <colgroup>
                  <col className="w-[44px]" />
                  <col className="w-[112px]" />
                  <col className="w-[76px]" />
                  <col className="w-[172px]" />
                  <col className="w-[142px]" />
                  <col className="w-[74px]" />
                  <col />
                  <col className="w-[116px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[#E6DDCF] bg-[#FFFCF8] text-[#7A7063]">
                    <th className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        disabled={!canOperate || items.length === 0}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedIds(pageIds);
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-3 py-4">
                      <SortHeader
                        label="Tarih"
                        sortKey="received_at"
                        activeSortBy={sortBy}
                        activeSortOrder={sortOrder}
                        onToggle={handleToggleSort}
                      />
                    </th>
                    <th className="px-3 py-4">
                      <SortHeader
                        label="Tür"
                        sortKey="form_type"
                        activeSortBy={sortBy}
                        activeSortOrder={sortOrder}
                        onToggle={handleToggleSort}
                      />
                    </th>
                    <th className="px-3 py-4">
                      <SortHeader
                        label="İsim"
                        sortKey="full_name"
                        activeSortBy={sortBy}
                        activeSortOrder={sortOrder}
                        onToggle={handleToggleSort}
                      />
                    </th>
                    <th className="px-3 py-4">
                      <SortHeader
                        label="Telefon"
                        sortKey="phone"
                        activeSortBy={sortBy}
                        activeSortOrder={sortOrder}
                        onToggle={handleToggleSort}
                      />
                    </th>
                    <th className="px-3 py-4 text-center">
                      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#7A7063]">
                        CRM
                      </span>
                    </th>
                    <th className="px-3 py-4">
                      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#7A7063]">
                        Notlar
                      </span>
                    </th>
                    <th className="px-3 py-4 text-right">
                      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#7A7063]">
                        İşlem
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={panelEmptyRowClassName}>
                        {previewIdentity
                          ? 'Bağlantı kurulduğunda uygun web formları burada listelenecek. Şimdilik tasarım önizleme modundasın.'
                          : 'Henüz kriterlere uyan başvuru bulunmuyor. Filtreleri temizleyip tekrar deneyebilirsin.'}
                      </td>
                    </tr>
                  ) : null}

                  {items.map((item) => {
                    const transferred = item.crm_status_ui === 'TRANSFERRED';
                    return (
                      <tr
                        key={item.id}
                        onClick={() => openDetail(item.id)}
                        className="group cursor-pointer border-b border-[#F0E7DA] align-middle transition hover:bg-[#FFFCF7]"
                      >
                        <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
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
                        <td className="px-3 py-4">
                          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] leading-none text-[#1B2B24]">
                            {formatShortDate(item.received_at)}
                          </p>
                          <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] leading-none text-[#7A7063]">
                            {formatShortTime(item.received_at)}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <span
                            title={formTypeLabel(item.form_type)}
                            className="inline-flex min-w-[44px] justify-center rounded-full border border-[#DDD4C6] bg-[#FFF8EF] px-2 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#6A5C4A]"
                          >
                            {formTypeShortLabel(item.form_type)}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <p className="truncate font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] leading-[1.3] text-[#1B2B24] group-hover:text-[#2C5447]">
                            {item.full_name || '-'}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <span className="truncate font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.3] text-[#33463E]">
                            {item.phone || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-center">
                          <CrmStatusIcon transferred={transferred} />
                        </td>
                        <td className="px-3 py-4">
                          <p className="line-clamp-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.45] text-[#5E665E]">
                            {item.latest_note_excerpt || 'Henüz not eklenmedi'}
                          </p>
                        </td>
                        <td className="px-3 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => void runAction('crm_transfer', [item.id])}
                            disabled={!canOperate || actionLoading || transferred}
                            className={panelSmallButtonClassName}
                          >
                            {transferred ? 'Aktarıldı' : 'CRM Aktar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECE2D6] px-5 py-4">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
                Toplam {formatNumber(total)} kayıt • Sayfa {page} / {pageCount}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || listLoading}
                  className={panelSmallButtonClassName}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
                  disabled={page >= pageCount || listLoading}
                  className={panelSmallButtonClassName}
                >
                  Sonraki
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );

  const renderDetail = () => (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button type="button" onClick={closeDetail} className={panelSecondaryButtonClassName}>
              Listeye Dön
            </button>
            <p className="mt-4 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#7A7063]">
              Başvuru Detayı
            </p>
            <h2 className={panelLargeTitleClassName}>
              {detailItem?.full_name || formTypeLabel(detailItem?.form_type)}
            </h2>
            <p className={panelDescriptionClassName}>
              {formTypeLabel(detailItem?.form_type)} • {formatDateTime(detailItem?.received_at)}
            </p>
          </div>

          <span className={`rounded-full border px-3 py-1 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.12em] ${statusChipClassName(detailItem?.crm_status_ui === 'TRANSFERRED')}`}>
            {crmStatusLabel(detailItem?.crm_status_ui)}
          </span>
        </div>

        {detailItem ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailMetaCard label="Form Türü" value={formTypeLabel(detailItem.form_type)} />
            <DetailMetaCard label="Başvuru Tarihi" value={formatDateTime(detailItem.received_at)} />
            <DetailMetaCard label="Telefon" value={detailItem.phone || '-'} />
            <DetailMetaCard label="E-posta" value={detailItem.email || '-'} breakWords />
          </div>
        ) : null}
      </section>

      {successMessage ? <PanelFeedbackMessage tone="success">{successMessage}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage> : null}
      {detailLoading ? <PanelLoadingMessage>Başvuru detayı yükleniyor...</PanelLoadingMessage> : null}

      {!detailLoading && detailItem ? (
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_380px]">
          <section className={panelSurfaceClassName}>
            <div className="grid gap-3 md:grid-cols-2">
              <DetailMetaCard label="İsim" value={detailItem.full_name || '-'} />
              <DetailMetaCard label="Telefon" value={detailItem.phone || '-'} />
              <DetailMetaCard label="E-posta" value={detailItem.email || '-'} breakWords />
              <DetailMetaCard label="Form Kaynağı" value={detailItem.form_source || '-'} breakWords />
            </div>

            <div className="mt-5">
              <p className={panelEyebrowClassName}>Form Alanları</p>
              <h3 className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] leading-[1.25] text-[#1B2B24]">
                Formda gönderilen tüm bilgiler
              </h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(detailItem.field_entries || []).length === 0 ? (
                  <div className={panelSoftCardClassName}>
                    <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#6E675D]">
                      Bu başvuruda gösterilecek alan bulunamadı.
                    </p>
                  </div>
                ) : null}

                {(detailItem.field_entries || []).map((field, index) => (
                  <div key={`${field.label || 'field'}-${index}`} className={panelSoftCardClassName}>
                    <p className={panelEyebrowClassName}>{field.label || 'Alan'}</p>
                    <p className="mt-2 whitespace-pre-wrap break-words font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.65] text-[#33463E]">
                      {field.value || '-'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className={panelSurfaceClassName}>
              <p className={panelEyebrowClassName}>CRM Durumu</p>
              <h3 className={panelTitleClassName}>{crmStatusLabel(detailItem.crm_status_ui)}</h3>
              <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.65] text-[#697067]">
                Bu kayıt için son aktarım durumu ve hata geçmişi burada tutulur.
              </p>
              <div className="mt-4 space-y-3">
                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Son Aktarım</p>
                  <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#33463E]">
                    {formatDateTime(detailItem.crm_transferred_at)}
                  </p>
                </div>

                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Son Hata</p>
                  <p className="mt-2 whitespace-pre-wrap break-words font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.6] text-[#33463E]">
                    {detailItem.crm_last_error || 'Kayıtlı hata yok'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void runAction('crm_transfer', [detailItem.id])}
                disabled={!canOperate || actionLoading || detailItem.crm_status_ui === 'TRANSFERRED'}
                className={`mt-4 w-full justify-center ${panelPrimaryButtonClassName}`}
              >
                {detailItem.crm_status_ui === 'TRANSFERRED' ? 'CRM’e Aktarıldı' : 'CRM’e Aktar'}
              </button>
            </div>

            <div className={panelSurfaceClassName}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={panelEyebrowClassName}>Notlar</p>
                  <h3 className={panelTitleClassName}>Kısa operasyon notları</h3>
                </div>
                {readOnly ? <span className={panelReadOnlyNoticeClassName}>Not ekleme kapalı</span> : null}
              </div>

              <textarea
                rows={4}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                disabled={!canOperate}
                placeholder="Kısa bir operasyon notu ekle"
                className="mt-4 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC] disabled:cursor-not-allowed disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => void runAction('add_note', [detailItem.id], noteDraft)}
                disabled={!canOperate || actionLoading || noteDraft.trim().length === 0}
                className={`mt-3 ${panelSecondaryButtonClassName}`}
              >
                Not Ekle
              </button>

              <div className="mt-4 space-y-3">
                {(detailItem.notes || []).length === 0 ? (
                  <div className={panelSoftCardClassName}>
                    <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#6E675D]">
                      Henüz operasyon notu eklenmedi.
                    </p>
                  </div>
                ) : null}

                {(detailItem.notes || []).map((note) => (
                  <div key={note.id} className={panelSoftCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.65] text-[#33463E]">
                        {note.note || '-'}
                      </p>
                      <span className="shrink-0 text-[11px] text-[#8A7F71]">{formatDateTime(note.created_at)}</span>
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-[#8A7F71]">
                      {note.created_by || 'panel-user'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {!detailLoading && !detailItem ? (
        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Detay Önizleme</p>
          <h3 className={panelTitleClassName}>Form detayları bağlantı sonrası burada açılacak</h3>
          <p className={panelDescriptionClassName}>
            Tasarım önizleme modunda detay verisi çekilmiyor. Ana yazılımcı `applications` kontratını bağladığında bu alan gerçek form kartları ve not akışıyla dolacak.
          </p>
        </section>
      ) : null}
    </div>
  );

  return applicationId ? renderDetail() : renderList();
}
