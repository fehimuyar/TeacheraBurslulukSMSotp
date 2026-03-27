import { useEffect, useMemo, useState } from 'react';
import { panelApiHref, panelFetch } from '../../api/panelApi';
import { canOverrideResults, canPublishResults, isReadOnlyPanelRole } from './panelRoleAccess';

type ResultRow = {
  result_id: string;
  attempt_id: string | null;
  candidate_id: string | null;
  campaign_code: string | null;
  application_no: string | null;
  student_full_name: string | null;
  parent_full_name: string | null;
  parent_phone_e164: string | null;
  grade: number | null;
  school_name: string | null;
  result_status: string | null;
  result_score: number | null;
  result_percentage: number | null;
  placement_label: string | null;
  cefr_band: string | null;
  published_at: string | null;
  viewed_at: string | null;
  scholarship_submission_status?: string | null;
  objective_score?: number | null;
  speaking_score?: number | null;
  final_score?: number | null;
  speaking_uploaded_count?: number | null;
  speaking_expected_count?: number | null;
  finalized_at?: string | null;
  override_count: number | null;
  last_override_at: string | null;
  last_override_reason: string | null;
  last_overridden_by: string | null;
  updated_at: string | null;
};

type ResultsSummary = {
  total_results?: number;
  published_results?: number;
  viewed_results?: number;
  pending_publish?: number;
  scholarship_pending_finalize?: number;
  overridden_results?: number;
};

type ResultsListResponse = {
  items?: ResultRow[];
  total?: number;
  page?: number;
  per_page?: number;
  summary?: ResultsSummary;
  message?: string;
  error?: string;
};

type ResultsActionResponse = {
  action?: 'override' | 'publish' | 'finalize' | string;
  requested?: number;
  updated?: number;
  published?: number;
  finalized?: number;
  notifications_enqueued?: number;
  sms_notifications_enqueued?: number;
  whatsapp_fallback_enabled?: boolean;
  notifications_skipped_no_recipient?: number;
  item?: ResultRow;
  message?: string;
  error?: string;
};

type ScholarshipSpeakingQuestion = {
  question_id: string;
  question_no: number;
  prompt: string;
  visual_asset?: string | null;
  visual_url?: string | null;
  max_duration_seconds: number;
  rubric_max_score: number;
  rubric_score?: number | null;
  response?: {
    response_id: string;
    mime_type?: string | null;
    byte_size?: number | null;
    duration_seconds?: number | null;
    status?: string | null;
    audio_url?: string | null;
  } | null;
};

type ScholarshipDetailResponse = {
  result?: ResultRow & {
    application_no?: string | null;
    parent_full_name?: string | null;
    parent_phone_e164?: string | null;
    exam_language?: string | null;
    exam_age_range?: string | null;
  };
  scholarship?: {
    submission_status?: string | null;
    exam_version_key?: string | null;
    content_grade?: string | null;
    objective_score?: number | null;
    objective_percentage?: number | null;
    objective_question_count?: number | null;
    objective_answered_count?: number | null;
    objective_correct_count?: number | null;
    objective_wrong_count?: number | null;
    objective_unanswered_count?: number | null;
    speaking_expected_count?: number | null;
    speaking_uploaded_count?: number | null;
    speaking_score?: number | null;
    final_score?: number | null;
    submitted_at?: string | null;
    finalized_at?: string | null;
    speaking_rubric?: Array<{
      questionId: string;
      score: number;
      maxScore?: number;
    }>;
  };
  speaking_questions?: ScholarshipSpeakingQuestion[];
  message?: string;
  error?: string;
};

type ResultFilters = {
  campaignCode: string;
  schoolQuery: string;
  grade: string;
  resultStatus: '' | 'NOT_READY' | 'PUBLISHED' | 'VIEWED';
  viewedStatus: '' | 'VIEWED' | 'NOT_VIEWED';
  publishStatus: '' | 'PUBLISHED' | 'NOT_PUBLISHED';
  overrideStatus: '' | 'OVERRIDDEN' | 'NOT_OVERRIDDEN';
  publishedFrom: string;
  publishedTo: string;
};

type OverrideDraft = {
  reason: string;
  score: string;
  percentage: string;
  placementLabel: string;
  cefrBand: string;
};

const defaultFilters: ResultFilters = {
  campaignCode: '',
  schoolQuery: '',
  grade: '',
  resultStatus: '',
  viewedStatus: '',
  publishStatus: '',
  overrideStatus: '',
  publishedFrom: '',
  publishedTo: '',
};

const defaultOverrideDraft: OverrideDraft = {
  reason: '',
  score: '',
  percentage: '',
  placementLabel: '',
  cefrBand: '',
};

const RESULT_STATUS_OPTIONS = ['NOT_READY', 'PUBLISHED', 'VIEWED'] as const;
const VIEWED_STATUS_OPTIONS = ['VIEWED', 'NOT_VIEWED'] as const;
const PUBLISH_STATUS_OPTIONS = ['PUBLISHED', 'NOT_PUBLISHED'] as const;
const OVERRIDE_STATUS_OPTIONS = ['OVERRIDDEN', 'NOT_OVERRIDDEN'] as const;
const GRADE_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 2));

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

function formatPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function normalizeMessage(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function toResultStatusLabel(value: string | null | undefined) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'NOT_READY') return 'Hazır Değil';
  if (normalized === 'PUBLISHED') return 'Yayınlandı';
  if (normalized === 'VIEWED') return 'Görüntülendi';
  return normalized || '-';
}

function toPublishState(value: string | null | undefined) {
  return value ? 'Yayınlandı' : 'Bekliyor';
}

function toViewedState(value: string | null | undefined) {
  return value ? 'Görüntülendi' : 'Görüntülenmedi';
}

function toScholarshipStatusLabel(value: string | null | undefined) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '-';
  if (normalized === 'EVALUATION_PENDING') return 'Rubric Bekliyor';
  if (normalized === 'FINALIZED') return 'Finalize Edildi';
  return normalized;
}

function formatDurationSeconds(value: number | null | undefined) {
  if (!Number.isFinite(value)) return '-';
  const safe = Math.max(0, Math.trunc(Number(value)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function buildFiltersPayload(filters: ResultFilters) {
  const payload: Record<string, unknown> = {};
  const campaignCode = filters.campaignCode.trim();
  if (campaignCode) payload.campaign_code = campaignCode;
  const schoolQuery = filters.schoolQuery.trim();
  if (schoolQuery) payload.school_query = schoolQuery;
  if (filters.grade) payload.grade = [filters.grade];
  if (filters.resultStatus) payload.result_status = [filters.resultStatus];
  if (filters.viewedStatus) payload.viewed_status = [filters.viewedStatus];
  if (filters.publishStatus) payload.publish_status = [filters.publishStatus];
  if (filters.overrideStatus) payload.override_status = [filters.overrideStatus];
  if (filters.publishedFrom) payload.from = `${filters.publishedFrom}T00:00:00.000Z`;
  if (filters.publishedTo) payload.to = `${filters.publishedTo}T23:59:59.999Z`;
  return payload;
}

function buildResultsPath(query: string, filters: ResultFilters, page: number, perPage: number) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));
  params.set('sort_by', 'updated_at');
  params.set('sort_order', 'desc');

  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  }

  const filtersPayload = buildFiltersPayload(filters);
  if (Object.keys(filtersPayload).length > 0) {
    params.set('filters', JSON.stringify(filtersPayload));
  }

  return `/api/panel/results?${params.toString()}`;
}

function readOptionalNumberInput(value: string, fieldName: string) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} sayısal olmalıdır.`);
  }
  if (numeric < 0 || numeric > 100) {
    throw new Error(`${fieldName} 0 ile 100 arasında olmalıdır.`);
  }
  return Number(numeric.toFixed(2));
}

function hasAnyOverrideField(draft: OverrideDraft) {
  return Boolean(
    draft.score.trim()
      || draft.percentage.trim()
      || draft.placementLabel.trim()
      || draft.cefrBand.trim(),
  );
}

export default function ResultReviewPanel({
  active,
  role,
  permissions,
}: {
  active: boolean;
  role?: string;
  permissions?: string[];
}) {
  const [query, setQuery] = useState('');
  const [draftFilters, setDraftFilters] = useState<ResultFilters>(defaultFilters);
  const [appliedQuery, setAppliedQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<ResultFilters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [items, setItems] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ResultsSummary>({});
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft>(defaultOverrideDraft);
  const [enqueueWhatsapp, setEnqueueWhatsapp] = useState(true);
  const [forceRepublish, setForceRepublish] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [detailResultId, setDetailResultId] = useState('');
  const [detailPayload, setDetailPayload] = useState<ScholarshipDetailResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [rubricDraft, setRubricDraft] = useState<Record<string, string>>({});

  const canOverride = canOverrideResults(role, permissions);
  const canPublish = canPublishResults(role, permissions);
  const isReadOnly = isReadOnlyPanelRole(role);

  const pageCount = useMemo(() => {
    const value = Math.ceil(total / perPage);
    return value > 0 ? value : 1;
  }, [perPage, total]);

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedResultIds.includes(item.result_id));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await panelFetch(buildResultsPath(appliedQuery, appliedFilters, page, perPage), {
          method: 'GET',
        });
        const payload = (await response.json()) as ResultsListResponse;
        if (!response.ok) {
          throw new Error(normalizeMessage(payload, 'Sonuç listesi alınamadı.'));
        }

        if (cancelled) return;
        const nextItems = Array.isArray(payload.items) ? payload.items : [];
        setItems(nextItems);
        setTotal(Number(payload.total || 0));
        setSummary(payload.summary || {});
        setSelectedResultIds((prev) => prev.filter((id) => nextItems.some((item) => item.result_id === id)));
      } catch (error) {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setSummary({});
          setSelectedResultIds([]);
          setErrorMessage(error instanceof Error ? error.message : 'Sonuç listesi alınamadı.');
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

  const refreshList = async () => {
    const response = await panelFetch(buildResultsPath(appliedQuery, appliedFilters, page, perPage), {
      method: 'GET',
    });
    if (!response.ok) return;
    const payload = (await response.json()) as ResultsListResponse;
    const nextItems = Array.isArray(payload.items) ? payload.items : [];
    setItems(nextItems);
    setTotal(Number(payload.total || 0));
    setSummary(payload.summary || {});
    setSelectedResultIds((prev) => prev.filter((id) => nextItems.some((item) => item.result_id === id)));
  };

  const loadScholarshipDetail = async (resultId: string) => {
    if (!resultId) return;
    setIsDetailLoading(true);
    setDetailError('');

    try {
      const response = await panelFetch(`/api/panel/results/${encodeURIComponent(resultId)}`, {
        method: 'GET',
      });
      const payload = (await response.json()) as ScholarshipDetailResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Scholarship detaylari alinamadi.'));
      }

      setDetailResultId(resultId);
      setDetailPayload(payload);
      setRubricDraft(
        Object.fromEntries(
          (payload.speaking_questions || []).map((question) => [
            question.question_id,
            String(question.rubric_score ?? 0),
          ]),
        ),
      );
    } catch (error) {
      setDetailResultId(resultId);
      setDetailPayload(null);
      setDetailError(error instanceof Error ? error.message : 'Scholarship detaylari alinamadi.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const runOverride = async (resultIds: string[]) => {
    if (!canOverride) {
      setErrorMessage('PANEL_RESULTS_OVERRIDE izni olmadan override işlemi yapılamaz.');
      return;
    }
    if (resultIds.length === 0 || isActionRunning) return;

    const reason = overrideDraft.reason.trim();
    if (!reason) {
      setErrorMessage('Override nedeni zorunludur.');
      return;
    }
    if (!hasAnyOverrideField(overrideDraft)) {
      setErrorMessage('Override için en az bir alan (score/percentage/placement/cefr) girilmelidir.');
      return;
    }

    setIsActionRunning(true);
    setMessage('');
    setErrorMessage('');

    try {
      const body: Record<string, unknown> = {
        action: 'override',
        result_ids: resultIds,
        reason,
      };

      const score = readOptionalNumberInput(overrideDraft.score, 'Score');
      const percentage = readOptionalNumberInput(overrideDraft.percentage, 'Percentage');
      if (typeof score === 'number') body.score = score;
      if (typeof percentage === 'number') body.percentage = percentage;
      const placementLabel = overrideDraft.placementLabel.trim();
      const cefrBand = overrideDraft.cefrBand.trim();
      if (placementLabel) body.placement_label = placementLabel;
      if (cefrBand) body.cefr_band = cefrBand;

      const response = await panelFetch('/api/panel/results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as ResultsActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Override işlemi başarısız.'));
      }

      setMessage(
        `Override tamamlandı. Requested: ${formatNumber(payload.requested)} • Updated: ${formatNumber(payload.updated)}`,
      );
      await refreshList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Override işlemi tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  const runPublish = async (resultIds: string[]) => {
    if (!canPublish) {
      setErrorMessage('PANEL_RESULTS_PUBLISH izni olmadan publish işlemi yapılamaz.');
      return;
    }
    if (resultIds.length === 0 || isActionRunning) return;

    setIsActionRunning(true);
    setMessage('');
    setErrorMessage('');

    try {
      const response = await panelFetch('/api/panel/results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'publish',
          result_ids: resultIds,
          enqueue_whatsapp: enqueueWhatsapp,
          force_republish: forceRepublish,
        }),
      });

      const payload = (await response.json()) as ResultsActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Publish işlemi başarısız.'));
      }

      setMessage(
        `Publish tamamlandı. Requested: ${formatNumber(payload.requested)} • Published: ${formatNumber(payload.published)} • SMS Enqueued: ${formatNumber(payload.sms_notifications_enqueued ?? payload.notifications_enqueued)} • WA Fallback: ${payload.whatsapp_fallback_enabled ? 'Açık' : 'Kapalı'}`,
      );
      await refreshList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Publish işlemi tamamlanamadı.');
    } finally {
      setIsActionRunning(false);
    }
  };

  const runFinalize = async (resultId: string) => {
    if (!canOverride) {
      setErrorMessage('PANEL_RESULTS_OVERRIDE izni olmadan finalize islemi yapilamaz.');
      return;
    }
    if (!detailPayload?.speaking_questions || detailResultId !== resultId || isActionRunning) return;

    setIsActionRunning(true);
    setMessage('');
    setErrorMessage('');
    setDetailError('');

    try {
      const rubric = detailPayload.speaking_questions.map((question) => {
        const rawValue = String(rubricDraft[question.question_id] || '').trim();
        const score = rawValue === '' ? 0 : Number.parseInt(rawValue, 10);
        if (!Number.isFinite(score)) {
          throw new Error(`${question.question_no}. soru rubric puani sayisal olmalidir.`);
        }
        if (score < 0 || score > Number(question.rubric_max_score || 0)) {
          throw new Error(
            `${question.question_no}. soru rubric puani 0 ile ${question.rubric_max_score} arasinda olmalidir.`,
          );
        }
        return {
          questionId: question.question_id,
          score,
        };
      });

      const response = await panelFetch('/api/panel/results/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          action: 'finalize',
          result_ids: [resultId],
          rubric,
        }),
      });

      const payload = (await response.json()) as ResultsActionResponse;
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Finalize islemi basarisiz.'));
      }

      setMessage(
        `Finalize tamamlandi. Finalized: ${formatNumber(payload.finalized ?? 0)} • Result: ${formatNumber(Number(payload.item?.result_score || 0))}`,
      );
      await refreshList();
      await loadScholarshipDetail(resultId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Finalize islemi tamamlanamadi.');
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <section className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5 shadow-[0_14px_38px_rgba(0,0,0,0.28)] lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/54">Sonuç Review</p>
          <h3 className="mt-2 text-[22px] font-semibold text-white">Results Review / Override / Publish</h3>
          <p className="mt-2 text-[13px] leading-[1.7] text-white/64">
            Sonuçları gözden geçirin, gerekli durumlarda override uygulayın; publish sonrası SMS teslimatını ve WhatsApp fallback politikasını panelden yönetin.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Toplam Sonuç</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.total_results ?? total)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Yayınlanan</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.published_results)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Görüntülenen</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.viewed_results)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Yayın Bekleyen</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.pending_publish)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Override Edilen</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.overridden_results)}</p>
        </div>
        <div className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[12px] text-white/50">Finalize Bekleyen</p>
          <p className="mt-1 text-[22px] font-semibold text-white">{formatNumber(summary.scholarship_pending_finalize)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Aday / veli / tel / başvuru no"
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <input
          value={draftFilters.campaignCode}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, campaignCode: event.target.value }))}
          placeholder="Campaign code"
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <input
          value={draftFilters.schoolQuery}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, schoolQuery: event.target.value }))}
          placeholder="Okul ara"
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        />
        <select
          value={draftFilters.grade}
          onChange={(event) => setDraftFilters((prev) => ({ ...prev, grade: event.target.value }))}
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Sınıf (tümü)</option>
          {GRADE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.resultStatus}
          onChange={(event) =>
            setDraftFilters((prev) => ({ ...prev, resultStatus: event.target.value as ResultFilters['resultStatus'] }))
          }
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Sonuç durum (tümü)</option>
          {RESULT_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.viewedStatus}
          onChange={(event) =>
            setDraftFilters((prev) => ({ ...prev, viewedStatus: event.target.value as ResultFilters['viewedStatus'] }))
          }
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Görüntüleme (tümü)</option>
          {VIEWED_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.publishStatus}
          onChange={(event) =>
            setDraftFilters((prev) => ({ ...prev, publishStatus: event.target.value as ResultFilters['publishStatus'] }))
          }
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Publish (tümü)</option>
          {PUBLISH_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={draftFilters.overrideStatus}
          onChange={(event) =>
            setDraftFilters((prev) => ({ ...prev, overrideStatus: event.target.value as ResultFilters['overrideStatus'] }))
          }
          className="h-[42px] rounded-xl border border-[#1A273A] bg-[#030B18] px-3 text-[13px] text-white/90 outline-none focus:border-[#2D4363]"
        >
          <option value="">Override (tümü)</option>
          {OVERRIDE_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[12px] text-white/66">
          <span>Yayın başlangıç</span>
          <input
            type="date"
            value={draftFilters.publishedFrom}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, publishedFrom: event.target.value }))}
            className="h-[36px] rounded-lg border border-[#1A273A] bg-[#030B18] px-2 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-white/66">
          <span>Yayın bitiş</span>
          <input
            type="date"
            value={draftFilters.publishedTo}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, publishedTo: event.target.value }))}
            className="h-[36px] rounded-lg border border-[#1A273A] bg-[#030B18] px-2 text-[12px] text-white/90 outline-none focus:border-[#2D4363]"
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

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/58">Override Formu</p>
          <textarea
            value={overrideDraft.reason}
            onChange={(event) => setOverrideDraft((prev) => ({ ...prev, reason: event.target.value }))}
            rows={2}
            placeholder="Override nedeni (zorunlu)"
            disabled={!canOverride}
            className="mt-2 w-full rounded-xl border border-[#1A273A] bg-[#030B18] px-3 py-2 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
          />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={overrideDraft.score}
              onChange={(event) => setOverrideDraft((prev) => ({ ...prev, score: event.target.value }))}
              placeholder="Score (0-100)"
              disabled={!canOverride}
              className="h-[38px] rounded-lg border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
            />
            <input
              value={overrideDraft.percentage}
              onChange={(event) => setOverrideDraft((prev) => ({ ...prev, percentage: event.target.value }))}
              placeholder="Percentage (0-100)"
              disabled={!canOverride}
              className="h-[38px] rounded-lg border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
            />
            <input
              value={overrideDraft.placementLabel}
              onChange={(event) => setOverrideDraft((prev) => ({ ...prev, placementLabel: event.target.value }))}
              placeholder="Placement label"
              disabled={!canOverride}
              className="h-[38px] rounded-lg border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
            />
            <input
              value={overrideDraft.cefrBand}
              onChange={(event) => setOverrideDraft((prev) => ({ ...prev, cefrBand: event.target.value }))}
              placeholder="CEFR band"
              disabled={!canOverride}
              className="h-[38px] rounded-lg border border-[#1A273A] bg-[#030B18] px-3 text-[12px] text-white/90 outline-none focus:border-[#2D4363] disabled:opacity-70"
            />
          </div>
          <p className="mt-2 text-[11px] text-white/58">
            Not: Override için en az bir alan ve neden girilmelidir.
          </p>
        </article>

        <article className="rounded-xl border border-[#1A273A] bg-[#071021]/92 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/58">Publish Ayarları</p>
          <div className="mt-2 flex flex-col gap-2 text-[12px] text-white/70">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enqueueWhatsapp}
                onChange={(event) => setEnqueueWhatsapp(event.target.checked)}
                disabled={!canPublish}
                className="h-3.5 w-3.5 accent-[#D92E27]"
              />
              <span>SMS başarısızsa WhatsApp fallback aktif</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={forceRepublish}
                onChange={(event) => setForceRepublish(event.target.checked)}
                disabled={!canPublish}
                className="h-3.5 w-3.5 accent-[#D92E27]"
              />
              <span>Daha önce yayınlanan sonuçları tekrar yayınla</span>
            </label>
          </div>
        </article>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isReadOnly ? (
          <p className="rounded-lg border border-[#274063] bg-[#0A192B]/80 px-3 py-2 text-[12px] text-[#9FC7FF]">
            READ_ONLY modu: Override ve publish aksiyonları kapalıdır.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void runOverride(selectedResultIds)}
          disabled={!canOverride || isActionRunning || selectedResultIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Toplu Override ({selectedResultIds.length})
        </button>
        <button
          type="button"
          onClick={() => void runPublish(selectedResultIds)}
          disabled={!canPublish || isActionRunning || selectedResultIds.length === 0}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Toplu Publish ({selectedResultIds.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedResultIds.length !== 1) {
              setErrorMessage('Rubric inceleme icin tek bir sonuc secin.');
              return;
            }
            void loadScholarshipDetail(selectedResultIds[0]);
          }}
          disabled={isActionRunning || selectedResultIds.length !== 1}
          className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
        >
          Rubric Incele
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-[#244B39] bg-[#0E261E] px-3 py-2 text-[12px] text-[#9FE4D0]">{message}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{errorMessage}</p>
      ) : null}
      {detailError ? (
        <p className="mt-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[12px] text-[#FFB8B1]">{detailError}</p>
      ) : null}

      {(isDetailLoading || detailPayload || detailError) ? (
        <section className="mt-4 rounded-xl border border-[#1A273A] bg-[#071021]/92 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/58">Scholarship Review</p>
              <h4 className="mt-1 text-[18px] font-semibold text-white">
                {detailPayload?.result?.student_full_name || 'Rubric detayi'}
              </h4>
              <p className="mt-1 text-[12px] text-white/58">
                {detailPayload?.scholarship?.content_grade || '-'} • {toScholarshipStatusLabel(detailPayload?.scholarship?.submission_status)}
              </p>
            </div>
            <div className="flex gap-2">
              {detailPayload?.result?.result_id ? (
                <button
                  type="button"
                  onClick={() => void runFinalize(detailPayload.result?.result_id || '')}
                  disabled={!canOverride || isActionRunning || isDetailLoading}
                  className="rounded-xl bg-[#D92E27] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-white transition hover:bg-[#bf251f] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Finalize Et
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setDetailResultId('');
                  setDetailPayload(null);
                  setRubricDraft({});
                  setDetailError('');
                }}
                className="rounded-xl border border-[#1A273A] bg-[#0A192B]/90 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-white/78 transition hover:border-[#2D4363]"
              >
                Kapat
              </button>
            </div>
          </div>

          {isDetailLoading ? (
            <p className="mt-4 text-[13px] text-white/65">Scholarship detaylari yukleniyor...</p>
          ) : null}

          {detailPayload ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <article className="rounded-xl border border-[#1A273A] bg-[#030B18] p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-white/56">Aday</p>
                  <div className="mt-2 space-y-1 text-[12px] text-white/78">
                    <p>Ogrenci: {detailPayload.result?.student_full_name || '-'}</p>
                    <p>Veli: {detailPayload.result?.parent_full_name || '-'}</p>
                    <p>Telefon: {detailPayload.result?.parent_phone_e164 || '-'}</p>
                    <p>Okul: {detailPayload.result?.school_name || '-'}</p>
                    <p>Sinif: {detailPayload.result?.grade ?? '-'}</p>
                  </div>
                </article>
                <article className="rounded-xl border border-[#1A273A] bg-[#030B18] p-3">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-white/56">Objective Ozet</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 text-[12px] text-white/78">
                    <p>Skor: {formatNumber(Number(detailPayload.scholarship?.objective_score || 0))}</p>
                    <p>Yuzde: {formatPercent(detailPayload.scholarship?.objective_percentage)}</p>
                    <p>Dogru: {formatNumber(Number(detailPayload.scholarship?.objective_correct_count || 0))}</p>
                    <p>Yanlis: {formatNumber(Number(detailPayload.scholarship?.objective_wrong_count || 0))}</p>
                    <p>Bos: {formatNumber(Number(detailPayload.scholarship?.objective_unanswered_count || 0))}</p>
                    <p>Speaking Upload: {formatNumber(Number(detailPayload.scholarship?.speaking_uploaded_count || 0))} / {formatNumber(Number(detailPayload.scholarship?.speaking_expected_count || 0))}</p>
                  </div>
                </article>
              </div>

              <div className="space-y-3">
                {(detailPayload.speaking_questions || []).map((question) => (
                  <article key={question.question_id} className="rounded-xl border border-[#1A273A] bg-[#030B18] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-white/56">
                          Speaking {question.question_no}
                        </p>
                        <p className="mt-2 text-[14px] font-semibold text-white">{question.prompt}</p>
                        <p className="mt-1 text-[12px] text-white/58">
                          Maks sure: {formatDurationSeconds(question.max_duration_seconds)} • Maks rubric: {question.rubric_max_score}
                        </p>
                      </div>
                      <div className="min-w-[140px]">
                        <label className="text-[11px] uppercase tracking-[0.1em] text-white/56">Rubric</label>
                        <select
                          value={rubricDraft[question.question_id] ?? String(question.rubric_score ?? 0)}
                          onChange={(event) =>
                            setRubricDraft((prev) => ({
                              ...prev,
                              [question.question_id]: event.target.value,
                            }))
                          }
                          disabled={!canOverride || isActionRunning}
                          className="mt-2 h-[40px] w-full rounded-lg border border-[#1A273A] bg-[#071021] px-3 text-[12px] text-white outline-none focus:border-[#2D4363]"
                        >
                          {Array.from({ length: Number(question.rubric_max_score || 0) + 1 }, (_, index) => (
                            <option key={`${question.question_id}-${index}`} value={String(index)}>
                              {index}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {question.visual_url ? (
                      <img
                        src={question.visual_url}
                        alt={`Speaking visual ${question.question_no}`}
                        className="mt-3 max-h-[220px] rounded-lg border border-[#1A273A] object-contain"
                      />
                    ) : null}

                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="space-y-1 text-[12px] text-white/70">
                        <p>Upload durum: {question.response?.status || 'Yanit yok'}</p>
                        <p>Sure: {formatDurationSeconds(question.response?.duration_seconds)}</p>
                        <p>MIME: {question.response?.mime_type || '-'}</p>
                      </div>
                      {question.response?.audio_url ? (
                        <audio
                          controls
                          src={panelApiHref(question.response.audio_url)}
                          className="w-full"
                        >
                          Tarayici ses oynatmayi desteklemiyor.
                        </audio>
                      ) : (
                        <div className="rounded-lg border border-dashed border-[#1A273A] px-3 py-3 text-[12px] text-white/52">
                          Bu prompt icin yuklenmis ses kaydi yok.
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isLoading ? <p className="mt-3 text-[13px] text-white/65">Sonuç kayıtları yükleniyor...</p> : null}

      {!isLoading ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[1860px] text-left text-[12px] text-white/80">
            <thead>
              <tr className="border-b border-white/12 text-white/56">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    disabled={isActionRunning || (!canOverride && !canPublish)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedResultIds((prev) =>
                          Array.from(new Set([...prev, ...items.map((item) => item.result_id)])),
                        );
                      } else {
                        const pageIds = new Set(items.map((item) => item.result_id));
                        setSelectedResultIds((prev) => prev.filter((id) => !pageIds.has(id)));
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2">Aday</th>
                <th className="px-2 py-2">Veli / Telefon</th>
                <th className="px-2 py-2">Başvuru</th>
                <th className="px-2 py-2">Kampanya</th>
                <th className="px-2 py-2">Okul</th>
                <th className="px-2 py-2">Sınıf</th>
                <th className="px-2 py-2">Durum</th>
                <th className="px-2 py-2">Scholarship</th>
                <th className="px-2 py-2">Publish</th>
                <th className="px-2 py-2">Viewed</th>
                <th className="px-2 py-2">Skor / Yüzde</th>
                <th className="px-2 py-2">Objective / Speaking</th>
                <th className="px-2 py-2">Placement / CEFR</th>
                <th className="px-2 py-2">Override</th>
                <th className="px-2 py-2">Güncelleme</th>
                <th className="px-2 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-2 py-6 text-center text-white/55">
                    Filtreye uygun sonuç kaydı bulunamadı.
                  </td>
                </tr>
              ) : null}

              {items.map((item) => (
                <tr key={item.result_id} className="border-b border-white/6 align-top">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedResultIds.includes(item.result_id)}
                      disabled={isActionRunning || (!canOverride && !canPublish)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedResultIds((prev) => Array.from(new Set([...prev, item.result_id])));
                        } else {
                          setSelectedResultIds((prev) => prev.filter((id) => id !== item.result_id));
                        }
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <p className="font-semibold text-white">{item.student_full_name || '-'}</p>
                    <p className="text-[11px] text-white/56">{item.result_id.slice(0, 8)}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.parent_full_name || '-'}</p>
                    <p className="text-[11px] text-white/56">{item.parent_phone_e164 || '-'}</p>
                  </td>
                  <td className="px-2 py-2">{item.application_no || '-'}</td>
                  <td className="px-2 py-2">{item.campaign_code || '-'}</td>
                  <td className="px-2 py-2">{item.school_name || '-'}</td>
                  <td className="px-2 py-2">{item.grade ? String(item.grade) : '-'}</td>
                  <td className="px-2 py-2">{toResultStatusLabel(item.result_status)}</td>
                  <td className="px-2 py-2">
                    <p>{toScholarshipStatusLabel(item.scholarship_submission_status)}</p>
                    <p className="text-[11px] text-white/56">
                      {formatNumber(Number(item.speaking_uploaded_count || 0))} / {formatNumber(Number(item.speaking_expected_count || 0))}
                    </p>
                  </td>
                  <td className="px-2 py-2">{toPublishState(item.published_at)}</td>
                  <td className="px-2 py-2">{toViewedState(item.viewed_at)}</td>
                  <td className="px-2 py-2">
                    {Number.isFinite(item.result_score) ? Number(item.result_score).toFixed(2) : '-'} /{' '}
                    {formatPercent(item.result_percentage)}
                  </td>
                  <td className="px-2 py-2">
                    <p>{Number.isFinite(item.objective_score) ? Number(item.objective_score).toFixed(2) : '-'}</p>
                    <p className="text-[11px] text-white/56">
                      {Number.isFinite(item.speaking_score) ? Number(item.speaking_score).toFixed(2) : '-'}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{item.placement_label || '-'}</p>
                    <p className="text-[11px] text-white/56">{item.cefr_band || '-'}</p>
                  </td>
                  <td className="px-2 py-2">
                    <p>{formatNumber(Number(item.override_count || 0))}</p>
                    <p className="text-[11px] text-white/56">{formatDate(item.last_override_at)}</p>
                    <p className="text-[11px] text-white/56">{item.last_override_reason || '-'}</p>
                  </td>
                  <td className="px-2 py-2">{formatDate(item.updated_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => void loadScholarshipDetail(item.result_id)}
                        disabled={isActionRunning}
                        className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Incele
                      </button>
                      <button
                        type="button"
                        onClick={() => void runOverride([item.result_id])}
                        disabled={!canOverride || isActionRunning}
                        className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Override
                      </button>
                      <button
                        type="button"
                        onClick={() => void runPublish([item.result_id])}
                        disabled={!canPublish || isActionRunning}
                        className="rounded-lg border border-[#1A273A] bg-[#0A192B]/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/78 transition hover:border-[#2D4363] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Publish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
