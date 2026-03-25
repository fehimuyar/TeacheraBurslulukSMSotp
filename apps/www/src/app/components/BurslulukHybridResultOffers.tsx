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
    includes: ['Seviye tespit', '8 hafta grup', '2 adet mock sinav', 'Aylik ilerleme raporu'],
    totalPrice: 9800,
    discountRate: 15,
  },
  {
    id: 'b02',
    title: 'Exam Booster Paket',
    includes: ['12 hafta sinav hazirlik', '4 adet full mock', '1 birebir kocluk', 'Rapor + aksiyon plani'],
    totalPrice: 16800,
    discountRate: 20,
  },
  {
    id: 'b03',
    title: 'Premium Mentorluk Paket',
    includes: ['16 hafta hibrit egitim', 'Haftalik birebir seans', 'Sinirsiz deneme havuzu', 'Danisman oncelikli takip'],
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

function tabButtonClass(active: boolean) {
  return active
    ? 'border-[#68232E] bg-[#68232E] text-white shadow-[0_14px_28px_rgba(104,35,46,0.16)]'
    : 'border-[#D8CDC0] bg-white/76 text-[#5B4F45] hover:border-[#B8AA9A] hover:bg-white';
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

  return (
    <section className="mt-8 rounded-[28px] border border-[#DDD3C7] bg-[linear-gradient(180deg,#FCF8F2_0%,#F7F1E8_100%)] p-5 shadow-[0_22px_54px_rgba(25,20,15,0.05)] sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel>Hibrit Sonuc Paneli</SectionLabel>
          <h2 className="font-['Neutraface_2_Display:Titling',sans-serif] text-[24px] uppercase leading-[1.06] tracking-[0.02em] text-[#68232E] sm:text-[28px]">
            Program, fiyat ve paket onerileri
          </h2>
          <p className="mt-3 max-w-[760px] text-[14px] leading-[1.76] text-[#5B4F45] sm:text-[15px]">
            Sonucunuza gore uygun programlari, fiyat satirlarini, paketleri ve hizli bilgilendirme videolarini tek ekranda inceleyebilirsiniz.
          </p>
        </div>
        <Link
          to="/iletisim?source=bursluluk_hybrid_result_consult"
          className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#2C5447] px-6 py-3 text-[12px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(44,84,71,0.18)] transition hover:bg-[#23463B] hover:shadow-[0_20px_36px_rgba(44,84,71,0.22)]"
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

      <div className="mt-5 flex flex-wrap gap-2.5">
        <button
          type="button"
          className={`rounded-full border px-4 py-2.5 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] transition ${tabButtonClass(tab === 'programs')}`}
          onClick={() => setTab('programs')}
        >
          Programlar
        </button>
        <button
          type="button"
          className={`rounded-full border px-4 py-2.5 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] transition ${tabButtonClass(tab === 'prices')}`}
          onClick={() => setTab('prices')}
        >
          Fiyatlar
        </button>
        <button
          type="button"
          className={`rounded-full border px-4 py-2.5 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] transition ${tabButtonClass(tab === 'packages')}`}
          onClick={() => setTab('packages')}
        >
          Paketler
        </button>
        <button
          type="button"
          className={`rounded-full border px-4 py-2.5 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.16em] transition ${tabButtonClass(tab === 'video')}`}
          onClick={() => setTab('video')}
        >
          Video
        </button>
      </div>

      {tab === 'programs' ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input
              className="h-12 w-full rounded-[18px] border border-[#D8CDC0] bg-white/86 px-4 text-[14px] text-[#3E342D] outline-none transition focus:border-[#68232E] focus:bg-white sm:max-w-[360px]"
              placeholder="Program ara (dil, seviye, format)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p className="text-[12px] uppercase tracking-[0.14em] text-[#7A7063]">Toplam {filteredPrograms.length} program</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {pagedPrograms.map((item) => (
              <article key={item.id} className="rounded-[24px] border border-[#E2D8CC] bg-[#FFFCF8] p-4 shadow-[0_16px_30px_rgba(25,20,15,0.04)] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.18em] text-[#4A7067]">
                    {item.category}
                  </p>
                  <span className="rounded-full border border-[#D8DED7] bg-[#F5FAF7] px-3 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#2C5447]">
                    {modeLabel(item.mode)}
                  </span>
                </div>
                <h3 className="mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[20px] uppercase leading-[1.08] tracking-[0.02em] text-[#68232E]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[14px] leading-[1.7] text-[#5B4F45]">
                  {item.level} seviye • {item.durationWeeks} hafta sureli plan
                </p>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
                  <p className="font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-none tracking-[0.02em] text-[#2C5447]">
                    {formatMoney(item.monthlyPrice)}
                  </p>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">Aylik plan</span>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className="text-[12px] uppercase tracking-[0.14em] text-[#7A7063]">Sayfa {safePage} / {totalPages}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={safePage <= 1}
                className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#5B4F45] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Geri
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safePage >= totalPages}
                className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#5B4F45] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ileri
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'prices' ? (
        <div className="mt-5 overflow-x-auto rounded-[24px] border border-[#E2D8CC] bg-[#FFFCF8] shadow-[0_16px_30px_rgba(25,20,15,0.04)]">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[#7A7063]">
                <th className="border-b border-[#E7DED2] px-4 py-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em]">Kalem</th>
                <th className="border-b border-[#E7DED2] px-4 py-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em]">Kapsam</th>
                <th className="border-b border-[#E7DED2] px-4 py-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em]">Aylik</th>
                <th className="border-b border-[#E7DED2] px-4 py-3 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em]">Baslangic</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_ROWS.map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-[#F0E8DE] px-4 py-3 text-[#3E342D]">{row.title}</td>
                  <td className="border-b border-[#F0E8DE] px-4 py-3 text-[#5B4F45]">{row.scope}</td>
                  <td className="border-b border-[#F0E8DE] px-4 py-3 text-[#2C5447]">{formatMoney(row.monthlyPrice)}</td>
                  <td className="border-b border-[#F0E8DE] px-4 py-3 text-[#68232E]">{formatMoney(row.startFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'packages' ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {BUNDLES.map((bundle) => (
            <article key={bundle.id} className="rounded-[24px] border border-[#E2D8CC] bg-[#FFFCF8] p-5 shadow-[0_16px_30px_rgba(25,20,15,0.04)]">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em] text-[#4A7067]">
                %{bundle.discountRate} indirim
              </p>
              <h3 className="mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[20px] uppercase leading-[1.08] tracking-[0.02em] text-[#68232E]">
                {bundle.title}
              </h3>
              <ul className="mt-4 space-y-2 text-[14px] leading-[1.68] text-[#5B4F45]">
                {bundle.includes.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="pt-[1px] text-[#2C5447]">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 font-['Neutraface_2_Display:Titling',sans-serif] text-[28px] uppercase leading-none tracking-[0.02em] text-[#2C5447]">
                {formatMoney(bundle.totalPrice)}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'video' ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[26px] border border-[#E2D8CC] bg-[#FFFCF8] shadow-[0_18px_34px_rgba(25,20,15,0.04)]">
            <video className="h-[300px] w-full object-cover sm:h-[360px]" autoPlay muted loop playsInline preload="metadata">
              <source src={homeHeroVideoWebm} type="video/webm" />
              <source src={homeHeroVideo} type="video/mp4" />
            </video>
          </div>
          <div className="space-y-3">
            {VIDEOS.map((video) => (
              <article key={video.id} className="rounded-[22px] border border-[#E2D8CC] bg-[#FFFCF8] p-4 shadow-[0_16px_30px_rgba(25,20,15,0.04)]">
                <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.16em] text-[#4A7067]">{video.durationLabel}</p>
                <h3 className="mt-3 font-['Neutraface_2_Display:Titling',sans-serif] text-[18px] uppercase leading-[1.08] tracking-[0.02em] text-[#68232E]">
                  {video.title}
                </h3>
                <p className="mt-2 text-[14px] leading-[1.7] text-[#5B4F45]">{video.summary}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Link to="/fiyatlar" className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#5B4F45] transition hover:bg-white">Tum Fiyatlar</Link>
        <Link to="/egitimlerimiz" className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#5B4F45] transition hover:bg-white">Tum Programlar</Link>
        <Link to="/academy" className="rounded-full border border-[#D8CDC0] bg-white/78 px-4 py-2 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] text-[#5B4F45] transition hover:bg-white">Akademi Icerikleri</Link>
      </div>
    </section>
  );
}
