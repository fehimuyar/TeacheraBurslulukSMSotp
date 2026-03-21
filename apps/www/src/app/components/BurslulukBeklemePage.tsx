import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getExamSessionStatus } from '../api/examApi';
import { trackEvent } from '../lib/analytics';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';

function formatTimer(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function BurslulukBeklemePage() {
  const navigate = useNavigate();
  const session = readCandidateSession();

  const [nowMs, setNowMs] = useState(Date.now());
  const [serverGate, setServerGate] = useState<{
    exam_open: boolean;
    exam_open_at: string | null;
    server_time_utc: string;
    remaining_seconds: number;
  } | null>(null);
  const [gateError, setGateError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdownSeconds = useMemo(() => {
    if (serverGate) {
      return Math.max(0, Number(serverGate.remaining_seconds || 0));
    }
    if (!session) return 0;
    const openMs = Number(new Date(session.examOpenAt));
    if (!Number.isFinite(openMs)) return 0;
    return Math.max(0, Math.ceil((openMs - nowMs) / 1000));
  }, [nowMs, serverGate, session]);

  useEffect(() => {
    if (!session?.attemptId || !session?.sessionToken) return;
    let isCancelled = false;

    const run = async () => {
      try {
        const response = await getExamSessionStatus(session.sessionToken, session.attemptId);
        if (isCancelled) return;
        setServerGate(response.gate);
        setGateError('');
      } catch (error) {
        if (isCancelled) return;
        const message = error instanceof Error && error.message.trim() ? error.message : 'Durum servisi gecici olarak ulasilamiyor.';
        setGateError(message);
      }
    };

    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 15000);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.attemptId, session?.sessionToken]);

  if (!session) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Bekleme ekrani acilamadi</h1>
          <p className="mt-3 text-white/70">Aday oturumu bulunamadi. Lutfen giris adimina donun.</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em]">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  const canStart = serverGate ? Boolean(serverGate.exam_open) : countdownSeconds === 0;

  const handleStartExam = () => {
    trackEvent('placement_exam_start', {
      exam_language: session.language || 'en',
      age_range: session.ageRange || '',
      question_count: Number(session.questionCount || 0),
      exam_bank: 'bursluluk_2026',
    });
    navigate('/bursluluk/sinav');
  };

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,11,35,0.32),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(18,86,94,0.22),transparent_34%),linear-gradient(138deg,#05050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="relative mx-auto w-full max-w-[940px] rounded-[28px] border border-white/12 bg-[#091427]/86 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <p className="text-[12px] uppercase tracking-[0.17em] text-white/55">Aday bekleme ekranı</p>
        <h1 className="mt-3 text-[34px] font-semibold text-white sm:text-[44px]">Sınav Açılış Sayaçı</h1>
        <p className="mt-4 text-[17px] leading-[1.8] text-white/72">
          Aday: <span className="font-semibold text-white">{session.studentFullName || session.candidateCode || session.applicationNo}</span>
        </p>
        <p className="mt-1 text-[17px] leading-[1.8] text-white/72">
          Aday Kodu: <span className="font-semibold text-white">{session.candidateCode || session.applicationNo}</span>
        </p>

        <div className="mt-8 rounded-2xl border border-white/12 bg-[#071021]/88 p-6 text-center">
          <p className="text-[12px] uppercase tracking-[0.2em] text-white/56">Kalan sure</p>
          <p className="mt-3 text-[56px] font-semibold leading-none text-white sm:text-[72px]">{formatTimer(countdownSeconds)}</p>
          <p className="mt-3 text-[13px] text-white/56">
            Sınav saati: {new Date((serverGate?.candidate_exam_open_at || serverGate?.exam_open_at || session.examOpenAt)).toLocaleString('tr-TR')}
          </p>
          {session.examSlotLabel ? (
            <p className="mt-2 text-[12px] text-white/50">Slot: {session.examSlotLabel}</p>
          ) : null}
        </div>

        <div className="mt-7 grid gap-3 rounded-2xl border border-white/10 bg-[#071021]/88 p-5 text-[14px] text-white/72 sm:grid-cols-2">
          <p>1. Kulaklik/hoparlor kontrolu yapildi.</p>
          <p>2. Tarayici guncel ve tek sekme acik.</p>
          <p>3. Internet baglantisi stabil.</p>
          <p>4. SMS ile gelen kimlik bilgileri hazir.</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleStartExam}
            disabled={!canStart}
            className="rounded-full bg-[#D92E27] px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#bf251f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {canStart ? 'Sınava Başla' : 'Sınav Açılışı Bekleniyor'}
          </button>
          <Link to="/bursluluk/giris" className="rounded-full border border-white/18 px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/72">
            Girise Don
          </Link>
        </div>
        {gateError ? (
          <p className="mt-4 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[13px] text-[#FFB8B1]">
            {gateError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
