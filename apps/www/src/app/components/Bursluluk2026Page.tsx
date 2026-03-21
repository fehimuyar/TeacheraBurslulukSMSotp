import { Link } from 'react-router';

const trustBadges = ['ÜCRETSİZ', 'MEB ONAYLI', 'ONLINE'] as const;

export default function Bursluluk2026Page() {
  return (
    <section className="relative min-h-screen overflow-hidden px-4 pb-16 pt-[118px] sm:px-6 lg:px-12 lg:pt-[142px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(146,11,35,0.36),transparent_42%),radial-gradient(circle_at_86%_12%,rgba(75,66,96,0.26),transparent_34%),linear-gradient(138deg,#06050D_0%,#0A0C16_52%,#05070F_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_0.75px,transparent_0.75px)] [background-size:14px_14px] opacity-[0.14]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#05070f]/90" />

      <div className="relative mx-auto grid w-full max-w-[1320px] gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-12">
        <div className="max-w-[640px]">
          <p className="mb-6 flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.32em] text-[#E35347]">
            <span className="h-px w-10 bg-[#E35347]" />
            Teachera Bursluluk 2026
          </p>

          <h1 className="text-[44px] font-semibold leading-[1.03] text-white sm:text-[56px] lg:text-[68px]">
            Teachera Online
            <br />
            Bursluluk Sınavı
          </h1>

          <p className="mt-7 max-w-[580px] text-[24px] leading-[1.9] text-white/58 sm:text-[20px]">
            Teachera Dil Okulu&apos;nun Milli Eğitim Bakanlığı onaylı online bursluluk sınavı ile
            Konya genelindeki tüm ilkokul, ortaokul ve lise öğrencilerine kapılarımızı açıyoruz.
            Katılım ücretsizdir. Detaylar için videoyu izleyebilirsiniz.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {trustBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-5 py-2 text-[12px] font-semibold tracking-[0.15em] text-white/74"
              >
                <span className="mr-2 text-[10px] text-[#E35347]">✓</span>
                {badge}
              </span>
            ))}
          </div>

          <div className="mt-8">
            <Link
              to="/bursluluk/giris"
              className="inline-flex items-center gap-2 rounded-full bg-[#D92E27] px-8 py-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#bf251f]"
            >
              Hemen Başvur
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-[30px] border border-white/14 bg-white/[0.055] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <div className="relative overflow-hidden rounded-[26px] border border-white/12 bg-[#121826]">
              <video
                className="h-[300px] w-full object-cover sm:h-[380px] md:h-[470px] lg:h-[520px]"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                src="/media/bursluluk-2026-hero.mp4"
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/18" />

              <button
                type="button"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/28 px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.13em] text-white/84 backdrop-blur-md"
              >
                Detaylar İçin Önce Videoyu İzle
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
