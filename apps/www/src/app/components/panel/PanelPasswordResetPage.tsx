import { useEffect, useState, type FormEvent } from 'react';
import { panelFetch } from '../../api/panelApi';
import { PanelFeedbackMessage, panelSoftCardClassName } from './panelUi';

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const inputClassName =
  "h-[60px] w-full rounded-[22px] border border-[#DDD4C6] bg-[#FFFCF7] px-5 text-[15px] text-[#16251F] outline-none transition placeholder:text-[#8A7F71] focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]";

export default function PanelPasswordResetPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      try {
        const response = await panelFetch('/api/panel/auth/me', {
          method: 'GET',
        });
        if (!cancelled && (response.status === 401 || response.status === 403)) {
          window.location.assign('/panel/login?next=/panel/password-reset');
        }
      } catch {
        if (!cancelled) {
          window.location.assign('/panel/login?next=/panel/password-reset');
        }
      }
    };

    void verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword.length < 10) {
      setErrorMessage('Yeni şifre en az 10 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Şifre tekrarı eşleşmiyor.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await panelFetch('/api/panel/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const payload = await readJsonSafe(response);
      if (response.status === 404) {
        setErrorMessage('Şifre yenileme API endpointi henüz aktif değil. Backend endpointi açıldığında bu ekran doğrudan çalışacaktır.');
        return;
      }

      if (!response.ok) {
        const message = String(payload?.message || payload?.error || 'Şifre yenileme başarısız.');
        setErrorMessage(message);
        return;
      }

      setSuccessMessage('Şifreniz güncellendi. Dashboard ekranına yönlendiriliyorsunuz...');
      window.setTimeout(() => {
        window.location.assign('/panel/dashboard');
      }, 700);
    } catch {
      setErrorMessage('Ağ hatası nedeniyle şifre yenileme tamamlanamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#F5EFE4] px-4 py-14 sm:px-6 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#F9F4EC_0%,#F2EBDD_48%,#ECE3D5_100%)]" />
      <div className="pointer-events-none absolute right-[10%] top-[14%] h-[340px] w-[340px] rounded-full bg-[#E8DBC1]/50 blur-3xl" />
      <div className="pointer-events-none absolute left-[16%] bottom-[10%] h-[220px] w-[220px] rounded-full bg-[#D9E0D4]/35 blur-3xl" />

      <div className="relative mx-auto mt-10 w-full max-w-[760px] rounded-[34px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.95)_0%,rgba(252,248,242,0.92)_100%)] p-7 shadow-[0_40px_90px_rgba(109,90,58,0.12)] backdrop-blur-[18px] sm:p-8 lg:p-10">
        <div className="flex items-center gap-4">
          <div className="h-[2px] w-14 rounded-full bg-[#2C5447]" />
          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.23em] text-[#7A7063]">Teachera Ops</p>
        </div>
        <h1 className="mt-4 font-['Neutraface_2_Text:Bold',sans-serif] text-[40px] leading-[1.05] text-[#1B2B24] sm:text-[46px]">Şifre Yenileme</h1>
        <p className="mt-3 font-['Neutraface_2_Text:Book',sans-serif] text-[16px] leading-[1.8] text-[#666D65]">
          Geçici şifre ile giriş yaptığınız için yeni şifre belirlemeniz gerekiyor.
        </p>

        <div className={`${panelSoftCardClassName} mt-6`}>
          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.2em] text-[#7A7063]">Güvenlik Notu</p>
          <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[15px] leading-[1.75] text-[#626860]">
            Yeni şifre en az 10 karakter olmalı. Güncelleme tamamlandığında panel dashboard ekranına otomatik yönlendirme yapılır.
          </p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.2em] text-[#7A7063]">Yeni Şifre</span>
            <input
              autoComplete="new-password"
              className={inputClassName}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="En az 10 karakter"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.2em] text-[#7A7063]">Yeni Şifre (Tekrar)</span>
            <input
              autoComplete="new-password"
              className={inputClassName}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Şifreyi tekrar girin"
              required
            />
          </label>

          <button
            className="mt-2 h-[60px] w-full rounded-[22px] bg-[#20372F] px-4 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.22em] text-white shadow-[0_18px_34px_rgba(32,55,47,0.18)] transition hover:bg-[#172A23] disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'KAYDEDİLİYOR' : 'ŞİFREYİ GÜNCELLE'}
          </button>
        </form>

        {errorMessage ? <PanelFeedbackMessage className="mt-4 text-[14px]" tone="error">{errorMessage}</PanelFeedbackMessage> : null}

        {successMessage ? (
          <PanelFeedbackMessage className="mt-4 text-[14px]" tone="success">
            {successMessage}
          </PanelFeedbackMessage>
        ) : null}
      </div>
    </section>
  );
}
