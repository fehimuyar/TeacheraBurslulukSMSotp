import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { getScholarshipResultStatus, resolveExamEndpoint, trackResultAppointmentIntent } from '../api/examApi';
import { trackEvent } from '../lib/analytics';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';
import BurslulukHybridResultOffers from './BurslulukHybridResultOffers';

interface ResultPayload {
  result?: {
    result_id?: string;
    attempt_id?: string;
    score?: number;
    percentage?: number;
    status?: string;
    placement_label?: string | null;
    cefr_band?: string | null;
    discount_rate?: number | null;
    class_rank?: number | null;
    correct_count?: number | null;
    wrong_count?: number | null;
    unanswered_count?: number | null;
    viewed_at?: string | null;
    published_at?: string | null;
    exam_language?: string;
    exam_age_range?: string;
  };
  error?: string;
  message?: string;
}

interface ScholarshipResultStatusPayload {
  status?: 'started' | 'evaluation_pending' | 'finalized' | 'timeout';
  finalScore?: number;
  error?: string;
  message?: string;
}

async function readJsonSafe<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Belirtilmedi';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatusLabel(value: string | null | undefined) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'Hazirlaniyor';
  if (normalized === 'VIEWED') return 'Goruntulendi';
  if (normalized === 'PUBLISHED') return 'Yayinlandi';
  if (normalized === 'READY') return 'Hazir';
  return normalized;
}

function formatLanguageLabel(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en') return 'Ingilizce';
  if (normalized === 'de') return 'Almanca';
  if (normalized === 'fr') return 'Fransizca';
  if (normalized === 'es') return 'Ispanyolca';
  if (normalized === 'it') return 'Italyanca';
  return normalized ? normalized.toUpperCase() : 'Belirtilmedi';
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 sm:mb-4 sm:gap-3">
      <span className="h-px w-10 bg-[#4A7067]/44 sm:w-12" />
      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.22em] text-[#68232E]/58 sm:text-[11px] sm:tracking-[0.24em]">
        {children}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = 'default',
}: {
  label: string;
  value: string;
  accent?: 'default' | 'green' | 'burgundy';
}) {
  const valueClassName =
    accent === 'green'
      ? 'text-[#2C5447]'
      : accent === 'burgundy'
        ? 'text-[#68232E]'
        : 'text-[#3E342D]';

  return (
    <div className="rounded-[24px] border border-[#E2D8CC] bg-[#FCFAF7] px-5 py-5 shadow-[0_18px_34px_rgba(25,20,15,0.04)]">
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]/82">
        {label}
      </p>
      <p className={`mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[34px] uppercase leading-none tracking-[0.02em] sm:text-[40px] ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-[#E2D8CC] bg-[#FCFAF7] p-5 sm:p-6">
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]">
        {title}
      </p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-[#E7DED2] bg-white/78 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em] text-[#7A7063]">
        {label}
      </span>
      <span className="text-[14px] leading-[1.65] text-[#3E342D] sm:text-right">{value}</span>
    </div>
  );
}

export default function BurslulukSonucPage() {
  const [searchParams] = useSearchParams();
  const session = readCandidateSession();
  const attemptId = useMemo(() => {
    const queryValue = String(searchParams.get('attemptId') || '').trim();
    if (queryValue) return queryValue;
    return session?.attemptId || '';
  }, [searchParams, session?.attemptId]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [resultStatus, setResultStatus] = useState<'started' | 'evaluation_pending' | 'finalized' | 'timeout' | ''>('');
  const [isIntentTracked, setIsIntentTracked] = useState(false);
  const [isResultTracked, setIsResultTracked] = useState(false);

  const appointmentHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('source', 'bursluluk_result_cta');
    if (attemptId) params.set('attemptId', attemptId);
    if (session?.candidateCode) params.set('candidateCode', session.candidateCode);
    const query = params.toString();
    return query ? `/iletisim?${query}` : '/iletisim';
  }, [attemptId, session?.candidateCode]);

  useEffect(() => {
    let timerId: number | null = null;
    let cancelled = false;

    const run = async () => {
      if (!attemptId || !session?.sessionToken) {
        setErrorMessage('Sonuc goruntulemek icin aday oturumu gerekir.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');
      try {
        const lifecycle = await getScholarshipResultStatus(session.sessionToken, attemptId);
        if (cancelled) return;
        setResultStatus(lifecycle.status || '');

        if (lifecycle.status !== 'finalized') {
          setPayload(null);
          timerId = window.setTimeout(() => {
            void run();
          }, 8000);
          return;
        }

        const response = await fetch(resolveExamEndpoint(`/api/exam/results/${encodeURIComponent(attemptId)}`), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-exam-session-token': session.sessionToken,
          },
        });

        const json = await readJsonSafe<ResultPayload>(response);
        if (!response.ok || !json?.result) {
          const reason = String(json?.message || json?.error || '').trim();
          if (response.status === 404) {
            setResultStatus('evaluation_pending');
            timerId = window.setTimeout(() => {
              void run();
            }, 8000);
          } else {
            setErrorMessage(reason || `Sonuc servisi hatasi (HTTP ${response.status}).`);
          }
          setPayload(json);
          return;
        }
        setPayload(json);
      } catch {
        if (!cancelled) {
          setErrorMessage('Ag hatasi nedeniyle sonuc alinamadi.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [attemptId, session?.sessionToken]);

  const result = payload?.result;

  useEffect(() => {
    if (!result || isResultTracked) return;
    const correctCount = Number(result.correct_count || 0);
    const wrongCount = Number(result.wrong_count || 0);
    const unansweredCount = Number(result.unanswered_count || 0);
    const answeredCount = Math.max(0, correctCount + wrongCount);
    const questionCount = Math.max(0, answeredCount + unansweredCount);

    trackEvent('placement_exam_complete', {
      completion_status: 'completed',
      answered_count: answeredCount,
      correct_count: correctCount,
      wrong_count: wrongCount,
      unanswered_count: unansweredCount,
      score: Number(result.score || 0),
      percentage: Number(result.percentage || 0),
      question_count: questionCount,
      exam_language: result.exam_language || session?.language || 'en',
      age_range: result.exam_age_range || session?.ageRange || '',
      duration_seconds: undefined,
    });
    setIsResultTracked(true);
  }, [isResultTracked, result, session?.ageRange, session?.language]);

  const handleAppointmentIntent = async () => {
    trackEvent('cta_click', {
      cta_id: 'bursluluk_result_randevu_al',
      cta_location: 'bursluluk_sonuc',
      cta_destination: appointmentHref,
      source: 'result_page_cta',
      cta_type: 'button',
    });

    if (isIntentTracked || !attemptId || !session?.sessionToken) return;

    try {
      await trackResultAppointmentIntent(session.sessionToken, {
        attemptId,
        source: 'result_page_cta',
        destinationUrl: appointmentHref,
      });
    } catch {
      // Intent telemetry should never block navigation.
    } finally {
      setIsIntentTracked(true);
    }
  };

  const placementLabel = result?.placement_label || result?.cefr_band || 'Hazirlaniyor';
  const candidateDisplayCode = session?.candidateCode || session?.applicationNo || '-';
  const candidateDisplayName = session?.studentFullName || 'Aday ogrenci';
  const schoolDisplay = session?.schoolName || 'Okul bilgisi bekleniyor';
  const classDisplay = session?.grade ? `${session.grade}. Sinif` : 'Sinif bilgisi bekleniyor';
  const isPending = !result && ['started', 'evaluation_pending', 'timeout', ''].includes(resultStatus || '');
  const pendingTitle = resultStatus === 'timeout' ? 'Sure doldu, degerlendirme suruyor' : 'Degerlendirme bekleniyor';
  const pendingCopy =
    resultStatus === 'timeout'
      ? 'Sinav oturumunuz sure limitine ulasti. Objective ve speaking kayitlari kontrol edildikten sonra sonucunuz yayinlandiginda bu ekran otomatik olarak guncellenecektir.'
      : 'Objective bolumler kaydedildi. Speaking degerlendirmesi ve panel son onayi tamamlandiginda sonucunuz burada gorunecektir.';

  if (!session) {
    return (
      <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
        <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
        <div className="relative mx-auto max-w-[860px] rounded-[30px] border border-[#DDD3C7] bg-white/88 p-6 shadow-[0_24px_64px_rgba(25,20,15,0.08)] sm:p-8">
          <SectionLabel>Sonuc Ekrani</SectionLabel>
          <h1 className="max-w-[12ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-[1.02] tracking-[0.018em] text-[#68232E] sm:text-[34px]">
            Aday oturumu bulunamadi
          </h1>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.8] text-[#5B4F45]">
            Sonuc ekranini acmak icin once bursluluk giris akisindan aday oturumu baslatilmis olmalidir.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/bursluluk/giris"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#E70000] px-7 py-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)]"
            >
              Girise Don
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (isPending) {
    return (
      <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
        <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />

        <div className="relative mx-auto max-w-[960px] rounded-[30px] border border-[#DDD3C7] bg-white/88 p-6 shadow-[0_24px_64px_rgba(25,20,15,0.08)] sm:p-8">
          <SectionLabel>Sonuc Ekrani</SectionLabel>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_320px]">
            <div className="rounded-[28px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[30px] uppercase leading-[1.02] tracking-[0.02em] text-[#68232E] sm:text-[36px]">
                    {pendingTitle}
                  </h1>
                  <p className="mt-4 max-w-[58ch] text-[15px] leading-[1.82] text-[#5B4F45] sm:text-[16px] sm:leading-[1.88]">
                    {pendingCopy}
                  </p>
                </div>
                <div className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#4A7067]">
                  {isLoading ? 'Kontrol Ediliyor' : 'Beklemede'}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Aday Kodu" value={candidateDisplayCode} accent="burgundy" />
                <MetricCard label="Sinif" value={session?.grade ? `${session.grade}` : '-'} />
                <MetricCard label="Durum" value={resultStatus === 'timeout' ? 'TIMEOUT' : 'PENDING'} accent="green" />
              </div>

              {errorMessage ? (
                <p className="mt-6 rounded-[22px] border border-[#E5B8B1] bg-[#FFF3F1] px-4 py-4 text-[14px] leading-[1.72] text-[#8E3530]">
                  {errorMessage}
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <DetailCard title="Aday Ozeti">
                <DetailRow label="Ogrenci" value={candidateDisplayName} />
                <DetailRow label="Okul" value={schoolDisplay} />
                <DetailRow label="Sinif" value={classDisplay} />
              </DetailCard>

              <DetailCard title="Sonraki Adim">
                <DetailRow label="Kontrol" value={isLoading ? 'Sunucu sonucu kontrol ediyor' : 'Sonuc yayinini bekliyor'} />
                <DetailRow label="Durum" value={resultStatus === 'timeout' ? 'Sure asimi sonrasi inceleme' : 'Panel onayi bekleniyor'} />
              </DetailCard>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/bursluluk/giris"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-[#D8CDC0] bg-white/76 px-6 py-3 text-[12px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#5B4F45] transition hover:bg-white"
            >
              Girise Don
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[12%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-[1080px] rounded-[30px] border border-[#DDD3C7] bg-white/88 p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="rounded-[28px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-5 sm:p-6 lg:p-7">
            <SectionLabel>Sonuc Ekrani</SectionLabel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[30px] uppercase leading-[1.02] tracking-[0.02em] text-[#68232E] sm:text-[36px] lg:text-[40px]">
                  Bursluluk Sonucunuz
                </h1>
                <p className="mt-4 max-w-[58ch] text-[15px] leading-[1.82] text-[#5B4F45] sm:text-[16px] sm:leading-[1.88]">
                  Sinav performansiniz, burs orani ve yerlesim bandiniz bu ekranda tek bir ozet halinde sunulur. Danisman gorusmesine gecmeden once tum sonuclari ayni sayfada inceleyebilirsiniz.
                </p>
              </div>
              <div className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#4A7067]">
                {formatStatusLabel(result?.status)}
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Skor" value={String(Number(result?.score || 0))} accent="burgundy" />
              <MetricCard label="Yuzde" value={`%${Number(result?.percentage || 0)}`} />
              <MetricCard label="Burs Orani" value={`%${Number(result?.discount_rate || 0)}`} accent="green" />
              <MetricCard label="Sinif Sirasi" value={String(result?.class_rank || '-')} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Dogru" value={String(Number(result?.correct_count || 0))} />
              <MetricCard label="Yanlis" value={String(Number(result?.wrong_count || 0))} />
              <MetricCard label="Bos" value={String(Number(result?.unanswered_count || 0))} />
            </div>

            <div className="mt-6 rounded-[24px] border border-[#E2D8CC] bg-[#FFFCF8] px-5 py-5 shadow-[0_18px_34px_rgba(25,20,15,0.04)]">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]">
                Yerlesim Bandi
              </p>
              <p className="mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-[1.02] tracking-[0.02em] text-[#68232E] sm:text-[32px]">
                {placementLabel}
              </p>
              <p className="mt-2 text-[14px] leading-[1.72] text-[#5B4F45]">
                Sonuc durumunuz {formatStatusLabel(result?.status).toLowerCase()} olarak isaretlendi. Danisman gorusmesi icin uygun adima bu sayfadan devam edebilirsiniz.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <DetailCard title="Aday Ozeti">
              <DetailRow label="Aday Kodu" value={candidateDisplayCode} />
              <DetailRow label="Ogrenci" value={candidateDisplayName} />
              <DetailRow label="Okul" value={schoolDisplay} />
              <DetailRow label="Sinif" value={classDisplay} />
            </DetailCard>

            <DetailCard title="Sinav Bilgisi">
              <DetailRow label="Sinav Dili" value={formatLanguageLabel(result?.exam_language || session.language)} />
              <DetailRow label="Yas / Grup" value={String(result?.exam_age_range || session.ageRange || 'Belirtilmedi')} />
              <DetailRow label="Yayinlanma" value={formatDateTime(result?.published_at)} />
              <DetailRow label="Goruntulenme" value={formatDateTime(result?.viewed_at)} />
            </DetailCard>

            <div className="rounded-[28px] border border-[#D8DED7] bg-[linear-gradient(180deg,#F6FAF7_0%,#EDF4EF_100%)] p-5 shadow-[0_20px_42px_rgba(44,84,71,0.08)] sm:p-6">
              <SectionLabel>Sonraki Adim</SectionLabel>
              <h2 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] uppercase leading-[1.06] tracking-[0.02em] text-[#2C5447]">
                Danisman Gorusmesi
              </h2>
              <p className="mt-3 text-[14px] leading-[1.76] text-[#4C5D56]">
                Uygun burs ve program seceneklerini netlestirmek icin egitim danismanimizla gorusme planlayabilirsiniz.
              </p>

              {result && result.status === 'VIEWED' ? (
                <Link
                  to="/bursluluk/randevu"
                  onClick={() => {
                    void handleAppointmentIntent();
                  }}
                  className="mt-5 inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#2C5447] px-7 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(44,84,71,0.18)] transition hover:bg-[#23463B] hover:shadow-[0_20px_36px_rgba(44,84,71,0.22)]"
                >
                  Randevu Al
                </Link>
              ) : (
                <div className="mt-5 rounded-[20px] border border-[#D8DED7] bg-white/75 px-4 py-4 text-[13px] leading-[1.7] text-[#5B6D65]">
                  Sonucunuz tam olarak goruntulendiginde randevu adimi burada aktif olur.
                </div>
              )}

              <p className="mt-3 text-[12px] text-[#5B6D65]/86">
                Kayit, program ve odeme akisina gecmeden once en uygun rota size birebir aktarilir.
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-6 rounded-[22px] border border-[#E2D8CC] bg-[#FCFAF7] px-4 py-4 text-[14px] leading-[1.72] text-[#5B4F45]">
            Sonuc yukleniyor...
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-6 rounded-[22px] border border-[#E5B8B1] bg-[#FFF3F1] px-4 py-4 text-[14px] leading-[1.72] text-[#8E3530]">
            {errorMessage}
          </p>
        ) : null}

        {result ? <BurslulukHybridResultOffers /> : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/bursluluk/giris"
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-[#D8CDC0] bg-white/76 px-6 py-3 text-[12px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#5B4F45] transition hover:bg-white"
          >
            Girise Don
          </Link>
        </div>
      </div>
    </section>
  );
}
