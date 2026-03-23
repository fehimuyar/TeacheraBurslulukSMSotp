import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { resolveExamEndpoint } from '../api/examApi';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';

interface ResultPayload {
  result?: {
    result_id?: string;
    attempt_id?: string;
    score?: number;
    percentage?: number;
    status?: string;
    placement_label?: string | null;
    cefr_band?: string | null;
    viewed_at?: string | null;
    published_at?: string | null;
    exam_language?: string;
    exam_age_range?: string;
  };
  error?: string;
  message?: string;
}

async function readJsonSafe(response: Response) {
  try {
    return (await response.json()) as ResultPayload;
  } catch {
    return null;
  }
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

  useEffect(() => {
    const run = async () => {
      if (!attemptId || !session?.sessionToken) {
        setErrorMessage('Sonuc goruntulemek icin aday oturumu gerekir.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await fetch(resolveExamEndpoint(`/api/exam/results/${encodeURIComponent(attemptId)}`), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-exam-session-token': session.sessionToken,
          },
        });

        const json = await readJsonSafe(response);
        if (!response.ok || !json?.result) {
          const reason = String(json?.message || json?.error || '').trim();
          if (response.status === 404) {
            setErrorMessage('Sonuc henuz yayinlanmadi. Lutfen daha sonra tekrar kontrol edin.');
          } else {
            setErrorMessage(reason || `Sonuc servisi hatasi (HTTP ${response.status}).`);
          }
          setPayload(json);
          return;
        }
        setPayload(json);
      } catch {
        setErrorMessage('Ag hatasi nedeniyle sonuc alinamadi.');
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [attemptId, session?.sessionToken]);

  const result = payload?.result;

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,11,35,0.32),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(18,86,94,0.22),transparent_34%),linear-gradient(138deg,#05050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="relative mx-auto w-full max-w-[920px] rounded-[26px] border border-white/12 bg-[#091427]/86 p-7 sm:p-9">
        <p className="text-[12px] uppercase tracking-[0.16em] text-white/54">Bursluluk Sonuc Ekrani</p>
        <h1 className="mt-3 text-[36px] font-semibold text-white sm:text-[44px]">Sinav Sonucu</h1>
        <p className="mt-2 text-[15px] text-white/60">Basvuru No: {session?.applicationNo || '-'}</p>

        {isLoading ? (
          <p className="mt-8 rounded-xl border border-white/12 bg-[#071021]/88 px-4 py-4 text-white/72">Sonuc yukleniyor...</p>
        ) : null}

        {errorMessage ? (
          <p className="mt-8 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-4 text-[#FFB8B1]">{errorMessage}</p>
        ) : null}

        {!isLoading && result ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Skor</p>
              <p className="mt-3 text-[40px] font-semibold text-white">{Number(result.score || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Yuzde</p>
              <p className="mt-3 text-[40px] font-semibold text-white">%{Number(result.percentage || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5 sm:col-span-2">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Yerlesim Bandi</p>
              <p className="mt-3 text-[24px] font-semibold text-white">{result.placement_label || result.cefr_band || 'Hazirlaniyor'}</p>
              <p className="mt-2 text-[14px] text-white/62">Durum: {result.status || '-'}</p>
            </div>
          </div>
        ) : null}

        {/* Randevu Al CTA */}
        {result && result.status === 'VIEWED' && (
          <div className="mt-8 rounded-3xl border border-[#2C5447]/30 bg-[#2C5447] p-6 text-center shadow-[0_12px_40px_rgba(44,84,71,0.3)]">
            <p className="text-[14px] leading-[1.6] text-white/80">
              Eğitim danışmanımızla ücretsiz görüşme randevusu alın
            </p>
            <Link
              to="/bursluluk/randevu"
              className="mt-4 inline-block rounded-full bg-white px-10 py-4 text-[14px] font-semibold uppercase tracking-[0.14em] text-[#2C5447] shadow-[0_8px_24px_rgba(255,255,255,0.2)] transition hover:shadow-[0_12px_32px_rgba(255,255,255,0.3)] active:scale-[0.97]"
            >
              Randevu Al
            </Link>
            <p className="mt-3 text-[12px] text-white/50">
              Size uygun bir tarih ve saat seçin
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/bursluluk/giris" className="rounded-full border border-white/18 px-6 py-3 text-[12px] uppercase tracking-[0.16em] text-white/74">
            Girise Don
          </Link>
        </div>
      </div>
    </section>
  );
}
