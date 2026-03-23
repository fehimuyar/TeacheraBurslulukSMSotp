import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { candidateLogin, candidatePasswordReset, searchSchools, startExamSession, type SchoolSearchItem } from '../api/examApi';
import { captureAttributionFromUrl, trackEvent } from '../lib/analytics';
import { isValidTrMobilePhone, normalizeTrMobileInput, TR_MOBILE_PATTERN, TR_MOBILE_TITLE } from './phoneUtils';
import { savePlacementExamLead } from './exam/placementExamSession';
import {
  deriveAgeRangeFromGrade,
  normalizeGrade,
  readCandidateSession,
  resolveDefaultExamOpenAt,
  saveCandidateSession,
} from './bursluluk/burslulukFlowSession';
import { KONYA_SCHOOL_CATALOG } from './bursluluk/konyaSchoolCatalog';

const CAMPAIGN_CODE = String(import.meta.env.VITE_BURSLULUK_CAMPAIGN_CODE || '2026_BURSLULUK').trim();
const QUESTION_COUNT = Number(import.meta.env.VITE_BURSLULUK_QUESTION_COUNT || 40) || 40;

const FALLBACK_KONYA_SCHOOLS: SchoolSearchItem[] = KONYA_SCHOOL_CATALOG.map((item) => ({
  id: null,
  name: item.name,
  district: item.district || null,
  city: 'Konya',
  source: 'fallback',
}));

const grades = Array.from({ length: 12 }, (_, index) => index + 1);
const EXAM_SLOT_CATALOG = [
  {
    value: '2026-03-28T07:00:00.000Z',
    day: '2026-03-28',
    label: '28 Mart 2026 10:00-11:00',
    gradeMin: 1,
    gradeMax: 4,
  },
  {
    value: '2026-03-28T10:00:00.000Z',
    day: '2026-03-28',
    label: '28 Mart 2026 13:00-14:00',
    gradeMin: 5,
    gradeMax: 8,
  },
  {
    value: '2026-03-29T10:00:00.000Z',
    day: '2026-03-29',
    label: '29 Mart 2026 13:00-14:00',
    gradeMin: 9,
    gradeMax: 12,
  },
] as const;

function readExamSlotsByGrade(grade: number) {
  return EXAM_SLOT_CATALOG.filter((slot) => grade >= slot.gradeMin && grade <= slot.gradeMax);
}

function toE164FromTrMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  return `+90${digits}`;
}

function normalizeError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function normalizeIdentityInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

function normalizeBirthYearInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function normalizeNameInput(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function normalizeSectionInput(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 20);
}

function normalizeCandidateCodeInput(value: string) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase().slice(0, 60);
}

function isNameLike(value: string) {
  const normalized = normalizeNameInput(value);
  if (normalized.length < 5) return false;
  return normalized.split(' ').filter(Boolean).length >= 2;
}

function isValidTrIdentityNo(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || digits.startsWith('0')) return false;
  const nums = digits.split('').map((item) => Number.parseInt(item, 10));
  const oddSum = nums[0] + nums[2] + nums[4] + nums[6] + nums[8];
  const evenSum = nums[1] + nums[3] + nums[5] + nums[7];
  const check10 = ((oddSum * 7) - evenSum) % 10;
  const check11 = nums.slice(0, 10).reduce((sum, current) => sum + current, 0) % 10;
  return check10 === nums[9] && check11 === nums[10];
}

function isBirthYearReasonable(birthYear: number) {
  const currentYear = new Date().getUTCFullYear();
  return Number.isFinite(birthYear) && birthYear >= 1998 && birthYear <= currentYear;
}

function isGradeBirthYearConsistent(grade: number, birthYear: number) {
  const currentYear = new Date().getUTCFullYear();
  const age = currentYear - birthYear;
  if (!Number.isFinite(age) || age < 5 || age > 30) return false;
  const minGrade = Math.max(1, age - 9);
  const maxGrade = Math.min(12, age - 4);
  return grade >= minGrade && grade <= maxGrade;
}

const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  'first_touch_utm_source',
  'first_touch_utm_medium',
  'first_touch_utm_campaign',
  'last_touch_utm_source',
  'last_touch_utm_medium',
  'last_touch_utm_campaign',
  'first_touch_captured_at',
  'last_touch_captured_at',
] as const;

function readBurslulukAttributionPayload() {
  if (typeof window === 'undefined') return undefined;
  const captured = captureAttributionFromUrl();
  const payload: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = String(captured[key] || '').trim().slice(0, 240);
    if (value) payload[key] = value;
  }

  const landingPath = String(window.location.pathname || '').trim().slice(0, 240);
  if (landingPath) payload.landing_path = landingPath;

  const landingUrl = String(window.location.href || '').trim().slice(0, 500);
  if (landingUrl) payload.landing_url = landingUrl;

  const referrer = String(document.referrer || '').trim().slice(0, 500);
  if (referrer) payload.referrer = referrer;

  return Object.keys(payload).length > 0 ? payload : undefined;
}

type Mode = 'apply' | 'login';

export default function BurslulukGirisPage() {
  const navigate = useNavigate();
  const [savedSession] = useState(() => readCandidateSession());
  const [mode, setMode] = useState<Mode>(() => (savedSession ? 'login' : 'apply'));

  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [studentFullName, setStudentFullName] = useState('');
  const [identityNo, setIdentityNo] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [grade, setGrade] = useState(8);
  const [section, setSection] = useState(savedSession?.section || '');
  const [selectedExamDay, setSelectedExamDay] = useState('');
  const [selectedExamAt, setSelectedExamAt] = useState('');
  const [parentFullName, setParentFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [language, setLanguage] = useState('en');
  const [kvkkConsent, setKvkkConsent] = useState(true);
  const [contactConsent, setContactConsent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSchoolSearchLoading, setIsSchoolSearchLoading] = useState(false);
  const [schoolSearchResults, setSchoolSearchResults] = useState<SchoolSearchItem[]>(FALLBACK_KONYA_SCHOOLS.slice(0, 8));
  const [errorMessage, setErrorMessage] = useState('');

  const [loginApplicationNo, setLoginApplicationNo] = useState(savedSession?.candidateCode || savedSession?.applicationNo || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [resetIdentityNo, setResetIdentityNo] = useState('');
  const [resetBirthYear, setResetBirthYear] = useState('');
  const [resetLookup, setResetLookup] = useState<{
    maskedPhone: string;
    candidateCode: string;
  } | null>(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const filteredSchools = useMemo(() => {
    if (schoolSearchResults.length > 0) return schoolSearchResults;
    return FALLBACK_KONYA_SCHOOLS.slice(0, 8);
  }, [schoolSearchResults]);

  const availableExamSlots = useMemo(() => readExamSlotsByGrade(grade), [grade]);
  const availableExamDays = useMemo(
    () => Array.from(new Set(availableExamSlots.map((slot) => slot.day))),
    [availableExamSlots],
  );
  const availableSlotsForSelectedDay = useMemo(
    () => availableExamSlots.filter((slot) => slot.day === selectedExamDay),
    [availableExamSlots, selectedExamDay],
  );
  const canResumeSession = Boolean(savedSession?.attemptId && savedSession?.sessionToken);

  useEffect(() => {
    if (availableExamDays.length === 0) {
      setSelectedExamDay('');
      setSelectedExamAt('');
      return;
    }
    setSelectedExamDay((current) => (current && availableExamDays.includes(current) ? current : availableExamDays[0]));
  }, [availableExamDays]);

  useEffect(() => {
    if (!selectedExamDay) {
      setSelectedExamAt('');
      return;
    }
    const slotValues = availableSlotsForSelectedDay.map((slot) => slot.value);
    if (slotValues.length === 0) {
      setSelectedExamAt('');
      return;
    }
    setSelectedExamAt((current) => (current && slotValues.includes(current) ? current : slotValues[0]));
  }, [availableSlotsForSelectedDay, selectedExamDay]);

  useEffect(() => {
    setErrorMessage('');
    if (mode === 'apply') {
      setResetLookup(null);
      setResetMessage('');
      setResetIdentityNo('');
      setResetBirthYear('');
    }
  }, [mode]);

  useEffect(() => {
    const query = schoolSearch.trim();
    if (query.length < 2) {
      setIsSchoolSearchLoading(false);
      setSchoolSearchResults(FALLBACK_KONYA_SCHOOLS.slice(0, 8));
      return;
    }

    let isCancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSchoolSearchLoading(true);
      try {
        const response = await searchSchools(query, 8);
        if (isCancelled) return;
        setSchoolSearchResults(response.items || []);
      } catch {
        if (isCancelled) return;
        const fallback = FALLBACK_KONYA_SCHOOLS.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
        setSchoolSearchResults(fallback);
      } finally {
        if (!isCancelled) {
          setIsSchoolSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      isCancelled = true;
      window.clearTimeout(timer);
    };
  }, [schoolSearch]);

  const handleApplySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    const normalizedGrade = normalizeGrade(grade);
    const normalizedStudentFullName = normalizeNameInput(studentFullName);
    const normalizedParentFullName = normalizeNameInput(parentFullName);
    const normalizedIdentityNo = normalizeIdentityInput(identityNo);
    const normalizedBirthYearText = normalizeBirthYearInput(birthYear);
    const normalizedBirthYear = Number.parseInt(normalizedBirthYearText, 10);
    const normalizedSection = normalizeSectionInput(section);
    const normalizedSchoolName = normalizeNameInput(schoolName || schoolSearch);
    const normalizedPhone = normalizeTrMobileInput(parentPhone);
    const parentPhoneE164 = toE164FromTrMobile(normalizedPhone);

    if (!isNameLike(normalizedStudentFullName)) {
      setErrorMessage('Ogrenci ad-soyad en az ad ve soyad icermelidir.');
      return;
    }
    if (!isNameLike(normalizedParentFullName)) {
      setErrorMessage('Veli ad-soyad en az ad ve soyad icermelidir.');
      return;
    }
    if (!normalizedSchoolName) {
      setErrorMessage('Okul alani zorunludur.');
      return;
    }
    if (!isValidTrMobilePhone(normalizedPhone)) {
      setErrorMessage(TR_MOBILE_TITLE);
      return;
    }
    if (!kvkkConsent) {
      setErrorMessage('Basvuru icin KVKK acik riza onayi gereklidir.');
      return;
    }
    if (!isValidTrIdentityNo(normalizedIdentityNo)) {
      setErrorMessage('TC Kimlik No gecersiz.');
      return;
    }
    if (!isBirthYearReasonable(normalizedBirthYear)) {
      setErrorMessage('Dogum yili gecersiz.');
      return;
    }
    if (!isGradeBirthYearConsistent(normalizedGrade, normalizedBirthYear)) {
      setErrorMessage('Sinif ve dogum yili birbiriyle uyumlu degil.');
      return;
    }
    if (!normalizedSection) {
      setErrorMessage('Sube alani zorunludur.');
      return;
    }
    if (!selectedExamDay || !selectedExamAt) {
      setErrorMessage('Sinav gunu ve saat slotu secimi zorunludur.');
      return;
    }

    setIsSubmitting(true);

    try {
      const ageRange = deriveAgeRangeFromGrade(normalizedGrade);
      const attribution = readBurslulukAttributionPayload();
      const response = await startExamSession({
        studentFullName: normalizedStudentFullName,
        parentFullName: normalizedParentFullName,
        identityNo: normalizedIdentityNo,
        birthYear: normalizedBirthYear,
        parentPhoneE164,
        schoolName: normalizedSchoolName || undefined,
        grade: normalizedGrade,
        section: normalizedSection,
        selectedExamAt,
        ageRange,
        language,
        source: 'bursluluk_2026_apply_form',
        campaignCode: CAMPAIGN_CODE,
        attribution,
        questionCount: QUESTION_COUNT,
        consent: {
          kvkkApproved: kvkkConsent,
          contactConsent,
          consentVersion: 'KVKK_v1_2026-03-13',
          legalTextVersion: 'KVKK_v1_2026-03-13',
          source: 'bursluluk_form_web',
        },
      });

      const session = response.session;
      saveCandidateSession({
        applicationNo: session.applicationNo,
        candidateCode: session.candidateCode || session.applicationNo,
        attemptId: session.attemptId,
        sessionToken: session.sessionToken,
        candidateId: session.candidateId,
        expiresAt: session.expiresAt,
        startedAt: session.startedAt,
        credentialsSmsStatus: session.credentialsSmsStatus,
        consentVersion: session.consentVersion,
        studentFullName: normalizedStudentFullName,
        parentFullName: normalizedParentFullName,
        parentPhoneE164,
        schoolName: normalizedSchoolName,
        section: session.section || normalizedSection,
        grade: normalizedGrade,
        ageRange,
        language,
        questionCount: QUESTION_COUNT,
        campaignCode: CAMPAIGN_CODE,
        examOpenAt: session.scheduledExamAt || selectedExamAt || resolveDefaultExamOpenAt(),
        examSlotLabel: session.examSlotLabel || availableSlotsForSelectedDay.find((slot) => slot.value === selectedExamAt)?.label || '',
      });

      savePlacementExamLead({
        fullName: normalizedStudentFullName,
        phone: normalizedPhone,
        email: '',
        age: ageRange,
        language,
        source: 'bursluluk_2026_apply_form',
        kvkkConsent: true,
        contactConsent,
        kvkkConsentVersion: 'KVKK_v1_2026-03-13',
        kvkkLegalTextVersion: 'KVKK_v1_2026-03-13',
        consentCapturedAt: new Date().toISOString(),
      });

      trackEvent('lead_form_submit_success', {
        form_subject: 'bursluluk_apply',
        form_id: 'bursluluk_2026_apply',
        field_count: 12,
        delivery_method: 'exam_session_start_api',
        captcha_enabled: true,
      });

      navigate('/bursluluk/onay');
    } catch (error) {
      trackEvent('lead_form_submit_failure', {
        form_subject: 'bursluluk_apply',
        form_id: 'bursluluk_2026_apply',
        field_count: 12,
        delivery_method: 'exam_session_start_api',
        captcha_enabled: true,
        error_message: normalizeError(error, 'exam_session_start_failed').slice(0, 120),
      });
      setErrorMessage(normalizeError(error, 'Basvuru kaydi basarisiz. Lutfen tekrar deneyin.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setIsLoginSubmitting(true);
    try {
      const normalizedCandidateCode = normalizeCandidateCodeInput(loginApplicationNo);
      const normalizedPassword = String(loginPassword || '').trim().slice(0, 180);
      if (!normalizedCandidateCode || !normalizedPassword) {
        throw new Error('Kullanici adi ve sifre alanlarini doldurun.');
      }
      const response = await candidateLogin({
        username: normalizedCandidateCode,
        password: normalizedPassword,
        campaignCode: CAMPAIGN_CODE,
      });
      const session = response.session;
      const candidate = response.candidate || {};
      setLoginApplicationNo(normalizedCandidateCode);
      saveCandidateSession({
        applicationNo: session.applicationNo,
        candidateCode: session.candidateCode || session.applicationNo,
        attemptId: session.attemptId,
        sessionToken: session.sessionToken,
        candidateId: session.candidateId,
        expiresAt: session.expiresAt,
        studentFullName: candidate.studentFullName || 'Aday Ogrenci',
        parentFullName: candidate.parentFullName || 'Veli',
        parentPhoneE164: '',
        schoolName: '',
        section: session.section || candidate.section || '',
        grade: normalizeGrade(candidate.grade ?? 8),
        ageRange: session.examAgeRange || deriveAgeRangeFromGrade(normalizeGrade(candidate.grade ?? 8)),
        language: session.examLanguage || 'en',
        questionCount: Number(session.questionCount || QUESTION_COUNT),
        campaignCode: CAMPAIGN_CODE,
        examOpenAt: session.scheduledExamAt
          || response.gate?.candidate_exam_open_at
          || response.gate?.exam_open_at
          || resolveDefaultExamOpenAt(),
        examSlotLabel: session.examSlotLabel || '',
      });
      trackEvent('cta_click', {
        cta_id: 'bursluluk_candidate_login_submit',
        cta_location: 'bursluluk_giris',
        cta_destination: '/bursluluk/bekleme',
        source: 'candidate_login',
        cta_type: 'button',
      });
      trackEvent('candidate_login_success', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
      });
      navigate('/bursluluk/bekleme');
    } catch (error) {
      trackEvent('candidate_login_failure', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
        error_message: normalizeError(error, 'candidate_login_failed').slice(0, 120),
      });
      setErrorMessage(normalizeError(error, 'Aday girisi basarisiz.'));
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  const handleResetLookup = async () => {
    setErrorMessage('');
    setResetMessage('');
    const normalizedIdentityNo = normalizeIdentityInput(resetIdentityNo);
    const normalizedBirthYearText = normalizeBirthYearInput(resetBirthYear);
    const normalizedBirthYear = Number.parseInt(normalizedBirthYearText, 10);
    if (!isValidTrIdentityNo(normalizedIdentityNo) || !isBirthYearReasonable(normalizedBirthYear)) {
      setErrorMessage('Sifre yenileme icin 11 haneli TC Kimlik No ve 4 haneli dogum yili girin.');
      return;
    }

    setResetIdentityNo(normalizedIdentityNo);
    setResetBirthYear(normalizedBirthYearText);
    setIsResetSubmitting(true);
    try {
      const response = await candidatePasswordReset({
        identityNo: normalizedIdentityNo,
        birthYear: normalizedBirthYear,
        campaignCode: CAMPAIGN_CODE,
        confirm: false,
      });
      const normalizedCandidateCode = normalizeCandidateCodeInput(response.reset.candidate_code);
      setResetLookup({
        maskedPhone: response.reset.masked_phone,
        candidateCode: normalizedCandidateCode,
      });
      setLoginApplicationNo(normalizedCandidateCode);
      trackEvent('candidate_password_reset_lookup_success', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
      });
    } catch (error) {
      trackEvent('candidate_password_reset_lookup_failure', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
        error_message: normalizeError(error, 'candidate_password_reset_lookup_failed').slice(0, 120),
      });
      setErrorMessage(normalizeError(error, 'Kimlik bilgileri dogrulanamadi.'));
      setResetLookup(null);
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleResetConfirm = async () => {
    setErrorMessage('');
    setResetMessage('');
    if (!resetLookup) return;
    const normalizedIdentityNo = normalizeIdentityInput(resetIdentityNo);
    const normalizedBirthYear = Number.parseInt(normalizeBirthYearInput(resetBirthYear), 10);

    setIsResetSubmitting(true);
    try {
      await candidatePasswordReset({
        identityNo: normalizedIdentityNo,
        birthYear: normalizedBirthYear,
        campaignCode: CAMPAIGN_CODE,
        confirm: true,
      });
      setLoginApplicationNo(resetLookup.candidateCode);
      trackEvent('cta_click', {
        cta_id: 'bursluluk_password_reset_sms',
        cta_location: 'bursluluk_giris',
        cta_destination: 'candidate_password_reset',
        source: 'candidate_password_reset',
        cta_type: 'button',
      });
      trackEvent('candidate_password_reset_confirm_success', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
      });
      setResetMessage('Yeni sifre SMS ile gonderildi. Aday kodunuzla giris yapabilirsiniz.');
    } catch (error) {
      trackEvent('candidate_password_reset_confirm_failure', {
        source: 'bursluluk_giris',
        campaign_code: CAMPAIGN_CODE,
        error_message: normalizeError(error, 'candidate_password_reset_confirm_failed').slice(0, 120),
      });
      setErrorMessage(normalizeError(error, 'Sifre yenileme islemi tamamlanamadi.'));
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleResumeSession = () => {
    if (!canResumeSession) return;
    trackEvent('cta_click', {
      cta_id: 'bursluluk_resume_existing_session',
      cta_location: 'bursluluk_giris',
      cta_destination: '/bursluluk/bekleme',
      source: 'candidate_session_resume',
      cta_type: 'button',
    });
    navigate('/bursluluk/bekleme');
  };

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(146,11,35,0.34),transparent_42%),radial-gradient(circle_at_84%_12%,rgba(39,102,129,0.26),transparent_34%),linear-gradient(138deg,#06050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_0.75px,transparent_0.75px)] [background-size:14px_14px] opacity-[0.14]" />

      <div className="relative mx-auto w-full max-w-[1080px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold text-white sm:text-[38px]">Bursluluk Giris ve Basvuru</h1>
          <Link to="/bursluluk-2026" className="rounded-full border border-white/18 px-4 py-2 text-[12px] uppercase tracking-[0.16em] text-white/70">
            Landing
          </Link>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('apply')}
            className={`rounded-full px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] ${mode === 'apply' ? 'bg-[#D92E27] text-white' : 'border border-white/18 text-white/70'}`}
          >
            Yeni Basvuru
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-full px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] ${mode === 'login' ? 'bg-[#D92E27] text-white' : 'border border-white/18 text-white/70'}`}
          >
            Aday Girisi
          </button>
        </div>

        {mode === 'apply' ? (
          <form onSubmit={handleApplySubmit} className="grid gap-4 rounded-[26px] border border-white/12 bg-[#0A1323]/82 p-6 sm:grid-cols-2 sm:p-8">
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Okul (Konya, arama)</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={schoolSearch}
                onChange={(event) => {
                  setSchoolSearch(event.target.value);
                  setSchoolName('');
                }}
                placeholder="Okul adini yazin"
              />
              {filteredSchools.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {filteredSchools.map((item) => (
                    <button
                      key={item.id || item.name}
                      type="button"
                      onClick={() => {
                        setSchoolName(item.name);
                        setSchoolSearch(item.name);
                      }}
                      className="rounded-full border border-white/16 px-3 py-1 text-[11px] text-white/76 hover:border-[#cf3b35]"
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {isSchoolSearchLoading ? <p className="mt-2 text-[12px] text-white/54">Okullar yukleniyor...</p> : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Ogrenci Ad Soyad</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={studentFullName}
                onChange={(event) => setStudentFullName(normalizeNameInput(event.target.value))}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">TC Kimlik No</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={identityNo}
                onChange={(event) => setIdentityNo(normalizeIdentityInput(event.target.value))}
                inputMode="numeric"
                pattern="[0-9]{11}"
                maxLength={11}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Dogum Yili</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={birthYear}
                onChange={(event) => setBirthYear(normalizeBirthYearInput(event.target.value))}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="2014"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Sinif (1-12)</span>
              <select
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={grade}
                onChange={(event) => setGrade(Number(event.target.value))}
              >
                {grades.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Sube</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={section}
                onChange={(event) => setSection(normalizeSectionInput(event.target.value))}
                placeholder="Orn. 5-A"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Sinav Gunu</span>
              <select
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={selectedExamDay}
                onChange={(event) => setSelectedExamDay(event.target.value)}
                required
              >
                {availableExamDays.map((day) => (
                  <option key={day} value={day}>
                    {day === '2026-03-28' ? '28 Mart 2026 Cumartesi' : '29 Mart 2026 Pazar'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Sinav Saat Slotu</span>
              <select
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={selectedExamAt}
                onChange={(event) => setSelectedExamAt(event.target.value)}
                required
              >
                {availableSlotsForSelectedDay.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[12px] text-white/58">
                Sinif secimine gore acilan slotlar gosterilir.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Veli Ad Soyad</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={parentFullName}
                onChange={(event) => setParentFullName(normalizeNameInput(event.target.value))}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Veli Telefonu</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={parentPhone}
                onChange={(event) => setParentPhone(normalizeTrMobileInput(event.target.value))}
                placeholder="5XX XXX XX XX"
                pattern={TR_MOBILE_PATTERN}
                title={TR_MOBILE_TITLE}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Sinav Dili</span>
              <select
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="fr">Francais</option>
                <option value="es">Espanol</option>
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#071021]/90 p-3 text-[13px] text-white/74 sm:col-span-2">
              <input type="checkbox" checked={kvkkConsent} onChange={(event) => setKvkkConsent(event.target.checked)} className="mt-1" />
              KVKK acik riza metnini okudum ve onayliyorum.
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#071021]/90 p-3 text-[13px] text-white/74 sm:col-span-2">
              <input type="checkbox" checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} className="mt-1" />
              SMS/WhatsApp bilgilendirmesi almayi kabul ediyorum.
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-12 rounded-xl bg-[#D92E27] text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#bf251f] disabled:opacity-70 sm:col-span-2"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Basvuruyu Tamamla'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="grid gap-4 rounded-[26px] border border-white/12 bg-[#0A1323]/82 p-6 sm:grid-cols-2 sm:p-8">
            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Aday Kodu</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={loginApplicationNo}
                onChange={(event) => setLoginApplicationNo(normalizeCandidateCodeInput(event.target.value))}
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[12px] uppercase tracking-[0.15em] text-white/56">Kisa Sifre (SMS)</span>
              <input
                className="h-12 w-full rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                type="password"
                required
              />
            </label>
            <button
              type="submit"
              disabled={isLoginSubmitting}
              className="h-12 rounded-xl bg-[#D92E27] text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#bf251f] disabled:opacity-70 sm:col-span-2"
            >
              {isLoginSubmitting ? 'Giris yapiliyor...' : 'Aday Girisi Yap'}
            </button>

            {canResumeSession ? (
              <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 p-4 sm:col-span-2">
                <p className="text-[12px] uppercase tracking-[0.15em] text-emerald-200/88">Mevcut Oturum</p>
                <p className="mt-2 text-[13px] text-emerald-100/90">
                  Daha once acilan oturum bulundu ({savedSession?.candidateCode || savedSession?.applicationNo}).
                </p>
                <button
                  type="button"
                  onClick={handleResumeSession}
                  className="mt-3 rounded-full border border-emerald-300/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100 hover:bg-emerald-400/10"
                >
                  Mevcut Oturuma Devam Et
                </button>
              </div>
            ) : null}

            <div className="rounded-xl border border-white/12 bg-[#071021]/88 p-4 sm:col-span-2">
              <p className="text-[12px] uppercase tracking-[0.15em] text-white/56">Sifremi Yenile</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  className="h-11 rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                  value={resetIdentityNo}
                  onChange={(event) => setResetIdentityNo(normalizeIdentityInput(event.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]{11}"
                  maxLength={11}
                  placeholder="TC Kimlik No (11 hane)"
                />
                <input
                  className="h-11 rounded-xl border border-white/18 bg-[#061021] px-4 text-white outline-none focus:border-[#cf3b35]"
                  value={resetBirthYear}
                  onChange={(event) => setResetBirthYear(normalizeBirthYearInput(event.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="Dogum Yili"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResetLookup}
                  disabled={isResetSubmitting}
                  className="rounded-full border border-white/18 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/78 hover:border-[#cf3b35] disabled:opacity-70"
                >
                  {isResetSubmitting ? 'Dogrulaniyor...' : 'Telefonu Dogrula'}
                </button>
                {resetLookup ? (
                  <button
                    type="button"
                    onClick={handleResetConfirm}
                    disabled={isResetSubmitting}
                    className="rounded-full bg-[#D92E27] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white hover:bg-[#bf251f] disabled:opacity-70"
                  >
                    {isResetSubmitting ? 'Gonderiliyor...' : 'SMS ile Yeni Sifre Gonder'}
                  </button>
                ) : null}
              </div>
              {resetLookup ? (
                <p className="mt-3 text-[13px] text-white/72">
                  Kayitli telefon: <span className="font-semibold text-white">{resetLookup.maskedPhone}</span>
                </p>
              ) : null}
              {resetMessage ? (
                <p className="mt-3 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-200">
                  {resetMessage}
                </p>
              ) : null}
            </div>
          </form>
        )}

        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[14px] text-[#FFB8B1]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
