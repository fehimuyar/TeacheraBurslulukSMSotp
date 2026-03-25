import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../../api/panelApi';
import { canOperateUnviewed, isReadOnlyPanelRole } from '../panelRoleAccess';
import {
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type ScenarioMode = 'result_unseen' | 'viewed_no_appointment' | 'appointment_no_show';

type UnviewedSummaryPayload = {
  summary?: {
    total_unviewed?: number;
  };
  message?: string;
  error?: string;
};

type ConsultantSummaryPayload = {
  summary?: {
    viewed_no_appointment?: number;
    appointment_no_show?: number;
  };
  message?: string;
  error?: string;
};

type FollowUpPreviewPayload = {
  preview?: boolean;
  totals?: {
    scanned?: number;
    enqueued?: number;
    skipped_no_phone?: number;
  };
  message?: string;
  error?: string;
  audit_log_id?: string | number | null;
  audit_log_seq?: number | null;
};

type UnviewedListPayload = {
  items?: Array<{
    candidate_id: string;
    student_full_name: string | null;
    school_name: string | null;
    grade: number | null;
    result_published_at: string | null;
    wa_result_status: string | null;
  }>;
  message?: string;
  error?: string;
};

type ConsultantListPayload = {
  items?: Array<{
    candidate_id: string;
    student_full_name: string | null;
    school_name: string | null;
    grade: number | null;
    appointment_status: string | null;
    appointment_status_at: string | null;
    viewed_no_appointment?: boolean;
  }>;
  message?: string;
  error?: string;
};

type ScenarioListRow = {
  candidate_id: string;
  student_full_name: string | null;
  school_name: string | null;
  grade: number | null;
  detail: string;
};

type PreviewState = {
  scanned: number;
  enqueueable: number;
  skippedNoPhone: number;
  previewedAt: string;
};

const WA_SCENARIOS: Array<{
  id: ScenarioMode;
  title: string;
  description: string;
  helper: string;
}> = [
  {
    id: 'result_unseen',
    title: 'Sonuc Goruntulemeyenler',
    description: 'Sonucu yayinda olan ama henuz giris yapip sonucu acmayan adaylar.',
    helper: 'WA_RESULT auto follow-up',
  },
  {
    id: 'viewed_no_appointment',
    title: 'Randevu Almayanlar',
    description: 'Sonucu gormus fakat henuz randevu planlamamis adaylar.',
    helper: 'Viewed / no appointment follow-up',
  },
  {
    id: 'appointment_no_show',
    title: 'Gorusmeye Gelmeyenler',
    description: 'Randevusuna gelmeyen adaylara ikinci temas taramasi.',
    helper: 'No-show follow-up',
  },
];

const EMPTY_COUNTS: Record<ScenarioMode, number> = {
  result_unseen: 0,
  viewed_no_appointment: 0,
  appointment_no_show: 0,
};

const EMPTY_PREVIEWS: Record<ScenarioMode, PreviewState | null> = {
  result_unseen: null,
  viewed_no_appointment: null,
  appointment_no_show: null,
};

function formatNumber(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('tr-TR').format(Number(value));
}

function formatDateTime(value: string | null | undefined) {
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

function readAuditLabel(payload: FollowUpPreviewPayload | null | undefined) {
  const auditId = payload?.audit_log_id;
  if (auditId === null || auditId === undefined || auditId === '') return '';
  const seq = Number(payload?.audit_log_seq);
  if (Number.isFinite(seq) && seq > 0) {
    return ` Audit #${String(auditId)} / Seq ${String(seq)}`;
  }
  return ` Audit #${String(auditId)}`;
}

function buildUnviewedPath(campaignCode: string, perPage = 1) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('per_page', String(perPage));
  params.set('sort_by', 'result_published_at');
  params.set('sort_order', 'desc');
  if (campaignCode.trim()) {
    params.set('filters', JSON.stringify({ campaign_code: campaignCode.trim() }));
  }
  return `/api/panel/unviewed-results?${params.toString()}`;
}

function buildConsultantPath(campaignCode: string, perPage = 40) {
  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('per_page', String(perPage));
  params.set('sort_by', 'updated_at');
  params.set('sort_order', 'desc');
  if (campaignCode.trim()) {
    params.set('filters', JSON.stringify({ campaign_code: campaignCode.trim() }));
  }
  return `/api/panel/consultant/overview?${params.toString()}`;
}

function buildActionBody({
  campaignCode,
  mode,
  limit,
  resultUnseenDelayMinutes,
  viewedNoAppointmentDelayMinutes,
  appointmentNoShowDelayMinutes,
  preview,
}: {
  campaignCode: string;
  mode: ScenarioMode;
  limit: number;
  resultUnseenDelayMinutes: number;
  viewedNoAppointmentDelayMinutes: number;
  appointmentNoShowDelayMinutes: number;
  preview: boolean;
}) {
  return {
    action: 'run_followup_auto_whatsapp',
    campaign_code: campaignCode.trim() || undefined,
    mode,
    limit,
    result_unseen_delay_minutes: resultUnseenDelayMinutes,
    viewed_no_appointment_delay_minutes: viewedNoAppointmentDelayMinutes,
    appointment_no_show_delay_minutes: appointmentNoShowDelayMinutes,
    preview,
  };
}

function buildPreviewMessage(mode: ScenarioMode, payload: FollowUpPreviewPayload) {
  const totals = payload.totals || {};
  const label =
    mode === 'result_unseen'
      ? 'Sonuc goruntulemeyenler'
      : mode === 'viewed_no_appointment'
        ? 'Randevu almayanlar'
        : 'No-show follow-up';
  return [
    `${label} dry-run sonucu`,
    `Scanned: ${formatNumber(totals.scanned)}`,
    `Enqueueable: ${formatNumber(totals.enqueued)}`,
    `No phone: ${formatNumber(totals.skipped_no_phone)}`,
    '',
    'Islem uygulansin mi?',
  ].join('\n');
}

function normalizePreview(payload: FollowUpPreviewPayload): PreviewState {
  const totals = payload.totals || {};
  return {
    scanned: Number(totals.scanned || 0),
    enqueueable: Number(totals.enqueued || 0),
    skippedNoPhone: Number(totals.skipped_no_phone || 0),
    previewedAt: new Date().toISOString(),
  };
}

export default function WhatsAppTriggersTab({
  role,
  permissions,
  seedCampaignCode = '',
}: {
  role?: string;
  permissions?: string[];
  seedCampaignCode?: string;
}) {
  const canOperate = canOperateUnviewed(role, permissions);
  const readOnly = isReadOnlyPanelRole(role);

  const [campaignCode, setCampaignCode] = useState(seedCampaignCode);
  const [limitInput, setLimitInput] = useState('250');
  const [resultUnseenDelayInput, setResultUnseenDelayInput] = useState('30');
  const [viewedDelayInput, setViewedDelayInput] = useState('180');
  const [noShowDelayInput, setNoShowDelayInput] = useState('30');

  const [counts, setCounts] = useState<Record<ScenarioMode, number>>(EMPTY_COUNTS);
  const [previews, setPreviews] = useState<Record<ScenarioMode, PreviewState | null>>(EMPTY_PREVIEWS);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [loadingScenarioId, setLoadingScenarioId] = useState<ScenarioMode | null>(null);
  const [runningScenarioId, setRunningScenarioId] = useState<ScenarioMode | null>(null);

  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [listModalScenario, setListModalScenario] = useState<ScenarioMode | null>(null);
  const [listRows, setListRows] = useState<ScenarioListRow[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listErrorMessage, setListErrorMessage] = useState('');

  useEffect(() => {
    setCampaignCode(seedCampaignCode);
  }, [seedCampaignCode]);

  const numericConfig = useMemo(() => {
    const parsedLimit = Number.parseInt(limitInput, 10);
    const parsedResultDelay = Number.parseInt(resultUnseenDelayInput, 10);
    const parsedViewedDelay = Number.parseInt(viewedDelayInput, 10);
    const parsedNoShowDelay = Number.parseInt(noShowDelayInput, 10);
    return {
      limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 2000) : 250,
      resultUnseenDelayMinutes: Number.isFinite(parsedResultDelay) ? Math.min(Math.max(parsedResultDelay, 0), 1440) : 30,
      viewedNoAppointmentDelayMinutes: Number.isFinite(parsedViewedDelay) ? Math.min(Math.max(parsedViewedDelay, 0), 1440) : 180,
      appointmentNoShowDelayMinutes: Number.isFinite(parsedNoShowDelay) ? Math.min(Math.max(parsedNoShowDelay, 0), 1440) : 30,
    };
  }, [limitInput, noShowDelayInput, resultUnseenDelayInput, viewedDelayInput]);

  const loadCounts = async () => {
    setIsLoadingCounts(true);
    setErrorMessage('');
    try {
      const [unviewedResponse, consultantResponse] = await Promise.all([
        panelFetch(buildUnviewedPath(campaignCode), { method: 'GET' }),
        panelFetch(buildConsultantPath(campaignCode, 1), { method: 'GET' }),
      ]);
      const unviewedPayload = (await unviewedResponse.json()) as UnviewedSummaryPayload;
      const consultantPayload = (await consultantResponse.json()) as ConsultantSummaryPayload;
      if (!unviewedResponse.ok) {
        throw new Error(normalizeMessage(unviewedPayload, 'WhatsApp hedef ozeti alinamadi.'));
      }
      if (!consultantResponse.ok) {
        throw new Error(normalizeMessage(consultantPayload, 'Danisman takip ozeti alinamadi.'));
      }
      setCounts({
        result_unseen: Number(unviewedPayload.summary?.total_unviewed || 0),
        viewed_no_appointment: Number(consultantPayload.summary?.viewed_no_appointment || 0),
        appointment_no_show: Number(consultantPayload.summary?.appointment_no_show || 0),
      });
    } catch (error) {
      setCounts(EMPTY_COUNTS);
      setErrorMessage(error instanceof Error ? error.message : 'WhatsApp hedef ozeti alinamadi.');
    } finally {
      setIsLoadingCounts(false);
    }
  };

  useEffect(() => {
    void loadCounts();
  }, [campaignCode]);

  const runPreview = async (mode: ScenarioMode) => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin WhatsApp otomasyon aksiyonlari kapali.');
      return null;
    }

    setLoadingScenarioId(mode);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch('/api/panel/unviewed-results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          buildActionBody({
            campaignCode,
            mode,
            preview: true,
            ...numericConfig,
          }),
        ),
      });
      const payload = (await response.json()) as FollowUpPreviewPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Dry-run sonucu alinamadi.'));
      }
      const previewState = normalizePreview(payload);
      setPreviews((prev) => ({ ...prev, [mode]: previewState }));
      setMessage(
        `${WA_SCENARIOS.find((item) => item.id === mode)?.title || 'Follow-up'} dry-run: Scanned ${formatNumber(previewState.scanned)} • Enqueueable ${formatNumber(previewState.enqueueable)} • No phone ${formatNumber(previewState.skippedNoPhone)}`,
      );
      return payload;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Dry-run sonucu alinamadi.');
      return null;
    } finally {
      setLoadingScenarioId(null);
    }
  };

  const handleRunScenario = async (mode: ScenarioMode) => {
    if (!canOperate) {
      setErrorMessage('Bu rol icin WhatsApp otomasyon aksiyonlari kapali.');
      return;
    }

    setRunningScenarioId(mode);
    setErrorMessage('');
    setMessage('');
    try {
      const previewPayload = await runPreview(mode);
      if (!previewPayload) return;
      const confirmed = window.confirm(buildPreviewMessage(mode, previewPayload));
      if (!confirmed) return;

      const response = await panelFetch('/api/panel/unviewed-results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(
          buildActionBody({
            campaignCode,
            mode,
            preview: false,
            ...numericConfig,
          }),
        ),
      });
      const payload = (await response.json()) as FollowUpPreviewPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'WhatsApp taramasi calistirilamadi.'));
      }
      const totals = payload.totals || {};
      setMessage(
        `${WA_SCENARIOS.find((item) => item.id === mode)?.title || 'Follow-up'} tamamlandi. Scanned ${formatNumber(totals.scanned)} • Enqueued ${formatNumber(totals.enqueued)} • No phone ${formatNumber(totals.skipped_no_phone)}${readAuditLabel(payload)}`,
      );
      await loadCounts();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'WhatsApp taramasi calistirilamadi.');
    } finally {
      setRunningScenarioId(null);
    }
  };

  const openListModal = async (mode: ScenarioMode) => {
    setListModalScenario(mode);
    setIsListLoading(true);
    setListErrorMessage('');
    setListRows([]);
    try {
      if (mode === 'result_unseen') {
        const response = await panelFetch(buildUnviewedPath(campaignCode, 25), { method: 'GET' });
        const payload = (await response.json()) as UnviewedListPayload;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'Aday listesi alinamadi.'));
        }
        const items = Array.isArray(payload.items) ? payload.items : [];
        setListRows(
          items.map((item) => ({
            candidate_id: item.candidate_id,
            student_full_name: item.student_full_name,
            school_name: item.school_name,
            grade: item.grade,
            detail: `Yayin: ${formatDateTime(item.result_published_at)} • WA: ${item.wa_result_status || '-'}`,
          })),
        );
        return;
      }

      const response = await panelFetch(buildConsultantPath(campaignCode, 60), { method: 'GET' });
      const payload = (await response.json()) as ConsultantListPayload;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Takip listesi alinamadi.'));
      }
      const items = Array.isArray(payload.items) ? payload.items : [];
      const filteredItems = items.filter((item) => {
        if (mode === 'viewed_no_appointment') return Boolean(item.viewed_no_appointment);
        return String(item.appointment_status || '').trim().toUpperCase() === 'NO_SHOW';
      });
      setListRows(
        filteredItems.slice(0, 25).map((item) => ({
          candidate_id: item.candidate_id,
          student_full_name: item.student_full_name,
          school_name: item.school_name,
          grade: item.grade,
          detail:
            mode === 'viewed_no_appointment'
              ? 'Sonuc goruldu, randevu yok'
              : `No-show tarihi: ${formatDateTime(item.appointment_status_at)}`,
        })),
      );
    } catch (error) {
      setListErrorMessage(error instanceof Error ? error.message : 'Aday listesi alinamadi.');
    } finally {
      setIsListLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod. Dry-run ve tetikleme aksiyonlari kapali.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}
      {errorMessage && <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>WhatsApp Follow-up</p>
        <h3 className={panelTitleClassName}>Canli Tetikleme Senaryolari</h3>
        <p className={panelDescriptionClassName}>
          Sonuc ve randevu akislarindaki kritik aday segmentleri mevcut panel backend sorgulari uzerinden izlenir.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Campaign code</label>
            <input value={campaignCode} onChange={(event) => setCampaignCode(event.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="Bos = varsayilan / tumu" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Limit</label>
            <input value={limitInput} onChange={(event) => setLimitInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="250" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sonuc Gorulmedi Gecikme (dk)</label>
            <input value={resultUnseenDelayInput} onChange={(event) => setResultUnseenDelayInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={`mt-1 w-full ${panelCompactInputClassName}`} placeholder="30" />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Randevu / No-show Gecikme (dk)</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input value={viewedDelayInput} onChange={(event) => setViewedDelayInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={panelCompactInputClassName} placeholder="180" />
              <input value={noShowDelayInput} onChange={(event) => setNoShowDelayInput(event.target.value.replace(/\D/g, '').slice(0, 4))} className={panelCompactInputClassName} placeholder="30" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sonuc Goruntulemeyen</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{isLoadingCounts ? '...' : formatNumber(counts.result_unseen)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Goruldu / Randevu Yok</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{isLoadingCounts ? '...' : formatNumber(counts.viewed_no_appointment)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">No-show</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#875349]">{isLoadingCounts ? '...' : formatNumber(counts.appointment_no_show)}</p>
        </div>
      </div>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Senaryolar</p>
        {isLoadingCounts ? (
          <PanelLoadingMessage>WhatsApp takip havuzlari yukleniyor...</PanelLoadingMessage>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {WA_SCENARIOS.map((scenario) => {
              const preview = previews[scenario.id];
              const isPreviewing = loadingScenarioId === scenario.id;
              const isRunning = runningScenarioId === scenario.id;
              return (
                <div key={scenario.id} className={panelSoftCardClassName}>
                  <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] text-[#1B2B24]">{scenario.title}</p>
                  <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.6] text-[#5E665E]">{scenario.description}</p>
                  <div className="mt-3 rounded-[16px] border border-[#E4DBCF] bg-[#FBF7F0] px-3 py-3">
                    <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Canli havuz</p>
                    <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] text-[#1B2B24]">{formatNumber(counts[scenario.id])} aday</p>
                    <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">{scenario.helper}</p>
                    {preview ? (
                      <div className="mt-3 rounded-[12px] border border-[#D6E3DA] bg-[#EEF6F0] px-3 py-2">
                        <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#2C5447]">
                          Dry-run: {formatNumber(preview.scanned)} scanned • {formatNumber(preview.enqueueable)} enqueueable • {formatNumber(preview.skippedNoPhone)} no phone
                        </p>
                        <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#537466]">
                          Son onizleme: {formatDateTime(preview.previewedAt)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void openListModal(scenario.id)} className={panelSecondaryButtonClassName}>
                      Listeyi Gor
                    </button>
                    {canOperate ? (
                      <>
                        <button type="button" onClick={() => void runPreview(scenario.id)} className={panelSecondaryButtonClassName} disabled={isPreviewing || isRunning}>
                          {isPreviewing ? 'Dry-run...' : 'Dry-run'}
                        </button>
                        <button type="button" onClick={() => void handleRunScenario(scenario.id)} className={panelPrimaryButtonClassName} disabled={isPreviewing || isRunning}>
                          {isRunning ? 'Calisiyor...' : 'Tetikle'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PanelModal
        open={listModalScenario !== null}
        onClose={() => {
          setListModalScenario(null);
          setListRows([]);
          setListErrorMessage('');
        }}
        title={listModalScenario ? `${WA_SCENARIOS.find((item) => item.id === listModalScenario)?.title || 'Senaryo'} - Aday Listesi` : ''}
        maxWidth="760px"
      >
        {isListLoading ? (
          <PanelLoadingMessage>Aday listesi yukleniyor...</PanelLoadingMessage>
        ) : listErrorMessage ? (
          <PanelFeedbackMessage tone="error">{listErrorMessage}</PanelFeedbackMessage>
        ) : listRows.length === 0 ? (
          <PanelEmptyState message="Bu senaryoda gosterilecek aday bulunamadi." />
        ) : (
          <div className={panelTableContainerClassName}>
            <table className="min-w-[640px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
              <thead>
                <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                  <th className="px-3 py-2">Aday</th>
                  <th className="px-3 py-2">Okul</th>
                  <th className="px-3 py-2 text-right">Sinif</th>
                  <th className="px-3 py-2">Detay</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row) => (
                  <tr key={`${row.candidate_id}-${row.detail}`} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{row.student_full_name || row.candidate_id}</td>
                    <td className="px-3 py-2">{row.school_name || '-'}</td>
                    <td className="px-3 py-2 text-right">{row.grade ? `${row.grade}` : '-'}</td>
                    <td className="px-3 py-2">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelModal>
    </div>
  );
}
