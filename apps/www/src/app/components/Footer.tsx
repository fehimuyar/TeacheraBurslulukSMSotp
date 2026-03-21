import { useState } from 'react';
import { Instagram, Linkedin, Facebook, Youtube, Clock, Navigation, ChevronDown, PhoneCall, MapPin } from 'lucide-react';
import TeacheraLogo from '../../imports/TeacheraLogo';

/* ── X (Twitter) Icon ── */
function XIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46L20 4" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { Icon: Instagram, href: 'https://www.instagram.com/teacheradilokulu/', label: 'Instagram' },
  { Icon: Linkedin, href: 'https://tr.linkedin.com/company/teachera-dil-okulu', label: 'LinkedIn' },
  { Icon: null, href: 'https://x.com/teacheradilokul', label: 'X', isX: true },
  { Icon: Facebook, href: 'https://www.facebook.com/teacheradilokulu/', label: 'Facebook' },
  { Icon: Youtube, href: 'https://www.youtube.com/@teacheradilokullari', label: 'YouTube' },
] as const;

function FooterAccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-[#ffffff]/5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.15em]">
          {title}
        </h4>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-label={`${title} bölümünü ${isOpen ? 'kapat' : 'aç'}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#4A7067]/35 text-[#4A7067] hover:text-white hover:border-[#4A7067] hover:bg-[#4A7067]/10 transition-colors"
        >
          <ChevronDown
            size={11}
            className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {isOpen && <div className="pt-3">{children}</div>}
    </div>
  );
}

export default function Footer() {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isKvkkOpen, setIsKvkkOpen] = useState(false);

  return (
    <footer className="bg-[#00000B] text-white pt-20 pb-12 overflow-hidden relative font-['Neutraface_2_Text:Book',sans-serif]">
       {/* Background Grid Pattern */}
       <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
       />

       {/* Top Divider Line */}
       <div className="absolute top-0 left-0 w-full h-[1px] bg-[#D0D0D0] opacity-30" />

       <div className="max-w-[1440px] mx-auto px-6 lg:px-12 relative z-10">
          
          {/* MAIN GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 border-b border-[#ffffff]/10 pb-16 mb-12">

             {/* COL 1: BRAND INFO (4 Cols) */}
             <div className="lg:col-span-4 flex flex-col gap-8 pr-0 lg:pr-12">
                {/* Teachera Logo - White */}
                <div
                  className="w-[130px] h-[26px] relative"
                  style={{ '--fill-0': '#ffffff' } as React.CSSProperties}
                >
                  <TeacheraLogo />
                </div>

                <p className="text-[#ffffff]/80 text-[14px] leading-relaxed font-['Neutraface_2_Text:Book',sans-serif]">
                  Teachera, Avrupa standartlarına karşılık gelen bir müfredat kullanarak, İngilizce, İspanyolca, Fransızca, Almanca, İtalyanca, Rusça ve Arapça eğitimleri veren, Milli Eğitim Bakanlığına bağlı faaliyet yürüten, online ve yüz yüze eğitim veren bir dil okuludur.
                </p>

                {/* Working Hours */}
                <div className="hidden md:flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                   <Clock size={15} className="text-[#4A7067] mt-0.5 shrink-0" />
                   <div className="flex-1">
                      <h4 className="text-[11px] text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.15em] mb-1.5">Çalışma Saatleri</h4>
                      <p className="text-[13px] text-white/90 font-['Neutraface_2_Text:Demi',sans-serif]">
                        Her Gün <span className="text-white/40 mx-1">·</span> 09:00 – 21:30
                      </p>
                   </div>
                </div>

                {/* Map + Directions */}
                <div className="flex flex-col gap-2.5">
                   <div className="w-full h-[150px] rounded-2xl overflow-hidden border border-white/[0.06]">
                      <iframe
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1574!2d32.4943368!3d37.8886148!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x14d085702d789a11%3A0xc68498fb76cc5793!2sY%C4%B1ld%C4%B1zlar%20Ku%C5%9Fa%C4%9F%C4%B1%20Dil%20Okulu!5e0!3m2!1str!2str"
                        width="100%"
                        height="100%"
                        style={{ border: 0, filter: 'grayscale(0.85) brightness(0.65) contrast(1.1)' }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Teachera Konum"
                      />
                   </div>
                   <a
                     href="https://www.google.com/maps/dir/?api=1&destination=37.8886148,32.4943368&destination_place_id=ChIJEZp4LXCFDRQRk1fMdvuYhMY"
                     target="_blank"
                     rel="noopener noreferrer"
                     className="group flex items-center justify-center gap-2 w-full py-2.5 rounded-full border border-[#4A7067]/30 hover:border-[#4A7067] hover:bg-[#4A7067]/10 transition-all duration-300"
                   >
                      <Navigation size={12} className="text-[#4A7067] group-hover:text-white transition-colors" />
                      <span className="text-[12px] text-[#4A7067] group-hover:text-white font-['Neutraface_2_Text:Demi',sans-serif] tracking-[0.05em] transition-colors">
                        Yol Tarifi Al
                      </span>
                   </a>
                </div>
             </div>

             {/* COL 2: SİTE HARİTASI (2 Cols) */}
             <div className="lg:col-span-2 flex flex-col gap-4">
                <h4 className="text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.15em] mb-1">
                  Site Haritası
                </h4>
                <ul className="flex flex-col gap-2.5 text-[13px] font-['Neutraface_2_Text:Book',sans-serif]">
                   <li><a href="/#home" className="text-white/75 hover:text-white transition-colors">Ana Sayfa</a></li>
                   <li><a href="/bursluluk-2026" className="text-white/75 hover:text-white transition-colors">Bursluluk Sınavı Başvuru</a></li>
                   <li><a href="/bursluluk/giris" className="text-white/75 hover:text-white transition-colors">Bursluluk Giriş</a></li>
                   <li><a href="/metodoloji" className="text-white/75 hover:text-white transition-colors">Metodoloji</a></li>
                   <li><a href="/#delivery-options" className="text-white/75 hover:text-white transition-colors">Eğitim Formatları</a></li>
                   <li><a href="/egitimlerimiz" className="text-white/75 hover:text-white transition-colors">Eğitim Programları</a></li>
                   <li><a href="/academy" className="text-white/75 hover:text-white transition-colors">Academy</a></li>
                   <li><a href="/speakup" className="text-white/75 hover:text-white transition-colors">SpeakUp</a></li>
                   <li><a href="/#faq" className="text-white/75 hover:text-white transition-colors">S.S.S.</a></li>
                   <li><a href="/iletisim" className="text-white/75 hover:text-white transition-colors">İletişim</a></li>
                </ul>

                {/* Diller */}
                <div className="mt-3 pt-3 border-t border-[#ffffff]/5">
                   <h4 className="text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.15em] mb-4">
                     Diller
                   </h4>
                   <ul className="flex flex-col gap-2.5 text-[13px] font-['Neutraface_2_Text:Book',sans-serif]">
                      <li><a href="/egitimlerimiz/ingilizce/grup-programi" className="text-white/60 hover:text-white transition-colors">İngilizce</a></li>
                      <li><a href="/egitimlerimiz/ispanyolca/grup-programi" className="text-white/60 hover:text-white transition-colors">İspanyolca</a></li>
                      <li><a href="/egitimlerimiz/almanca/grup-programi" className="text-white/60 hover:text-white transition-colors">Almanca</a></li>
                      <li><a href="/egitimlerimiz/fransizca/grup-programi" className="text-white/60 hover:text-white transition-colors">Fransızca</a></li>
                      <li><a href="/egitimlerimiz/italyanca/grup-programi" className="text-white/60 hover:text-white transition-colors">İtalyanca</a></li>
                      <li><a href="/egitimlerimiz/rusca/grup-programi" className="text-white/60 hover:text-white transition-colors">Rusça</a></li>
                      <li><a href="/egitimlerimiz/arapca/grup-programi" className="text-white/60 hover:text-white transition-colors">Arapça</a></li>
                   </ul>
                </div>
             </div>

             {/* COL 3: KURUMSAL + KARİYER (3 Cols) */}
             <div className="lg:col-span-2 flex flex-col gap-4">
                <h4 className="text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.15em] mb-1">
                  Kurumsal
                </h4>
                <ul className="flex flex-col gap-2.5 text-[13px] font-['Neutraface_2_Text:Book',sans-serif]">
                   <li><a href="/is-firsatlari" className="text-white/75 hover:text-white transition-colors">İş Fırsatları</a></li>
                   <li><a href="/musteri-temsilcisi-ol" className="text-white/75 hover:text-white transition-colors">Müşteri Temsilcisi Ol</a></li>
                   <li><a href="/elci-ol" className="text-white/75 hover:text-white transition-colors">Elçi Ol</a></li>
                   <li><a href="/kurumsal" className="text-white/75 hover:text-white transition-colors">Kurumsal Fiyat Teklifi</a></li>
                   <li><a href="/fiyatlar" className="text-white/75 hover:text-white transition-colors">Fiyatlar</a></li>
                </ul>

                <FooterAccordionSection
                  title="KONYA"
                  isOpen={isGuideOpen}
                  onToggle={() => setIsGuideOpen((prev) => !prev)}
                >
                  <ul className="flex flex-col gap-2 text-[12px] font-['Neutraface_2_Text:Book',sans-serif]">
                    <li><a href="/" className="text-white/55 hover:text-white/75 transition-colors">Konya Dil Kursu</a></li>
                    <li><a href="/konya-ingilizce-kursu" className="text-white/55 hover:text-white/75 transition-colors">Konya İngilizce Kursu</a></li>
                    <li><a href="/egitimlerimiz/ispanyolca/grup-programi" className="text-white/55 hover:text-white/75 transition-colors">Konya İspanyolca Kursu</a></li>
                    <li><a href="/egitimlerimiz/rusca/grup-programi" className="text-white/55 hover:text-white/75 transition-colors">Konya Rusça Kursu</a></li>
                    <li><a href="/egitimlerimiz/arapca/grup-programi" className="text-white/55 hover:text-white/75 transition-colors">Konya Arapça Kursu</a></li>
                    <li><a href="/egitimlerimiz/almanca/grup-programi" className="text-white/55 hover:text-white/75 transition-colors">Konya Almanca Kursu</a></li>
                    <li><a href="/egitimlerimiz/almanca/goethe-testdaf" className="text-white/55 hover:text-white/75 transition-colors">Konya Goethe Kursu</a></li>
                    <li><a href="/egitimlerimiz/ingilizce/ielts" className="text-white/55 hover:text-white/75 transition-colors">Konya IELTS Kursu</a></li>
                    <li><a href="/egitimlerimiz/ingilizce/toefl" className="text-white/55 hover:text-white/75 transition-colors">Konya TOEFL Kursu</a></li>
                    <li><a href="/egitimlerimiz/italyanca/grup-programi" className="text-white/55 hover:text-white/75 transition-colors">Konya İtalyanca Kursu</a></li>
                    <li><a href="/egitimlerimiz/ingilizce/kids-grup" className="text-white/55 hover:text-white/75 transition-colors">Konya Çocuklar İçin İngilizce</a></li>
                    <li><a href="/" className="text-white/55 hover:text-white/75 transition-colors">Konya En İyi Dil Kursu</a></li>
                  </ul>
                </FooterAccordionSection>

                <FooterAccordionSection
                  title="Kişisel Verilerin Korunması"
                  isOpen={isKvkkOpen}
                  onToggle={() => setIsKvkkOpen((prev) => !prev)}
                >
                  <ul className="flex flex-col gap-2 text-[12px] font-['Neutraface_2_Text:Book',sans-serif]">
                    <li><a href="/hukuki/gizlilik-politikasi" className="text-white/55 hover:text-white/75 transition-colors">Gizlilik Politikası</a></li>
                    <li><a href="/hukuki/cocuklarin-gizlilik-politikasi" className="text-white/55 hover:text-white/75 transition-colors">Çocukların Gizlilik Politikası</a></li>
                    <li><a href="/hukuki/cerez-politikasi" className="text-white/55 hover:text-white/75 transition-colors">Çerez Politikası</a></li>
                    <li><a href="/hukuki/ebeveyn-muvafakatname" className="text-white/55 hover:text-white/75 transition-colors">Ebeveyn Muvafakatname</a></li>
                    <li><a href="/hukuki/yurt-disina-aktarim-acik-riza" className="text-white/55 hover:text-white/75 transition-colors">Yurt Dışına Aktarım Açık Rıza</a></li>
                    <li><a href="/hukuki/whatsapp-acik-riza-metni" className="text-white/55 hover:text-white/75 transition-colors">WhatsApp Açık Rıza Metni</a></li>
                    <li><a href="/hukuki/musteri-aydinlatma-metni" className="text-white/55 hover:text-white/75 transition-colors">Müşteri Aydınlatma Metni</a></li>
                    <li><a href="/hukuki/iletisim-aydinlatma-metni" className="text-white/55 hover:text-white/75 transition-colors">İletişim Aydınlatma Metni</a></li>
                    <li><a href="/hukuki/cagri-merkezi-aydinlatma-metni" className="text-white/55 hover:text-white/75 transition-colors">Çağrı Merkezi Aydınlatma Metni</a></li>
                    <li><a href="/hukuki/ilgili-kisi-basvuru-formu" className="text-white/55 hover:text-white/75 transition-colors">İlgili Kişi Başvuru Formu</a></li>
                  </ul>
                </FooterAccordionSection>
             </div>

             {/* COL 4: İLETİŞİM */}
             <div className="lg:col-span-4 flex flex-col gap-6 font-['Neutraface_2_Text:Demi',sans-serif]">
                <h4 className="text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.15em] mb-1">
                  İletişim
                </h4>

                {/* Phone Card */}
                <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                   <div className="absolute -left-10 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-[#4A7067]/15 blur-2xl transition-colors duration-300 group-hover:bg-[#4A7067]/30" />
                   <div className="relative flex items-center gap-3">
                      <div className="relative">
                         <div className="absolute inset-0 rounded-full bg-[#4A7067]/25 animate-ping" style={{ animationDuration: '2.4s' }} />
                         <div className="relative h-9 w-9 rounded-full border border-[#4A7067]/45 bg-[#4A7067]/15 flex items-center justify-center">
                            <PhoneCall size={15} className="text-[#6A9B8F]" />
                         </div>
                      </div>
                      <div>
                         <p className="text-[11px] uppercase tracking-[0.16em] text-[#4A7067] mb-0.5">Telefon</p>
                         <a href="tel:03322368066" className="text-[24px] leading-none text-white hover:text-[#6A9B8F] transition-colors">
                           0332 236 80 66
                         </a>
                      </div>
                   </div>
                </div>

                {/* WhatsApp Button */}
                <a
                  href="https://wa.me/905528674226"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 h-[44px] rounded-full bg-[#25D366] hover:bg-[#20BD5C] text-[#0B2A19] font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] tracking-[0.04em] transition-colors"
                >
                  <PhoneCall size={15} />
                  WhatsApp'tan Yaz
                </a>

                {/* Address Card */}
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4">
                   <div className="absolute top-3 right-4 text-right select-none">
                     <span className="font-['Neutraface_2_Text:Bold',sans-serif] text-[2.2rem] leading-none tracking-tighter text-white/[0.08]">
                       26
                     </span>
                     <span className="block font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] tracking-[0.22em] uppercase text-white/20 text-right -mt-1">
                       . KAT
                     </span>
                   </div>
                   <div className="relative">
                     <div className="inline-flex items-center gap-2 mb-2">
                       <MapPin size={12} className="text-[#E70000]" />
                       <span className="text-[10px] uppercase tracking-[0.18em] text-[#4A7067]">Kampüs</span>
                     </div>
                     <p className="text-[16px] text-white leading-tight font-['Neutraface_2_Text:Bold',sans-serif]">
                       Kule Plaza, <span className="text-[#F4EBD1]">Kat 26</span>
                     </p>
                     <p className="text-[13px] text-white/65 mt-1 font-['Neutraface_2_Text:Book',sans-serif]">
                       Selçuklu – Konya
                     </p>
                   </div>
                </div>

                {/* Emails */}
                <div className="space-y-5">
                   <div>
                      <h4 className="text-[13px] text-white/50 mb-1">Genel Sorularınız İçin</h4>
                      <a href="mailto:info@teachera.com.tr" className="text-[17px] text-white hover:text-[#6A9B8F] transition-colors block">info@teachera.com.tr</a>
                   </div>
                   <div>
                      <h4 className="text-[13px] text-white/50 mb-1">Satış Departmanı</h4>
                      <a href="mailto:sales@teachera.com.tr" className="text-[17px] text-white hover:text-[#6A9B8F] transition-colors block">sales@teachera.com.tr</a>
                   </div>
                   <div>
                      <h4 className="text-[13px] text-white/50 mb-1">Medya Soruları İçin</h4>
                      <a href="mailto:media@teachera.com.tr" className="text-[17px] text-white hover:text-[#6A9B8F] transition-colors block">media@teachera.com.tr</a>
                   </div>
                   <div>
                      <h4 className="text-[13px] text-white/50 mb-1">Ortaklıklar için</h4>
                      <a href="mailto:partners@teachera.com.tr" className="text-[17px] text-white hover:text-[#6A9B8F] transition-colors block">partners@teachera.com.tr</a>
                   </div>
                </div>

                {/* Mobile Working Hours (shown under contact on phones) */}
                <div className="md:hidden flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                   <Clock size={15} className="text-[#4A7067] mt-0.5 shrink-0" />
                   <div className="flex-1">
                      <h4 className="text-[11px] text-[#4A7067] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.15em] mb-1.5">Çalışma Saatleri</h4>
                      <p className="text-[13px] text-white/90 font-['Neutraface_2_Text:Demi',sans-serif]">
                        Her Gün <span className="text-white/40 mx-1">·</span> 09:00 – 21:30
                      </p>
                   </div>
                </div>
             </div>
          </div>

          {/* BOTTOM BAR */}
          <div className="flex flex-col items-center gap-6 text-sm font-['Neutraface_2_Text:Demi',sans-serif]">

              {/* Retro Signature Tagline */}
              <div className="text-center">
                <p className="font-['Retro_Signature:Regular',sans-serif] text-[#F4EBD1] text-[clamp(20px,3vw,36px)] leading-[1.3] tracking-wide">
                  Hızlı ve Kolay Öğren.
                </p>
                <p className="font-['Retro_Signature:Regular',sans-serif] text-[#F4EBD1] text-[clamp(20px,3vw,36px)] leading-[1.3] tracking-wide">
                  Teachera ile Akıcı Konuş.
                </p>
              </div>

              {/* Social Icons - centered, green themed */}
              <div className="flex items-center justify-center gap-3">
                {SOCIAL_LINKS.map((social, i) => (
                  <a
                    key={i}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={social.label}
                    className="w-8 h-8 rounded-full border border-[#324D47]/40 hover:border-[#324D47] hover:bg-[#324D47]/20 flex items-center justify-center text-[#324D47] hover:text-[#6A9B8F] transition-all duration-300"
                  >
                    {'isX' in social && social.isX ? (
                      <XIcon size={13} />
                    ) : social.Icon ? (
                      <social.Icon size={14} />
                    ) : null}
                  </a>
                ))}
              </div>

              {/* Copyright - centered */}
              <p className="text-[#4A7067]">&copy; Teachera 2026</p>
          </div>
       </div>
    </footer>
  );
}
