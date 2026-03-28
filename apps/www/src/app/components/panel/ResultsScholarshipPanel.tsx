import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { panelFetch } from '../../api/panelApi';
import { canOperatePanelActions, isReadOnlyPanelRole } from './panelPermissions';
import ResultEditModal from './ResultEditModal';
import { formatDateTime, formatNumber, readJsonSafe } from './panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
} from './panelUi';

type ResultRow = {
  attempt_id: string;
  result_id?: string | null;
  candidate_id?: string | null;
  student_full_name?: string | null;
  grade?: number | null;
  school_name?: string | null;
  objective_score_80?: number | null;
  speaking_score_20?: number | null;
  speaking_status?: string | null;
  final_score_100?: number | null;
  ranking_group?: string | null;
  ranking_position?: number | null;
  ranking_total?: number | null;
  placement_label?: string | null;
  review_note?: string | null;
  result_status?: string | null;
  published_at?: string | null;
  result_viewed_at?: string | null;
  submitted_at?: string | null;
  speaking_uploaded_count?: number | null;
};

type SpeakingItem = {
  response_id: string;
  question_id?: string | null;
  storage_key?: string | null;
  mime_type?: string | null;
  byte_size?: number | null;
  duration_seconds?: number | null;
  upload_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ResultDetail = ResultRow & {
  uploaded_count?: number | null;
  total_count?: number | null;
  speaking_items?: SpeakingItem[];
};

type ResultsListResponse = {
  items?: ResultRow[];
  summary?: {
    total?: number;
    published?: number;
    speaking_pending?: number;
    final_scored?: number;
  };
  pagination?: {
    page?: number;
    per_page?: number;
    total?: number;
  };
  message?: string;
  error?: string;
};

type ResultDetailResponse = {
  item?: ResultDetail;
  message?: string;
  error?: string;
};

type ResultActionResponse = {
  item?: ResultDetail;
  processed?: number;
  published?: number;
  unpublished?: number;
  skipped?: number;
  attempt_ids?: string[];
  message?: string;
  error?: string;
};

function normalizeMessage(payload: { message?: string; error?: string } | null | undefined, fallback: string) {
  const direct = String(payload?.message || payload?.error || '').trim();
  return direct || fallback;
}

function statusBadgeClassName(kind: 'pending' | 'ready' | 'published' | 'neutral') {
  if (kind === 'pending') return 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]';
  if (kind === 'ready') return 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]';
  if (kind === 'published') return 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]';
  return 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]';
}

function speakingStatusLabel(value: string | null | undefined) {
  const normalized = String(value || 'PENDING').trim().toUpperCase();
  if (normalized === 'SCORED') return 'SKORLANDI';
  if (normalized === 'UPLOADED') return 'YÜKLENDİ';
  return 'BEKLENİYOR';
}

function resultStatusLabel(value: string | null | undefined) {
  const normalized = String(value || 'NOT_READY').trim().toUpperCase();
  if (normalized === 'VIEWED') return 'GÖRÜLDÜ';
  if (normalized === 'PUBLISHED') return 'YAYINDA';
  return 'BEKLEMEDE';
}

function buildResultsPath(filters: {
  q: string;
  grade: string;
  resultStatus: string;
  speakingStatus: string;
  page: number;
  perPage: number;
}) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.grade.trim()) params.set('grade', filters.grade.trim());
  if (filters.resultStatus.trim()) params.set('result_status', filters.resultStatus.trim());
  if (filters.speakingStatus.trim()) params.set('speaking_status', filters.speakingStatus.trim());
  params.set('page', String(filters.page));
  params.set('per_page', String(filters.perPage));
  return `/api/panel/results?${params.toString()}`;
}

function parseNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatScore(value: unknown, digits = 2) {
  const numeric = parseNumber(value);
  if (numeric === null) return '-';
  return numeric.toFixed(digits);
}

function formatDurationSeconds(value: unknown) {
  const numeric = parseNumber(value);
  if (numeric === null) return '-';
  const totalSeconds = Math.max(0, Math.round(numeric));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value: unknown) {
  const numeric = parseNumber(value);
  if (numeric === null) return '-';
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ResultsScholarshipPanel({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [items, setItems] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    published: 0,
    speaking_pending: 0,
    final_scored: 0,
  });
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [resultStatusFilter, setResultStatusFilter] = useState('');
  const [speakingStatusFilter, setSpeakingStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<ResultRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<ResultDetail | null>(null);
  const [detailAttemptId, setDetailAttemptId] = useState('');
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [publishConfirm, setPublishConfirm] = useState<'publish' | 'unpublish' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');

  const allSelectedOnPage = items.length > 0 && items.every((item) => selectedIds.has(item.attempt_id));
  const totalPages = Math.max(1, Math.ceil(Math.max(total, 1) / perPage));

  const selectedCount = selectedIds.size;
  const selectedRows = useMemo(
    () => items.filter((item) => selectedIds.has(item.attempt_id)),
    [items, selectedIds],
  );

  const loadResults = async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await panelFetch(buildResultsPath({
        q: query,
        grade: gradeFilter,
        resultStatus: resultStatusFilter,
        speakingStatus: speakingStatusFilter,
        page,
        perPage,
      }), {
        method: 'GET',
        signal,
      });
      const payload = await readJsonSafe<ResultsListResponse>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Sonuç listesi alınamadı.'));
      }

      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      setItems(nextItems);
      setSummary({
        total: Number(payload?.summary?.total || 0),
        published: Number(payload?.summary?.published || 0),
        speaking_pending: Number(payload?.summary?.speaking_pending || 0),
        final_scored: Number(payload?.summary?.final_scored || 0),
      });
      setTotal(Number(payload?.pagination?.total || 0));
      setSelectedIds((previous) => {
        const next = new Set<string>();
        for (const item of nextItems) {
          if (previous.has(item.attempt_id)) next.add(item.attempt_id);
        }
        return next;
      });
    } catch (error) {
      if (signal?.aborted) return;
      setItems([]);
      setSummary({ total: 0, published: 0, speaking_pending: 0, final_scored: 0 });
      setTotal(0);
      setSelectedIds(new Set());
      setErrorMessage(error instanceof Error ? error.message : 'Sonuç listesi alınamadı.');
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadResults(controller.signal);
    return () => controller.abort();
  }, [query, gradeFilter, resultStatusFilter, speakingStatusFilter, page, perPage]);

  const loadDetail = async (attemptId: string) => {
    setIsDetailLoading(true);
    setDetailError('');
    setDetailAttemptId(attemptId);
    try {
      const response = await panelFetch(`/api/panel/results/${encodeURIComponent(attemptId)}`, {
        method: 'GET',
      });
      const payload = await readJsonSafe<ResultDetailResponse>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Sonuç detayı alınamadı.'));
      }
      setDetailTarget(payload?.item || null);
    } catch (error) {
      setDetailTarget(null);
      setDetailError(error instanceof Error ? error.message : 'Sonuç detayı alınamadı.');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const refreshDetailIfOpen = async (attemptId: string) => {
    if (detailAttemptId && detailAttemptId === attemptId) {
      await loadDetail(attemptId);
    }
  };

  const toggleOne = (attemptId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allSelectedOnPage) {
        for (const item of items) next.delete(item.attempt_id);
      } else {
        for (const item of items) next.add(item.attempt_id);
      }
      return next;
    });
  };

  const handleSaveSpeakingScore = async (attemptId: string, updates: { speakingScore20: number; reviewNote: string }) => {
    if (!canOperate || isMutating) return;
    setIsMutating(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch('/api/panel/results/speaking-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          attemptId,
          speakingScore20: updates.speakingScore20,
          reviewNote: updates.reviewNote,
        }),
      });
      const payload = await readJsonSafe<ResultActionResponse>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Speaking puanı kaydedilemedi.'));
      }
      setMessage('Speaking puanı kaydedildi. Toplam puan, sıralama ve burs etiketi güncellendi.');
      setEditTarget(null);
      await loadResults();
      await refreshDetailIfOpen(attemptId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Speaking puanı kaydedilemedi.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleImportCsv = async () => {
    if (!canOperate || isMutating) return;
    if (!importCsvText.trim()) {
      setErrorMessage('CSV içeriği gerekli.');
      return;
    }
    setIsMutating(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch('/api/panel/results/speaking-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          csvText: importCsvText,
        }),
      });
      const payload = await readJsonSafe<ResultActionResponse>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'CSV import başarısız.'));
      }
      setImportOpen(false);
      setImportCsvText('');
      setMessage(`${formatNumber(payload?.processed)} aday için speaking puanı içe aktarıldı.`);
      await loadResults();
      if (detailAttemptId) await loadDetail(detailAttemptId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'CSV import başarısız.');
    } finally {
      setIsMutating(false);
    }
  };

  const handlePublishMutation = async (mode: 'publish' | 'unpublish') => {
    if (!canOperate || isMutating || selectedCount === 0) return;
    const endpoint = mode === 'publish' ? '/api/panel/results/publish' : '/api/panel/results/unpublish';
    setIsMutating(true);
    setErrorMessage('');
    setMessage('');
    try {
      const response = await panelFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          attemptIds: [...selectedIds],
        }),
      });
      const payload = await readJsonSafe<ResultActionResponse>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, mode === 'publish' ? 'Publish başarısız.' : 'Unpublish başarısız.'));
      }

      if (mode === 'publish') {
        setMessage(
          `${formatNumber(payload?.published)} sonuç yayınlandı${payload?.skipped ? `, ${formatNumber(payload.skipped)} kayıt final puan beklediği için atlandı` : ''}.`,
        );
      } else {
        setMessage(`${formatNumber(payload?.unpublished)} sonuç yayından kaldırıldı.`);
      }
      setSelectedIds(new Set());
      setPublishConfirm(null);
      await loadResults();
      if (detailAttemptId) await loadDetail(detailAttemptId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleOpenSpeakingRecording = async (attemptId: string, responseId: string) => {
    setDetailError('');
    try {
      const response = await panelFetch(
        `/api/panel/results/speaking-download?attemptId=${encodeURIComponent(attemptId)}&responseId=${encodeURIComponent(responseId)}`,
        { method: 'GET' },
      );
      const payload = await readJsonSafe<{ url?: string; message?: string; error?: string }>(response);
      if (!response.ok || !payload?.url) {
        throw new Error(normalizeMessage(payload, 'Speaking kaydı açılamadı.'));
      }
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Speaking kaydı açılamadı.');
    }
  };

  const handleCsvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportCsvText(text);
      setErrorMessage('');
    } catch {
      setErrorMessage('CSV dosyası okunamadı.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {readOnly ? <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p> : null}
      {message ? <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Yönetim</p>
            <h2 className={panelLargeTitleClassName}>Sonuç & Burs</h2>
            <p className={panelDescriptionClassName}>
              Objective skorları anında görünür. Speaking puanı sonradan girildiğinde toplam puan, sınıf sırası ve burs etiketi otomatik hesaplanır.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPage(1);
                void loadResults();
              }}
              className={panelSecondaryButtonClassName}
              disabled={isLoading}
            >
              Yenile
            </button>
            {canOperate ? (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className={panelSecondaryButtonClassName}
                disabled={isMutating}
              >
                CSV Import
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Sonuç</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(summary.total)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Yayında</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(summary.published)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Speaking Bekleyen</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#795A26]">{formatNumber(summary.speaking_pending)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Final Puan Hazır</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#4A4A6A]">{formatNumber(summary.final_scored)}</p>
        </div>
      </div>

      <section className={panelSurfaceClassName}>
        <details className="rounded-[14px] border border-[#E4DBCF] bg-[#FBF7F0]" open>
          <summary className="cursor-pointer px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">
            Filtreler
          </summary>
          <div className="grid gap-2 px-3 pb-3 md:grid-cols-5">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Ad veya okul ara..."
              className={panelCompactInputClassName}
            />
            <select
              value={gradeFilter}
              onChange={(event) => {
                setGradeFilter(event.target.value);
                setPage(1);
              }}
              className={panelCompactInputClassName}
            >
              <option value="">Tüm sınıflar</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => (
                <option key={grade} value={String(grade)}>
                  {grade}. Sınıf
                </option>
              ))}
            </select>
            <select
              value={resultStatusFilter}
              onChange={(event) => {
                setResultStatusFilter(event.target.value);
                setPage(1);
              }}
              className={panelCompactInputClassName}
            >
              <option value="">Tüm sonuç durumları</option>
              <option value="NOT_READY">Beklemede</option>
              <option value="PUBLISHED">Yayında</option>
              <option value="VIEWED">Görüldü</option>
            </select>
            <select
              value={speakingStatusFilter}
              onChange={(event) => {
                setSpeakingStatusFilter(event.target.value);
                setPage(1);
              }}
              className={panelCompactInputClassName}
            >
              <option value="">Tüm speaking durumları</option>
              <option value="PENDING">Bekleniyor</option>
              <option value="SCORED">Skorlandı</option>
            </select>
            <select
              value={String(perPage)}
              onChange={(event) => {
                setPerPage(Number(event.target.value) || 50);
                setPage(1);
              }}
              className={panelCompactInputClassName}
            >
              {[25, 50, 100, 200].map((value) => (
                <option key={value} value={String(value)}>
                  {value} / sayfa
                </option>
              ))}
            </select>
          </div>
        </details>

        {canOperate ? (
          <section className={`${panelSoftCardClassName} mt-3 border-[#C8CAD8]`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.14em] text-[#4A4A6A]">Operasyon İşlemleri</p>
                <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">
                  Seçili kayıtlar için publish veya unpublish yapabilirsiniz. Speaking skoru olmayan kayıtlar publish sırasında atlanır.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const first = selectedRows[0] || null;
                    if (!first) {
                      setErrorMessage('Speaking puanı girmek için bir aday seçin.');
                      return;
                    }
                    setEditTarget(first);
                    setErrorMessage('');
                  }}
                  disabled={selectedCount === 0 || isMutating}
                  className={panelSecondaryButtonClassName}
                >
                  Speaking Puanı Gir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCount === 0) {
                      setErrorMessage('Yayınlamak için en az bir kayıt seçin.');
                      return;
                    }
                    setPublishConfirm('publish');
                    setErrorMessage('');
                  }}
                  disabled={selectedCount === 0 || isMutating}
                  className={panelPrimaryButtonClassName}
                >
                  Yayınla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCount === 0) {
                      setErrorMessage('Yayından kaldırmak için en az bir kayıt seçin.');
                      return;
                    }
                    setPublishConfirm('unpublish');
                    setErrorMessage('');
                  }}
                  disabled={selectedCount === 0 || isMutating}
                  className={panelSecondaryButtonClassName}
                >
                  Yayından Kaldır
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {isLoading ? <PanelLoadingMessage>Sonuç listesi yükleniyor...</PanelLoadingMessage> : null}

        <div className={panelTableContainerClassName}>
          <table className="min-w-[1180px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                {canOperate ? (
                  <th className="w-[36px] px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-[#DDD4C6]"
                    />
                  </th>
                ) : null}
                <th className="px-3 py-2">Öğrenci</th>
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Okul</th>
                <th className="px-3 py-2 text-right">Objective / 80</th>
                <th className="px-3 py-2 text-right">Speaking / 20</th>
                <th className="px-3 py-2 text-right">Final / 100</th>
                <th className="px-3 py-2">Burs</th>
                <th className="px-3 py-2">Sıra</th>
                <th className="px-3 py-2">Speaking</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Submit</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={canOperate ? 13 : 12}>
                    <PanelEmptyState />
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const speakingLabel = speakingStatusLabel(item.speaking_status);
                  const resultLabel = resultStatusLabel(item.result_status);
                  const canPublish = parseNumber(item.final_score_100) !== null;
                  return (
                    <tr key={item.attempt_id} className="border-b border-[#F0E7DA]">
                      {canOperate ? (
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.attempt_id)}
                            onChange={() => toggleOne(item.attempt_id)}
                            className="h-3.5 w-3.5 rounded border-[#DDD4C6]"
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.student_full_name || '-'}</p>
                        <p className="text-[11px] text-[#7A7063]">{item.candidate_id || item.attempt_id}</p>
                      </td>
                      <td className="px-3 py-2">{item.grade ? `${item.grade}. Sınıf` : '-'}</td>
                      <td className="px-3 py-2">{item.school_name || '-'}</td>
                      <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">
                        {formatScore(item.objective_score_80)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {parseNumber(item.speaking_score_20) === null ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${statusBadgeClassName('pending')}`}>
                            Bekleniyor
                          </span>
                        ) : (
                          <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{formatScore(item.speaking_score_20)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">
                        {formatScore(item.final_score_100)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${item.placement_label ? statusBadgeClassName('ready') : statusBadgeClassName('neutral')}`}>
                          {item.placement_label || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {item.ranking_position && item.ranking_total
                          ? `${item.ranking_position} / ${item.ranking_total}`
                          : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${speakingLabel === 'SKORLANDI' ? statusBadgeClassName('ready') : statusBadgeClassName('pending')}`}>
                            {speakingLabel}
                          </span>
                          <span className="text-[11px] text-[#7A7063]">{formatNumber(Number(item.speaking_uploaded_count || 0))} kayıt</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
                          resultLabel === 'YAYINDA'
                            ? statusBadgeClassName('published')
                            : resultLabel === 'GÖRÜLDÜ'
                              ? statusBadgeClassName('ready')
                              : statusBadgeClassName('pending')
                        }`}>
                          {resultLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">{formatDateTime(item.submitted_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void loadDetail(item.attempt_id)}
                            className={panelSmallButtonClassName}
                          >
                            Kayıtlar
                          </button>
                          {canOperate ? (
                            <button
                              type="button"
                              onClick={() => setEditTarget(item)}
                              className={panelSmallButtonClassName}
                            >
                              Puan Gir
                            </button>
                          ) : null}
                          {canOperate && canPublish ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIds(new Set([item.attempt_id]));
                                setPublishConfirm('publish');
                              }}
                              className={panelSmallButtonClassName}
                            >
                              Yayınla
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#6F675D]">
            Toplam {formatNumber(total)} kayıt • Sayfa {formatNumber(page)} / {formatNumber(totalPages)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className={panelSecondaryButtonClassName}
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className={panelSecondaryButtonClassName}
            >
              Sonraki
            </button>
          </div>
        </div>
      </section>

      <ResultEditModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        result={editTarget}
        onSave={(attemptId, updates) => {
          void handleSaveSpeakingScore(attemptId, updates);
        }}
      />

      <PanelModal
        open={importOpen}
        onClose={() => {
          if (isMutating) return;
          setImportOpen(false);
        }}
        title="Speaking CSV Import"
        maxWidth="760px"
      >
        <div className="space-y-4">
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>CSV Şablonu</p>
            <p className={`mt-1 ${panelDescriptionClassName}`}>
              Sütunlar: <code>attempt_id</code>, <code>speaking_score_20</code>, opsiyonel <code>review_note</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className={panelSecondaryButtonClassName}>
                CSV Dosyası Seç
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleCsvFileChange(event)} />
              </label>
              <button
                type="button"
                onClick={() => setImportCsvText('attempt_id,speaking_score_20,review_note\n')}
                className={panelSecondaryButtonClassName}
              >
                Şablon Yerleştir
              </button>
            </div>
          </div>

          <textarea
            rows={14}
            value={importCsvText}
            onChange={(event) => setImportCsvText(event.target.value)}
            placeholder="attempt_id,speaking_score_20,review_note"
            className="w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-3 font-mono text-[12px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setImportOpen(false)} className={panelSecondaryButtonClassName} disabled={isMutating}>
              Vazgeç
            </button>
            <button type="button" onClick={() => void handleImportCsv()} className={panelPrimaryButtonClassName} disabled={isMutating}>
              Import Et
            </button>
          </div>
        </div>
      </PanelModal>

      <PanelModal
        open={Boolean(detailAttemptId)}
        onClose={() => {
          setDetailAttemptId('');
          setDetailTarget(null);
          setDetailError('');
        }}
        title="Speaking Kayıtları"
        maxWidth="900px"
      >
        <div className="space-y-4">
          {isDetailLoading ? <PanelLoadingMessage>Detay yükleniyor...</PanelLoadingMessage> : null}
          {detailError ? <PanelFeedbackMessage tone="error">{detailError}</PanelFeedbackMessage> : null}

          {detailTarget ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Öğrenci</p>
                  <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[15px] text-[#1B2B24]">{detailTarget.student_full_name || '-'}</p>
                  <p className="text-[12px] text-[#6F675D]">{detailTarget.grade ? `${detailTarget.grade}. Sınıf` : '-'}</p>
                </div>
                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Objective / 80</p>
                  <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatScore(detailTarget.objective_score_80)}</p>
                </div>
                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Speaking / 20</p>
                  <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">
                    {parseNumber(detailTarget.speaking_score_20) === null ? 'Bekleniyor' : formatScore(detailTarget.speaking_score_20)}
                  </p>
                </div>
                <div className={panelSoftCardClassName}>
                  <p className={panelEyebrowClassName}>Final / 100</p>
                  <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatScore(detailTarget.final_score_100)}</p>
                </div>
              </div>

              <div className={panelTableContainerClassName}>
                <table className="min-w-[760px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
                  <thead>
                    <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2">Süre</th>
                      <th className="px-3 py-2">Boyut</th>
                      <th className="px-3 py-2">Yüklendi</th>
                      <th className="px-3 py-2">Storage Key</th>
                      <th className="px-3 py-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailTarget.speaking_items || []).length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <PanelEmptyState message="Henüz speaking kaydı bulunmuyor." />
                        </td>
                      </tr>
                    ) : (
                      (detailTarget.speaking_items || []).map((item) => (
                        <tr key={item.response_id} className="border-b border-[#F0E7DA]">
                          <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.question_id || '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
                              String(item.upload_status || '').toUpperCase() === 'UPLOADED'
                                ? statusBadgeClassName('ready')
                                : statusBadgeClassName('pending')
                            }`}>
                              {String(item.upload_status || 'UNKNOWN').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2">{formatDurationSeconds(item.duration_seconds)}</td>
                          <td className="px-3 py-2">{formatBytes(item.byte_size)}</td>
                          <td className="px-3 py-2">{formatDateTime(item.updated_at || item.created_at)}</td>
                          <td className="max-w-[280px] truncate px-3 py-2 text-[11px] text-[#6F675D]" title={item.storage_key || ''}>
                            {item.storage_key || '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void handleOpenSpeakingRecording(detailTarget.attempt_id, item.response_id)}
                              disabled={String(item.upload_status || '').toUpperCase() !== 'UPLOADED'}
                              className={panelSmallButtonClassName}
                            >
                              Kaydı Aç
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {canOperate ? (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditTarget(detailTarget);
                      setDetailAttemptId('');
                    }}
                    className={panelSecondaryButtonClassName}
                  >
                    Speaking Puanı Gir
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PanelModal>

      <PanelConfirmDialog
        open={publishConfirm !== null}
        onCancel={() => setPublishConfirm(null)}
        onConfirm={() => {
          if (!publishConfirm) return;
          void handlePublishMutation(publishConfirm);
        }}
        title={publishConfirm === 'publish' ? 'Sonuçları Yayınla' : 'Sonuçları Yayından Kaldır'}
        description={
          publishConfirm === 'publish'
            ? `${formatNumber(selectedCount)} adayın sonucu yayınlanacak. Final puanı hazır olmayan kayıtlar atlanır.`
            : `${formatNumber(selectedCount)} adayın sonucu yayından kaldırılacak.`
        }
        confirmLabel={publishConfirm === 'publish' ? 'Yayınla' : 'Kaldır'}
        danger={publishConfirm === 'unpublish'}
      />
    </div>
  );
}
