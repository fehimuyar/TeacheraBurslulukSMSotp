import { useEffect, useMemo, useState } from 'react';
import { panelFetch, resolvePanelEndpoint } from '../../api/panelApi';
import {
  PanelFeedbackMessage,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelEmptyRowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelStatCardClassName,
  panelTitleClassName,
  panelSurfaceClassName,
} from './panelUi';

type AuditItem = {
  id: string;
  seq: number;
  actor_type: string | null;
  actor_id: string | null;
  actor_role: string | null;
  action: string | null;
  target_type: string | null;
  target_id: string | null;
  request_id: string | null;
  entry_hash: string | null;
  created_at: string | null;
};

type AuditPayload = {
  items?: AuditItem[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: {
    total_entries?: number;
    admin_events?: number;
    panel_actions?: number;
    chain_last_hash?: string | null;
    chain_updated_at?: string | null;
  };
};

const ACTOR_TYPE_OPTIONS = ['ADMIN_USER', 'SYSTEM', 'WORKER'] as const;

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

function shorten(value: string | null | undefined, size = 14) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.length <= size) return raw;
  return `${raw.slice(0, size)}...`;
}

function buildPath(params: {
  page: number;
  perPage: number;
  q: string;
  actorType: string;
  action: string;
  targetType: string;
  from: string;
  to: string;
}) {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('per_page', String(params.perPage));
  query.set('sort_by', 'created_at');
  query.set('sort_order', 'desc');

  const q = params.q.trim();
  if (q) {
    query.set('q', q);
  }

  const filters: Record<string, string> = {};
  if (params.actorType.trim()) filters.actor_type = params.actorType.trim().toUpperCase();
  if (params.action.trim()) filters.action = params.action.trim();
  if (params.targetType.trim()) filters.target_type = params.targetType.trim();
  if (params.from.trim()) filters.from = params.from.trim();
  if (params.to.trim()) filters.to = params.to.trim();

  if (Object.keys(filters).length > 0) {
    query.set('filters', JSON.stringify(filters));
  }

  return `/api/panel/audit?${query.toString()}`;
}

export default function PanelAuditTrailPanel({ active }: { active: boolean }) {
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [actorType, setActorType] = useState('');
  const [appliedActorType, setAppliedActorType] = useState('');
  const [action, setAction] = useState('');
  const [appliedAction, setAppliedAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [appliedTargetType, setAppliedTargetType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<AuditPayload['summary']>({});

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [perPage, total]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await panelFetch(
          buildPath({
            page,
            perPage,
            q: appliedQ,
            actorType: appliedActorType,
            action: appliedAction,
            targetType: appliedTargetType,
            from: appliedFromDate,
            to: appliedToDate,
          }),
          { method: 'GET' },
        );
        const payload = (await response.json()) as AuditPayload & { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(normalizeError(payload, 'Audit log listesi alınamadı.'));
        }
        if (cancelled) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Audit log listesi alınamadı.');
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
  }, [active, page, perPage, appliedQ, appliedActorType, appliedAction, appliedTargetType, appliedFromDate, appliedToDate]);

  const applyFilters = () => {
    setAppliedQ(q.trim());
    setAppliedActorType(actorType.trim());
    setAppliedAction(action.trim());
    setAppliedTargetType(targetType.trim());
    setAppliedFromDate(fromDate.trim());
    setAppliedToDate(toDate.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setQ('');
    setActorType('');
    setAction('');
    setTargetType('');
    setFromDate('');
    setToDate('');
    setAppliedQ('');
    setAppliedActorType('');
    setAppliedAction('');
    setAppliedTargetType('');
    setAppliedFromDate('');
    setAppliedToDate('');
    setPage(1);
  };

  const handleExport = async (format: 'csv' | 'xls') => {
    if (isExporting) return;
    setIsExporting(true);
    setErrorMessage('');
    try {
      const listPath = buildPath({
        page: 1,
        perPage: 100000,
        q: appliedQ,
        actorType: appliedActorType,
        action: appliedAction,
        targetType: appliedTargetType,
        from: appliedFromDate,
        to: appliedToDate,
      });
      const exportPath = `${listPath.replace('/api/panel/audit?', '/api/panel/audit/export?')}&format=${format}`;
      const response = await panelFetch(exportPath, {
        method: 'GET',
        headers: {
          Accept: format === 'xls' ? 'application/vnd.ms-excel' : 'text/csv',
        },
      });
      if (!response.ok) {
        let message = `Audit export başarısız (HTTP ${response.status}).`;
        try {
          const payload = (await response.json()) as { message?: string; error?: string };
          message = normalizeError(payload, message);
        } catch {
          // keep default message
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const matchedFileName = /filename="?([^"]+)"?/i.exec(contentDisposition)?.[1];
      const filename = matchedFileName || `panel-audit-export.${format}`;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Audit export başarısız.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className={panelSurfaceClassName}>
      <p className={panelEyebrowClassName}>Audit & Uyum</p>
      <h2 className={panelTitleClassName}>Değiştirilemez İşlem Günlüğü</h2>
      <p className={panelDescriptionClassName}>
        Panel işlemlerinin actor-bound kayıtları hash-chain ile izlenir. Bu ekran operasyon ve uyum incelemesi için tek doğrulama yüzeyidir.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Toplam Kayıt</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary?.total_entries)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Admin Event</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary?.admin_events)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="text-[12px] font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">Panel Action</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary?.panel_actions)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_180px_1fr_1fr_180px_180px_auto_auto]">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Actor / action / target / request id ara"
          className={panelInputClassName}
        />
        <select
          value={actorType}
          onChange={(event) => setActorType(event.target.value)}
          className={panelInputClassName}
        >
          <option value="">Actor Type</option>
          {ACTOR_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Action (örn: PANEL_...)"
          className={panelInputClassName}
        />
        <input
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
          placeholder="Target type"
          className={panelInputClassName}
        />
        <input
          type="datetime-local"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          className={panelInputClassName}
        />
        <input
          type="datetime-local"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className={panelInputClassName}
        />
        <button
          type="button"
          onClick={applyFilters}
          className={`h-[40px] ${panelPrimaryButtonClassName} px-3 text-[11px] tracking-[0.12em]`}
        >
          Uygula
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className={`h-[40px] ${panelSecondaryButtonClassName} px-3 text-[11px] tracking-[0.12em]`}
        >
          Temizle
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-[#DDD3C5] bg-[#FBF7F0] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#6F675D]">
        <span>Chain Hash: {shorten(summary?.chain_last_hash, 26)}</span>
        <span>Chain Updated: {formatDateTime(summary?.chain_updated_at || null)}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => void handleExport('csv')}
          disabled={isExporting}
          className={panelSecondaryButtonClassName}
        >
          {isExporting ? 'Export...' : 'CSV Export'}
        </button>
        <button
          type="button"
          onClick={() => void handleExport('xls')}
          disabled={isExporting}
          className={panelSecondaryButtonClassName}
        >
          {isExporting ? 'Export...' : 'XLS Export'}
        </button>
        <a
          href={resolvePanelEndpoint('/api/panel/audit')}
          target="_blank"
          rel="noreferrer"
          className="rounded-[14px] border border-[#DDD3C5] bg-[#FFFDF9] px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.11em] text-[#4C5A53] transition hover:border-[#BCA98F]"
        >
          Audit API
        </a>
      </div>

      {errorMessage ? <PanelFeedbackMessage className="mt-3" tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1120px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
          <thead>
            <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
              <th className="px-2 py-2">Seq</th>
              <th className="px-2 py-2">Tarih</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Request</th>
              <th className="px-2 py-2">Hash</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">
                  Audit kayıtları yükleniyor...
                </td>
              </tr>
            ) : null}
            {!isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className={panelEmptyRowClassName}>
                  Kayıt bulunamadı.
                </td>
              </tr>
            ) : null}
            {!isLoading
              ? items.map((item) => (
                  <tr key={item.id} className="border-b border-[#F0E7DA]">
                    <td className="px-2 py-2">{formatNumber(item.seq)}</td>
                    <td className="px-2 py-2">{formatDateTime(item.created_at)}</td>
                    <td className="px-2 py-2">{item.actor_type || '-'}</td>
                    <td className="px-2 py-2">{item.actor_role || '-'}</td>
                    <td className="px-2 py-2">{item.action || '-'}</td>
                    <td className="px-2 py-2">{[item.target_type, item.target_id].filter(Boolean).join(':') || '-'}</td>
                    <td className="px-2 py-2">{shorten(item.request_id, 16)}</td>
                    <td className="px-2 py-2">{shorten(item.entry_hash, 20)}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
        <span>
          Sayfa {page} / {pageCount} • Toplam kayıt: {formatNumber(total)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className={panelSmallButtonClassName}
          >
            Önceki
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            disabled={page >= pageCount}
            className={panelSmallButtonClassName}
          >
            Sonraki
          </button>
        </div>
      </div>
    </section>
  );
}
