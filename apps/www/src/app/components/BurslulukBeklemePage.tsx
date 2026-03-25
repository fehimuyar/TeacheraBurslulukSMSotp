import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getExamSessionStatus } from '../api/examApi';
import { trackEvent } from '../lib/analytics';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';

type ServerGate = {
  exam_open: boolean;
  exam_open_at: string | null;
  candidate_exam_open_at?: string | null;
  server_time_utc?: string | null;
  remaining_seconds: number;
};

function padTimerUnit(value: number) {
  return String(Math.max(0, value)).padStart(2, '0');
}

function formatTimerParts(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  return {
    days: padTimerUnit(days),
    hours: padTimerUnit(hours),
    minutes: padTimerUnit(minutes),
  };
}

function formatExamOpenAt(value: string | null | undefined) {
  if (!value) return 'Belirlenecek';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belirlenecek';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatServerTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#E2D8CC] bg-[#FCFAF7] px-4 py-4 sm:px-5 sm:py-5">
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#4A7067] sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2.5 text-[15px] leading-[1.6] text-[#3E342D] sm:text-[16px] sm:leading-[1.62]">{value}</p>
    </div>
  );
}

function CountdownCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[#E5DBCF] bg-[#FFFCF8] px-4 py-5 text-center shadow-[0_18px_34px_rgba(25,20,15,0.04)] sm:px-5 sm:py-6">
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]/82">
        {label}
      </p>
      <p className="mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[40px] uppercase leading-none tracking-[0.03em] text-[#68232E] sm:text-[52px]">
        {value}
      </p>
    </div>
  );
}

const readinessItems = [
  'SMS ile gelen basvuru numarasi ve sifrenizi hazir tutun.',
  'Tek cihaz ve tek sekme ile sinava devam edin.',
  'Tarayicinizi kapatmadan stabil internet baglantisini koruyun.',
] as const;

export default function BurslulukBeklemePage() {
  const navigate = useNavigate();
  const session = readCandidateSession();

  const [nowMs, setNowMs] = useState(Date.now());
  const [serverGate, setServerGate] = useState<ServerGate | null>(null);
  const [gateError, setGateError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) return undefined;

    let isCancelled = false;

    const run = async () => {
      try {
        const response = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (isCancelled) return;
        setServerGate(response.gate || null);
        setGateError('');
      } catch (error) {
        if (isCancelled) return;
        const message = error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Durum servisi gecici olarak ulasilamiyor.';
        setGateError(message);
      }
    };

    void run();
    const poller = window.setInterval(() => {
      void run();
    }, 15000);

    return () => {
      isCancelled = true;
      window.clearInterval(poller);
    };
  }, [session?.attemptId, session?.sessionToken]);

  const countdownSeconds = useMemo(() => {
    if (serverGate) {
      return Math.max(0, Number(serverGate.remaining_seconds || 0));
    }
    if (!session?.examOpenAt) return 0;
    const openMs = Number(new Date(session.examOpenAt));
    if (!Number.isFinite(openMs)) return 0;
    return Math.max(0, Math.ceil((openMs - nowMs) / 1000));
  }, [nowMs, serverGate, session?.examOpenAt]);

  const displayExamOpenAt = serverGate?.candidate_exam_open_at || serverGate?.exam_open_at || session?.examOpenAt || '';
  const timer = useMemo(() => formatTimerParts(countdownSeconds), [countdownSeconds]);
  const canStart = serverGate ? Boolean(serverGate.exam_open) : countdownSeconds === 0;
  const statusLabel = canStart
    ? 'Sinav ekraniniz hazir'
    : countdownSeconds > 0
      ? 'Sinav acilisini bekliyorsunuz'
      : 'Sunucu onayi bekleniyor';
  const helperText = canStart
    ? 'Sayac tamamlandi. Basla butonuyla sinav ekranina gecebilirsiniz.'
    : countdownSeconds > 0
      ? 'Sayac sifirlandiginda sinava basla butonu aktif olacak.'
      : 'Sayac sifirlandi. Sistem son erisim kontrolunu tamamliyor.';

  const handleStartExam = () => {
    trackEvent('placement_exam_start', {
      exam_language: session?.language || 'en',
      age_range: session?.ageRange || '',
      question_count: Number(session?.questionCount || 0),
      exam_bank: 'bursluluk_2026',
    });
    navigate('/bursluluk/sinav');
  };

  if (!session) {
    return (
      <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
        <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
        <div className="relative mx-auto max-w-[860px] rounded-[30px] border border-[#DDD3C7] bg-white/88 p-6 shadow-[0_24px_64px_rgba(25,20,15,0.08)] sm:p-8">
          <SectionLabel>Bekleme Ekrani</SectionLabel>
          <h1 className="max-w-[12ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-[1.02] tracking-[0.018em] text-[#68232E] sm:text-[34px]">
            Aday oturumu bulunamadi
          </h1>
          <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.8] text-[#5B4F45]">
            Bekleme ekranini acmak icin once giris yapilmis bir bursluluk oturumu gerekiyor.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[12%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-[1040px] rounded-[30px] border border-[#DDD3C7] bg-white/88 p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <div className="rounded-[28px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-5 sm:p-6 lg:p-7">
            <SectionLabel>Bekleme Ekrani</SectionLabel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[30px] uppercase leading-[1.02] tracking-[0.02em] text-[#68232E] sm:text-[36px] lg:text-[40px]">
                  Sinav Baslangic Sayaci
                </h1>
                <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.82] text-[#5B4F45] sm:text-[16px] sm:leading-[1.88]">
                  Basvuru akisinizi tamamladiniz. Sinav saatiniz geldiginde sistem sizi ayni oturumdan sinav ekranina alacak.
                </p>
              </div>
              <div className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#4A7067]">
                {statusLabel}
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <CountdownCard label="Gun" value={timer.days} />
              <CountdownCard label="Saat" value={timer.hours} />
              <CountdownCard label="Dakika" value={timer.minutes} />
            </div>

            <div className="mt-6 rounded-[24px] border border-[#E2D8CC] bg-[#FFFCF8] px-5 py-5">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]">
                Sinav Acilis Bilgisi
              </p>
              <p className="mt-3 text-[18px] leading-[1.6] text-[#3E342D] sm:text-[20px]">
                {formatExamOpenAt(displayExamOpenAt)}
              </p>
              <p className="mt-2 text-[14px] leading-[1.7] text-[#5B4F45]">
                {helperText}
              </p>
              {formatServerTime(serverGate?.server_time_utc) ? (
                <p className="mt-3 text-[12px] uppercase tracking-[0.14em] text-[#68232E]/56">
                  Son sunucu kontrolu {formatServerTime(serverGate?.server_time_utc)}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleStartExam}
                disabled={!canStart}
                className="inline-flex min-h-[54px] items-center justify-center rounded-full bg-[#E70000] px-7 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)] disabled:cursor-not-allowed disabled:bg-[#D8CDC0] disabled:text-[#8F8173] disabled:shadow-none"
              >
                {canStart ? 'Sinava Basla' : 'Sinav Acilisi Bekleniyor'}
              </button>
            </div>

            {gateError ? (
              <p className="mt-5 rounded-[22px] border border-[#E5B8B1] bg-[#FFF3F1] px-4 py-4 text-[14px] leading-[1.72] text-[#8E3530]">
                {gateError}
              </p>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-[#E2D8CC] bg-[#FCFAF7] p-5 sm:p-6">
              <SectionLabel>Aday Ozeti</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <SummaryCard label="Aday" value={session.studentFullName || 'Aday ogrenci'} />
                <SummaryCard label="Aday Kodu" value={session.candidateCode || session.applicationNo || '-'} />
                <SummaryCard label="Sinif" value={String(session.grade || '-')} />
                <SummaryCard label="Oturum" value={session.examSlotLabel || formatExamOpenAt(displayExamOpenAt)} />
              </div>
            </div>

            <div className="rounded-[28px] border border-[#DDD3C7] bg-white/84 p-5 shadow-[0_20px_48px_rgba(25,20,15,0.05)] sm:p-6">
              <SectionLabel>Hazirlik Notlari</SectionLabel>
              <h2 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] uppercase leading-[1.08] tracking-[0.03em] text-[#68232E] sm:text-[26px]">
                Sinavdan once kisa kontrol
              </h2>
              <div className="mt-5 space-y-3.5">
                {readinessItems.map((item, index) => (
                  <article
                    key={item}
                    className="grid grid-cols-[54px_1fr] gap-3 rounded-[22px] border border-[#E5DBCF] bg-[#FFFCF8] px-4 py-4 sm:grid-cols-[62px_1fr] sm:gap-4 sm:px-5"
                  >
                    <div className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] leading-none tracking-[0.015em] text-[#68232E]/16 sm:text-[28px]">
                      {padTimerUnit(index + 1)}
                    </div>
                    <p className="text-[14px] leading-[1.7] text-[#5B4F45] sm:text-[15px] sm:leading-[1.76]">
                      {item}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
