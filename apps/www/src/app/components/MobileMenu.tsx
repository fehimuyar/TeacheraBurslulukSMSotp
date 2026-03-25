import { useRef } from 'react';
import { motion } from 'motion/react';
import { Instagram, Linkedin, Facebook, Youtube, ArrowRight, User, X, Phone } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import imgRectangle279 from "figma:asset/884befb1e78a75b64de1fe6d23317da411da15ba.webp";
import TeacheraLogo from '../../imports/TeacheraLogo';
import { useLevelAssessment } from './LevelAssessmentContext';
import { OverlayDrawer } from './overlay/OverlayPrimitives';

/* ── X (Twitter) Icon ── */
function XIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46L20 4" />
    </svg>
  );
}

interface MobileMenuProps {
  onClose: () => void;
  currentSection: string;
}

interface MenuItem {
  id: string;
  label: string;
  href: string;
  highlight?: boolean;
  isRoute?: boolean;
}

const menuItems: MenuItem[] = [
  { id: 'home', label: 'Ana Sayfa', href: '/', isRoute: true },
  { id: 'bursluluk-apply', label: 'Bursluluk Başvuru', href: '/bursluluk-2026', isRoute: true },
  { id: 'bursluluk-login', label: 'Bursluluk Giriş', href: '/bursluluk/giris', isRoute: true },
  { id: 'about', label: 'Biz Kimiz?', href: '/biz-kimiz', isRoute: true },
  { id: 'methodology', label: 'Metodoloji', href: '/metodoloji', isRoute: true },
  { id: 'prices', label: 'Fiyatlar', href: '/fiyatlar', isRoute: true },
  { id: 'programs', label: 'Eğitim Programları', href: '/egitimlerimiz', isRoute: true },
  { id: 'academy', label: 'Teachera Academy', href: '/academy', isRoute: true, highlight: true },
  { id: 'contact', label: 'İletişim', href: '/iletisim', isRoute: true },
];

const SOCIAL_LINKS = [
  { Icon: Instagram, href: 'https://www.instagram.com/teacheradilokulu/', label: 'Instagram' },
  { Icon: Linkedin, href: 'https://tr.linkedin.com/company/teachera-dil-okulu', label: 'LinkedIn' },
  { Icon: null, href: 'https://x.com/teacheradilokul', label: 'X', isX: true },
  { Icon: Facebook, href: 'https://www.facebook.com/teacheradilokulu/', label: 'Facebook' },
  { Icon: Youtube, href: 'https://www.youtube.com/@teacheradilokullari', label: 'YouTube' },
];

const LOGIN_URL = 'https://teachera.dlpro.eu/';
const PHONE_HREF = 'tel:03322368066';
export default function MobileMenu({ onClose, currentSection: _currentSection }: MobileMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { open: openLevelAssessment } = useLevelAssessment();
  const disableMenuAnimations = true;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentPath = location.pathname;
  
  const handleLinkClick = (item: MenuItem) => {
    if (item.isRoute) {
      const targetPath = item.href;
      const currentPath = window.location.pathname;

      navigate(targetPath);
      onClose();

      if (currentPath === targetPath) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Fallback for rare mobile navigation race conditions.
      window.setTimeout(() => {
        if (window.location.pathname !== targetPath) {
          window.location.assign(targetPath);
        }
      }, 350);
      return;
    }
    if (window.location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
            const element = document.getElementById(item.href.replace('#', ''));
            if (element) {
                const offset = 80;
                const elementPosition = element.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }, 100);
    } else {
        const element = document.getElementById(item.href.replace('#', ''));
        if (element) {
            const offset = 80;
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - offset;
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    }
    onClose();
  };

  const handleLogin = () => {
    onClose();
    window.open(LOGIN_URL, '_blank', 'noopener,noreferrer');
  };

  return (
        <OverlayDrawer
          open
          onClose={onClose}
          owner="mobile-menu"
          ariaLabel="Mobil menü"
          closeOnOutsideClick={false}
          initialFocusRef={closeButtonRef}
          containerClassName="fixed inset-0 z-[55]"
        >
          {({ panelProps }) => (
          <div
            {...panelProps}
            className="h-[100dvh] bg-[#00000B] overflow-x-hidden overflow-y-hidden overscroll-none"
          >
          {/* BACKGROUND IMAGE & OVERLAY */}
          <div className="absolute inset-0 z-0 pointer-events-none">
             <img
               src={imgRectangle279}
               alt="Background"
               className="w-full h-full object-cover opacity-[0.16]"
               loading="eager"
               decoding="sync"
             />
             <div className="absolute inset-0 bg-gradient-to-r from-[#00000B] via-[#00000B] to-[#00000B]" />
          </div>

          {/* CONTENT CONTAINER */}
          <div
            className="relative z-10 w-full h-full min-h-0 max-w-[1440px] mx-auto px-6 lg:px-12 flex flex-col pt-[calc(env(safe-area-inset-top)+3.4rem)] sm:pt-[calc(env(safe-area-inset-top)+4.1rem)] lg:pt-0"
          >
            
            {/* Close Button - Always visible on top */}
            <motion.button
              ref={closeButtonRef}
              initial={disableMenuAnimations ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="absolute top-[max(env(safe-area-inset-top),1rem)] right-[max(env(safe-area-inset-right),1.5rem)] lg:right-12 md:top-8 z-[60] w-12 h-12 flex items-center justify-center rounded-full bg-[#324D47] hover:bg-[#3d5e56] text-white shadow-[0_0_20px_rgba(50,77,71,0.4)] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6A9B8F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00000B]"
              aria-label="Close menu"
            >
              <X size={24} />
            </motion.button>

            <div className="flex flex-col lg:grid lg:grid-cols-12 h-full min-h-0 pb-4 sm:pb-6 lg:pt-40 lg:pb-32">
               
               {/* LEFT SIDE: INFO (Desktop Only) */}
               <div className="hidden lg:flex lg:col-span-5 flex-col justify-between h-full border-r border-[#ffffff]/10 pr-16 relative">
                  
                  {/* Decorative Line */}
                  <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-transparent via-[#ffffff]/10 to-transparent" />

                  {/* Top: Branding */}
                  <div>
                     <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center gap-3 mb-8"
                     >
                        <span className="w-8 h-[1px] bg-[#E70000]" />
                        <span className="text-[#E70000] text-xs font-['Neutraface_2_Text:Demi',sans-serif] tracking-[0.2em] uppercase">
                           Premium Language Education
                        </span>
                     </motion.div>
                     
                     <motion.h2 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-5xl font-['Neutraface_2_Text:Bold',sans-serif] text-white leading-[1.1]"
                     >
                        Dünyanın kapılarını<br/>
                        <span className="text-[#ffffff]/40">dil ile arala.</span>
                     </motion.h2>
                  </div>

                  {/* Bottom: Login, Social & Contact */}
                  <div className="space-y-8 mt-20">
                     {/* Desktop: Giris Yap */}
                     <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                        onClick={handleLogin}
                        className="flex items-center gap-3 px-6 py-3 bg-[#ffffff]/5 hover:bg-[#324D47] text-white border border-[#ffffff]/10 hover:border-[#324D47] rounded-full font-['Neutraface_2_Text:Demi',sans-serif] text-xs tracking-[0.15em] uppercase transition-all duration-300 group"
                     >
                        <User size={16} className="text-[#324D47] group-hover:text-white transition-colors" />
                        <span>Giriş Yap</span>
                     </motion.button>

                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex items-center gap-4"
                     >
                        {SOCIAL_LINKS.map((social, i) => (
                           <a
                             key={i}
                             href={social.href}
                             target="_blank"
                             rel="noopener noreferrer"
                             aria-label={social.label}
                             className="w-12 h-12 rounded-full border border-[#ffffff]/10 hover:border-[#324D47] hover:bg-[#324D47] flex items-center justify-center text-white/60 hover:text-white transition-all duration-300 group"
                           >
                              {social.isX ? (
                                <XIcon size={20} className="group-hover:scale-110 transition-transform" />
                              ) : social.Icon ? (
                                <social.Icon size={20} className="group-hover:scale-110 transition-transform" />
                              ) : null}
                           </a>
                        ))}
                     </motion.div>

                     <div className="text-[#ffffff]/50 text-sm font-['Neutraface_2_Text:Book',sans-serif] leading-relaxed tracking-wide">
                        <p className="mb-2">Kule Plaza Kat: 26, Selçuklu – KONYA</p>
                        <p>+90 332 236 80 66  &bull;  info@teachera.com.tr</p>
                     </div>
                  </div>
               </div>

               {/* RIGHT SIDE / MOBILE CONTENT */}
               <div className="lg:col-span-7 flex flex-col h-full min-h-0 lg:justify-start lg:pl-14 xl:pl-16 lg:pt-4 overflow-hidden">
                  
                  {/* Mobile Branding (Visible only on mobile) */}
                  <div className="lg:hidden mb-4 sm:mb-5">
                     <motion.p 
                       initial={disableMenuAnimations ? false : { opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.2 }}
                       className="text-[#E70000] text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] tracking-[0.22em] uppercase mb-1.5"
                     >
                       Premium Education
                     </motion.p>
                     <motion.h3
                       initial={disableMenuAnimations ? false : { opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.3 }}
                       className="text-[1.55rem] sm:text-[1.62rem] font-['Neutraface_2_Text:Bold',sans-serif] text-white leading-tight"
                     >
                       Menü
                     </motion.h3>
                  </div>

                  {/* Navigation Links */}
                  <nav className="flex flex-col justify-between lg:justify-start gap-2 sm:gap-2.5 lg:gap-5 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(84,122,112,0.95)_transparent] [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] pr-0.5 sm:pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#547A70]/90">
                     {menuItems.map((item, index) => (
                        (() => {
                          const isActiveRoute = Boolean(
                            item.isRoute &&
                              (item.href === currentPath || (item.href !== '/' && currentPath.startsWith(`${item.href}/`))),
                          );
                          return (
                        <motion.button
                           key={item.id}
                           initial={disableMenuAnimations ? false : { opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.2 + (index * 0.05), ease: "easeOut" }}
                           onClick={() => handleLinkClick(item)}
                           className="group relative overflow-hidden rounded-[18px] flex items-center justify-between py-2 sm:py-2.5 px-1.5 transition-all duration-500 min-w-0"
                           aria-current={isActiveRoute ? 'page' : undefined}
                        >
                           {isActiveRoute ? (
                             <motion.span
                               initial={{ opacity: 0, x: -14 }}
                               animate={{ opacity: 1, x: 0 }}
                               transition={{ duration: 0.28, ease: 'easeOut' }}
                               className="pointer-events-none absolute inset-0 rounded-[18px] border border-[#324D47]/35 bg-gradient-to-r from-[#324D47]/24 via-[#324D47]/10 to-transparent"
                             />
                           ) : null}
                           {isActiveRoute ? (
                             <motion.span
                               initial={{ opacity: 0, y: 6 }}
                               animate={{ opacity: 1, y: 0 }}
                               transition={{ duration: 0.24, ease: 'easeOut', delay: 0.04 }}
                               className="pointer-events-none absolute left-0 top-1/2 h-[26px] w-[2px] -translate-y-1/2 rounded-full bg-[#6A9B8F]"
                             />
                           ) : null}
                           <div className="flex items-center gap-3.5 sm:gap-4 lg:gap-6 min-w-0">
                              <span className={`
                                 text-[12px] sm:text-[13px] lg:text-sm font-['Neutraface_2_Text:Demi',sans-serif] w-5 lg:w-6 transition-colors
                                 ${item.isRoute && item.href === currentPath ? 'text-[#6A9B8F]' : 'text-[#ffffff]/20 group-hover:text-[#324D47]'}
                              `}>
                                 0{index + 1}
                              </span>
                              
                              <span lang="tr" className={`
                                 text-[1.86rem] sm:text-[2.02rem] md:text-[2.2rem] font-['Neutraface_2_Text:Book',sans-serif] tracking-tight transition-all duration-300 text-left leading-[1.06] break-words min-w-0
                                 ${
                                   item.isRoute && item.href === currentPath
                                     ? 'text-white translate-x-1'
                                     : item.highlight
                                       ? 'text-[#E70000]'
                                       : 'text-[#ffffff]/80 group-hover:text-white group-hover:translate-x-2'
                                 }
                              `}>
                                 {item.id === 'academy' ? (
                                   <span className="inline-flex items-center gap-2 md:gap-3">
                                     <span 
                                       className="relative w-[108px] h-[22px] sm:w-[124px] sm:h-[24px] md:w-[140px] md:h-[28px] inline-block align-middle shrink-0"
                                       style={{ '--fill-0': '#E70000' } as React.CSSProperties}
                                     >
                                       <TeacheraLogo />
                                     </span>
                                     <span>Academy</span>
                                   </span>
                                 ) : item.id === 'contact' ? (
                                   <span style={{ fontFamily: '"Avenir Next", "Avenir", "Helvetica Neue", Arial, sans-serif', fontWeight: 300 }}>İletişim</span>
                                 ) : (
                                   item.label
                                 )}
                              </span>
                           </div>

                           <div className={`
                              hidden lg:flex w-12 h-12 rounded-full border border-[#ffffff]/10 items-center justify-center opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 group-hover:border-[#324D47]
                           `}>
                              <ArrowRight size={20} className="text-[#324D47]" />
                           </div>
                        </motion.button>
                          );
                        })()
                     ))}
                  </nav>

                  {/* Mobile Footer & Actions */}
                  <div className="lg:hidden mt-4 sm:mt-5 border-t border-[#ffffff]/10 pt-3 sm:pt-4 pb-[max(env(safe-area-inset-bottom),0.25rem)] shrink-0">
                     <motion.a
                        initial={disableMenuAnimations ? false : { opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.45 }}
                        href={PHONE_HREF}
                        onClick={onClose}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 mb-2.5 bg-[#ffffff]/6 hover:bg-[#324D47] text-white border border-[#ffffff]/12 hover:border-[#324D47] rounded-xl font-['Neutraface_2_Text:Demi',sans-serif] text-sm transition-all duration-300 group"
                     >
                        <Phone size={16} className="text-[#6A9B8F] group-hover:text-white transition-colors" />
                        <span>HEMEN ARA</span>
                     </motion.a>
                     <motion.button
                        initial={disableMenuAnimations ? false : { opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.5 }}
                        onClick={() => {
                          onClose();
                          openLevelAssessment('mobile_menu_level_assessment');
                        }}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 mb-2.5 bg-[#324D47] hover:bg-[#3d5e56] text-white border border-[#324D47] rounded-xl font-['Neutraface_2_Text:Demi',sans-serif] text-sm transition-all duration-300"
                     >
                        <span>SEVİYE TESPİT</span>
                     </motion.button>
                     <motion.button
                        initial={disableMenuAnimations ? false : { opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={disableMenuAnimations ? { duration: 0 } : { delay: 0.55 }}
                        onClick={handleLogin}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 mb-5 bg-[#ffffff]/5 hover:bg-[#324D47] text-white border border-[#ffffff]/10 rounded-xl font-['Neutraface_2_Text:Demi',sans-serif] text-sm transition-all duration-300 group"
                     >
                        <User size={18} className="text-[#324D47] group-hover:text-white transition-colors" />
                        <span>GİRİŞ YAP</span>
                     </motion.button>
                  </div>
               </div>
            </div>
          </div>
          </div>
          )}
        </OverlayDrawer>
  );
}
