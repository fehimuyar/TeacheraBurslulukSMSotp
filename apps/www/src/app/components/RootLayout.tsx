import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AnimatePresence } from 'motion/react';
import { Outlet, useLocation } from 'react-router';
import { SpeedInsights } from '@vercel/speed-insights/react';
import Navigation from './Navigation';
import MobileMenu from './MobileMenu';
import Footer from './Footer';
import { LevelAssessmentProvider } from './LevelAssessmentContext';
import { FreeTrialProvider } from './FreeTrialContext';
import SeoManager from './SeoManager';
import LevelAssessmentModal from './LevelAssessment';
import FreeTrialModal from './FreeTrialModal';
import AppToaster from './overlay/AppToaster';
import { initTracking, trackPageView } from '../lib/analytics';
import { initTagManager } from '../lib/tagManager';
import { useLiteMode } from '../lib/useLiteMode';

const WhatsAppButton = lazy(() =>
  import('./WhatsAppButton').then((module) => ({ default: module.WhatsAppButton })),
);
const CookieConsent = lazy(() => import('./CookieConsent'));

export default function RootLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState('home');
  const [showDeferredUi, setShowDeferredUi] = useState(false);
  const currentSectionRef = useRef('home');
  const location = useLocation();
  const liteMode = useLiteMode();
  const isPanelRoute = location.pathname.startsWith('/panel/');
  const isAuthPage = location.pathname === '/giris' || isPanelRoute;

  useEffect(() => {
    document.documentElement.lang = 'tr';
  }, []);

  useEffect(() => {
    initTagManager();
    return initTracking();
  }, []);

  useEffect(() => {
    let timeoutId = 0;
    let idleId: number | null = null;
    const onReady = () => setShowDeferredUi(true);
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(onReady, { timeout: 1600 });
    } else {
      timeoutId = window.setTimeout(onReady, 900);
    }

    return () => {
      window.clearTimeout(timeoutId);
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('teachera-reduce-motion', liteMode);
    return () => document.documentElement.classList.remove('teachera-reduce-motion');
  }, [liteMode]);

  useEffect(() => {
    setIsMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    trackPageView();
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (location.pathname !== '/') {
      setCurrentSection('home');
      currentSectionRef.current = 'home';
      return;
    }

    const shouldTrackScrollSections = window.matchMedia('(min-width: 1024px)').matches;
    if (!shouldTrackScrollSections) {
      setCurrentSection('home');
      currentSectionRef.current = 'home';
      return;
    }

    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;

        const sections = ['home', 'how-it-works', 'delivery-options', 'programs', 'faq'];
        const scrollPosition = window.scrollY + 100;
        let nextSection = currentSectionRef.current;

        for (const section of sections) {
          const element = document.getElementById(section);
          if (element) {
            const offsetTop = element.offsetTop;
            const offsetBottom = offsetTop + element.offsetHeight;

            if (scrollPosition >= offsetTop && scrollPosition < offsetBottom) {
              nextSection = section;
              break;
            }
          }
        }

        if (nextSection !== currentSectionRef.current) {
          currentSectionRef.current = nextSection;
          setCurrentSection(nextSection);
        }
      });
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [location.pathname]);

  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  const isBurslulukLandingRoute = location.pathname === '/bursluluk-2026';

  return (
    <FreeTrialProvider>
      <LevelAssessmentProvider>
        <div className="relative min-h-screen bg-[#00000B]">
          <SeoManager />

          {!isPanelRoute && (
            <Navigation
              isMenuOpen={isMenuOpen}
              setIsMenuOpen={setIsMenuOpen}
              currentSection={currentSection}
            />
          )}

          {!isPanelRoute && (
            <AnimatePresence mode="wait" initial={false}>
              {isMenuOpen ? (
                <MobileMenu
                  key="mobile-menu"
                  onClose={() => setIsMenuOpen(false)}
                  currentSection={currentSection}
                />
              ) : null}
            </AnimatePresence>
          )}

          <main className="relative">
            <Outlet />
          </main>

          {!isAuthPage && <Footer />}

          {!isPanelRoute && (
            <>
              <LevelAssessmentModal />
              <FreeTrialModal />
            </>
          )}
          <AppToaster />

          {!isPanelRoute && (
            <Suspense fallback={null}>
              {!isBurslulukLandingRoute && <WhatsAppButton />}
              {showDeferredUi && <CookieConsent />}
            </Suspense>
          )}

          <SpeedInsights sampleRate={0.5} />
        </div>
      </LevelAssessmentProvider>
    </FreeTrialProvider>
  );
}
