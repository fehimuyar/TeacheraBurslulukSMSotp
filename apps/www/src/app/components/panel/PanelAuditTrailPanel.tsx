import { useEffect, useMemo, useState } from 'react';
import { panelFetch, resolvePanelEndpoint } from '../../api/panelApi';
import { canExportAudit, canReadAudit } from './panelRoleAccess';

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

export default function PanelAuditTrailPanel({
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
  }, [active, canRead, page, perPage, appliedQ, appliedActorType, appliedAction, appliedTargetType, appliedFromDate, appliedToDate]);

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
    if (!canExport) {
      setErrorMessage('Bu rol icin audit export kapali (PANEL_AUDIT_EXPORT).');
      return;
    }
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
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)]">
      <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Audit & Uyum</p>
      <h2 className="mt-2 text-[24px] font-semibold text-white">Değiştirilemez İşlem Günlüğü</h2>
      <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
        Panel işlemlerinin actor-bound kayıtları hash-chain ile izlenir. Bu ekran operasyon ve uyum incelemesi için tek doğrulama yüzeyidir.
      </p>

      {!canRead ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">
          Bu bolumu goruntulemek icin PANEL_AUDIT_READ izni gerekir.
        </p>
      ) : null}

      {!canRead ? null : (
        <>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/52">Toplam Kayıt</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary?.total_entries)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/52">Admin Event</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary?.admin_events)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/52">Panel Action</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary?.panel_actions)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_180px_1fr_1fr_180px_180px_auto_auto]">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Actor / action / target / request id ara"
          className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <select
          value={actorType}
          onChange={(event) => setActorType(event.target.value)}
          className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
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
          className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <input
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
          placeholder="Target type"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1A273A] bg-[#071021]/92 px-3 py-2 text-[12px] text-white/72">
        <span>Chain Hash: {shorten(summary?.chain_last_hash, 26)}</span>
        <span>Chain Updated: {formatDateTime(summary?.chain_updated_at || null)}</span>
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
          href={resolvePanelEndpoint('/api/panel/audit')}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-[#1A273A] bg-[#071021]/82 px-3 py-2 font-semibold uppercase tracking-[0.11em] text-white/72 transition hover:border-[#2D4363]"
        >
          Audit API
        </a>
      </div>

      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1120px] text-left text-[12px] text-white/80">
          <thead>
            <tr className="border-b border-white/12 text-white/56">
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
                <td colSpan={8} className="px-2 py-4 text-center text-white/60">
                  Audit kayıtları yükleniyor...
                </td>
              </tr>
            ) : null}
            {!isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-white/60">
                  Kayıt bulunamadı.
                </td>
              </tr>
            ) : null}
            {!isLoading
              ? items.map((item) => (
                  <tr key={item.id} className="border-b border-white/6">
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
