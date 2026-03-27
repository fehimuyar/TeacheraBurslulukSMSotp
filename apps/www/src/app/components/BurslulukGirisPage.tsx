import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { candidateLogin, renewCandidateCredentials } from '../api/examApi';
import { notifyError, notifySuccess } from '../lib/notifications';
import { isValidTrMobilePhone, normalizeTrMobileInput, TR_MOBILE_PATTERN, TR_MOBILE_TITLE } from './phoneUtils';
import {
  getCredentialsResendRemainingSeconds,
  startCredentialsResendCooldown,
} from './bursluluk/credentialsResendCooldown';
import {
  deriveAgeRangeFromGrade,
  normalizeGrade,
  readCandidateSession,
  resolveDefaultExamOpenAt,
  saveCandidateSession,
  type BurslulukCandidateSession,
} from './bursluluk/burslulukFlowSession';

const CAMPAIGN_CODE = String(import.meta.env.VITE_BURSLULUK_CAMPAIGN_CODE || '2026_BURSLULUK').trim();
const QUESTION_COUNT = Number(import.meta.env.VITE_BURSLULUK_QUESTION_COUNT || 40) || 40;

function toE164FromTrMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  return `+90${digits}`;
}

function fromE164ToTrMobile(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.startsWith('90') ? digits.slice(2) : digits;
  return normalizeTrMobileInput(normalized);
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function formatCooldown(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function updateStoredSession(
  current: BurslulukCandidateSession,
  patch: Partial<BurslulukCandidateSession>,
) {
  return saveCandidateSession({
    applicationNo: patch.applicationNo || current.applicationNo,
    candidateCode: patch.candidateCode ?? current.candidateCode,
    attemptId: patch.attemptId || current.attemptId,
    sessionToken: patch.sessionToken || current.sessionToken,
    candidateId: patch.candidateId ?? current.candidateId,
    expiresAt: patch.expiresAt ?? current.expiresAt,
    startedAt: patch.startedAt ?? current.startedAt,
    credentialsSmsStatus: patch.credentialsSmsStatus ?? current.credentialsSmsStatus,
    consentVersion: patch.consentVersion ?? current.consentVersion,
    studentFullName: patch.studentFullName || current.studentFullName,
    parentFullName: patch.parentFullName || current.parentFullName,
    parentPhoneE164: patch.parentPhoneE164 || current.parentPhoneE164,
    parentEmail: patch.parentEmail ?? current.parentEmail,
    schoolName: patch.schoolName || current.schoolName,
    schoolDistrict: patch.schoolDistrict ?? current.schoolDistrict,
    schoolType: patch.schoolType ?? current.schoolType,
    grade: patch.grade ?? current.grade,
    tckn: patch.tckn ?? current.tckn,
    birthYear: patch.birthYear ?? current.birthYear,
    branch: patch.branch ?? current.branch,
    selectedSessionId: patch.selectedSessionId ?? current.selectedSessionId,
    selectedSessionLabel: patch.selectedSessionLabel ?? current.selectedSessionLabel,
    ageRange: patch.ageRange || current.ageRange,
    language: patch.language || current.language,
    questionCount: patch.questionCount ?? current.questionCount,
    campaignCode: patch.campaignCode || current.campaignCode,
    examOpenAt: patch.examOpenAt || current.examOpenAt,
    examSlotLabel: patch.examSlotLabel ?? current.examSlotLabel,
    scholarshipExam: patch.scholarshipExam ?? current.scholarshipExam,
  });
}

async function requestCredentialsSms({
  applicationNo,
  parentPhoneE164,
  attemptId,
  sessionToken,
}: {
  applicationNo: string;
  parentPhoneE164: string;
  attemptId?: string;
  sessionToken?: string | null;
}) {
  if (attemptId && sessionToken) {
    try {
      return await renewCandidateCredentials(sessionToken, { attemptId });
    } catch {
      // Fall back to public recovery when the stored session token is stale.
    }
  }

  return renewCandidateCredentials(null, {
    applicationNo,
    parentPhoneE164,
    campaignCode: CAMPAIGN_CODE,
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

export default function BurslulukGirisPage() {
  const navigate = useNavigate();
  const [sessionContext, setSessionContext] = useState<BurslulukCandidateSession | null>(() => readCandidateSession());

  const [loginApplicationNo, setLoginApplicationNo] = useState(sessionContext?.applicationNo || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [showRenewFlow, setShowRenewFlow] = useState(false);
  const [renewApplicationNo, setRenewApplicationNo] = useState(sessionContext?.applicationNo || '');
  const [renewPhone, setRenewPhone] = useState(fromE164ToTrMobile(sessionContext?.parentPhoneE164 || ''));
  const [isAutoRenewSubmitting, setIsAutoRenewSubmitting] = useState(false);
  const [isRenewSubmitting, setIsRenewSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [renewMessage, setRenewMessage] = useState('');
  const [cooldownRemaining, setCooldownRemaining] = useState(() =>
    getCredentialsResendRemainingSeconds(sessionContext?.applicationNo || ''),
  );
  const [hasAttemptedAutoRenew, setHasAttemptedAutoRenew] = useState(false);

  useEffect(() => {
    const applicationNo = renewApplicationNo.trim().toUpperCase();
    if (!applicationNo) {
      setCooldownRemaining(0);
      return;
    }

    setCooldownRemaining(getCredentialsResendRemainingSeconds(applicationNo));
    const intervalId = window.setInterval(() => {
      setCooldownRemaining(getCredentialsResendRemainingSeconds(applicationNo));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [renewApplicationNo]);

  useEffect(() => {
    if (showRenewFlow && !renewApplicationNo.trim() && loginApplicationNo.trim()) {
      setRenewApplicationNo(loginApplicationNo.trim().toUpperCase());
    }
  }, [showRenewFlow, renewApplicationNo, loginApplicationNo]);

  useEffect(() => {
    const session = sessionContext;
    const applicationNo = session?.applicationNo.trim().toUpperCase() || '';
    const parentPhoneE164 = String(session?.parentPhoneE164 || '').trim();

    if (!session || !applicationNo || !parentPhoneE164 || hasAttemptedAutoRenew || cooldownRemaining > 0) {
      return;
    }

    let cancelled = false;
    setHasAttemptedAutoRenew(true);

    const run = async () => {
      setErrorMessage('');
      setRenewMessage('');
      setIsAutoRenewSubmitting(true);

      try {
        const response = await requestCredentialsSms({
          applicationNo,
          parentPhoneE164,
          attemptId: session.attemptId,
          sessionToken: session.sessionToken,
        });

        if (cancelled) return;
        const updated = updateStoredSession(session, {
          sessionToken: response.credentials.sessionToken,
          expiresAt: response.credentials.expiresAt,
          credentialsSmsStatus: response.credentials.credentialsSmsStatus,
          parentPhoneE164: response.credentials.phone || parentPhoneE164,
        });
        setSessionContext(updated);
        setLoginApplicationNo(updated.applicationNo);
        setRenewApplicationNo(updated.applicationNo);
        setRenewPhone(fromE164ToTrMobile(updated.parentPhoneE164 || parentPhoneE164));
        startCredentialsResendCooldown(updated.applicationNo);
        setCooldownRemaining(getCredentialsResendRemainingSeconds(updated.applicationNo));
        setRenewMessage('Şifreniz kayıtlı telefon numarasına gönderildi.');
      } catch (error) {
        if (cancelled) return;
        const message = normalizeError(error, 'Şifre gönderilemedi.');
        setErrorMessage(message);
      } finally {
        if (!cancelled) {
          setIsAutoRenewSubmitting(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [sessionContext, hasAttemptedAutoRenew, cooldownRemaining]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setRenewMessage('');
    setIsLoginSubmitting(true);

    try {
      if (!loginApplicationNo.trim() || !loginPassword.trim()) {
        throw new Error('Kullanıcı adı ve şifre alanlarını doldurun.');
      }

      const response = await candidateLogin({
        username: loginApplicationNo.trim(),
        password: loginPassword.trim(),
        campaignCode: CAMPAIGN_CODE,
      });

      const session = response.session;
      const candidate = response.candidate || {};
      const isSameCandidate = sessionContext?.applicationNo === session.applicationNo;

      const savedSession = saveCandidateSession({
        applicationNo: session.applicationNo,
        attemptId: session.attemptId,
        sessionToken: session.sessionToken,
        candidateId: session.candidateId,
        expiresAt: session.expiresAt,
        studentFullName: candidate.studentFullName || sessionContext?.studentFullName || 'Aday Öğrenci',
        parentFullName: candidate.parentFullName || sessionContext?.parentFullName || 'Veli',
        parentPhoneE164: isSameCandidate ? sessionContext?.parentPhoneE164 || '' : '',
        schoolName: isSameCandidate ? sessionContext?.schoolName || '' : '',
        schoolDistrict: isSameCandidate ? sessionContext?.schoolDistrict : undefined,
        schoolType: isSameCandidate ? sessionContext?.schoolType : undefined,
        grade: normalizeGrade(candidate.grade ?? sessionContext?.grade ?? 8),
        tckn: isSameCandidate ? sessionContext?.tckn : undefined,
        birthYear: isSameCandidate ? sessionContext?.birthYear : undefined,
        branch: isSameCandidate ? sessionContext?.branch : undefined,
        selectedSessionId: isSameCandidate ? sessionContext?.selectedSessionId : undefined,
        selectedSessionLabel: isSameCandidate ? sessionContext?.selectedSessionLabel : undefined,
        ageRange:
          session.examAgeRange
          || (isSameCandidate ? sessionContext?.ageRange : undefined)
          || deriveAgeRangeFromGrade(normalizeGrade(candidate.grade ?? sessionContext?.grade ?? 8)),
        language: session.examLanguage || (isSameCandidate ? sessionContext?.language : undefined) || 'en',
        questionCount: Number(session.questionCount || session.scholarshipExam?.questionCount || QUESTION_COUNT),
        campaignCode: CAMPAIGN_CODE,
        examOpenAt: response.gate?.exam_open_at || sessionContext?.examOpenAt || resolveDefaultExamOpenAt(),
        examSlotLabel: session.examSlotLabel || sessionContext?.examSlotLabel,
        scholarshipExam: session.scholarshipExam || sessionContext?.scholarshipExam,
      });
      setSessionContext(savedSession);

      navigate('/bursluluk/bekleme');
    } catch (error) {
      setErrorMessage(normalizeError(error, 'Aday girişi başarısız.'));
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  const handleRenewSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setRenewMessage('');

    const applicationNo = renewApplicationNo.trim().toUpperCase();
    const normalizedPhone = normalizeTrMobileInput(renewPhone);

    if (!applicationNo) {
      setErrorMessage('Başvuru numarası zorunludur.');
      return;
    }
    if (!isValidTrMobilePhone(normalizedPhone)) {
      setErrorMessage(TR_MOBILE_TITLE);
      return;
    }
    if (cooldownRemaining > 0 || isRenewSubmitting || isAutoRenewSubmitting) {
      return;
    }

    setIsRenewSubmitting(true);

    try {
      const parentPhoneE164 = toE164FromTrMobile(normalizedPhone);
      const currentSession = sessionContext && sessionContext.applicationNo.trim().toUpperCase() === applicationNo
        ? sessionContext
        : null;
      const authenticatedSession = currentSession
        && (!currentSession.parentPhoneE164 || currentSession.parentPhoneE164 === parentPhoneE164)
          ? currentSession
          : null;

      const response = await requestCredentialsSms({
        applicationNo,
        parentPhoneE164,
        attemptId: authenticatedSession?.attemptId,
        sessionToken: authenticatedSession?.sessionToken,
      });

      if (currentSession) {
        const updated = updateStoredSession(currentSession, {
          sessionToken: response.credentials.sessionToken,
          expiresAt: response.credentials.expiresAt,
          credentialsSmsStatus: response.credentials.credentialsSmsStatus,
          parentPhoneE164: response.credentials.phone || parentPhoneE164,
        });
        setSessionContext(updated);
        setRenewPhone(fromE164ToTrMobile(updated.parentPhoneE164 || parentPhoneE164));
      }

      startCredentialsResendCooldown(applicationNo);
      setCooldownRemaining(getCredentialsResendRemainingSeconds(applicationNo));
      setRenewMessage('Şifreniz kayıtlı telefon numarasına tekrar gönderildi.');
      notifySuccess('Şifre kayıtlı telefon numarasına tekrar gönderildi.');
      setLoginApplicationNo(applicationNo);
      setRenewApplicationNo(applicationNo);
    } catch (error) {
      const message = normalizeError(error, 'Şifre tekrar gönderilemedi.');
      setErrorMessage(message);
      notifyError(message);
    } finally {
      setIsRenewSubmitting(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pb-20 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[14%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-[960px]">
        <div className="rounded-[30px] border border-[#DDD3C7] bg-white/88 p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.88fr)]">
            <form onSubmit={handleLoginSubmit} className="rounded-[26px] border border-[#E2D8CC] bg-[#FCFAF7] p-5 sm:p-6">
              <SectionLabel>Giriş Yap</SectionLabel>

              <label className="block">
                <span className="mb-2.5 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#5B4F45]">
                  Kullanıcı Adı / Başvuru No
                </span>
                <input
                  className="min-h-[54px] w-full rounded-[18px] border border-[#D8CDC0] bg-white px-4 text-[15px] text-[#2F2621] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#8F8173] focus:border-[#4A7067]/55 focus:shadow-[0_0_0_4px_rgba(74,112,103,0.08)]"
                  value={loginApplicationNo}
                  onChange={(event) => setLoginApplicationNo(event.target.value.toUpperCase())}
                  placeholder="Örn. AD101895 veya 20260320-100001"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-2.5 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#5B4F45]">
                  Şifre
                </span>
                <input
                  className="min-h-[54px] w-full rounded-[18px] border border-[#D8CDC0] bg-white px-4 text-[15px] text-[#2F2621] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#8F8173] focus:border-[#4A7067]/55 focus:shadow-[0_0_0_4px_rgba(74,112,103,0.08)]"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  placeholder="SMS ile gelen şifre"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isLoginSubmitting}
                className="mt-5 inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoginSubmitting ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>

            <div className="rounded-[26px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-5 sm:p-6">
              <SectionLabel>Şifremi Yenile</SectionLabel>
              <h2 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] uppercase leading-[1.08] tracking-[0.03em] text-[#68232E] sm:text-[26px]">
                SMS gelmediyse tekrar gönderin
              </h2>
              <p className="mt-3 text-[14px] leading-[1.76] text-[#5B4F45] sm:text-[15px]">
                Kullanıcı adınız veya başvuru numaranız ve veli telefonunuz ile şifreyi kayıtlı numaraya tekrar gönderebilirsiniz.
              </p>

              <button
                type="button"
                onClick={() => {
                  setShowRenewFlow((current) => !current);
                  setErrorMessage('');
                  setRenewMessage('');
                }}
                className="mt-5 inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#D6CABC] bg-white px-5 py-3 text-[12px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-[#68232E] transition-colors duration-200 hover:bg-[#F8F2EA]"
              >
                {showRenewFlow ? 'Akışı Kapat' : 'Şifremi Yenile'}
              </button>

              {showRenewFlow ? (
                <form onSubmit={handleRenewSubmit} className="mt-5 border-t border-[#E2D8CC] pt-5">
                  <label className="block">
                    <span className="mb-2.5 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#5B4F45]">
                      Kullanıcı Adı / Başvuru No
                    </span>
                    <input
                      className="min-h-[52px] w-full rounded-[18px] border border-[#D8CDC0] bg-white px-4 text-[15px] text-[#2F2621] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#8F8173] focus:border-[#4A7067]/55 focus:shadow-[0_0_0_4px_rgba(74,112,103,0.08)]"
                      value={renewApplicationNo}
                      onChange={(event) => setRenewApplicationNo(event.target.value.toUpperCase())}
                      placeholder="Örn. AD101895 veya 20260320-100001"
                      required
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="mb-2.5 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#5B4F45]">
                      Veli Telefonu
                    </span>
                    <input
                      className="min-h-[52px] w-full rounded-[18px] border border-[#D8CDC0] bg-white px-4 text-[15px] text-[#2F2621] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#8F8173] focus:border-[#4A7067]/55 focus:shadow-[0_0_0_4px_rgba(74,112,103,0.08)]"
                      value={renewPhone}
                      onChange={(event) => setRenewPhone(normalizeTrMobileInput(event.target.value))}
                      placeholder="5XX XXX XX XX"
                      pattern={TR_MOBILE_PATTERN}
                      title={TR_MOBILE_TITLE}
                      inputMode="tel"
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isRenewSubmitting || isAutoRenewSubmitting || cooldownRemaining > 0}
                    className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#324D47] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(50,77,71,0.16)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-[#3D5E56] hover:shadow-[0_20px_38px_rgba(50,77,71,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRenewSubmitting
                      ? 'Gönderiliyor...'
                      : isAutoRenewSubmitting
                        ? 'Şifre Hazırlanıyor...'
                        : cooldownRemaining > 0
                          ? `Tekrar Gönder ${formatCooldown(cooldownRemaining)}`
                          : 'Şifreyi Tekrar Gönder'}
                  </button>

                  {cooldownRemaining > 0 ? (
                    <p className="mt-3 text-[13px] leading-[1.7] text-[#6A5A4F]">
                      Aynı başvuru için kısa süre içinde tekrar gönderim yapılamaz.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </div>
          </div>

          {renewMessage ? (
            <div className="mt-5 rounded-[20px] border border-[#CFE2D8] bg-[#F5FBF7] px-4 py-4 text-[14px] leading-[1.7] text-[#2E5B4F]">
              {renewMessage}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 rounded-[20px] border border-[#E5C8C1] bg-[#FFF7F5] px-4 py-4 text-[14px] leading-[1.7] text-[#8A3A32]">
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
