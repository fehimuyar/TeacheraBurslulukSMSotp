import { useEffect, useState, type FormEvent } from 'react';
import { panelFetch } from '../../api/panelApi';
import {
  createPanelPreviewIdentity,
  isPanelPreviewRuntimeEnabled,
  readPanelPreviewIdentity,
  writePanelPreviewIdentity,
} from './panelPreviewSession';

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  next_step?: string;
  otp_required?: boolean;
  otp?: {
    challenge_id?: string;
    challenge_token?: string;
    expires_in_seconds?: number;
    masked_phone?: string;
  };
  identity?: {
    role?: string;
    password_reset_required?: boolean;
  };
  session?: {
    password_reset_required?: boolean;
    force_password_reset?: boolean;
  };
  user?: {
    role?: string;
    password_reset_required?: boolean;
    force_password_reset?: boolean;
  };
};

function normalizeMessage(payload: ApiResponse | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function readRequiresPasswordReset(payload: ApiResponse | null) {
  if (!payload) return false;
  if (String(payload.next_step || '').toLowerCase() === 'password_reset') return true;
  if (payload.identity?.password_reset_required) return true;
  if (payload.session?.password_reset_required || payload.session?.force_password_reset) return true;
  if (payload.user?.password_reset_required || payload.user?.force_password_reset) return true;
  return false;
}

const DASHBOARD_ALLOWED_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'EDUCATION_ADVISOR',
  'OPERATIONS',
  'READ_ONLY',
]);

function readRole(payload: ApiResponse | null) {
  return String(payload?.user?.role || payload?.identity?.role || '')
    .trim()
    .toUpperCase();
}

function canRouteToDashboard(role: string) {
  return role ? DASHBOARD_ALLOWED_ROLES.has(role) : false;
}

async function readJsonSafe(response: Response) {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

const inputClassName =
  "h-[64px] w-full rounded-[22px] border border-[#DDD4C6] bg-[#FFFCF7] px-5 text-[16px] text-[#16251F] outline-none transition duration-200 focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]";
const fieldLabelClassName =
  "mb-2 block font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.22em] text-[#7A7063]";
const statusClassMap = {
  error: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
  success: 'border-[#D8E0D6] bg-[#F6FAF5] text-[#345346]',
} as const;

function LoginStatusMessage({
  children,
  tone,
}: {
  children: string;
  tone: keyof typeof statusClassMap;
}) {
  if (!children) return null;

  return (
    <p className={`mt-4 rounded-[18px] border px-4 py-3 text-[14px] leading-[1.6] ${statusClassMap[tone]}`}>{children}</p>
  );
}

function normalizeTckn(value: string) {
  return String(value || '').replace(/\D+/g, '').slice(0, 11);
}

function normalizeOtp(value: string) {
  return String(value || '').replace(/\D+/g, '').slice(0, 6);
}

export default function PanelLoginPage() {
  const [tckn, setTckn] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSessionCheckLoading, setIsSessionCheckLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const normalizedTckn = normalizeTckn(tckn);
  const normalizedOtp = normalizeOtp(otpCode);

  const canSubmit = normalizedTckn.length === 11 && password && !isSubmitting && !isSessionCheckLoading;

  useEffect(() => {
    let cancelled = false;

    const verifyExistingSession = async () => {
      const previewIdentity = readPanelPreviewIdentity();
      if (previewIdentity) {
        window.location.assign('/panel/dashboard');
        return;
      }

      try {
        const response = await panelFetch('/api/panel/auth/me', {
          method: 'GET',
        });

        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setIsSessionCheckLoading(false);
          return;
        }

        const payload = await readJsonSafe(response);
        const requiresPasswordReset = readRequiresPasswordReset(payload);
        if (requiresPasswordReset) {
          window.location.assign('/panel/password-reset');
          return;
        }

        const role = readRole(payload);
        if (canRouteToDashboard(role)) {
          window.location.assign('/panel/dashboard');
          return;
        }

        setErrorMessage('Panel rolünüz doğrulanamadı. Lütfen destek ekibiyle iletişime geçin.');
      } catch {
        if (!cancelled) {
          setIsSessionCheckLoading(false);
        }
      } finally {
        if (!cancelled) {
          setIsSessionCheckLoading(false);
        }
      }
    };

    void verifyExistingSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestOtpChallenge = async () => {
    const challengeResponse = await panelFetch('/api/panel/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });

    const challengePayload = await readJsonSafe(challengeResponse);
    if (!challengeResponse.ok || challengePayload?.ok === false) {
      setErrorMessage(normalizeMessage(challengePayload, 'SMS doğrulama kodu gönderilemedi.'));
      return false;
    }

    const challengeId = String(challengePayload?.otp?.challenge_id || '').trim();
    const challengeToken = String(challengePayload?.otp?.challenge_token || '').trim();
    const maskedPhone = String(challengePayload?.otp?.masked_phone || '').trim();

    if (!challengePayload?.otp_required || !challengeId || !challengeToken) {
      setErrorMessage('SMS doğrulama akışı başlatılamadı. Lütfen tekrar deneyin.');
      return false;
    }

    setOtpChallengeId(challengeId);
    setOtpChallengeToken(challengeToken);
    setOtpMaskedPhone(maskedPhone);
    setOtpCode('');
    setSuccessMessage(
      maskedPhone
        ? `SMS doğrulama kodu ${maskedPhone} numarasına gönderildi.`
        : 'SMS doğrulama kodu gönderildi.',
    );
    return true;
  };

  const handleResendCode = async () => {
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      setErrorMessage('Kodu tekrar göndermek için e-posta ve şifre alanlarını doldurun.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);
    try {
      await requestOtpChallenge();
    } catch {
      setErrorMessage('SMS doğrulama kodu tekrar gönderilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(true);

    if (isPanelPreviewRuntimeEnabled()) {
      writePanelPreviewIdentity(createPanelPreviewIdentity(normalizedTckn));
      setSuccessMessage('Tasarım önizleme modu açıldı. Panel arayüzüne yönlendiriliyorsunuz...');
      window.setTimeout(() => {
        window.location.assign('/panel/dashboard');
      }, 300);
      setIsSubmitting(false);
      return;
    }

    try {
      if (!isOtpStep) {
        await requestOtpChallenge();
        return;
      }

      const loginResponse = await panelFetch('/api/panel/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          tckn: normalizedTckn,
          password,
          otpCode: normalizedOtp.length === 6 ? normalizedOtp : undefined,
        }),
      });

      const loginPayload = await readJsonSafe(loginResponse);
      if (!loginResponse.ok || loginPayload?.ok === false) {
        const mismatchMessage = normalizeMessage(loginPayload, 'Panel girişi başarısız.');
        if (
          isPanelPreviewRuntimeEnabled() &&
          /email.*password.*mfacode/i.test(mismatchMessage.replace(/\s+/g, ' '))
        ) {
          writePanelPreviewIdentity(createPanelPreviewIdentity(normalizedTckn));
          setSuccessMessage('Eski panel auth kontratı algılandı. Tasarım önizleme modu ile devam ediliyor...');
          window.setTimeout(() => {
            window.location.assign('/panel/dashboard');
          }, 300);
          return;
        }
        setErrorMessage(mismatchMessage);
        return;
      }

      if (loginPayload?.otp_required) {
        const challengeId = String(loginPayload?.otp?.challenge_id || '').trim();
        const challengeToken = String(loginPayload?.otp?.challenge_token || '').trim();
        const maskedPhone = String(loginPayload?.otp?.masked_phone || '').trim();
        if (challengeId && challengeToken) {
          setOtpChallengeId(challengeId);
          setOtpChallengeToken(challengeToken);
          setOtpMaskedPhone(maskedPhone);
          setOtpCode('');
          setSuccessMessage(
            maskedPhone
              ? `Yeni SMS doğrulama kodu ${maskedPhone} numarasına gönderildi.`
              : 'Yeni SMS doğrulama kodu gönderildi.',
          );
          return;
        }
      }

      const requiresPasswordReset = readRequiresPasswordReset(loginPayload);
      const role = readRole(loginPayload);
      if (!requiresPasswordReset && !canRouteToDashboard(role)) {
        setErrorMessage('Bu hesap panel dashboard erişimi için yetkilendirilmemiş.');
        return;
      }

      const targetPath = requiresPasswordReset ? '/panel/password-reset' : '/panel/dashboard';
      setSuccessMessage(
        requiresPasswordReset
          ? 'Geçici şifre algılandı. Şifre yenileme ekranına yönlendiriliyorsunuz...'
          : 'Giriş başarılı. Operasyon paneline yönlendiriliyorsunuz...',
      );

      window.setTimeout(() => {
        window.location.assign(targetPath);
      }, 450);
    } catch {
      setErrorMessage('Ağ hatası nedeniyle giriş tamamlanamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F5EFE4] px-6 py-8 lg:px-12 lg:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#F9F4EC_0%,#F2EBDD_48%,#ECE3D5_100%)]" />
      <div className="pointer-events-none absolute right-[10%] top-[14%] h-[340px] w-[340px] rounded-full bg-[#E8DBC1]/50 blur-3xl" />
      <div className="pointer-events-none absolute left-[16%] bottom-[10%] h-[220px] w-[220px] rounded-full bg-[#D9E0D4]/35 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-[1540px] items-center justify-center">
        <div className="w-full max-w-[520px] rounded-[34px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.94)_0%,rgba(252,248,242,0.9)_100%)] p-8 shadow-[0_40px_90px_rgba(109,90,58,0.12)] backdrop-blur-[18px] sm:p-10 lg:p-12">
          <div className="flex items-center gap-4">
            <div className="h-[2px] w-14 rounded-full bg-[#2C5447]" />
            <h1 className="font-['Neutraface_2_Text:Demi',sans-serif] text-[24px] leading-none tracking-[0.14em] text-[#1B2B24] lg:text-[28px]">
              GİRİŞ YAP
            </h1>
          </div>

          <form className="mt-8 space-y-4 lg:mt-10" onSubmit={handleSubmit}>
            <label className="block">
              <span className={fieldLabelClassName}>TC</span>
              <input
                autoComplete="username"
                className={inputClassName}
                inputMode="numeric"
                maxLength={11}
                type="text"
                value={normalizedTckn}
                onChange={(event) => setTckn(normalizeTckn(event.target.value))}
                required
              />
            </label>

            <label className="block">
              <span className={fieldLabelClassName}>Şifre</span>
              <input
                autoComplete="current-password"
                className={inputClassName}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <label className="block">
              <span className={fieldLabelClassName}>OTP</span>
              <input
                autoComplete="one-time-code"
                className={inputClassName}
                inputMode="numeric"
                maxLength={6}
                type="text"
                value={normalizedOtp}
                onChange={(event) => setOtpCode(normalizeOtp(event.target.value))}
              />
            </label>

            <button
              className="mt-3 flex h-[64px] w-full cursor-pointer items-center justify-center rounded-[22px] bg-[#20372F] px-4 text-[12px] font-semibold uppercase tracking-[0.24em] text-white shadow-[0_18px_34px_rgba(32,55,47,0.18)] transition duration-200 hover:bg-[#172A23] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#EEE3CC] disabled:cursor-not-allowed disabled:bg-[#8B9188]"
              type="submit"
              disabled={!canSubmit}
            >
              Giriş Yap
            </button>

            {isOtpStep ? (
              <button
                className="h-[52px] w-full rounded-2xl border border-[#2D4363] px-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:border-[#3B5A84] hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                type="button"
                onClick={() => {
                  void handleResendCode();
                }}
                disabled={isSubmitting}
              >
                KODU TEKRAR GÖNDER
              </button>
            ) : null}
          </form>

          <LoginStatusMessage tone="error">{errorMessage}</LoginStatusMessage>
          <LoginStatusMessage tone="success">{successMessage}</LoginStatusMessage>
        </div>
      </div>
    </section>
  );
}
