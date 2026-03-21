import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canOperateNotifications, isReadOnlyPanelRole } from './panelRoleAccess';

type NotificationRow = {
  job_id: string;
  channel: 'SMS' | 'WHATSAPP' | string;
  template_code: string | null;
  recipient: string | null;
  status: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error_code: string | null;
};

type NotificationSummary = {
  total_jobs?: number;
  dlq_jobs?: number;
  failed_jobs?: number;
  successful_jobs?: number;
};

type NotificationListResponse = {
  items?: NotificationRow[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: NotificationSummary;
  message?: string;
  error?: string;
};

type NotificationActionResponse = {
  action?: string;
  campaign_code?: string;
  force?: boolean;
  reminder_lead_minutes?: number;
  reminder_window_minutes?: number;
  requested?: number;
  updated?: number;
  scanned?: number;
  enqueued?: number;
  skipped_no_phone?: number;
  skipped_errors?: number;
  skipped_reason?: string;
  message?: string;
  error?: string;
};

type NotificationFilters = {
  campaignCode: string;
  channel: '' | 'SMS' | 'WHATSAPP';
  status: string;
};

const defaultFilters: NotificationFilters = {
  campaignCode: '',
  channel: '',
  status: '',
};

const STATUS_OPTIONS = [
  'NOT_QUEUED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
  'RETRYING',
  'DLQ',
  'CANCELLED',
] as const;

type NotificationAction = 'retry' | 'cancel' | 'requeue_dlq';

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

function buildFiltersPayload(filters: NotificationFilters) {
  const payload: Record<string, unknown> = {};
  const campaignCode = filters.campaignCode.trim();
  if (campaignCode) payload.campaign_code = campaignCode;
  if (filters.channel) payload.channel = [filters.channel];
  if (filters.status) payload.status = [filters.status];
  return payload;
}

function buildNotificationsPath(query: string, filters: NotificationFilters, page: number, perPage: number) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('sort_by', 'next_retry_at');
  params.set('sort_order', 'desc');

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const filtersPayload = buildFiltersPayload(filters);
  if (Object.keys(filtersPayload).length > 0) {
    params.set('filters', JSON.stringify(filtersPayload));
  }

  return `/api/panel/notifications?${params.toString()}`;
}

export default function NotificationCenterPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [query, setQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<NotificationFilters>(defaultFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<NotificationFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<NotificationSummary>({});
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [reminderCampaignCode, setReminderCampaignCode] = useState('');
  const [reminderLeadMinutes, setReminderLeadMinutes] = useState('30');
  const [reminderWindowMinutes, setReminderWindowMinutes] = useState('2');
  const [reminderLimit, setReminderLimit] = useState('250');
  const [reminderForce, setReminderForce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const canOperate = canOperateNotifications(role, permissions);
  const isReadOnly = isReadOnlyPanelRole(role);

  const pageCount = useMemo(() => {
    const value = Math.ceil(total / perPage);
    return value > 0 ? value : 1;
  }, [perPage, total]);

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedJobIds.includes(item.job_id));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const loadNotifications = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await panelFetch(buildNotificationsPath(appliedQuery, appliedFilters, page, perPage), {
          method: 'GET',
        });
        const payload = (await response.json()) as NotificationListResponse;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'Bildirim listesi alınamadı.'));
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
          setErrorMessage(error instanceof Error ? error.message : 'Bildirim listesi alınamadı.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [active, appliedFilters, appliedQuery, page, perPage]);

  const runAction = async (action: NotificationAction) => {
    if (!canOperate) {
      setErrorMessage('Bu rol için işlem aksiyonları kapalıdır (READ_ONLY).');
      return;
    }
    if (selectedJobIds.length === 0 || isActionRunning) return;

    setIsActionRunning(true);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/notifications/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action,
          job_ids: selectedJobIds,
        }),
      });

      const payload = (await response.json()) as NotificationActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Bildirim aksiyonu başarısız.'));
      }

      const actionLabel =
        action === 'retry' ? 'Retry' : action === 'cancel' ? 'Cancel' : 'DLQ requeue';
      setMessage(
        `${actionLabel} tamamlandı. Requested: ${formatNumber(payload.requested)} • Updated: ${formatNumber(payload.updated)}`,
      );

      const refresh = await panelFetch(buildNotificationsPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as NotificationListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
        setSelectedJobIds((prev) => prev.filter((id) => refreshedItems.some((item) => item.job_id === id)));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Bildirim aksiyonu tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  const runReminderBroadcast = async () => {
    if (!canOperate) {
      setErrorMessage('Bu rol için işlem aksiyonları kapalıdır (READ_ONLY).');
      return;
    }
    if (isActionRunning) return;

    setIsActionRunning(true);
    setErrorMessage('');
    setMessage('');

    const lead = Number.parseInt(reminderLeadMinutes, 10);
    const windowMinutes = Number.parseInt(reminderWindowMinutes, 10);
    const limit = Number.parseInt(reminderLimit, 10);

    try {
      const response = await panelFetch('/api/panel/notifications/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'run_exam_reminder_broadcast',
          campaign_code: reminderCampaignCode.trim() || undefined,
          reminder_lead_minutes: Number.isFinite(lead) ? lead : undefined,
          reminder_window_minutes: Number.isFinite(windowMinutes) ? windowMinutes : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
          force: reminderForce,
        }),
      });

      const payload = (await response.json()) as NotificationActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Exam reminder broadcast çalıştırılamadı.'));
      }

      const skippedReason = String(payload.skipped_reason || '').trim();
      if (skippedReason) {
        setMessage(
          `Exam reminder broadcast: skipped (${skippedReason}). Campaign: ${payload.campaign_code || '-'} • Lead: ${formatNumber(payload.reminder_lead_minutes)} dk • Window: ${formatNumber(payload.reminder_window_minutes)} dk`,
        );
      } else {
        setMessage(
          `Exam reminder broadcast tamamlandı. Scanned: ${formatNumber(payload.scanned)} • Enqueued: ${formatNumber(payload.enqueued)} • No phone: ${formatNumber(payload.skipped_no_phone)} • Errors: ${formatNumber(payload.skipped_errors)}`,
        );
      }

      const refresh = await panelFetch(buildNotificationsPath(appliedQuery, appliedFilters, page, perPage), { method: 'GET' });
      if (refresh.ok) {
        const refreshedPayload = (await refresh.json()) as NotificationListResponse;
        const refreshedItems = Array.isArray(refreshedPayload.items) ? refreshedPayload.items : [];
        setItems(refreshedItems);
        setTotal(Number(refreshedPayload.total || 0));
        setSummary(refreshedPayload.summary || {});
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Exam reminder broadcast tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)] lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Bildirim Merkezi</p>
          <h3 className="mt-2 text-[22px] font-semibold text-white">SMS / WhatsApp Job ve Event Takibi</h3>
          <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
            Job listesi, provider teslim/okunma eventleri ve retry/cancel/requeue işlemleri bu ekrandan yönetilir.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Toplam Job</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.total_jobs ?? total)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">DLQ Job</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.dlq_jobs)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Failed Job</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.failed_jobs)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Successful Job</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.successful_jobs)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[#1A273A] bg-[#050f1f]/95 p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/54">Exam Reminder Broadcast (P0)</p>
        <p className="mt-1 text-[12px] text-white/62">
          Sınavdan varsayılan 30 dakika önce hatırlatma SMS yayını için manuel tarama/tetikleme.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input
            value={reminderCampaignCode}
            onChange={(event) => setReminderCampaignCode(event.target.value)}
            placeholder="Campaign code (boşsa DEFAULT)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={1}
            max={1440}
            value={reminderLeadMinutes}
            onChange={(event) => setReminderLeadMinutes(event.target.value)}
            placeholder="Lead (dk)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={1}
            max={60}
            value={reminderWindowMinutes}
            onChange={(event) => setReminderWindowMinutes(event.target.value)}
            placeholder="Window (dk)"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <input
            type="number"
            min={1}
            max={2000}
            value={reminderLimit}
            onChange={(event) => setReminderLimit(event.target.value)}
            placeholder="Limit"
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
          <label className="flex items-center gap-2 rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/78">
            <input
              type="checkbox"
              checked={reminderForce}
              onChange={(event) => setReminderForce(event.target.checked)}
            />
            <span>Force</span>
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void runReminderBroadcast()}
            disabled={!canOperate || isActionRunning}
            className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
          >
            Reminder Broadcast Çalıştır
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDraftFilters((prev) => ({ ...prev, channel: '' }))}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
            draftFilters.channel === ''
              ? 'border-[#D34840] bg-[#4B1817] text-white'
              : 'border-[#1A273A] bg-[#0A192B]/90 text-white/75 hover:border-[#2D4363]'
          }`}
        >
          Tümü
        </button>
        <button
          type="button"
          onClick={() => setDraftFilters((prev) => ({ ...prev, channel: 'SMS' }))}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
            draftFilters.channel === 'SMS'
              ? 'border-[#D34840] bg-[#4B1817] text-white'
              : 'border-[#1A273A] bg-[#0A192B]/90 text-white/75 hover:border-[#2D4363]'
          }`}
        >
          SMS
        </button>
        <button
          type="button"
          onClick={() => setDraftFilters((prev) => ({ ...prev, channel: 'WHATSAPP' }))}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition ${
            draftFilters.channel === 'WHATSAPP'
              ? 'border-[#D34840] bg-[#4B1817] text-white'
              : 'border-[#1A273A] bg-[#0A192B]/90 text-white/75 hover:border-[#2D4363]'
          }`}
        >
          WhatsApp
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Template / recipient / provider msg / error ara"
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
          className="rounded-xl bg-[#D92E27] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-white transition hover:bg-[#bf251f]"
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
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-white/80 transition hover:border-[#2D4363]"
        >
          Filtreleri Temizle
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isReadOnly ? (
          <p className="rounded-lg border border-[#274063] bg-[#0A192B]/80 px-3 py-2 text-[12px] text-[#9FC7FF]">
            READ_ONLY modu: bildirim aksiyonları kapalıdır.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void runAction('retry')}
          disabled={!canOperate || isActionRunning || selectedJobIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Retry ({selectedJobIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('cancel')}
          disabled={!canOperate || isActionRunning || selectedJobIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Cancel ({selectedJobIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runAction('requeue_dlq')}
          disabled={!canOperate || isActionRunning || selectedJobIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          DLQ Requeue ({selectedJobIds.length})
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-[#244B39] bg-[#0E261E] px-3 py-2 text-[12px] text-[#9FE4D0]">{message}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
      ) : null}

      {isLoading ? <p className="mt-3 text-[13px] text-white/65">Bildirim listesi yükleniyor...</p> : null}

      {!isLoading ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1460px] text-left text-[12px] text-white/80">
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
                  <th className="px-2 py-2">Job ID</th>
                  <th className="px-2 py-2">Kanal</th>
                  <th className="px-2 py-2">Şablon</th>
                  <th className="px-2 py-2">Alıcı</th>
                  <th className="px-2 py-2">Durum</th>
                  <th className="px-2 py-2">Retry</th>
                  <th className="px-2 py-2">Sonraki Retry</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-white/55">
                      Filtreye uygun bildirim kaydı bulunamadı.
                    </td>
                  </tr>
                ) : null}
                {items.map((item) => (
                  <tr key={item.job_id} className="border-b border-white/6 align-top">
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
                      <p className="text-white/55">{item.job_id}</p>
                    </td>
                    <td className="px-2 py-2">{item.channel || '-'}</td>
                    <td className="px-2 py-2">{item.template_code || '-'}</td>
                    <td className="px-2 py-2">{item.recipient || '-'}</td>
                    <td className="px-2 py-2">{item.status || '-'}</td>
                    <td className="px-2 py-2">{formatNumber(item.retry_count ?? undefined)}</td>
                    <td className="px-2 py-2">{formatDate(item.next_retry_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#1A273A] bg-[#071021]/92 p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/54">Provider Event Görünümü</p>
            <table className="mt-2 min-w-[1120px] text-left text-[12px] text-white/80">
              <thead>
                <tr className="border-b border-white/12 text-white/56">
                  <th className="px-2 py-2">Job ID</th>
                  <th className="px-2 py-2">Provider Msg ID</th>
                  <th className="px-2 py-2">Sent</th>
                  <th className="px-2 py-2">Delivered</th>
                  <th className="px-2 py-2">Read</th>
                  <th className="px-2 py-2">Error Code</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-5 text-center text-white/55">
                      Provider event kaydı bulunamadı.
                    </td>
                  </tr>
                ) : null}
                {items.map((item) => (
                  <tr key={`event-${item.job_id}`} className="border-b border-white/6">
                    <td className="px-2 py-2">{shortId(item.job_id)}</td>
                    <td className="px-2 py-2">{item.provider_message_id || '-'}</td>
                    <td className="px-2 py-2">{formatDate(item.sent_at)}</td>
                    <td className="px-2 py-2">{formatDate(item.delivered_at)}</td>
                    <td className="px-2 py-2">{formatDate(item.read_at)}</td>
                    <td className="px-2 py-2">{item.error_code || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
