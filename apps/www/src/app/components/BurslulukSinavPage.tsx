import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { getExamSessionStatus, resolveExamApiBase } from '../api/examApi';
import { createHttpExamAdapter, type ExamAttemptState, type ExamContentPublic } from './bursluluk-exam';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';
import { BurslulukExamShell } from './bursluluk-shell/BurslulukExamShell';
import './bursluluk-exam/styles.css';

const DEFAULT_DURATION_SECONDS = 3600;

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="h-px w-10 bg-[#4A7067]/40" />
      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.2em] text-[#68232E]/56">
        {children}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-[#E2D8CC] bg-[#FCFAF7] px-4 py-4 sm:px-5 sm:py-5">
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#4A7067]">
        {label}
      </p>
      <p className="mt-2.5 text-[15px] leading-[1.58] text-[#3E342D] sm:text-[16px]">{value}</p>
    </div>
  );
}

function ExamStateScreen({
  sectionLabel,
  title,
  description,
  session,
  primaryAction,
  secondaryAction,
}: {
  sectionLabel: string;
  title: string;
  description: string;
  session?: ReturnType<typeof readCandidateSession>;
  primaryAction?: { label: string; to: string };
  secondaryAction?: { label: string; to: string };
}) {
  const sessionLabel = session?.selectedSessionLabel || 'Belirlenecek';

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[14%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-[1180px] rounded-[30px] border border-[#DDD3C7] bg-white/84 p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.06fr)_minmax(340px,0.94fr)]">
          <div className="rounded-[30px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-5 shadow-[0_20px_48px_rgba(25,20,15,0.05)] sm:p-7">
            <SectionLabel>{sectionLabel}</SectionLabel>
            <h1 className="max-w-[11ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[30px] uppercase leading-[0.98] tracking-[0.016em] text-[#68232E] sm:text-[38px] lg:text-[44px]">
              {title}
            </h1>
            <p className="mt-4 max-w-[34rem] text-[15px] leading-[1.72] text-[#5B4F45] sm:text-[16px] sm:leading-[1.76]">
              {description}
            </p>

            <div className="mt-6 rounded-[26px] border border-[#E2D8CC] bg-white/82 px-5 py-5 shadow-[0_16px_36px_rgba(25,20,15,0.04)] sm:px-6 sm:py-6">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#8E7B6D]">
                Durum Notu
              </p>
              <p className="mt-3 text-[16px] leading-[1.72] text-[#5B4F45] sm:text-[17px]">
                Sistem oturum, soru içeriği ve sınav erişim durumunu güvenli biçimde kontrol ediyor.
              </p>
            </div>

            {primaryAction || secondaryAction ? (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {primaryAction ? (
                  <Link
                    to={primaryAction.to}
                    className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition-[background-color,box-shadow] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)] sm:px-8"
                  >
                    {primaryAction.label}
                  </Link>
                ) : null}
                {secondaryAction ? (
                  <Link
                    to={secondaryAction.to}
                    className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-[#D6CABC] bg-white px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-[#68232E] transition-colors duration-200 hover:bg-[#F8F2EA] sm:px-8"
                  >
                    {secondaryAction.label}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-[30px] border border-[#DDD3C7] bg-white/84 p-5 shadow-[0_20px_48px_rgba(25,20,15,0.05)] sm:p-7">
            <SectionLabel>Aday Özeti</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard label="Aday" value={session?.studentFullName || session?.applicationNo || 'Belirlenecek'} />
              <SummaryCard label="Aday Kodu" value={session?.applicationNo || 'Belirlenecek'} />
              <SummaryCard label="Sınıf" value={session ? String(session.grade) : 'Belirlenecek'} />
              <SummaryCard label="Oturum" value={sessionLabel} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function normalizeGrade(raw: unknown) {
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(12, parsed));
}

function resolveContentGradeKey(displayedGrade: unknown) {
  const grade = normalizeGrade(displayedGrade);
  const contentGrade = grade <= 1 ? 2 : (grade >= 12 ? 11 : grade);
  return `grade-${String(contentGrade).padStart(2, '0')}`;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`HTTP ${response.status}`);
  }
  return payload as T;
}

export default function BurslulukSinavPage() {
  const [session] = useState(() => readCandidateSession());
  const [isGateLoading, setIsGateLoading] = useState(true);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [content, setContent] = useState<ExamContentPublic | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const contentGradeKey = useMemo(() => resolveContentGradeKey(session?.grade), [session?.grade]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) {
      setIsGateLoading(false);
      setIsGateOpen(false);
      return;
    }

    let isCancelled = false;
    const run = async () => {
      try {
        const response = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (isCancelled) return;
        setIsGateOpen(Boolean(response.gate.exam_open));
      } catch {
        if (isCancelled) return;
        setIsGateOpen(false);
      } finally {
        if (!isCancelled) {
          setIsGateLoading(false);
        }
      }
    };

    void run();
    return () => {
      isCancelled = true;
    };
  }, [session?.attemptId, session?.sessionToken]);

  useEffect(() => {
    if (!session) {
      setIsContentLoading(false);
      setContent(null);
      return;
    }

    let isCancelled = false;
    const run = async () => {
      setIsContentLoading(true);
      setErrorMessage('');
      try {
        const response = await fetch(`/bursluluk-exam/${contentGradeKey}/assessment.public.json`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });
        const payload = await readJsonOrThrow<ExamContentPublic>(response);
        if (isCancelled) return;
        setContent(payload);
      } catch (error) {
        if (isCancelled) return;
        const message = error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Sinav icerigi yuklenemedi.';
        setErrorMessage(message);
        setContent(null);
      } finally {
        if (!isCancelled) {
          setIsContentLoading(false);
        }
      }
    };

    void run();
    return () => {
      isCancelled = true;
    };
  }, [contentGradeKey, session]);

  const adapter = useMemo(() => {
    if (!session?.sessionToken) return null;
    return createHttpExamAdapter({
      baseUrl: resolveExamApiBase(),
      sessionToken: session.sessionToken,
    });
  }, [session?.sessionToken]);

  const attempt = useMemo<ExamAttemptState | null>(() => {
    if (!content || !session) return null;

    const startedAt = session.startedAt || session.createdAt || new Date().toISOString();
    const startedAtMs = Number(new Date(startedAt));
    const fallbackStartedAt = Number.isFinite(startedAtMs) ? startedAtMs : Date.now();

    return {
      attemptId: session.attemptId,
      examVersionKey: content.examVersionKey,
      grade: content.grade,
      studentLabel: session.studentFullName || session.applicationNo,
      startedAt: new Date(fallbackStartedAt).toISOString(),
      deadlineAt: new Date(fallbackStartedAt + DEFAULT_DURATION_SECONDS * 1000).toISOString(),
      durationSeconds: DEFAULT_DURATION_SECONDS,
      status: 'started',
    };
  }, [content, session]);

  if (!session) {
    return (
      <ExamStateScreen
        sectionLabel="Sınav Oturumu"
        title="Sınav oturumu bulunamadı"
        description="Lütfen önce giriş adımından aday oturumunu başlatın ve ardından sınav ekranına geçin."
        primaryAction={{ label: 'Giriş Sayfasına Dön', to: '/bursluluk/giris' }}
      />
    );
  }

  if (isGateLoading || isContentLoading) {
    return (
      <ExamStateScreen
        sectionLabel="Sınav Hazırlığı"
        title="Sınav hazırlanıyor"
        description="Soru havuzu, oturum bilgisi ve sınav erişimi kontrol ediliyor. Birkaç saniye içinde sınav modülü açılacak."
        session={session}
        secondaryAction={{ label: 'Bekleme Ekranına Dön', to: '/bursluluk/bekleme' }}
      />
    );
  }

  if (!isGateOpen) {
    return (
      <ExamStateScreen
        sectionLabel="Sınav Kapısı"
        title="Sınav henüz açık değil"
        description="Bekleme ekranına dönerek açılış sayacını takip edin. Sınav saati geldiğinde bu oturum üzerinden devam edebilirsiniz."
        session={session}
        primaryAction={{ label: 'Bekleme Ekranına Dön', to: '/bursluluk/bekleme' }}
      />
    );
  }

  if (errorMessage || !content || !attempt || !adapter) {
    return (
      <ExamStateScreen
        sectionLabel="Sınav Modülü"
        title="Sınav ekranı açılamadı"
        description={errorMessage || 'Sınav modülü hazırlanamadı. Bekleme ekranına dönerek akışı yeniden deneyebilirsiniz.'}
        session={session}
        primaryAction={{ label: 'Bekleme Ekranına Dön', to: '/bursluluk/bekleme' }}
        secondaryAction={{ label: 'Girişe Dön', to: '/bursluluk/giris' }}
      />
    );
  }

  return (
    <BurslulukExamShell
      content={content}
      attempt={attempt}
      adapter={adapter}
      assetBaseUrl={`/bursluluk-exam/${contentGradeKey}`}
    />
  );
}
