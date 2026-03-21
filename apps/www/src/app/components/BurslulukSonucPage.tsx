import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  bookAppointmentSlot,
  getAppointmentSlots,
  resolveExamEndpoint,
  trackResultAppointmentIntent,
  type AppointmentSlotItem,
} from '../api/examApi';
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

type LatestAppointment = {
  event_type: string;
  occurred_at: string | null;
  appointment_at: string | null;
} | null;

type CandidateSchoolSchedule = {
  school_name: string | null;
  school_shift_type: string | null;
  class_start_local: string | null;
  class_end_local: string | null;
} | null;

async function readJsonSafe(response: Response) {
  try {
    return (await response.json()) as ResultPayload;
  } catch {
    return null;
  }
}

function formatAppointmentDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('tr-TR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [isSlotsVisible, setIsSlotsVisible] = useState(false);
  const [isSlotsLoading, setIsSlotsLoading] = useState(false);
  const [slotsErrorMessage, setSlotsErrorMessage] = useState('');
  const [appointmentSlots, setAppointmentSlots] = useState<AppointmentSlotItem[]>([]);
  const [candidateSchoolSchedule, setCandidateSchoolSchedule] = useState<CandidateSchoolSchedule>(null);
  const [candidateLatestAppointment, setCandidateLatestAppointment] = useState<LatestAppointment>(null);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [bookingSlotAt, setBookingSlotAt] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [bookingErrorMessage, setBookingErrorMessage] = useState('');
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

  const loadAppointmentSlots = async (options?: { silent?: boolean }) => {
    if (!attemptId || !session?.sessionToken) return;
    if (!options?.silent) {
      setIsSlotsLoading(true);
    }
    setSlotsErrorMessage('');
    try {
      const response = await getAppointmentSlots(session.sessionToken, attemptId, 24);
      const slots = Array.isArray(response.slots) ? response.slots : [];
      slots.sort((left, right) => {
        const leftPriority = left.recommended ? 0 : left.school_friendly === false ? 2 : 1;
        const rightPriority = right.recommended ? 0 : right.school_friendly === false ? 2 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return String(left.appointment_at).localeCompare(String(right.appointment_at));
      });
      setAppointmentSlots(slots);
      setCandidateSchoolSchedule(response.candidate_school_schedule || null);
      setCandidateLatestAppointment(response.candidate_latest_appointment || null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Randevu saatleri alinamadi.';
      setSlotsErrorMessage(reason || 'Randevu saatleri alinamadi.');
    } finally {
      if (!options?.silent) {
        setIsSlotsLoading(false);
      }
    }
  };

  const handleAppointmentClick = async () => {
    if (isSlotsLoading) return;
    setIsSlotsVisible(true);
    setBookingErrorMessage('');
    setBookingMessage('');
    trackEvent('cta_click', {
      cta_id: 'bursluluk_result_randevu_al',
      cta_location: 'bursluluk_sonuc',
      cta_destination: appointmentHref,
      source: 'result_page_cta',
      cta_type: 'button',
    });
    try {
      if (!isIntentTracked && attemptId && session?.sessionToken) {
        await trackResultAppointmentIntent(session.sessionToken, {
          attemptId,
          source: 'result_page_cta',
          destinationUrl: appointmentHref,
        });
        setIsIntentTracked(true);
      }
    } catch {
      // Intent tracking should not block slot opening.
      setIsIntentTracked(true);
    }

    if (appointmentSlots.length === 0) {
      await loadAppointmentSlots();
    }
  };

  const handleBookSlot = async (slot: AppointmentSlotItem) => {
    if (!attemptId || !session?.sessionToken) return;
    if (!slot?.is_available) return;

    setIsBookingSubmitting(true);
    setBookingSlotAt(slot.appointment_at);
    setBookingErrorMessage('');
    setBookingMessage('');
    try {
      const response = await bookAppointmentSlot(session.sessionToken, {
        attemptId,
        appointmentAt: slot.appointment_at,
        source: 'result_page_slot_booking',
      });
      const bookedAt = response?.appointment_booking?.appointment_at || slot.appointment_at;
      setBookingMessage(`Randevunuz olusturuldu: ${formatAppointmentDate(bookedAt)}`);
      trackEvent('cta_click', {
        cta_id: 'bursluluk_result_slot_booked',
        cta_location: 'bursluluk_sonuc',
        cta_destination: bookedAt,
        source: 'result_page_slot_booking',
        cta_type: 'button',
      });
      setCandidateLatestAppointment({
        event_type: 'APPOINTMENT_BOOKED',
        occurred_at: response?.appointment_booking?.occurred_at || new Date().toISOString(),
        appointment_at: bookedAt,
      });
      await loadAppointmentSlots({ silent: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Randevu olusturulamadi.';
      setBookingErrorMessage(reason || 'Randevu olusturulamadi.');
    } finally {
      setIsBookingSubmitting(false);
      setBookingSlotAt('');
    }
  };

  const hasActiveBooking = useMemo(() => {
    const eventType = String(candidateLatestAppointment?.event_type || '').toUpperCase();
    return eventType === 'APPOINTMENT_BOOKED' && Boolean(candidateLatestAppointment?.appointment_at);
  }, [candidateLatestAppointment]);

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_22%,rgba(146,11,35,0.32),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(18,86,94,0.22),transparent_34%),linear-gradient(138deg,#05050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="relative mx-auto w-full max-w-[920px] rounded-[26px] border border-white/12 bg-[#091427]/86 p-7 sm:p-9">
        <p className="text-[12px] uppercase tracking-[0.16em] text-white/54">Bursluluk Sonuc Ekrani</p>
        <h1 className="mt-3 text-[36px] font-semibold text-white sm:text-[44px]">Sinav Sonucu</h1>
        <p className="mt-2 text-[15px] text-white/60">Aday Kodu: {session?.candidateCode || session?.applicationNo || '-'}</p>

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
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Burs Orani</p>
              <p className="mt-3 text-[40px] font-semibold text-white">%{Number(result.discount_rate || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Sinif Sirasi</p>
              <p className="mt-3 text-[40px] font-semibold text-white">{result.class_rank || '-'}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Dogru</p>
              <p className="mt-3 text-[36px] font-semibold text-white">{Number(result.correct_count || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Yanlis</p>
              <p className="mt-3 text-[36px] font-semibold text-white">{Number(result.wrong_count || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Bos</p>
              <p className="mt-3 text-[36px] font-semibold text-white">{Number(result.unanswered_count || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#071021]/88 p-5 sm:col-span-2">
              <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Yerlesim Bandi</p>
              <p className="mt-3 text-[24px] font-semibold text-white">{result.placement_label || result.cefr_band || 'Hazirlaniyor'}</p>
              <p className="mt-2 text-[14px] text-white/62">Durum: {result.status || '-'}</p>
            </div>
          </div>
        ) : null}

        {!isLoading && result ? <BurslulukHybridResultOffers /> : null}

        {!isLoading && result ? (
          <div className="mt-8 rounded-2xl border border-[#3B7A6B] bg-[#0C2E29]/90 p-5 sm:p-6">
            <p className="text-[12px] uppercase tracking-[0.16em] text-[#BDE9DC]">Sonraki Adim</p>
            <h2 className="mt-2 text-[22px] font-semibold text-[#E8FFF8] sm:text-[26px]">Randevu Al</h2>
            <p className="mt-2 max-w-[640px] text-[14px] text-[#CDEFE5]">
              Egitim danismani ile gorusme planlayarak burs oranini detayli degerlendirebilirsiniz.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleAppointmentClick()}
                disabled={isSlotsLoading}
                className="rounded-full border border-[#8BDFC7] bg-[#35B58E] px-8 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#05231A] transition hover:bg-[#46C79F] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isSlotsLoading ? 'Yukleniyor...' : 'Musait Saatleri Goster'}
              </button>
              <Link to={appointmentHref} className="rounded-full border border-[#8BDFC7]/60 px-6 py-3 text-[12px] uppercase tracking-[0.16em] text-[#D5F6EB]">
                Iletisim Sayfasi
              </Link>
            </div>

            {hasActiveBooking ? (
              <p className="mt-4 rounded-xl border border-[#4E8B7B] bg-[#123A33] px-4 py-3 text-[14px] text-[#D5F6EB]">
                Aktif randevu: {formatAppointmentDate(candidateLatestAppointment?.appointment_at)}
              </p>
            ) : null}

            {isSlotsVisible ? (
              <div className="mt-4 rounded-xl border border-[#295E53] bg-[#0B241F]/80 p-4">
                {candidateSchoolSchedule?.school_name ? (
                  <p className="mb-3 rounded-lg border border-[#2A6458] bg-[#0F2F29] px-3 py-2 text-[12px] text-[#CDEFE5]">
                    Okul: {candidateSchoolSchedule.school_name}
                    {candidateSchoolSchedule.school_shift_type ? ` • Vardiya: ${candidateSchoolSchedule.school_shift_type}` : ''}
                    {(candidateSchoolSchedule.class_start_local && candidateSchoolSchedule.class_end_local)
                      ? ` • Ders: ${candidateSchoolSchedule.class_start_local.slice(0, 5)}-${candidateSchoolSchedule.class_end_local.slice(0, 5)}`
                      : ''}
                  </p>
                ) : null}
                {slotsErrorMessage ? (
                  <p className="rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[13px] text-[#FFB8B1]">{slotsErrorMessage}</p>
                ) : null}

                {bookingMessage ? (
                  <p className="mb-3 rounded-lg border border-[#4E8B7B] bg-[#123A33] px-3 py-2 text-[13px] text-[#D5F6EB]">{bookingMessage}</p>
                ) : null}

                {bookingErrorMessage ? (
                  <p className="mb-3 rounded-lg border border-[#6F2824] bg-[#2B1214]/80 px-3 py-2 text-[13px] text-[#FFB8B1]">{bookingErrorMessage}</p>
                ) : null}

                {appointmentSlots.length === 0 ? (
                  <p className="text-[13px] text-[#CDEFE5]">Uygun randevu saati bulunamadi. Iletisim ekibimiz sizi arayacaktir.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {appointmentSlots.map((slot) => (
                      <button
                        key={slot.appointment_at}
                        type="button"
                        onClick={() => void handleBookSlot(slot)}
                        disabled={!slot.is_available || isBookingSubmitting || hasActiveBooking}
                        className="rounded-lg border border-[#4E8B7B] bg-[#123A33] px-3 py-3 text-left text-[#D5F6EB] transition hover:bg-[#17483E] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <p className="text-[13px] font-semibold">{formatAppointmentDate(slot.appointment_at)}</p>
                        <p className="mt-1 text-[11px] text-[#A8DCCE]">Kontenjan: {slot.available}/{slot.capacity}</p>
                        {slot.recommended ? <p className="mt-1 text-[11px] text-[#D9FFE9]">Okul saatine uygun (onerilen)</p> : null}
                        {slot.school_friendly === false ? <p className="mt-1 text-[11px] text-[#FFD9BE]">Okul saatine yakin olabilir</p> : null}
                        {!slot.is_available ? <p className="mt-1 text-[11px] text-[#FFC9BE]">Dolu</p> : null}
                        {isBookingSubmitting && bookingSlotAt === slot.appointment_at ? (
                          <p className="mt-1 text-[11px] text-[#E5FFF7]">Kaydediliyor...</p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/bursluluk/giris" className="rounded-full border border-white/18 px-6 py-3 text-[12px] uppercase tracking-[0.16em] text-white/74">
            Girise Don
          </Link>
          <Link to={appointmentHref} className="rounded-full border border-white/18 px-6 py-3 text-[12px] uppercase tracking-[0.16em] text-white/74">
            Iletisim Sayfasi
          </Link>
        </div>
      </div>
    </section>
  );
}
