import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { startExamSession } from '../api/examApi';
import { getAttributionSubmissionPayload } from '../lib/analytics';
import { useLiteMode } from '../lib/useLiteMode';
import {
  deriveAgeRangeFromGrade,
  normalizeGrade,
  resolveDefaultExamOpenAt,
  saveCandidateSession,
} from './bursluluk/burslulukFlowSession';
import { KONYA_SCHOOL_CATALOG } from './bursluluk/konyaSchoolCatalog';
import { savePlacementExamLead } from './exam/placementExamSession';
import { isValidTrMobilePhone, normalizeTrMobileInput, TR_MOBILE_PATTERN, TR_MOBILE_TITLE } from './phoneUtils';

const revealEase = [0.22, 1, 0.36, 1] as const;
const trustBadges = ['Ücretsiz', 'MEB Onaylı', 'Online'] as const;
const CAMPAIGN_CODE = String(import.meta.env.VITE_BURSLULUK_CAMPAIGN_CODE || '2026_BURSLULUK').trim();
const QUESTION_COUNT = Number(import.meta.env.VITE_BURSLULUK_QUESTION_COUNT || 40) || 40;
const CONSENT_VERSION = 'KVKK_v1_2026-03-13';
const APPLICATION_LANGUAGE = 'en';
const FORM_GRADES = Array.from({ length: 12 }, (_, index) => index + 1);

const structureBlocks = [
  {
    number: '01',
    title: 'Katılım',
    description: 'Sınava katılan her öğrenci burs avantajı ile sürece başlar.',
  },
  {
    number: '02',
    title: 'Başarı',
    description: 'Net yükseldikçe burs oranı daha güçlü hale gelir.',
  },
  {
    number: '03',
    title: 'Derece',
    description: 'Sınıf dereceleri en yüksek burs oranlarına ulaşır.',
  },
] as const;

const scholarshipRows = [
  {
    percentage: '%100',
    category: 'Derece Bursu',
    condition: 'Her sınıf düzeyinde 1. olan toplam 10 öğrenci',
  },
  {
    percentage: '%80',
    category: 'Derece Bursu',
    condition: 'Her sınıf düzeyinde 2. olan toplam 10 öğrenci',
  },
  {
    percentage: '%70',
    category: 'Derece Bursu',
    condition: 'Her sınıf düzeyinde 3. ve 4. olan toplam 20 öğrenci',
  },
  {
    percentage: '%60',
    category: 'Başarı Bursu',
    condition: 'Başarı oranı %90 ve üzeri',
  },
  {
    percentage: '%50',
    category: 'Başarı Bursu',
    condition: 'Başarı oranı %80 ve üzeri',
  },
  {
    percentage: '%40',
    category: 'Başarı Bursu',
    condition: 'Başarı oranı %70 ve üzeri',
  },
  {
    percentage: '%20',
    category: 'Katılım Bursu',
    condition: 'Sınava katılan her öğrenci',
  },
] as const;

const scheduleGroups = [
  {
    date: '28 Mart 2026',
    sessions: [
      { number: '01', time: '10:00-11:00', grade: '1.2.3.4. Sınıflar', level: 'İlkokul' },
      { number: '02', time: '13:00-14:00', grade: '5.6.7.8. Sınıflar', level: 'Ortaokul' },
    ],
  },
  {
    date: '29 Mart 2026',
    sessions: [
      { number: '01', time: '13:00-14:00', grade: '9.10.11.12. Sınıflar', level: 'Lise' },
    ],
  },
] as const;

const processSteps = [
  'Formu doldur ve sınıfına uygun oturumu seç.',
  'Giriş bilgilerin SMS ile tarafına iletilsin.',
  'Sonuç açıklandığında aynı bilgilerle sonucunu görüntüle.',
] as const;

const faqItems = [
  {
    question: 'Sınav ücretli mi?',
    answer: 'Hayır. Başvuru ve katılım tamamen ücretsizdir.',
  },
  {
    question: 'Kimler katılabilir?',
    answer: 'Konya genelinde 1-12. sınıfta öğrenim gören tüm öğrenciler katılabilir.',
  },
  {
    question: 'Sınav kaç dakika sürüyor?',
    answer: 'Sınav süresi 60 dakikadır. Soru sayısı sınıf kademesine göre değişebilir.',
  },
  {
    question: 'Başvuru sonrası ne oluyor?',
    answer:
      'Başvurun tamamlanınca kullanıcı adı, şifre ve sınav giriş bilgin oluşturulur. Süreç SMS ile de paylaşılır.',
  },
  {
    question: 'Sonuçlar hemen açıklanacak mı?',
    answer:
      'Hayır. Sonuçlar belirlenen açıklama anında toplu SMS ile duyurulacak ve aynı kullanıcı adı-şifre ile görüntülenecek.',
  },
  {
    question: 'Bağlantım koparsa ne olacak?',
    answer:
      'Yanıtların otomatik kaydedilir. Yeniden giriş yaptığında uygun olduğu durumda kaldığın yerden devam edebilirsin.',
  },
  {
    question: 'Burs oranları toplanıyor mu?',
    answer: 'Hayır. Katılım, başarı ve derece avantajlarından yalnızca en yüksek oran uygulanır.',
  },
] as const;

type ApplicationSessionOption = {
  id: string;
  label: string;
  detail: string;
  examOpenAt: string;
  grades: number[];
};

const APPLICATION_SESSION_OPTIONS: ApplicationSessionOption[] = [
  {
    id: '2026-03-28-1000',
    label: '28 Mart 2026 • 10:00-11:00',
    detail: '1. 2. 3. 4. sınıflar',
    examOpenAt: '2026-03-28T10:00:00+03:00',
    grades: [1, 2, 3, 4],
  },
  {
    id: '2026-03-28-1300',
    label: '28 Mart 2026 • 13:00-14:00',
    detail: '5. 6. 7. 8. sınıflar',
    examOpenAt: '2026-03-28T13:00:00+03:00',
    grades: [5, 6, 7, 8],
  },
  {
    id: '2026-03-29-1300',
    label: '29 Mart 2026 • 13:00-14:00',
    detail: '9. 10. 11. 12. sınıflar',
    examOpenAt: '2026-03-29T13:00:00+03:00',
    grades: [9, 10, 11, 12],
  },
];

type ApplicationFormState = {
  schoolName: string;
  studentFullName: string;
  tckn: string;
  birthYear: string;
  parentFullName: string;
  parentPhone: string;
  grade: string;
  branch: string;
  sessionId: string;
  parentEmail: string;
  kvkkConsent: boolean;
};

type ApplicationFormErrors = Partial<Record<keyof ApplicationFormState, string>>;

const initialFormState: ApplicationFormState = {
  schoolName: '',
  studentFullName: '',
  tckn: '',
  birthYear: '',
  parentFullName: '',
  parentPhone: '',
  grade: '',
  branch: '',
  sessionId: '',
  parentEmail: '',
  kvkkConsent: false,
};

function sectionReveal(liteMode: boolean, delay = 0) {
  if (liteMode) return {};
  return {
    initial: { opacity: 0, y: 26 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: 0.56, delay, ease: revealEase },
  };
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

const SCHOOL_SEARCH_INDEX = KONYA_SCHOOL_CATALOG.map((item) => ({
  item,
  exact: normalizeSearchText(item.name),
  haystack: normalizeSearchText(`${item.name} ${item.type} ${item.district}`),
}));

function resolveApplicationSessions(gradeValue: number | null) {
  if (!gradeValue) return [];
  return APPLICATION_SESSION_OPTIONS.filter((option) => option.grades.includes(gradeValue));
}

function normalizeTcknInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

function isValidTckn(value: string) {
  if (!/^\d{11}$/.test(value)) return false;
  if (value.startsWith('0')) return false;

  const digits = value.split('').map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const tenthDigit = ((oddSum * 7 - evenSum) % 10 + 10) % 10;
  const eleventhDigit = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;

  return tenthDigit === digits[9] && eleventhDigit === digits[10];
}

function normalizeBirthYearInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function isValidBirthYear(value: string) {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  return year >= currentYear - 25 && year <= currentYear;
}

function normalizeBranchInput(value: string) {
  return value
    .toLocaleUpperCase('tr-TR')
    .replace(/[^0-9A-ZÇĞİÖŞÜ/-]/g, '')
    .slice(0, 6);
}

function toE164FromTrMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  return `+90${digits}`;
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
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

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-[760px]">
      <h2 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] uppercase leading-[1.06] tracking-[0.035em] text-[#68232E] sm:text-[26px] lg:text-[34px]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3.5 max-w-[64ch] text-[15px] leading-[1.76] text-[#5B4F45] sm:mt-4 sm:text-[16px] sm:leading-[1.8]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function FieldLabel({ children, optional = false }: { children: string; optional?: boolean }) {
  return (
    <span className="mb-2.5 block font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.16em] text-[#5B4F45]">
      {children}
      {optional ? <span className="ml-2 text-[#8C7E71]/80">Opsiyonel</span> : null}
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-[12px] leading-[1.65] text-[#A03A30]">{message}</p>;
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function Bursluluk2026Page() {
  const navigate = useNavigate();
  const liteMode = useLiteMode();

  const [openFaq, setOpenFaq] = useState(0);
  const [isApplicationOpen, setIsApplicationOpen] = useState(false);
  const [form, setForm] = useState<ApplicationFormState>(initialFormState);
  const [formErrors, setFormErrors] = useState<ApplicationFormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActivatedVideo, setHasActivatedVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef(false);

  const schoolQuery = normalizeSearchText(form.schoolName);
  const gradeValue = form.grade ? Number(form.grade) : null;

  const schoolSuggestions = useMemo(() => {
    if (schoolQuery.length < 2) return [];
    return SCHOOL_SEARCH_INDEX.filter((entry) => entry.haystack.includes(schoolQuery))
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [schoolQuery]);

  const matchedSchool = useMemo(
    () => SCHOOL_SEARCH_INDEX.find((entry) => entry.exact === schoolQuery)?.item ?? null,
    [schoolQuery],
  );

  const sessionOptions = useMemo(() => resolveApplicationSessions(gradeValue), [gradeValue]);
  const selectedSession =
    APPLICATION_SESSION_OPTIONS.find((option) => option.id === form.sessionId) || null;
  const videoProgress = videoDuration > 0 ? Math.min((currentVideoTime / videoDuration) * 100, 100) : 0;

  useEffect(() => {
    if (!sessionOptions.length) {
      if (form.sessionId) {
        setForm((prev) => ({ ...prev, sessionId: '' }));
      }
      return;
    }

    if (!sessionOptions.some((option) => option.id === form.sessionId)) {
      setForm((prev) => ({ ...prev, sessionId: sessionOptions[0]?.id || '' }));
    }
  }, [form.sessionId, sessionOptions]);

  useEffect(() => {
    if (!isApplicationOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isApplicationOpen]);

  useEffect(() => {
    if (!isApplicationOpen || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsApplicationOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isApplicationOpen]);

  const openApplicationForm = () => {
    setIsApplicationOpen(true);
  };
  const closeApplicationForm = () => setIsApplicationOpen(false);

  const clearFieldError = (field: keyof ApplicationFormState) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (!hasActivatedVideo) {
        setHasActivatedVideo(true);
        video.loop = false;
      }
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
  };

  const toggleMute = async () => {
    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);

    if (!nextMuted && !hasActivatedVideo) {
      setHasActivatedVideo(true);
      video.loop = false;
    }
  };

  const handleVideoMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
  };

  const markVideoReady = () => {
    setIsVideoReady(true);
  };

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentVideoTime(video.currentTime || 0);
  };

  const handleVideoSeek = (nextTime: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = nextTime;
    setCurrentVideoTime(nextTime);
  };

  const handleVideoSeekFromClientX = (clientX: number) => {
    const video = videoRef.current;
    const track = progressTrackRef.current;
    if (!video || !track || videoDuration <= 0) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const nextTime = ratio * videoDuration;
    video.currentTime = nextTime;
    setCurrentVideoTime(nextTime);
  };

  const handleVideoProgressPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (videoDuration <= 0) return;
    isSeekingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    handleVideoSeekFromClientX(event.clientX);
  };

  const handleVideoProgressPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSeekingRef.current) return;
    handleVideoSeekFromClientX(event.clientX);
  };

  const handleVideoProgressPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isSeekingRef.current = false;
  };

  const handleVideoProgressKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (videoDuration <= 0) return;

    let nextTime = currentVideoTime;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        nextTime = Math.max(currentVideoTime - 5, 0);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        nextTime = Math.min(currentVideoTime + 5, videoDuration);
        break;
      case 'Home':
        nextTime = 0;
        break;
      case 'End':
        nextTime = videoDuration;
        break;
      default:
        return;
    }

    event.preventDefault();
    handleVideoSeek(nextTime);
  };

  const handleApplicationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError('');

    const normalizedPhone = normalizeTrMobileInput(form.parentPhone);
    const nextErrors: ApplicationFormErrors = {};

    if (!form.schoolName.trim()) nextErrors.schoolName = 'Okul bilgisi zorunludur.';
    if (!form.studentFullName.trim()) nextErrors.studentFullName = 'Öğrenci adı soyadı zorunludur.';
    if (!isValidTckn(form.tckn)) nextErrors.tckn = 'TC Kimlik No 11 haneli geçerli bir değer olmalıdır.';
    if (!isValidBirthYear(form.birthYear)) nextErrors.birthYear = 'Doğum yılı 4 haneli bir değer olmalıdır.';
    if (!form.parentFullName.trim()) nextErrors.parentFullName = 'Veli adı soyadı zorunludur.';
    if (!isValidTrMobilePhone(normalizedPhone)) nextErrors.parentPhone = TR_MOBILE_TITLE;
    if (!form.grade) nextErrors.grade = 'Sınıf seçimi zorunludur.';
    if (!form.branch.trim()) nextErrors.branch = 'Şube bilgisi zorunludur.';
    if (!form.sessionId) nextErrors.sessionId = 'Oturum seçimi zorunludur.';
    if (form.parentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(form.parentEmail.trim())) {
      nextErrors.parentEmail = 'Geçerli bir e-posta adresi giriniz.';
    }
    if (!form.kvkkConsent) nextErrors.kvkkConsent = 'Başvuruyu tamamlamak için KVKK onayı gereklidir.';

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setIsApplicationOpen(true);
      openApplicationForm();
      return;
    }

    setIsSubmitting(true);

    try {
      const normalizedGrade = normalizeGrade(Number(form.grade));
      const ageRange = deriveAgeRangeFromGrade(normalizedGrade);
      const parentPhoneE164 = toE164FromTrMobile(normalizedPhone);
      const examOpenAt = selectedSession?.examOpenAt || resolveDefaultExamOpenAt();
      const attribution = getAttributionSubmissionPayload();

      const response = await startExamSession({
        studentFullName: form.studentFullName.trim(),
        parentFullName: form.parentFullName.trim(),
        identityNo: form.tckn,
        birthYear: Number(form.birthYear),
        parentPhoneE164,
        parentEmail: form.parentEmail.trim() || undefined,
        schoolName: form.schoolName.trim(),
        grade: normalizedGrade,
        section: form.branch.trim(),
        selectedExamAt: selectedSession?.examOpenAt || undefined,
        ageRange,
        language: APPLICATION_LANGUAGE,
        source: 'bursluluk_2026_landing_form',
        campaignCode: CAMPAIGN_CODE,
        questionCount: QUESTION_COUNT,
        attribution: attribution,
        consent: {
          kvkkApproved: true,
          contactConsent: false,
          consentVersion: CONSENT_VERSION,
          legalTextVersion: CONSENT_VERSION,
          source: 'bursluluk_landing_form_web',
        },
      });

      const session = response.session;
      saveCandidateSession({
        applicationNo: session.applicationNo,
        attemptId: session.attemptId,
        sessionToken: session.sessionToken,
        candidateId: session.candidateId,
        expiresAt: session.expiresAt,
        startedAt: session.startedAt,
        credentialsSmsStatus: session.credentialsSmsStatus,
        consentVersion: session.consentVersion,
        studentFullName: form.studentFullName.trim(),
        parentFullName: form.parentFullName.trim(),
        parentPhoneE164,
        parentEmail: form.parentEmail.trim() || undefined,
        schoolName: form.schoolName.trim(),
        schoolDistrict: matchedSchool?.district || undefined,
        schoolType: matchedSchool?.type || undefined,
        grade: normalizedGrade,
        tckn: form.tckn,
        birthYear: form.birthYear,
        branch: form.branch.trim(),
        selectedSessionId: form.sessionId,
        selectedSessionLabel: selectedSession?.label || undefined,
        ageRange,
        language: APPLICATION_LANGUAGE,
        questionCount: QUESTION_COUNT,
        campaignCode: CAMPAIGN_CODE,
        examOpenAt,
      });

      savePlacementExamLead({
        fullName: form.studentFullName.trim(),
        phone: normalizedPhone,
        email: form.parentEmail.trim(),
        age: ageRange,
        language: APPLICATION_LANGUAGE,
        source: 'bursluluk_2026_landing_form',
        kvkkConsent: true,
        contactConsent: false,
        kvkkConsentVersion: CONSENT_VERSION,
        kvkkLegalTextVersion: CONSENT_VERSION,
        consentCapturedAt: new Date().toISOString(),
      });

      navigate('/bursluluk/onay');
    } catch (error) {
      setSubmitError(normalizeError(error, 'Başvuru kaydı başarısız oldu. Lütfen tekrar deneyin.'));
      openApplicationForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const videoStatusLabel = hasActivatedVideo ? (isMuted ? 'Sessiz İzleme' : 'Sesli İzleme') : 'Video Hazır';
  const playbackButtonLabel = isPlaying ? 'Durdur' : 'Başlat';
  const primaryCtaClass =
    "inline-flex min-h-[50px] items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(231,0,0,0.16)] transition-[background-color,box-shadow] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_34px_rgba(231,0,0,0.22)] sm:min-h-[52px] sm:px-8 sm:py-4 sm:text-[13px] sm:tracking-[0.18em]";
  const inputClass =
    "h-14 w-full rounded-[18px] border border-[#DDD1C4] bg-[#FFFCF8] px-4 text-[16px] text-[#2B241E] outline-none transition-colors duration-200 placeholder:text-[#9C8D7D] focus:border-[#B94A39] focus:bg-white";
  const selectClass =
    "h-14 w-full rounded-[18px] border border-[#DDD1C4] bg-[#FFFCF8] px-4 text-[16px] text-[#2B241E] outline-none transition-colors duration-200 focus:border-[#B94A39] focus:bg-white";
  const applicationFormDialog = (
    <AnimatePresence initial={false}>
      {isApplicationOpen ? (
        <motion.div
          initial={liteMode ? undefined : { opacity: 0 }}
          animate={liteMode ? undefined : { opacity: 1 }}
          exit={liteMode ? undefined : { opacity: 0 }}
          transition={{ duration: liteMode ? 0 : 0.2, ease: revealEase }}
          className="fixed inset-0 z-[95] bg-[#1E1712]/36 backdrop-blur-[3px]"
          onClick={closeApplicationForm}
        >
          <div className="flex min-h-[100svh] items-end justify-center px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-[76px] sm:min-h-full sm:items-center sm:px-6 sm:py-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="bursluluk-application-title"
              initial={liteMode ? undefined : { opacity: 0, y: 28, scale: 0.985 }}
              animate={liteMode ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={liteMode ? undefined : { opacity: 0, y: 18, scale: 0.99 }}
              transition={{ duration: liteMode ? 0 : 0.26, ease: revealEase }}
              onClick={(event) => event.stopPropagation()}
              className="relative flex max-h-[calc(100svh-1.5rem-env(safe-area-inset-bottom))] w-full max-w-[1080px] flex-col overflow-hidden rounded-t-[30px] border border-[#DDD2C5] bg-[#F8F4EE] shadow-[0_32px_90px_rgba(25,20,15,0.18)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[34px]"
            >
              <div className="border-b border-[#E4D8CA] bg-[linear-gradient(180deg,#FCF8F2_0%,#F6EFE6_100%)] px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2.5 sm:gap-3">
                      <span className="h-px w-10 bg-[#4A7067]/44 sm:w-12" />
                      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.22em] text-[#68232E]/58 sm:text-[11px] sm:tracking-[0.24em]">
                        Başvuru Formu
                      </span>
                    </div>
                    <h2
                      id="bursluluk-application-title"
                      className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] uppercase leading-[1.06] tracking-[0.035em] text-[#68232E] sm:text-[26px] lg:text-[32px]"
                    >
                      Bilgileri doldur ve oturumunu seç.
                    </h2>
                    <p className="mt-2 max-w-[62ch] text-[14px] leading-[1.72] text-[#5B4F45] sm:text-[15px] sm:leading-[1.8]">
                      Veli e-posta alanı isteğe bağlıdır. Diğer tüm alanlar zorunludur.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeApplicationForm}
                    aria-label="Başvuru formunu kapat"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#D8CDC0] bg-white text-[#68232E] transition-colors duration-200 hover:bg-[#F7F1E8]"
                  >
                    <X size={18} strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-8 lg:pb-8">
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleApplicationSubmit}>
                  <label className="block sm:col-span-2">
                    <FieldLabel>Okul</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.schoolName}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, schoolName: event.target.value }));
                        clearFieldError('schoolName');
                        setSubmitError('');
                      }}
                      placeholder="Okul adını yazın"
                      autoComplete="organization"
                      autoFocus
                    />
                    <p className="mt-2 text-[12px] leading-[1.65] text-[#7A6B5F]">
                      Listede yoksa okul adını manuel olarak yazabilirsiniz.
                    </p>
                    {schoolQuery.length >= 2 && !matchedSchool && schoolSuggestions.length > 0 ? (
                      <div className="mt-3 space-y-2 rounded-[20px] border border-[#E4D9CC] bg-[#FCFAF7] p-2">
                        {schoolSuggestions.map((item) => (
                          <button
                            key={`${item.name}-${item.district}`}
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, schoolName: item.name }));
                              clearFieldError('schoolName');
                              setSubmitError('');
                            }}
                            className="flex w-full items-start justify-between gap-3 rounded-[16px] px-3 py-3 text-left transition-colors duration-200 hover:bg-white"
                          >
                            <span className="text-[14px] leading-[1.6] text-[#392F28]">{item.name}</span>
                            <span className="shrink-0 pt-0.5 text-[11px] uppercase tracking-[0.14em] text-[#4A7067]">
                              {item.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {schoolQuery.length >= 2 && !matchedSchool && schoolSuggestions.length === 0 ? (
                      <p className="mt-3 rounded-[16px] border border-dashed border-[#D5C8BB] bg-[#FCFAF7] px-4 py-3 text-[13px] leading-[1.65] text-[#6E6054]">
                        Listede eşleşen okul bulunamadı. Yazdığınız okul adıyla başvuruya devam edebilirsiniz.
                      </p>
                    ) : null}
                    {matchedSchool ? (
                      <p className="mt-3 inline-flex min-h-[38px] items-center rounded-full border border-[#D8CDC0] bg-[#FBF7F1] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[#4A7067]">
                        {matchedSchool.district} • {matchedSchool.type}
                      </p>
                    ) : null}
                    <FieldError message={formErrors.schoolName} />
                  </label>

                  <label className="block sm:col-span-2">
                    <FieldLabel>Öğrenci Adı Soyadı</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.studentFullName}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, studentFullName: event.target.value }));
                        clearFieldError('studentFullName');
                        setSubmitError('');
                      }}
                      placeholder="Öğrenci adı soyadı"
                      autoComplete="name"
                    />
                    <FieldError message={formErrors.studentFullName} />
                  </label>

                  <label className="block">
                    <FieldLabel>TC Kimlik No</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.tckn}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, tckn: normalizeTcknInput(event.target.value) }));
                        clearFieldError('tckn');
                        setSubmitError('');
                      }}
                      placeholder="11 hane"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <FieldError message={formErrors.tckn} />
                  </label>

                  <label className="block">
                    <FieldLabel>Doğum Yılı</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.birthYear}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, birthYear: normalizeBirthYearInput(event.target.value) }));
                        clearFieldError('birthYear');
                        setSubmitError('');
                      }}
                      placeholder="2014"
                      inputMode="numeric"
                      autoComplete="bday-year"
                    />
                    <FieldError message={formErrors.birthYear} />
                  </label>

                  <label className="block sm:col-span-2">
                    <FieldLabel>Veli Ad Soyad</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.parentFullName}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, parentFullName: event.target.value }));
                        clearFieldError('parentFullName');
                        setSubmitError('');
                      }}
                      placeholder="Veli adı soyadı"
                      autoComplete="name"
                    />
                    <FieldError message={formErrors.parentFullName} />
                  </label>

                  <label className="block">
                    <FieldLabel>Veli Telefon</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.parentPhone}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, parentPhone: normalizeTrMobileInput(event.target.value) }));
                        clearFieldError('parentPhone');
                        setSubmitError('');
                      }}
                      placeholder="5XX XXX XX XX"
                      inputMode="tel"
                      autoComplete="tel"
                      pattern={TR_MOBILE_PATTERN}
                      title={TR_MOBILE_TITLE}
                    />
                    <FieldError message={formErrors.parentPhone} />
                  </label>

                  <label className="block">
                    <FieldLabel optional>Veli E-Posta</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.parentEmail}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, parentEmail: event.target.value }));
                        clearFieldError('parentEmail');
                        setSubmitError('');
                      }}
                      placeholder="veli@example.com"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                    />
                    <FieldError message={formErrors.parentEmail} />
                  </label>

                  <label className="block">
                    <FieldLabel>Sınıf</FieldLabel>
                    <select
                      className={selectClass}
                      value={form.grade}
                      onChange={(event) => {
                        setForm((prev) => ({
                          ...prev,
                          grade: event.target.value,
                          sessionId: '',
                        }));
                        clearFieldError('grade');
                        clearFieldError('sessionId');
                        setSubmitError('');
                      }}
                    >
                      <option value="">Sınıf seçin</option>
                      {FORM_GRADES.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}. Sınıf
                        </option>
                      ))}
                    </select>
                    <FieldError message={formErrors.grade} />
                  </label>

                  <label className="block">
                    <FieldLabel>Şube</FieldLabel>
                    <input
                      className={inputClass}
                      value={form.branch}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, branch: normalizeBranchInput(event.target.value) }));
                        clearFieldError('branch');
                        setSubmitError('');
                      }}
                      placeholder="A"
                      autoComplete="off"
                    />
                    <FieldError message={formErrors.branch} />
                  </label>

                  <label className="block sm:col-span-2">
                    <FieldLabel>Oturum</FieldLabel>
                    <select
                      className={selectClass}
                      value={form.sessionId}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, sessionId: event.target.value }));
                        clearFieldError('sessionId');
                        setSubmitError('');
                      }}
                      disabled={!form.grade}
                    >
                      <option value="">{form.grade ? 'Oturum seçin' : 'Önce sınıf seçin'}</option>
                      {sessionOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedSession ? (
                      <p className="mt-2 text-[12px] leading-[1.65] text-[#6D6054]">
                        Uygun grup: {selectedSession.detail}
                      </p>
                    ) : null}
                    <FieldError message={formErrors.sessionId} />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="flex items-start gap-3 rounded-[20px] border border-[#E4D9CC] bg-[#FCFAF7] px-4 py-4">
                      <input
                        type="checkbox"
                        checked={form.kvkkConsent}
                        onChange={(event) => {
                          setForm((prev) => ({ ...prev, kvkkConsent: event.target.checked }));
                          clearFieldError('kvkkConsent');
                          setSubmitError('');
                        }}
                        className="mt-1 h-4 w-4 rounded border-[#C9BCAD] text-[#68232E] focus:ring-[#68232E]"
                      />
                      <span className="text-[13px] leading-[1.7] text-[#5B4F45]">
                        KVKK aydınlatma ve açık rıza metnini okudum, başvuru için onay veriyorum.
                      </span>
                    </span>
                    <FieldError message={formErrors.kvkkConsent} />
                  </label>

                  {submitError ? (
                    <div className="sm:col-span-2 rounded-[20px] border border-[#E0B7AE] bg-[#FFF5F2] px-4 py-3 text-[13px] leading-[1.7] text-[#8D3326]">
                      {submitError}
                    </div>
                  ) : null}

                  <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[12px] leading-[1.7] text-[#74675A]">
                      Başvuruyu tamamladığında sınav giriş bilgilerin SMS ile iletilir.
                    </p>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`${primaryCtaClass} w-full disabled:cursor-not-allowed disabled:bg-[#C7B8A8] disabled:text-white/88 sm:w-auto`}
                    >
                      {isSubmitting ? 'Başvuru Kaydediliyor...' : 'Başvuruyu tamamla'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="relative overflow-hidden bg-[#F7F3ED] text-[#1F1C19]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,235,209,0.76),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(74,112,103,0.06),transparent_26%),linear-gradient(180deg,#FBF8F3_0%,#F5EFE7_28%,#F7F3ED_54%,#F1E9DE_100%)]" />
      <div className="pointer-events-none absolute left-[-8%] top-[8%] h-72 w-72 rounded-full bg-[#F4EBD1]/80 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[14%] right-[-10%] h-80 w-80 rounded-full bg-[#324D47]/[0.06] blur-3xl" />

      <main className="relative">
        <section id="home" className="px-4 pb-10 pt-[112px] sm:px-6 sm:pb-12 sm:pt-[130px] lg:px-10 lg:pb-14 lg:pt-[150px]">
          <div className="mx-auto grid max-w-[1280px] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:items-center lg:gap-16">
            <motion.div {...sectionReveal(liteMode)}>
              <SectionLabel>Teachera Bursluluk</SectionLabel>

              <div className="max-w-[680px]">
                <h1 className="mt-2 font-['Neutraface_2_Display:Titling',sans-serif] text-[31px] uppercase leading-[1.02] tracking-[0.03em] text-[#68232E] sm:text-[40px] lg:text-[52px]">
                  Teachera Online
                  <br />
                  Bursluluk Sınavı
                </h1>

                <p className="mt-5 max-w-[35rem] text-[15px] leading-[1.76] text-[#5B4F45] sm:text-[17px] sm:leading-[1.82]">
                  Teachera Dil Okulu’nun Milli Eğitim Bakanlığı onaylı online bursluluk sınavı ile Konya genelindeki tüm ilkokul, ortaokul ve lise öğrencilerine kapılarımızı açıyoruz. Katılım ücretsizdir. Detaylar için videoyu izleyebilirsiniz.
                </p>
              </div>

              <div className="mt-7 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3">
                {trustBadges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex min-h-[40px] items-center rounded-full border border-[#D7CCBF] bg-white/80 px-3.5 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.12em] text-[#4E443B] sm:min-h-[44px] sm:px-4 sm:text-[12px] sm:tracking-[0.14em]"
                  >
                    {badge}
                  </span>
                ))}
              </div>

              <div className="mt-8 hidden lg:flex lg:items-center lg:gap-3">
                <button type="button" onClick={openApplicationForm} className={`${primaryCtaClass} w-auto`}>
                  Hemen Başvur
                </button>
                <Link
                  to="/bursluluk/giris"
                  className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-[#D6CABC] bg-white px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-[#68232E] transition-colors duration-200 hover:bg-[#F8F2EA]"
                >
                  Giriş Yap
                </Link>
              </div>
            </motion.div>

            <motion.div {...sectionReveal(liteMode, 0.08)}>
              <div className="mx-auto w-full max-w-[540px] overflow-hidden rounded-[28px] border border-[#D8CEC2] bg-white/90 p-3 shadow-[0_22px_56px_rgba(25,20,15,0.07)] sm:rounded-[34px] sm:p-5 sm:shadow-[0_28px_80px_rgba(25,20,15,0.08)]">
                <div className="rounded-[22px] border border-[#E2D8CC] bg-[linear-gradient(180deg,#FBF7F2_0%,#F3ECE3_100%)] p-2.5 sm:rounded-[28px] sm:p-3">
                  <div className="relative overflow-hidden rounded-[18px] border border-[#D8CDC0] bg-[#E5DBCE] sm:rounded-[24px]">
                    <div className="aspect-[5/4]">
                      {isVideoReady ? null : (
                        <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#E9DFD2_0%,#DDD2C3_100%)] px-6 text-center">
                          <img src="/teachera-logo.svg" alt="Teachera" className="h-auto w-[62%] max-w-[270px]" />
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[#5B4F45] sm:text-[12px]">
                            Video yukleniyor...
                          </p>
                        </div>
                      )}
                      <video
                        ref={videoRef}
                        className="h-full w-full object-cover object-center"
                        src="/media/bursluluk-2026-hero.mp4"
                        poster="/media/bursluluk-2026-hero-poster.jpg"
                        autoPlay={false}
                        loop={!hasActivatedVideo}
                        muted={isMuted}
                        playsInline
                        preload="metadata"
                        onLoadedMetadata={handleVideoMetadata}
                        onLoadedData={markVideoReady}
                        onCanPlay={markVideoReady}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                        onEnded={() => setIsPlaying(false)}
                        onTimeUpdate={handleVideoTimeUpdate}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 rounded-[18px] border border-[#E7DDD2]/85 bg-[#FCFAF7]/92 px-3 py-2.5 backdrop-blur-[8px] sm:mt-3 sm:px-3.5 sm:py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] uppercase tracking-[0.14em] text-[#4A7067] sm:text-[10px] sm:tracking-[0.16em]">
                      {videoStatusLabel}
                    </span>
                    <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] uppercase tracking-[0.11em] text-[#6A5A4F] sm:text-[10px] sm:tracking-[0.13em]">
                      {formatVideoTime(currentVideoTime)} / {formatVideoTime(videoDuration)}
                    </span>
                  </div>

                  <div className="mt-1.5">
                    <div
                      ref={progressTrackRef}
                      role="slider"
                      tabIndex={videoDuration > 0 ? 0 : -1}
                      aria-label="Videoda ileri geri sar"
                      aria-orientation="horizontal"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(videoDuration)}
                      aria-valuenow={Math.round(currentVideoTime)}
                      aria-valuetext={`${formatVideoTime(currentVideoTime)} / ${formatVideoTime(videoDuration)}`}
                      onPointerDown={handleVideoProgressPointerDown}
                      onPointerMove={handleVideoProgressPointerMove}
                      onPointerUp={handleVideoProgressPointerEnd}
                      onPointerCancel={handleVideoProgressPointerEnd}
                      onKeyDown={handleVideoProgressKeyDown}
                      className={`group relative flex h-8 w-full items-center rounded-full outline-none transition-opacity duration-200 sm:h-9 ${
                        videoDuration > 0 ? 'cursor-pointer touch-none' : 'cursor-not-allowed opacity-50'
                      }`}
                    >
                      <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[#D7CEC4]" />
                      <span
                        className="pointer-events-none absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[#68232E]"
                        style={{ width: `${videoProgress}%` }}
                      />
                      <span
                        className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#68232E] shadow-[0_4px_12px_rgba(104,35,46,0.12)] transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110 sm:h-2.5 sm:w-2.5"
                        style={{ left: `clamp(0.3125rem, ${videoProgress}%, calc(100% - 0.3125rem))`, transform: 'translate(-50%, -50%)' }}
                      />
                    </div>
                  </div>

                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:mt-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void togglePlayback();
                      }}
                      className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-[#D8CDC0] bg-white px-3.5 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] uppercase tracking-[0.11em] text-[#68232E] transition-colors duration-200 hover:bg-[#F7F2EB] sm:min-h-[42px] sm:border-[#D4C8BA] sm:px-4 sm:text-[10px] sm:tracking-[0.13em]"
                    >
                      {isPlaying ? <Pause size={15} strokeWidth={2.2} /> : <Play size={15} strokeWidth={2.2} />}
                      {playbackButtonLabel}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void toggleMute();
                      }}
                      className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-[#D8CDC0] bg-white px-3.5 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] uppercase tracking-[0.11em] text-[#68232E] transition-colors duration-200 hover:bg-[#F7F2EB] sm:min-h-[42px] sm:border-[#D4C8BA] sm:px-4 sm:text-[10px] sm:tracking-[0.13em]"
                    >
                      {isMuted ? <VolumeX size={15} strokeWidth={2.2} /> : <Volume2 size={15} strokeWidth={2.2} />}
                      {isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 sm:mt-3">
                  <button type="button" onClick={openApplicationForm} className={`${primaryCtaClass} w-full lg:hidden`}>
                    Hemen Başvur
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="burs-yapisi" className="px-4 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-12 lg:px-10 lg:pb-16 lg:pt-14">
          <motion.div
            className="mx-auto max-w-[1360px] rounded-[30px] border border-[#DDD3C7] bg-white/78 px-5 py-6 shadow-[0_20px_48px_rgba(25,20,15,0.05)] sm:rounded-[40px] sm:px-8 sm:py-8 sm:shadow-[0_28px_74px_rgba(25,20,15,0.06)] lg:px-12 lg:py-12"
            {...sectionReveal(liteMode)}
          >
            <SectionLabel>Burs Yapısı</SectionLabel>
            <SectionHeading
              title="Katılan her öğrenci avantajla ayrılır, başarılı olan daha yüksek burs kazanır."
              subtitle="Katılım ücretsizdir. Burs yapısı nettir; katılan her öğrenci avantaj kazanır, daha yüksek başarı ise daha güçlü burs oranlarına dönüşür."
            />

            <div className="mt-8 grid gap-3.5 sm:mt-10 sm:gap-4 lg:grid-cols-3">
              {structureBlocks.map((block, index) => (
                <motion.article
                  key={block.number}
                  className="relative overflow-hidden rounded-[22px] border border-[#E4DACE] bg-[#FCFAF7] px-5 pb-5 pt-5 sm:rounded-[28px] sm:px-6 sm:pb-7 sm:pt-6"
                  {...sectionReveal(liteMode, 0.05 * index)}
                >
                  <p className="font-['Neutraface_2_Display:Titling',sans-serif] text-[34px] leading-none tracking-[0.02em] text-[#68232E]/12 sm:text-[48px]">
                    {block.number}
                  </p>
                  <h3 className="mt-4 font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] uppercase tracking-[0.05em] text-[#68232E] sm:mt-6 sm:text-[26px] sm:tracking-[0.06em]">
                    {block.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-[1.72] text-[#5B4F45] sm:mt-3 sm:text-[16px] sm:leading-[1.82]">{block.description}</p>
                </motion.article>
              ))}
            </div>

            <div className="mt-10 overflow-hidden rounded-[32px] border border-[#DDD2C5] bg-[#FFFDFA]">
              <div className="hidden lg:block">
                <div className="grid grid-cols-[84px_180px_220px_1fr] gap-6 border-b border-[#E7DDD2] bg-[#F7F1E9] px-8 py-4">
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                    Sıra
                  </span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                    Burs
                  </span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                    Kategori
                  </span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                    Şart
                  </span>
                </div>

                <div className="divide-y divide-[#E7DDD2]">
                  {scholarshipRows.map((row, index) => (
                    <div
                      key={`${row.percentage}-${row.condition}`}
                      className="grid grid-cols-[84px_180px_220px_1fr] gap-6 px-8 py-6"
                    >
                      <div className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#9B8B7B]">
                        0{index + 1}
                      </div>
                      <div className="font-['Neutraface_2_Display:Titling',sans-serif] text-[42px] leading-none tracking-[0.02em] text-[#68232E]">
                        {row.percentage}
                      </div>
                      <div className="font-['Neutraface_2_Text:Demi',sans-serif] text-[16px] text-[#4E443B]">
                        {row.category}
                      </div>
                      <div className="text-[16px] leading-[1.72] text-[#54493E]">{row.condition}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 p-3.5 lg:hidden">
                {scholarshipRows.map((row, index) => (
                  <article
                    key={`${row.percentage}-${row.condition}`}
                    className="rounded-[20px] border border-[#E4DACE] bg-[#FFFCF8] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                          0{index + 1}
                        </p>
                        <p className="mt-2.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#4E443B]">
                          {row.category}
                        </p>
                      </div>
                      <p className="font-['Neutraface_2_Display:Titling',sans-serif] text-[34px] leading-none tracking-[0.02em] text-[#68232E]">
                        {row.percentage}
                      </p>
                    </div>
                    <p className="mt-3 text-[14px] leading-[1.68] text-[#5B4F45]">{row.condition}</p>
                  </article>
                ))}
              </div>
            </div>

            <p className="mt-4 max-w-[72ch] text-[13px] leading-[1.72] text-[#6A5E53] sm:mt-5 sm:text-[14px] sm:leading-[1.8]">
              Nihai burs oranı sonuç ekranında gösterilir ve kurum tarafından yapılacak son kontrol sonrası kesinleşir.
            </p>
          </motion.div>
        </section>

        <section id="sinav-takvimi" className="px-4 pb-10 pt-2 sm:px-6 sm:pb-12 sm:pt-4 lg:px-10 lg:pb-14 lg:pt-6">
          <motion.div className="mx-auto max-w-[1360px]" {...sectionReveal(liteMode)}>
            <SectionLabel>Sınav Takvimi</SectionLabel>
            <SectionHeading
              title="28-29 Mart 2026 oturumları"
              subtitle="Başvuru sırasında sınıfına uygun oturum seçeneklerinden birini seçebilirsin."
            />

            <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-5 lg:grid-cols-2">
              {scheduleGroups.map((group, index) => (
                <motion.article
                  key={group.date}
                  className="overflow-hidden rounded-[24px] border border-[#DDD3C7] bg-white/80 shadow-[0_20px_44px_rgba(25,20,15,0.05)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(25,20,15,0.05)]"
                  {...sectionReveal(liteMode, 0.05 * index)}
                >
                  <div className="border-b border-[#E5DBCF] bg-[#F7F1E8] px-5 py-4 sm:px-6 sm:py-5">
                    <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.18em] text-[#4A7067]">
                      Tarih
                    </p>
                    <h3 className="mt-1.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] uppercase tracking-[0.04em] text-[#68232E] sm:mt-2 sm:text-[30px] sm:tracking-[0.05em]">
                      {group.date}
                    </h3>
                  </div>

                  <div className="divide-y divide-[#E7DDD2]">
                    {group.sessions.map((session) => (
                      <div key={`${group.date}-${session.time}`} className="grid grid-cols-[54px_1fr] gap-3 px-5 py-4 sm:grid-cols-[72px_1fr] sm:gap-4 sm:px-6 sm:py-5">
                        <div className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] leading-none tracking-[0.02em] text-[#68232E]/18 sm:text-[28px] sm:tracking-[0.03em]">
                          {session.number}
                        </div>
                        <div>
                          <p className="font-['Neutraface_2_Display:Titling',sans-serif] text-[22px] leading-none tracking-[0.03em] text-[#68232E] sm:text-[28px] sm:tracking-[0.04em]">
                            {session.time}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 sm:mt-3">
                            <p className="text-[15px] leading-[1.62] text-[#5B4F45] sm:text-[16px] sm:leading-[1.7]">
                              {session.grade}
                            </p>
                            <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em] text-[#68232E]/42 sm:text-[11px] sm:tracking-[0.18em]">
                              {session.level}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.article>
              ))}
            </div>
          </motion.div>
        </section>

        <section id="basvuru" className="px-4 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-12 lg:px-10 lg:pb-18 lg:pt-16">
          <motion.div
            className="mx-auto max-w-[1360px] overflow-hidden rounded-[30px] border border-[#DDD3C7] bg-[linear-gradient(135deg,#F7F1E8_0%,#F2EBE2_45%,#FCFAF7_100%)] shadow-[0_20px_48px_rgba(25,20,15,0.06)] sm:rounded-[38px] sm:shadow-[0_28px_70px_rgba(25,20,15,0.06)]"
            {...sectionReveal(liteMode)}
          >
            <div className="grid gap-8 px-5 py-6 sm:px-6 sm:py-8 lg:grid-cols-[0.94fr_1.06fr] lg:px-10 lg:py-12">
              <div>
                <SectionLabel>Başvuru</SectionLabel>
                <SectionHeading
                  title="Formu doldur, oturumunu seç, yerini ayırt."
                  subtitle="Başvurunu tamamladığında sınav giriş bilgilerin SMS ile iletilir. Sonuçlar açıklandığında aynı bilgilerle yeniden giriş yapabilirsin."
                />

                <button
                  type="button"
                  onClick={openApplicationForm}
                  className="mt-7 inline-flex min-h-[50px] w-full items-center justify-center rounded-full bg-[#E70000] px-6 py-3.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(231,0,0,0.16)] transition-[background-color,box-shadow] duration-200 hover:bg-[#C50000] hover:shadow-[0_20px_38px_rgba(231,0,0,0.22)] sm:mt-8 sm:min-h-[52px] sm:w-auto sm:px-8 sm:py-4 sm:text-[13px] sm:tracking-[0.18em]"
                >
                  Hemen Başvur
                </button>
              </div>

              <div className="grid gap-2.5 sm:gap-3">
                {processSteps.map((step, index) => (
                  <motion.article
                    key={step}
                    className="rounded-[20px] border border-white/80 bg-white/80 px-3.5 py-3 sm:rounded-[24px] sm:px-4 sm:py-3.5"
                    {...sectionReveal(liteMode, 0.06 * index)}
                  >
                    <div className="grid grid-cols-[52px_1fr] items-start gap-2.5 sm:grid-cols-[76px_1fr] sm:gap-3.5">
                      <div className="pt-0.5 font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] leading-none tracking-[0.02em] text-[#68232E]/16 sm:text-[40px] sm:tracking-[0.03em]">
                        0{index + 1}
                      </div>
                      <p className="text-[15px] leading-[1.64] text-[#5B4F45] sm:mt-1 sm:text-[16px] sm:leading-[1.76]">
                        {step}
                      </p>
                    </div>
                  </motion.article>
                ))}
              </div>
            </div>

          </motion.div>
        </section>

        <section id="sss" className="px-4 pb-16 pt-2 sm:px-6 sm:pb-18 sm:pt-4 lg:px-10 lg:pb-22 lg:pt-6">
          <motion.div className="mx-auto max-w-[1020px]" {...sectionReveal(liteMode)}>
            <SectionLabel>Sıkça Sorulan Sorular</SectionLabel>
            <SectionHeading title="Merak Ettikleriniz" />

            <div className="mt-8 overflow-hidden rounded-[24px] border border-[#DDD3C7] bg-white/80 shadow-[0_20px_52px_rgba(25,20,15,0.06)] sm:mt-10 sm:rounded-[32px] sm:shadow-[0_26px_70px_rgba(25,20,15,0.06)]">
              {faqItems.map((item, index) => {
                const isOpen = openFaq === index;
                return (
                  <div key={item.question} className={index === 0 ? '' : 'border-t border-[#E7DDD2]'}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      aria-expanded={isOpen}
                      className="flex min-h-[60px] w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors duration-200 hover:bg-[#FBF7F0] sm:min-h-[68px] sm:px-7 sm:py-5"
                    >
                      <span className="pr-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[15px] leading-[1.56] text-[#68232E] sm:pr-4 sm:text-[17px] sm:leading-[1.62]">
                        {item.question}
                      </span>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D8CDC0] bg-white text-[#68232E] sm:h-10 sm:w-10 sm:border-[#D5CABB]">
                        <ChevronDown
                          size={18}
                          strokeWidth={2.1}
                          className={isOpen ? 'rotate-180 transition-transform duration-200' : 'transition-transform duration-200'}
                        />
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          initial={liteMode ? undefined : { height: 0, opacity: 0 }}
                          animate={liteMode ? undefined : { height: 'auto', opacity: 1 }}
                          exit={liteMode ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: liteMode ? 0 : 0.22, ease: revealEase }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-0 sm:px-7 sm:pb-6">
                            <p className="max-w-[72ch] text-[14px] leading-[1.74] text-[#5B4F45] sm:text-[16px] sm:leading-[1.85]">
                              {item.answer}
                            </p>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-center sm:mt-10">
              <button type="button" onClick={openApplicationForm} className={`${primaryCtaClass} w-full sm:w-auto`}>
                Hemen Başvur
              </button>
            </div>
          </motion.div>
        </section>
      </main>
      {applicationFormDialog}
    </div>
  );
}
