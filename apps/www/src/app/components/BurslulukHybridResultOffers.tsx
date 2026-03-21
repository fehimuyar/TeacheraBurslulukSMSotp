import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { trackEvent } from '../lib/analytics';
import homeHeroVideo from '../../assets/video/home-hero.mp4';
import homeHeroVideoWebm from '../../assets/video/home-hero.webm';

type HybridTab = 'programs' | 'prices' | 'packages' | 'video';

type ProgramItem = {
  id: string;
  title: string;
  category: string;
  level: string;
  mode: 'ONLINE' | 'HIBRIT' | 'YUZ_YUZE';
  durationWeeks: number;
  monthlyPrice: number;
};

type PriceItem = {
  id: string;
  title: string;
  scope: string;
  monthlyPrice: number;
  startFee: number;
};

type BundleItem = {
  id: string;
  title: string;
  includes: string[];
  totalPrice: number;
  discountRate: number;
};

type VideoItem = {
  id: string;
  title: string;
  durationLabel: string;
  summary: string;
};

const PROGRAMS: ProgramItem[] = [
  { id: 'p01', title: 'Cambridge Kids Starters', category: 'INGILIZCE', level: 'A1', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 2900 },
  { id: 'p02', title: 'Cambridge Kids Movers', category: 'INGILIZCE', level: 'A1-A2', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 3100 },
  { id: 'p03', title: 'Cambridge Kids Flyers', category: 'INGILIZCE', level: 'A2', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 3300 },
  { id: 'p04', title: 'Teen General English', category: 'INGILIZCE', level: 'A2-B1', mode: 'ONLINE', durationWeeks: 16, monthlyPrice: 3600 },
  { id: 'p05', title: 'Teen IELTS Foundation', category: 'INGILIZCE', level: 'B1', mode: 'ONLINE', durationWeeks: 16, monthlyPrice: 4200 },
  { id: 'p06', title: 'Teen IELTS Band Booster', category: 'INGILIZCE', level: 'B1-B2', mode: 'HIBRIT', durationWeeks: 16, monthlyPrice: 4900 },
  { id: 'p07', title: 'TOEFL Sprint', category: 'INGILIZCE', level: 'B2-C1', mode: 'ONLINE', durationWeeks: 10, monthlyPrice: 5400 },
  { id: 'p08', title: 'PTE Acceleration', category: 'INGILIZCE', level: 'B2-C1', mode: 'ONLINE', durationWeeks: 10, monthlyPrice: 5600 },
  { id: 'p09', title: 'YDS / YOKDIL Core', category: 'INGILIZCE', level: 'B1-B2', mode: 'HIBRIT', durationWeeks: 14, monthlyPrice: 4700 },
  { id: 'p10', title: 'YDS / YOKDIL Intensive', category: 'INGILIZCE', level: 'B2-C1', mode: 'ONLINE', durationWeeks: 10, monthlyPrice: 5200 },
  { id: 'p11', title: 'Almanca Genel Program', category: 'ALMANCA', level: 'A1-A2', mode: 'YUZ_YUZE', durationWeeks: 16, monthlyPrice: 3500 },
  { id: 'p12', title: 'Goethe Zertifikat Prep', category: 'ALMANCA', level: 'B1-B2', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 4600 },
  { id: 'p13', title: 'TestDaF Akademik Prep', category: 'ALMANCA', level: 'B2-C1', mode: 'ONLINE', durationWeeks: 12, monthlyPrice: 5100 },
  { id: 'p14', title: 'Fransizca Genel Program', category: 'FRANSIZCA', level: 'A1-A2', mode: 'YUZ_YUZE', durationWeeks: 16, monthlyPrice: 3500 },
  { id: 'p15', title: 'DELF B1 Hazirlik', category: 'FRANSIZCA', level: 'B1', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 4500 },
  { id: 'p16', title: 'DALF C1 Hazirlik', category: 'FRANSIZCA', level: 'C1', mode: 'ONLINE', durationWeeks: 12, monthlyPrice: 5400 },
  { id: 'p17', title: 'Ispanyolca Genel Program', category: 'ISPANYOLCA', level: 'A1-A2', mode: 'YUZ_YUZE', durationWeeks: 16, monthlyPrice: 3400 },
  { id: 'p18', title: 'DELE B1 Hazirlik', category: 'ISPANYOLCA', level: 'B1', mode: 'HIBRIT', durationWeeks: 12, monthlyPrice: 4400 },
  { id: 'p19', title: 'DELE B2 Sprint', category: 'ISPANYOLCA', level: 'B2', mode: 'ONLINE', durationWeeks: 10, monthlyPrice: 5000 },
  { id: 'p20', title: 'Rusca Genel Program', category: 'RUSCA', level: 'A1-A2', mode: 'YUZ_YUZE', durationWeeks: 16, monthlyPrice: 3300 },
  { id: 'p21', title: 'TORFL Hazirlik', category: 'RUSCA', level: 'B1-B2', mode: 'ONLINE', durationWeeks: 12, monthlyPrice: 4600 },
  { id: 'p22', title: 'Italyanca Genel Program', category: 'ITALYANCA', level: 'A1-A2', mode: 'HIBRIT', durationWeeks: 16, monthlyPrice: 3400 },
  { id: 'p23', title: 'CELI Hazirlik', category: 'ITALYANCA', level: 'B1-B2', mode: 'ONLINE', durationWeeks: 12, monthlyPrice: 4700 },
  { id: 'p24', title: 'Arapca Genel Program', category: 'ARAPCA', level: 'A1-A2', mode: 'YUZ_YUZE', durationWeeks: 16, monthlyPrice: 3200 },
];

const PRICE_ROWS: PriceItem[] = [
  { id: 'f01', title: 'Kids Grup (Aylik)', scope: 'Haftada 2 ders', monthlyPrice: 2900, startFee: 900 },
  { id: 'f02', title: 'Teens Grup (Aylik)', scope: 'Haftada 2 ders', monthlyPrice: 3600, startFee: 1200 },
  { id: 'f03', title: 'Sinav Hazirlik Grup', scope: 'IELTS/TOEFL/PTE', monthlyPrice: 4900, startFee: 1500 },
  { id: 'f04', title: 'Birebir Premium', scope: 'Haftada 2 ders', monthlyPrice: 6900, startFee: 0 },
  { id: 'f05', title: 'Birebir Sinav Sprint', scope: '10 hafta paket', monthlyPrice: 7900, startFee: 0 },
  { id: 'f06', title: 'Akademik YDS/YOKDIL', scope: '12 hafta paket', monthlyPrice: 5200, startFee: 1000 },
];

const BUNDLES: BundleItem[] = [
  {
    id: 'b01',
    title: 'Starter Hybrid Paket',
    includes: ['Seviye tespit', '8 hafta grup', '2 adet mock sınav', 'Aylik ilerleme raporu'],
    totalPrice: 9800,
    discountRate: 15,
  },
  {
    id: 'b02',
    title: 'Exam Booster Paket',
    includes: ['12 hafta sınav hazırlık', '4 adet full mock', '1 birebir koçluk', 'Rapor + aksiyon planı'],
    totalPrice: 16800,
    discountRate: 20,
  },
  {
    id: 'b03',
    title: 'Premium Mentorluk Paket',
    includes: ['16 hafta hibrit eğitim', 'Haftalık birebir seans', 'Sınırsız deneme havuzu', 'Danışman öncelikli takip'],
    totalPrice: 24900,
    discountRate: 22,
  },
];

const VIDEOS: VideoItem[] = [
  { id: 'v01', title: 'Program Secim Rehberi', durationLabel: '05:20', summary: 'Seviyeye ve hedefe gore dogru program secimi.' },
  { id: 'v02', title: 'Sinav Hazirlik Yol Haritasi', durationLabel: '06:40', summary: 'IELTS/TOEFL/PTE icin haftalik uygulama plani.' },
  { id: 'v03', title: 'Bursluluk Sonrasi Kayit Akisi', durationLabel: '03:55', summary: 'Randevu -> gorusme -> kayit donusum adimlari.' },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
}

function modeLabel(mode: ProgramItem['mode']) {
  if (mode === 'YUZ_YUZE') return 'Yuz yuze';
  if (mode === 'HIBRIT') return 'Hibrit';
  return 'Online';
}

export default function BurslulukHybridResultOffers() {
  const [tab, setTab] = useState<HybridTab>('programs');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, tab]);

  useEffect(() => {
    trackEvent('hybrid_result_tab_view', {
      tab,
      source: 'bursluluk_result_hybrid_panel',
    });
  }, [tab]);

  const filteredPrograms = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return PROGRAMS;
    return PROGRAMS.filter((item) => {
      return (
        item.title.toLowerCase().includes(query)
        || item.category.toLowerCase().includes(query)
        || item.level.toLowerCase().includes(query)
        || modeLabel(item.mode).toLowerCase().includes(query)
      );
    });
  }, [search]);

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredPrograms.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedPrograms = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredPrograms.slice(start, start + pageSize);
  }, [filteredPrograms, safePage]);

  const tabButtonClass = (value: HybridTab) =>
    `rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
      tab === value
        ? 'border-[#D92E27] bg-[#D92E27]/20 text-[#FFD2CE]'
        : 'border-white/16 text-white/72 hover:border-white/30'
    }`;

  return (
    <section className="mt-8 rounded-2xl border border-white/12 bg-[#06101F]/88 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/56">Hibrit Sonuc Paneli</p>
          <h2 className="mt-2 text-[24px] font-semibold text-white">Program / Fiyat / Paket / Video</h2>
          <p className="mt-2 max-w-[760px] text-[14px] text-white/70">
            Sonucunuza gore uygun programlari, fiyat satirlarini, paketleri ve hizli bilgilendirme videolarini tek ekranda gorebilirsiniz.
          </p>
        </div>
        <Link
          to="/iletisim?source=bursluluk_hybrid_result_consult"
          className="rounded-full border border-[#8BDFC7]/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#D5F6EB]"
          onClick={() =>
            trackEvent('cta_click', {
              cta_id: 'bursluluk_hybrid_result_danisman',
              cta_location: 'bursluluk_sonuc',
              cta_destination: '/iletisim',
              source: 'hybrid_result_panel',
              cta_type: 'link',
            })
          }
        >
          Danismanla Gorus
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={tabButtonClass('programs')} onClick={() => setTab('programs')}>Programlar</button>
        <button type="button" className={tabButtonClass('prices')} onClick={() => setTab('prices')}>Fiyatlar</button>
        <button type="button" className={tabButtonClass('packages')} onClick={() => setTab('packages')}>Paketler</button>
        <button type="button" className={tabButtonClass('video')} onClick={() => setTab('video')}>Video</button>
      </div>

      {tab === 'programs' ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              className="h-11 w-full rounded-xl border border-white/18 bg-[#071325] px-4 text-white outline-none focus:border-[#D92E27] sm:max-w-[360px]"
              placeholder="Program ara (dil, seviye, format)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p className="text-[12px] text-white/60">Toplam {filteredPrograms.length} program</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {pagedPrograms.map((item) => (
              <article key={item.id} className="rounded-xl border border-white/12 bg-[#08172A] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">{item.category}</p>
                <h3 className="mt-2 text-[17px] font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-[13px] text-white/70">
                  {item.level} • {modeLabel(item.mode)} • {item.durationWeeks} hafta
                </p>
                <p className="mt-3 text-[18px] font-semibold text-[#D5F6EB]">{formatMoney(item.monthlyPrice)} / ay</p>
              </article>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[12px] text-white/58">Sayfa {safePage} / {totalPages}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="rounded-full border border-white/16 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-white/75 disabled:opacity-50"
              >
                Geri
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="rounded-full border border-white/16 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-white/75 disabled:opacity-50"
              >
                Ileri
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'prices' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-white/60">
                <th className="border-b border-white/12 px-3 py-2">Kalem</th>
                <th className="border-b border-white/12 px-3 py-2">Kapsam</th>
                <th className="border-b border-white/12 px-3 py-2">Aylik</th>
                <th className="border-b border-white/12 px-3 py-2">Baslangic</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_ROWS.map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-white/8 px-3 py-2 text-white">{row.title}</td>
                  <td className="border-b border-white/8 px-3 py-2 text-white/70">{row.scope}</td>
                  <td className="border-b border-white/8 px-3 py-2 text-[#D5F6EB]">{formatMoney(row.monthlyPrice)}</td>
                  <td className="border-b border-white/8 px-3 py-2 text-white/80">{formatMoney(row.startFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'packages' ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {BUNDLES.map((bundle) => (
            <article key={bundle.id} className="rounded-xl border border-white/12 bg-[#08172A] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#FFD2CE]">%{bundle.discountRate} indirim</p>
              <h3 className="mt-2 text-[17px] font-semibold text-white">{bundle.title}</h3>
              <ul className="mt-3 space-y-1 text-[13px] text-white/72">
                {bundle.includes.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
              <p className="mt-4 text-[20px] font-semibold text-[#D5F6EB]">{formatMoney(bundle.totalPrice)}</p>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'video' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-white/12">
            <video className="h-[300px] w-full object-cover sm:h-[360px]" autoPlay muted loop playsInline preload="metadata">
              <source src={homeHeroVideoWebm} type="video/webm" />
              <source src={homeHeroVideo} type="video/mp4" />
            </video>
          </div>
          <div className="space-y-3">
            {VIDEOS.map((video) => (
              <article key={video.id} className="rounded-xl border border-white/12 bg-[#08172A] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">{video.durationLabel}</p>
                <h3 className="mt-2 text-[16px] font-semibold text-white">{video.title}</h3>
                <p className="mt-2 text-[13px] text-white/70">{video.summary}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/fiyatlar" className="rounded-full border border-white/16 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-white/75">Tum Fiyatlar</Link>
        <Link to="/egitimlerimiz" className="rounded-full border border-white/16 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-white/75">Tum Programlar</Link>
        <Link to="/academy" className="rounded-full border border-white/16 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-white/75">Akademi Icerikleri</Link>
      </div>
    </section>
  );
}
