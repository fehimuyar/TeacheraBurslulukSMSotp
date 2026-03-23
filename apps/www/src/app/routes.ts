import { createBrowserRouter, redirect } from 'react-router';
import type { ComponentType } from 'react';
import RootLayout from './components/RootLayout';
import { REDIRECT_ROUTE_MAP, SEO_LANDING_ROUTE_PATHS } from './routeManifest';

type ComponentModule = { default: ComponentType<any> };

const lazyComponent = (importer: () => Promise<ComponentModule>) => async () => {
  const module = await importer();
  return { Component: module.default };
};

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, lazy: lazyComponent(() => import('./components/LandingPage')) },
      { path: 'giris', lazy: lazyComponent(() => import('./components/AuthPage')) },
      { path: 'iletisim', lazy: lazyComponent(() => import('./components/ContactPage')) },
      { path: 'biz-kimiz', lazy: lazyComponent(() => import('./components/WhoWeAre')) },
      { path: 'fiyatlar', lazy: lazyComponent(() => import('./components/PricingPage')) },
      { path: 'academy', lazy: lazyComponent(() => import('./components/AcademyPage')) },
      { path: 'academy/:slug', lazy: lazyComponent(() => import('./components/ArticleDetailPage')) },
      { path: 'kurumsal', lazy: lazyComponent(() => import('./components/CorporatePage')) },
      { path: 'hukuki', lazy: lazyComponent(() => import('./components/legal/LegalDocumentsPage')) },
      { path: 'hukuki/:slug', lazy: lazyComponent(() => import('./components/legal/LegalDocumentPage')) },
      { path: 'metodoloji', lazy: lazyComponent(() => import('./components/MethodologyPage')) },
      { path: 'seviye-tespit-sinavi', lazy: lazyComponent(() => import('./components/PlacementExamPage')) },
      { path: 'bursluluk-2026', lazy: lazyComponent(() => import('./components/Bursluluk2026Page')) },
      { path: 'bursluluk', loader: () => redirect('/bursluluk/giris') },
      { path: 'bursluluk/giris', lazy: lazyComponent(() => import('./components/BurslulukGirisPage')) },
      { path: 'bursluluk/onay', lazy: lazyComponent(() => import('./components/BurslulukOnayPage')) },
      { path: 'bursluluk/bekleme', lazy: lazyComponent(() => import('./components/BurslulukBeklemePage')) },
      { path: 'bursluluk/sinav', loader: () => redirect('/bursluluk/sınav') },
      { path: 'bursluluk/sınav', lazy: lazyComponent(() => import('./components/BurslulukSinavPage')) },
      { path: 'bursluluk/sonuc', loader: () => redirect('/bursluluk/sonuç') },
      { path: 'bursluluk/sonuç', lazy: lazyComponent(() => import('./components/BurslulukSonucPage')) },
      { path: 'bursluluk/randevu', lazy: lazyComponent(() => import('./components/BurslulukRandevuPage')) },
      { path: 'panel', loader: () => redirect('/panel/dashboard?view=home') },
      { path: 'panel/login', lazy: lazyComponent(() => import('./components/panel/PanelLoginPage')) },
      { path: 'panel/dashboard', lazy: lazyComponent(() => import('./components/panel/PanelDashboardPage')) },
      /* ── New V2 panel routes ── */
      { path: 'panel/home', loader: () => redirect('/panel/dashboard?view=home') },
      { path: 'panel/applications', loader: () => redirect('/panel/dashboard?view=applications') },
      { path: 'panel/scholarship', loader: () => redirect('/panel/dashboard?view=scholarship') },
      { path: 'panel/results', loader: () => redirect('/panel/dashboard?view=results') },
      { path: 'panel/operations', loader: () => redirect('/panel/dashboard?view=operations&focus=exam-assign') },
      { path: 'panel/operations/:focus', loader: ({ params }) => redirect(`/panel/dashboard?view=operations&focus=${params.focus}`) },
      { path: 'panel/reports', loader: () => redirect('/panel/dashboard?view=reports&focus=sales') },
      { path: 'panel/reports/:focus', loader: ({ params }) => redirect(`/panel/dashboard?view=reports&focus=${params.focus}`) },
      { path: 'panel/exam-builder', loader: () => redirect('/panel/dashboard?view=exam-builder') },
      { path: 'panel/system-status', loader: () => redirect('/panel/dashboard?view=system-status') },
      { path: 'panel/users', loader: () => redirect('/panel/dashboard?view=users&focus=roles') },
      { path: 'panel/appointments', loader: () => redirect('/panel/dashboard?view=appointments&focus=schedule') },
      { path: 'panel/appointments/:focus', loader: ({ params }) => redirect(`/panel/dashboard?view=appointments&focus=${params.focus}`) },
      /* ── Legacy compat redirects ── */
      { path: 'panel/inbox', loader: () => redirect('/panel/dashboard?view=applications') },
      { path: 'panel/crm', loader: () => redirect('/panel/dashboard?view=applications') },
      { path: 'panel/tasks', loader: () => redirect('/panel/dashboard?view=home') },
      { path: 'panel/exam', loader: () => redirect('/panel/dashboard?view=operations&focus=exam-assign') },
      { path: 'panel/publishing', loader: () => redirect('/panel/dashboard?view=operations') },
      { path: 'panel/performance', loader: () => redirect('/panel/dashboard?view=reports&focus=sales') },
      { path: 'panel/automation', loader: () => redirect('/panel/dashboard?view=operations') },
      { path: 'panel/integrations', loader: () => redirect('/panel/dashboard?view=operations&focus=api-status') },
      { path: 'panel/settings', loader: () => redirect('/panel/dashboard?view=settings') },
      { path: 'panel/audit', loader: () => redirect('/panel/dashboard?view=security') },
      { path: 'panel/security', loader: () => redirect('/panel/dashboard?view=security') },
      { path: 'panel/candidates', loader: () => redirect('/panel/dashboard?view=scholarship') },
      { path: 'panel/notifications', loader: () => redirect('/panel/dashboard?view=operations') },
      { path: 'panel/dlq', loader: () => redirect('/panel/dashboard?view=operations') },
      { path: 'panel/unviewed-results', loader: () => redirect('/panel/dashboard?view=scholarship') },
      { path: 'panel/password-reset', lazy: lazyComponent(() => import('./components/panel/PanelPasswordResetPage')) },
      { path: 'speakup', lazy: lazyComponent(() => import('./components/SpeakUpPage')) },
      { path: 'konya-ingilizce-kursu', loader: () => redirect(REDIRECT_ROUTE_MAP['konya-ingilizce-kursu']) },
      ...SEO_LANDING_ROUTE_PATHS.map((path) => ({
        path,
        lazy: lazyComponent(() => import('./components/KonyaSeoLandingPage')),
      })),
      { path: 'is-firsatlari', lazy: lazyComponent(() => import('./components/JobOpportunitiesPage')) },
      { path: 'musteri-temsilcisi-ol', lazy: lazyComponent(() => import('./components/CustomerRepresentativePage')) },
      { path: 'elci-ol', lazy: lazyComponent(() => import('./components/AmbassadorPage')) },
      {
        path: 'egitimlerimiz',
        children: [
          { index: true, lazy: lazyComponent(() => import('./components/CoursesHub')) },

          // Dynamic program detail route — catches all :lang/:program combos
          { path: ':lang/:program', lazy: lazyComponent(() => import('./components/ProgramDetailPage')) },
        ],
      },
      {
        path: '*',
        lazy: lazyComponent(() => import('./components/NotFoundPage')),
      },
    ],
  },
]);
