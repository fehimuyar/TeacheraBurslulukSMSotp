import { useEffect, useState, type FormEvent } from 'react';
import { panelFetch } from '../../api/panelApi';

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
  'h-[58px] w-full rounded-2xl border border-[#1A273A] bg-[#020A16] px-5 text-[15px] text-white/90 outline-none transition placeholder:text-white/25 focus:border-[#2D4363] focus:ring-2 focus:ring-[#2D4363]/35';

export default function PanelLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpChallengeId, setOtpChallengeId] = useState('');
  const [otpChallengeToken, setOtpChallengeToken] = useState('');
  const [otpMaskedPhone, setOtpMaskedPhone] = useState('');
  const [isSessionCheckLoading, setIsSessionCheckLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isOtpStep = Boolean(otpChallengeId && otpChallengeToken);
  const canSubmit = email.trim()
    && password
    && (!isOtpStep || otpCode.length === 6)
    && !isSubmitting
    && !isSessionCheckLoading;

  useEffect(() => {
    let cancelled = false;

    const verifyExistingSession = async () => {
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
          email: email.trim(),
          password,
          otpCode,
          challengeId: otpChallengeId,
          challengeToken: otpChallengeToken,
        }),
      });

      const loginPayload = await readJsonSafe(loginResponse);
      if (!loginResponse.ok || loginPayload?.ok === false) {
        setErrorMessage(normalizeMessage(loginPayload, 'Panel girişi başarısız.'));
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
    <section className="relative min-h-screen overflow-hidden px-4 py-14 sm:px-6 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_2%_28%,rgba(110,17,30,0.35),transparent_34%),radial-gradient(circle_at_82%_8%,rgba(22,75,90,0.22),transparent_34%),linear-gradient(160deg,#00020B_0%,#000918_45%,#02122A_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.14)_0.7px,transparent_0.7px)] [background-size:13px_13px] opacity-[0.12]" />

      <div className="relative mx-auto mt-10 grid w-full max-w-[1020px] gap-5 lg:grid-cols-[0.95fr_1.15fr]">
        <aside className="rounded-[28px] border border-[#1A2535] bg-[#0A1323]/78 p-8 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm lg:p-9">
          <p className="text-[14px] font-semibold uppercase tracking-[0.23em] text-white/52">Teachera Ops</p>
          <h1 className="mt-3 text-[48px] font-semibold leading-[1.1] text-white sm:text-[50px]">Panel Girişi</h1>
          <p className="mt-4 text-[27px] leading-[1.9] text-white/45 sm:text-[20px]">
            Eğitim danışmanı, admin ve owner kullanıcılar tek operasyon yüzeyine bu ekrandan giriş yapar.
          </p>

          <div className="mt-7 space-y-3">
            <div className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.21em] text-white/45">Giriş Sonrası</p>
              <p className="mt-2 text-[25px] leading-[1.8] text-white/38 sm:text-[17px]">
                CRM/Mobikob inbox, bursluluk operasyonu, görevler ve ayar ekranları aynı panelde açılır.
              </p>
            </div>

            <div className="rounded-[22px] border border-[#1A273A] bg-[#071021]/82 p-5">
              <p className="text-[23px] leading-[1.8] text-white/38 sm:text-[17px]">
                Geçici şifre ile giriş yapan kullanıcılar otomatik olarak şifre yenileme ekranına yönlendirilir.
              </p>
            </div>
          </div>
        </aside>

        <div className="rounded-[28px] border border-[#1A2535] bg-[#0A1323]/82 p-7 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:p-8 lg:p-9">
          <p className="text-[14px] font-semibold uppercase tracking-[0.23em] text-white/52">Kimlik Doğrulama</p>
          <p className="mt-3 text-[25px] leading-[1.8] text-white/45 sm:text-[18px]">
            Size tanımlanan kullanıcı adı ve şifre ile giriş yapın.
          </p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.2em] text-white/48">Kullanıcı Adı</span>
              <input
                autoComplete="email"
                className={inputClassName}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="aliye@teachera.com.tr"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.2em] text-white/48">Şifre</span>
              <input
                autoComplete="current-password"
                className={inputClassName}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="********"
                required
              />
            </label>

            {isOtpStep ? (
              <label className="block">
                <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.2em] text-white/48">SMS OTP (6 hane)</span>
                <input
                  autoComplete="one-time-code"
                  className={inputClassName}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D+/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                />
                {otpMaskedPhone ? (
                  <span className="mt-2 block text-[12px] text-white/45">Kod gönderilen telefon: {otpMaskedPhone}</span>
                ) : null}
              </label>
            ) : null}

            <button
              className="mt-2 h-[58px] w-full rounded-2xl bg-[#CA3C35] px-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-[#b4332d] disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting ? (isOtpStep ? 'KOD DOĞRULANIYOR' : 'KOD GÖNDERİLİYOR') : (isOtpStep ? 'KODU DOĞRULA' : 'SMS KODU GÖNDER')}
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

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-[#6F2824] bg-[#2B1214]/80 px-4 py-3 text-[14px] text-[#FFB8B1]">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="mt-4 rounded-xl border border-[#1E5A4C] bg-[#0F2C27]/80 px-4 py-3 text-[14px] text-[#9FE4D0]">
              {successMessage}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
