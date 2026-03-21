import { Link, useNavigate } from 'react-router';
import homeHeroVideo from '../../assets/video/home-hero.mp4';
import homeHeroVideoWebm from '../../assets/video/home-hero.webm';
import { readCandidateSession } from './bursluluk/burslulukFlowSession';

function smsStatusLabel(status: string | undefined) {
  const normalized = String(status || '').toUpperCase();
  if (!normalized || normalized === 'NOT_QUEUED') return 'Hazirlaniyor';
  if (normalized === 'QUEUED') return 'Kuyrukta';
  if (normalized === 'SENT') return 'Gonderildi';
  if (normalized === 'DELIVERED') return 'Iletildi';
  if (normalized === 'READ') return 'Okundu';
  if (normalized === 'FAILED' || normalized === 'DLQ') return 'Tekrar denenecek';
  return normalized;
}

export default function BurslulukOnayPage() {
  const navigate = useNavigate();
  const session = readCandidateSession();

  if (!session) {
    return (
      <section className="mx-auto min-h-[65vh] max-w-[840px] px-4 pb-16 pt-[132px] text-white sm:px-6">
        <div className="rounded-2xl border border-white/12 bg-[#091427]/85 p-8">
          <h1 className="text-[28px] font-semibold">Onay ekranina ulasilamadi</h1>
          <p className="mt-3 text-white/70">Aday oturumu bulunamadi. Lutfen basvuru/giris adimina donun.</p>
          <Link to="/bursluluk/giris" className="mt-6 inline-flex rounded-full bg-[#D92E27] px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.15em]">
            Giris Sayfasina Don
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(146,11,35,0.34),transparent_42%),radial-gradient(circle_at_84%_12%,rgba(39,102,129,0.26),transparent_34%),linear-gradient(138deg,#06050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="relative mx-auto grid w-full max-w-[1160px] gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[26px] border border-white/12 bg-[#091427]/85 p-6">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Basvuru onayi</p>
          <h1 className="mt-3 text-[36px] font-semibold text-white sm:text-[44px]">Basvurunuz Alindi</h1>
          <p className="mt-4 text-[18px] leading-[1.8] text-white/72">
            Aday kodu: <span className="font-semibold text-white">{session.candidateCode || session.applicationNo}</span>
          </p>
          <p className="mt-2 text-[18px] leading-[1.8] text-white/72">
            SMS durumu: <span className="font-semibold text-white">{smsStatusLabel(session.credentialsSmsStatus)}</span>
          </p>
          <p className="mt-2 text-[16px] leading-[1.8] text-white/72">
            Sube: <span className="font-semibold text-white">{session.section || '-'}</span>
          </p>
          <p className="mt-1 text-[16px] leading-[1.8] text-white/72">
            Sinav oturumu:{' '}
            <span className="font-semibold text-white">
              {session.examSlotLabel || new Date(session.examOpenAt).toLocaleString('tr-TR')}
            </span>
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-[#071021]/90 p-5">
            <h2 className="text-[17px] font-semibold text-white">Sınava katılım yönteminiz</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] text-white/70">
              <li>SMS ile gelen kullanici adi/sifre bilgisini saklayin.</li>
              <li>Sınav saati gelene kadar bekleme ekraninda teknik kontrol yapin.</li>
              <li>Tarayici sekmesini kapatmadan sinavi tek oturumda tamamlayin.</li>
            </ul>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/bursluluk/bekleme')}
              className="rounded-full bg-[#D92E27] px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-[#bf251f]"
            >
              Bekleme Ekranina Gec
            </button>
            <Link to="/bursluluk/giris" className="rounded-full border border-white/18 px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/72">
              Giris Sayfasina Don
            </Link>
          </div>
        </div>

        <div className="rounded-[26px] border border-white/12 bg-[#091427]/85 p-6">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/52">Teknik bilgilendirme videosu</p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <video className="h-[420px] w-full object-cover" autoPlay muted loop playsInline preload="metadata">
              <source src={homeHeroVideoWebm} type="video/webm" />
              <source src={homeHeroVideo} type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}
