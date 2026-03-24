import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { renewCandidateCredentials } from '../api/examApi';
import { notifyError, notifySuccess } from '../lib/notifications';
import {
  getCredentialsResendRemainingSeconds,
  startCredentialsResendCooldown,
} from './bursluluk/credentialsResendCooldown';
import {
  readCandidateSession,
  saveCandidateSession,
  type BurslulukCandidateSession,
} from './bursluluk/burslulukFlowSession';

const technicalRequirements = [
  {
    number: '01',
    title: 'Güncel Tarayıcı',
    description: 'Chrome, Safari veya Edge’in güncel bir sürümünü kullanın.',
  },
  {
    number: '02',
    title: 'Stabil İnternet',
    description: 'Sınav boyunca kesintisiz bir bağlantı kullanmaya özen gösterin.',
  },
  {
    number: '03',
    title: 'Tek Cihaz, Tek Sekme',
    description: 'Sınav sırasında aynı oturumu tek cihaz ve tek sekme üzerinden sürdürün.',
  },
] as const;

const recommendations = [
  {
    number: '01',
    title: 'SMS Bilgilerini Kontrol Edin',
    description: 'Başvuru numaranız ve şifreniz geldiğinde aynı bilgilerle giriş yapın.',
  },
  {
    number: '02',
    title: 'SMS Ulaşmazsa Tekrar Gönderin',
    description: 'Bu ekrandaki tekrar gönder butonu yeni şifreyi kayıtlı telefona iletir.',
  },
  {
    number: '03',
    title: 'Sınavdan Önce Giriş Deneyin',
    description: 'Oturum saatinizden birkaç dakika önce giriş yaparak ekranınızı kontrol edin.',
  },
] as const;

function smsStatusLabel(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized || normalized === 'NOT_QUEUED') return 'Hazırlanıyor';
  if (normalized === 'QUEUED') return 'Kuyrukta';
  if (normalized === 'SENT') return 'Gönderildi';
  if (normalized === 'DELIVERED') return 'İletildi';
  if (normalized === 'READ') return 'Okundu';
  if (normalized === 'FAILED' || normalized === 'DLQ') return 'Tekrar Denenecek';
  return normalized;
}

function formatExamOpenAt(value: string | undefined) {
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

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 sm:mb-3 sm:gap-2.5">
      <span className="h-px w-9 bg-[#4A7067]/40 sm:w-10" />
      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#68232E]/56 sm:text-[10px] sm:tracking-[0.2em]">
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
      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.14em] text-[#4A7067] sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2.5 text-[15px] leading-[1.6] text-[#3E342D] sm:text-[16px] sm:leading-[1.62]">{value}</p>
    </div>
  );
}

function NumberedList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: ReadonlyArray<{ number: string; title: string; description: string }>;
}) {
  return (
    <div className="rounded-[28px] border border-[#DDD3C7] bg-white/84 p-5 shadow-[0_20px_48px_rgba(25,20,15,0.05)] sm:p-6 lg:p-7">
      <SectionLabel>{title}</SectionLabel>
      <p className="font-['Neutraface_2_Display:Titling',sans-serif] text-[20px] uppercase leading-[1.08] tracking-[0.022em] text-[#68232E] sm:text-[23px] lg:text-[24px]">
        {title}
      </p>
      <p className="mt-3 max-w-[56ch] text-[14px] leading-[1.72] text-[#5B4F45] sm:text-[15px] sm:leading-[1.76]">
        {subtitle}
      </p>

      <div className="mt-6 space-y-3.5 sm:mt-7">
        {items.map((item) => (
          <article
            key={`${title}-${item.number}`}
            className="grid grid-cols-[56px_1fr] gap-3 rounded-[22px] border border-[#E5DBCF] bg-[#FFFCF8] px-4 py-4 sm:grid-cols-[68px_1fr] sm:gap-4 sm:px-5"
          >
            <div className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] leading-none tracking-[0.015em] text-[#68232E]/16 sm:text-[30px]">
              {item.number}
            </div>
            <div>
              <h3 className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] uppercase tracking-[0.05em] text-[#68232E] sm:text-[15px]">
                {item.title}
              </h3>
              <p className="mt-2 text-[14px] leading-[1.68] text-[#5B4F45] sm:text-[15px] sm:leading-[1.74]">
                {item.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function updateStoredSession(
  current: BurslulukCandidateSession,
  patch: Partial<BurslulukCandidateSession>,
) {
  return saveCandidateSession({
    applicationNo: patch.applicationNo || current.applicationNo,
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
  });
}

export default function BurslulukOnayPage() {
  const [session, setSession] = useState<BurslulukCandidateSession | null>(() => readCandidateSession());
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(() =>
    getCredentialsResendRemainingSeconds(readCandidateSession()?.applicationNo || ''),
  );

  const sessionLabel = useMemo(
    () => (session ? session.selectedSessionLabel || formatExamOpenAt(session.examOpenAt) : 'Belirlenecek'),
    [session],
  );

  useEffect(() => {
    if (!session?.applicationNo) {
      setCooldownRemaining(0);
      return;
    }

    setCooldownRemaining(getCredentialsResendRemainingSeconds(session.applicationNo));
    const intervalId = window.setInterval(() => {
      setCooldownRemaining(getCredentialsResendRemainingSeconds(session.applicationNo));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [session?.applicationNo]);

  const handleResendCredentials = async () => {
    if (!session || isResending || cooldownRemaining > 0) return;

    setResendError('');
    setResendSuccess('');
    setIsResending(true);

    try {
      const response = await renewCandidateCredentials(session.sessionToken, {
        attemptId: session.attemptId,
      });

      const updated = updateStoredSession(session, {
        sessionToken: response.credentials.sessionToken,
        expiresAt: response.credentials.expiresAt,
        credentialsSmsStatus: response.credentials.credentialsSmsStatus,
        parentPhoneE164: response.credentials.phone,
      });

      setSession(updated);
      startCredentialsResendCooldown(updated.applicationNo);
      setCooldownRemaining(getCredentialsResendRemainingSeconds(updated.applicationNo));
      setResendSuccess('Şifre tekrar SMS olarak gönderildi.');
      notifySuccess('Şifre tekrar SMS olarak gönderildi.');
    } catch (error) {
      const message = normalizeError(error, 'Şifre tekrar gönderilemedi.');
      setResendError(message);
      notifyError(message);
    } finally {
      setIsResending(false);
    }
  };

  if (!session) {
    return (
      <section className="relative min-h-screen overflow-hidden bg-[#F7F3ED] px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.72),transparent_34%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_42%,#F1E9DE_100%)]" />
        <div className="relative mx-auto max-w-[860px] rounded-[30px] border border-[#DDD3C7] bg-white/86 p-6 shadow-[0_24px_64px_rgba(25,20,15,0.08)] sm:p-8">
          <SectionLabel>Başvuru Onayı</SectionLabel>
          <h1 className="max-w-[12ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-[1.02] tracking-[0.018em] text-[#68232E] sm:text-[34px]">
            Onay ekranına ulaşılamadı
          </h1>
          <p className="mt-4 max-w-[42ch] text-[15px] leading-[1.72] text-[#5B4F45] sm:text-[16px] sm:leading-[1.76]">
            Aday oturumu bulunamadı. Lütfen yeniden başvuru yapın ya da mevcut bilgilerinizle giriş ekranına dönün.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/bursluluk-2026"
              className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition-[background-color,box-shadow] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)] sm:min-h-[52px]"
            >
              Başvuruya Dön
            </Link>
            <Link
              to="/bursluluk/giris"
              className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-[#D6CABC] bg-white px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-[#68232E] transition-colors duration-200 hover:bg-[#F8F2EA] sm:min-h-[52px]"
            >
              Giriş Yap
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
      <div className="pointer-events-none absolute bottom-[14%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <div className="relative mx-auto max-w-[1240px] space-y-6 sm:space-y-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.04fr)_minmax(360px,0.96fr)]">
          <div className="rounded-[30px] border border-[#DDD3C7] bg-white/84 p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
            <SectionLabel>Başvuru Onayı</SectionLabel>
            <h1 className="max-w-[11ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-[0.98] tracking-[0.016em] text-[#68232E] sm:text-[34px] lg:text-[40px]">
              Başvurunuz Alındı
            </h1>
            <p className="mt-4 max-w-[37rem] text-[15px] leading-[1.72] text-[#5B4F45] sm:max-w-[38ch] sm:text-[16px] sm:leading-[1.76]">
              Başvuru numaranız oluşturuldu. SMS ile gelen kullanıcı adı ve şifre bilgileriyle giriş yapabilirsiniz.
            </p>

            <div className="mt-6 grid gap-3 sm:mt-7 sm:grid-cols-2">
              <SummaryCard label="Başvuru No" value={session.applicationNo} />
              <SummaryCard label="SMS Durumu" value={smsStatusLabel(session.credentialsSmsStatus)} />
              <SummaryCard label="Öğrenci" value={session.studentFullName} />
              <SummaryCard label="Oturum" value={sessionLabel} />
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/bursluluk/giris"
                className="inline-flex min-h-[50px] items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.14)] transition-[background-color,box-shadow] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.2)] sm:min-h-[52px] sm:px-8"
              >
                Giriş Yap
              </Link>
              <button
                type="button"
                onClick={() => void handleResendCredentials()}
                disabled={isResending || cooldownRemaining > 0}
                className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-[#D6CABC] bg-white px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-[#68232E] transition-[background-color,opacity] duration-200 hover:bg-[#F8F2EA] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[52px] sm:px-8"
              >
                {isResending
                  ? 'Gönderiliyor...'
                  : cooldownRemaining > 0
                    ? `Tekrar Gönder ${formatCooldown(cooldownRemaining)}`
                    : 'Şifreyi Tekrar Gönder'}
              </button>
            </div>

            {cooldownRemaining > 0 ? (
              <p className="mt-4 max-w-[42ch] text-[13px] leading-[1.62] text-[#6A5A4F]">
                Aynı başvuru için tekrar gönderim kısa süreli olarak bekletiliyor.
              </p>
            ) : null}

            {resendSuccess ? (
              <div className="mt-4 rounded-[20px] border border-[#CFE2D8] bg-[#F5FBF7] px-4 py-4 text-[14px] leading-[1.7] text-[#2E5B4F]">
                {resendSuccess}
              </div>
            ) : null}

            {resendError ? (
              <div className="mt-4 rounded-[20px] border border-[#E5C8C1] bg-[#FFF7F5] px-4 py-4 text-[14px] leading-[1.7] text-[#8A3A32]">
                {resendError}
              </div>
            ) : null}
          </div>

          <div className="rounded-[30px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F5EDE3_100%)] p-5 shadow-[0_24px_58px_rgba(25,20,15,0.06)] sm:p-7 lg:p-8">
            <SectionLabel>Sonraki Adım</SectionLabel>
            <h2 className="max-w-[14ch] font-['Neutraface_2_Display:Titling',sans-serif] text-[21px] uppercase leading-[1.05] tracking-[0.02em] text-[#68232E] sm:text-[24px] lg:text-[28px]">
              SMS ile gelen bilgilerle giriş yapın.
            </h2>
            <p className="mt-4 max-w-[38ch] text-[15px] leading-[1.72] text-[#5B4F45] sm:text-[15px] sm:leading-[1.76]">
              Kullanıcı adı ve şifre bilginiz geldiğinde giriş ekranından devam edebilirsiniz. SMS ulaşmadıysa bu ekrandan tekrar gönderim yapabilirsiniz.
            </p>

            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-[52px_1fr] gap-3 rounded-[22px] border border-[#E2D8CC] bg-white/82 px-4 py-4 sm:grid-cols-[58px_1fr] sm:px-5">
                <p className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] leading-none tracking-[0.015em] text-[#68232E]/16 sm:text-[26px]">
                  01
                </p>
                <p className="text-[15px] leading-[1.6] text-[#5B4F45]">
                  Başvuru numaranızı not edin.
                </p>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-3 rounded-[22px] border border-[#E2D8CC] bg-white/82 px-4 py-4 sm:grid-cols-[58px_1fr] sm:px-5">
                <p className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] leading-none tracking-[0.015em] text-[#68232E]/16 sm:text-[26px]">
                  02
                </p>
                <p className="text-[15px] leading-[1.6] text-[#5B4F45]">
                  Şifre SMS ile gelmezse tekrar gönder butonunu kullanın.
                </p>
              </div>
              <div className="grid grid-cols-[52px_1fr] gap-3 rounded-[22px] border border-[#E2D8CC] bg-white/82 px-4 py-4 sm:grid-cols-[58px_1fr] sm:px-5">
                <p className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] leading-none tracking-[0.015em] text-[#68232E]/16 sm:text-[26px]">
                  03
                </p>
                <p className="text-[15px] leading-[1.6] text-[#5B4F45]">
                  Giriş yaptıktan sonra sınav saatini bekleyin.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <NumberedList
            title="Teknik Gereksinimler"
            subtitle="Sınava sorunsuz katılım için aşağıdaki temel teknik koşulları hazır bulundurmanız önerilir."
            items={technicalRequirements}
          />
          <NumberedList
            title="Tavsiyeler"
            subtitle="Sınav gününde daha rahat bir deneyim için bu kısa hazırlıkları önceden tamamlayabilirsiniz."
            items={recommendations}
          />
        </div>
      </div>
    </section>
  );
}
