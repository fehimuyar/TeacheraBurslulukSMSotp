import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canOperatePanelActions } from './panelRoleAccess';

type CandidateRow = {
  candidate_id: string;
  application_no: string | null;
  student_full_name: string | null;
  school_name: string | null;
  grade: number | null;
  section?: string | null;
  result_score: number | null;
  result_status: string | null;
  result_viewed_at: string | null;
  appointment_status: string | null;
  appointment_status_at: string | null;
  appointment_booked_at: string | null;
  crm_export_status: string | null;
  operator_note: string | null;
  updated_at: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  owner_role?: string | null;
  owner_assigned_at?: string | null;
  follow_up_needed?: boolean;
  unviewed_result?: boolean;
  viewed_no_appointment?: boolean;
};

type ConsultantSummary = {
  total_candidates?: number;
  follow_up_needed?: number;
  appointment_booked?: number;
  appointment_attended?: number;
  appointment_no_show?: number;
  owner_assigned?: number;
  unviewed_results?: number;
  viewed_no_appointment?: number;
  today_flow?: number;
};

type SchoolPerformanceRow = {
  school_name?: string | null;
  total_candidates?: number;
  follow_up_needed?: number;
  appointment_no_show?: number;
  unviewed_results?: number;
  viewed_no_appointment?: number;
};

type OwnershipRow = {
  owner_id?: string | null;
  owner_name?: string | null;
  owner_role?: string | null;
  total_candidates?: number;
  follow_up_needed?: number;
  appointment_no_show?: number;
  unviewed_results?: number;
  viewed_no_appointment?: number;
  last_assignment_at?: string | null;
};

type ConsultantOverviewResponse = {
  items?: CandidateRow[];
  total?: number;
  summary?: ConsultantSummary;
  school_performance?: SchoolPerformanceRow[];
  ownership?: OwnershipRow[];
  message?: string;
  error?: string;
};

type CandidateActionResponse = {
  processed?: number;
  message?: string;
  error?: string;
};

function normalizeMessage(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function formatNumber(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('tr-TR');
}

function normalizeAppointmentStatus(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function formatAppointmentStatus(value: string | null | undefined) {
  const normalized = normalizeAppointmentStatus(value);
  if (!normalized || normalized === 'NONE') return 'Randevu Yok';
  if (normalized === 'BOOKED') return 'Randevu Alindi';
  if (normalized === 'ATTENDED') return 'Gorusmeye Geldi';
  if (normalized === 'NO_SHOW') return 'No-show';
  return normalized;
}

function isTodayInTr(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const today = new Date();
  const fmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric' });
  return fmt.format(today) === fmt.format(date);
}

function buildOverviewPath({
  seedQuery,
  seedCampaignCode,
  schoolQuery,
  ownerId,
  followUpOnly,
}: {
  seedQuery?: string;
  seedCampaignCode?: string;
  schoolQuery?: string;
  ownerId?: string;
  followUpOnly?: boolean;
}) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('per_page', '120');
  params.set('sort_by', 'follow_up_needed');
  params.set('sort_order', 'desc');

  const normalizedQuery = String(seedQuery || '').trim();
  const normalizedCampaign = String(seedCampaignCode || '').trim();
  const normalizedSchoolQuery = String(schoolQuery || '').trim();
  const normalizedOwnerId = String(ownerId || '').trim();

  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const filters: Record<string, unknown> = {};
  if (normalizedCampaign) filters.campaign_code = normalizedCampaign;
  if (normalizedSchoolQuery) filters.school_query = normalizedSchoolQuery;
  if (normalizedOwnerId) filters.owner_id = normalizedOwnerId;
  if (followUpOnly) filters.follow_up_only = true;
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }

  return `/api/panel/consultant/overview?${params.toString()}`;
}

function buildFollowUpReason(item: CandidateRow) {
  const reasons: string[] = [];
  if (item.unviewed_result) reasons.push('Sonuc gorulmedi');
  if (normalizeAppointmentStatus(item.appointment_status) === 'NO_SHOW') reasons.push('No-show');
  if (item.viewed_no_appointment) reasons.push('Goruldu ama randevu yok');
  const crmStatus = String(item.crm_export_status || '').trim().toUpperCase();
  if (crmStatus === 'FAILED' || crmStatus === 'RETRYING' || crmStatus === 'DLQ') {
    reasons.push(`CRM ${crmStatus}`);
  }
  if (reasons.length === 0) {
    reasons.push('Takip tamam');
  }
  return reasons.join(' • ');
}

export default function ConsultantOverviewPanel({
  active,
  seedQuery = '',
  seedCampaignCode = '',
  role,
  permissions,
}: {
  active: boolean;
  seedQuery?: string;
  seedCampaignCode?: string;
  role?: string;
  permissions?: string[];
}) {
  const [items, setItems] = useState<CandidateRow[]>([]);
  const [summary, setSummary] = useState<ConsultantSummary>({});
  const [schoolRows, setSchoolRows] = useState<SchoolPerformanceRow[]>([]);
  const [ownerRows, setOwnerRows] = useState<OwnershipRow[]>([]);
  const [total, setTotal] = useState(0);

  const [schoolInput, setSchoolInput] = useState('');
  const [appliedSchoolQuery, setAppliedSchoolQuery] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [followUpOnly, setFollowUpOnly] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const canOperate = canOperatePanelActions(role, permissions);

  const loadRows = async () => {
    if (!active) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await panelFetch(
        buildOverviewPath({
          seedQuery,
          seedCampaignCode,
          schoolQuery: appliedSchoolQuery,
          ownerId: selectedOwnerId,
          followUpOnly,
        }),
        { method: 'GET' },
      );
      const payload = (await response.json()) as ConsultantOverviewResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Danisman operasyon gorunumu alinamadi.'));
      }
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);
      setTotal(Number(payload.total || 0));
      setSummary(payload.summary || {});
      setSchoolRows(Array.isArray(payload.school_performance) ? payload.school_performance : []);
      setOwnerRows(Array.isArray(payload.ownership) ? payload.ownership : []);
    } catch (error) {
      setItems([]);
      setSummary({});
      setSchoolRows([]);
      setOwnerRows([]);
      setTotal(0);
      setErrorMessage(error instanceof Error ? error.message : 'Danisman operasyon gorunumu alinamadi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void loadRows();
  }, [active, seedCampaignCode, seedQuery, appliedSchoolQuery, selectedOwnerId, followUpOnly]);

  const appointmentRows = useMemo(
    () =>
      items.filter((item) => {
        const status = normalizeAppointmentStatus(item.appointment_status);
        return status === 'BOOKED' || status === 'ATTENDED' || status === 'NO_SHOW';
      }),
    [items],
  );

  const todayRows = useMemo(
    () =>
      items.filter((item) => {
        const dateKey = item.appointment_status_at || item.appointment_booked_at || item.updated_at;
        return isTodayInTr(dateKey);
      }),
    [items],
  );

  const derived = useMemo(() => {
    const followUpNeeded = items.filter((item) => item.follow_up_needed).length;
    const booked = appointmentRows.filter((item) => normalizeAppointmentStatus(item.appointment_status) === 'BOOKED').length;
    const noShow = appointmentRows.filter((item) => normalizeAppointmentStatus(item.appointment_status) === 'NO_SHOW').length;
    const assigned = items.filter((item) => String(item.owner_id || '').trim()).length;
    return {
      followUpNeeded,
      booked,
      noShow,
      assigned,
      today: todayRows.length,
    };
  }, [appointmentRows, items, todayRows.length]);

  const ownerOptions = useMemo(() => {
    const options = ownerRows.map((item) => ({
      owner_id: String(item.owner_id || ''),
      owner_name: String(item.owner_name || 'Unassigned'),
      owner_role: String(item.owner_role || 'UNASSIGNED'),
      total_candidates: Number(item.total_candidates || 0),
    }));
    const hasUnassigned = options.some((item) => !item.owner_id);
    if (!hasUnassigned) {
      options.push({
        owner_id: '',
        owner_name: 'Unassigned',
        owner_role: 'UNASSIGNED',
        total_candidates: 0,
      });
    }
    return options;
  }, [ownerRows]);

  const drilldownRows = useMemo(() => {
    const prioritized = followUpOnly ? items : [...items].sort((a, b) => Number(Boolean(b.follow_up_needed)) - Number(Boolean(a.follow_up_needed)));
    return prioritized.slice(0, 18);
  }, [followUpOnly, items]);

  const runAppointmentAction = async (action: 'appointment_attended' | 'appointment_no_show', candidateId: string) => {
    if (!canOperate || !candidateId || isActionRunning) return;
    setIsActionRunning(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch('/api/panel/candidates/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action,
          candidate_ids: [candidateId],
        }),
      });
      const payload = (await response.json()) as CandidateActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Danisman aksiyonu kaydedilemedi.'));
      }
      setMessage(action === 'appointment_attended' ? 'Aday gorusmeye geldi olarak isaretlendi.' : 'Aday no-show olarak isaretlendi.');
      await loadRows();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Danisman aksiyonu kaydedilemedi.');
    } finally {
      setIsActionRunning(false);
    }
  };

  const applyFilters = () => {
    setAppliedSchoolQuery(schoolInput.trim());
  };

  const resetFilters = () => {
    setSchoolInput('');
    setAppliedSchoolQuery('');
    setSelectedOwnerId('');
    setFollowUpOnly(false);
  };

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)] lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Danisman Operasyon Derinligi</p>
          <h3 className="mt-2 text-[22px] font-semibold text-white">Okul Performansi + Ownership Drilldown</h3>
          <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
            Follow-up ihtiyaci, okul etkisi ve danisman sahipligi tek yuzeyde izlenir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRows()}
          disabled={isLoading}
          className="rounded-full border border-[#1A273A] bg-[#0A192B]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/78 hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Yukleniyor...' : 'Yenile'}
        </button>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_auto_auto]">
        <input
          value={schoolInput}
          onChange={(event) => setSchoolInput(event.target.value)}
          placeholder="Okul ara (drilldown)"
          className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <select
          value={selectedOwnerId}
          onChange={(event) => setSelectedOwnerId(event.target.value)}
          className="h-[40px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Tum ownership</option>
          <option value="__unassigned__">Unassigned</option>
          {ownerOptions
            .filter((item) => item.owner_id)
            .map((item) => (
              <option key={item.owner_id} value={item.owner_id}>
                {item.owner_name} ({item.owner_role}) - {formatNumber(item.total_candidates)}
              </option>
            ))}
        </select>
        <label className="inline-flex h-[40px] items-center gap-2 rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 text-[12px] text-white/78">
          <input
            type="checkbox"
            checked={followUpOnly}
            onChange={(event) => setFollowUpOnly(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#D92E27]"
          />
          <span>Follow-up only</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="h-[40px] rounded-xl bg-[#D92E27] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#bf251f]"
          >
            Uygula
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="h-[40px] rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-[#2D4363]"
          >
            Temizle
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 rounded-xl border border-[#224235] bg-[#0E2A21]/85 px-4 py-3 text-[13px] text-[#BCECD9]">{message}</p> : null}
      {errorMessage ? <p className="mt-3 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[13px] text-[#FFB8B1]">{errorMessage}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <article className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/52">Toplam Kayit</p>
          <p className="mt-2 text-[22px] font-semibold text-white">
            {formatNumber(summary.total_candidates ?? total)}
          </p>
        </article>
        <article className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/52">Follow-up</p>
          <p className="mt-2 text-[22px] font-semibold text-[#FFD2CE]">
            {formatNumber(summary.follow_up_needed ?? derived.followUpNeeded)}
          </p>
        </article>
        <article className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/52">Bugun Akis</p>
          <p className="mt-2 text-[22px] font-semibold text-white">
            {formatNumber(summary.today_flow ?? derived.today)}
          </p>
        </article>
        <article className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/52">Booked / No-show</p>
          <p className="mt-2 text-[20px] font-semibold text-white">
            {formatNumber(summary.appointment_booked ?? derived.booked)} / {formatNumber(summary.appointment_no_show ?? derived.noShow)}
          </p>
        </article>
        <article className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/52">Ownership Assigned</p>
          <p className="mt-2 text-[22px] font-semibold text-white">
            {formatNumber(summary.owner_assigned ?? derived.assigned)}
          </p>
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-[#1A273A] bg-[#081327]/88 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/52">Okul Performansi</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[620px] text-left text-[12px] text-white/80">
              <thead>
                <tr className="border-b border-white/12 text-white/56">
                  <th className="px-2 py-2">Okul</th>
                  <th className="px-2 py-2 text-right">Toplam</th>
                  <th className="px-2 py-2 text-right">Follow-up</th>
                  <th className="px-2 py-2 text-right">Unviewed</th>
                  <th className="px-2 py-2 text-right">No-show</th>
                </tr>
              </thead>
              <tbody>
                {(schoolRows.length > 0 ? schoolRows : [{ school_name: '-', total_candidates: 0 }]).slice(0, 10).map((row, index) => (
                  <tr key={`${row.school_name || 'na'}-${index}`} className="border-b border-white/6">
                    <td className="px-2 py-2">{row.school_name || '-'}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(Number(row.total_candidates || 0))}</td>
                    <td className="px-2 py-2 text-right font-semibold text-[#FFD2CE]">{formatNumber(Number(row.follow_up_needed || 0))}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(Number(row.unviewed_results || 0))}</td>
                    <td className="px-2 py-2 text-right">{formatNumber(Number(row.appointment_no_show || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-[#1A273A] bg-[#081327]/88 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/52">Follow-up Ownership</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[620px] text-left text-[12px] text-white/80">
              <thead>
                <tr className="border-b border-white/12 text-white/56">
                  <th className="px-2 py-2">Owner</th>
                  <th className="px-2 py-2 text-right">Toplam</th>
                  <th className="px-2 py-2 text-right">Follow-up</th>
                  <th className="px-2 py-2 text-right">No-show</th>
                  <th className="px-2 py-2 text-right">Drilldown</th>
                </tr>
              </thead>
              <tbody>
                {(ownerRows.length > 0 ? ownerRows : [{ owner_name: 'Unassigned', owner_role: 'UNASSIGNED', total_candidates: 0 }]).slice(0, 12).map((row, index) => {
                  const ownerId = String(row.owner_id || '');
                  return (
                    <tr key={`${ownerId || 'unassigned'}-${index}`} className="border-b border-white/6">
                      <td className="px-2 py-2">
                        <p className="font-medium text-white">{row.owner_name || 'Unassigned'}</p>
                        <p className="text-[11px] text-white/52">{row.owner_role || 'UNASSIGNED'}</p>
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(Number(row.total_candidates || 0))}</td>
                      <td className="px-2 py-2 text-right font-semibold text-[#FFD2CE]">{formatNumber(Number(row.follow_up_needed || 0))}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(Number(row.appointment_no_show || 0))}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedOwnerId(ownerId || '__unassigned__')}
                          className="rounded-full border border-[#1A273A] bg-[#0A192B]/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 hover:border-[#2D4363]"
                        >
                          Filtrele
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-3">
        {drilldownRows.map((item) => {
          const appointmentStatus = normalizeAppointmentStatus(item.appointment_status);
          return (
            <article key={item.candidate_id} className="rounded-xl border border-[#1A273A] bg-[#081327]/88 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-semibold text-white">{item.student_full_name || 'Aday'}</p>
                  <p className="mt-1 text-[12px] text-white/62">
                    {item.school_name || '-'} • Sinif {item.grade ?? '-'} • Sube {item.section || '-'} • Basvuru {item.application_no || '-'}
                  </p>
                  <p className="mt-1 text-[12px] text-white/62">
                    Randevu: {formatAppointmentStatus(item.appointment_status)} • Son durum: {formatDate(item.appointment_status_at || item.updated_at)}
                  </p>
                  <p className="mt-1 text-[12px] text-white/62">
                    Sonuc: {item.result_status || '-'} • Skor: {formatNumber(item.result_score)} • CRM: {item.crm_export_status || '-'}
                  </p>
                  <p className="mt-1 text-[12px] text-white/62">
                    Owner: {item.owner_name || 'Unassigned'} ({item.owner_role || 'UNASSIGNED'}) • Atama: {formatDate(item.owner_assigned_at)}
                  </p>
                  <p className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] ${item.follow_up_needed ? 'border-[#6F2824] bg-[#321517] text-[#FFD2CE]' : 'border-[#2A5D48] bg-[#123625] text-[#BCECD9]'}`}>
                    {item.follow_up_needed ? 'Follow-up gerekli' : 'Follow-up temiz'} • {buildFollowUpReason(item)}
                  </p>
                  {item.operator_note ? (
                    <p className="mt-2 rounded-md border border-[#1E324A] bg-[#0A192B]/80 px-2 py-1 text-[12px] text-white/70">
                      Not: {item.operator_note}
                    </p>
                  ) : null}
                </div>

                {canOperate && appointmentStatus === 'BOOKED' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void runAppointmentAction('appointment_attended', item.candidate_id)}
                      disabled={isActionRunning}
                      className="rounded-full border border-[#2A5D48] bg-[#123625] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#BCECD9] hover:bg-[#184B34] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Geldi
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAppointmentAction('appointment_no_show', item.candidate_id)}
                      disabled={isActionRunning}
                      className="rounded-full border border-[#6F2824] bg-[#321517] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#FFD2CE] hover:bg-[#4A1D21] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      No-show
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}

        {!isLoading && drilldownRows.length === 0 ? (
          <p className="rounded-xl border border-[#1A273A] bg-[#07162A]/82 px-4 py-3 text-[13px] text-white/66">
            Secilen filtreler icin danisman drilldown kaydi bulunamadi.
          </p>
        ) : null}
      </div>
    </section>
  );
}
