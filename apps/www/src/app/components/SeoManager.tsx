import { useEffect } from 'react';
import { useLocation } from 'react-router';

export type SeoMeta = {
  title: string;
  description: string;
  keywords: string[];
};

const FALLBACK_SITE_URL = 'https://teachera.com.tr';
const SITE_URL = (import.meta.env.VITE_SITE_URL || FALLBACK_SITE_URL).replace(/\/+$/, '');
const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon-32x32.png`;
const DEFAULT_ROBOTS = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
const PREFERRED_SITELINKS = [
  { name: 'Ana Sayfa', path: '/' },
  { name: 'Biz Kimiz', path: '/biz-kimiz' },
  { name: 'Metodoloji', path: '/metodoloji' },
  { name: 'Eğitim Programları', path: '/egitimlerimiz' },
  { name: 'Konya İngilizce Grup Programı', path: '/egitimlerimiz/ingilizce/grup-programi' },
  { name: 'Teachera Academy', path: '/academy' },
  { name: 'Seviye Tespit Sınavı', path: '/seviye-tespit-sinavi' },
  { name: 'İletişim', path: '/iletisim' },
] as const;

const CORE_KEYWORDS = [
  'konya dil kursu',
  'konya dil okulu',
  'konya ingilizce kursu',
  'konya ispanyolca kursu',
  'konya rusca kursu',
  'konya arapca kursu',
  'konya almanca kursu',
  'konya goethe kursu',
  'konya ielts kursu',
  'konya toefl kursu',
  'konya en iyi dil kursu',
  'konya yabanci dil okulu',
  'konya italyanca kursu',
  'konya cocuklar icin ingilizce',
  'selçuklu dil kursu',
  'türkiye online dil kursu',
  'online ingilizce kursu türkiye',
  'konuşma odaklı dil eğitimi',
  'teachera dil okulu',
];

const BASE_META: SeoMeta = {
  title: 'Teachera Dil Okulu Konya | Konuşma Odaklı Yabancı Dil Eğitimi',
  description:
    'Teachera, Konya Selçuklu merkezli dil okuludur. Türkiye geneline online ve yüz yüze İngilizce, Almanca, İspanyolca, Fransızca, İtalyanca, Rusça ve Arapça eğitimleri sunar.',
  keywords: [
    ...CORE_KEYWORDS,
    'konya yabancı dil kursu',
    'konya speaking club',
    'online yabancı dil kursu',
  ],
};

const STATIC_ROUTE_META: Record<string, SeoMeta> = {
  '/': BASE_META,
  '/biz-kimiz': {
    title: 'Biz Kimiz | Teachera Konya Dil Okulu',
    description:
      'Teachera Dil Okulu, Konya merkezli bir eğitim kurumudur. Türkiye genelinde konuşma odaklı yabancı dil eğitimi sunar.',
    keywords: [...CORE_KEYWORDS, 'konya dil okulu hakkında', 'teachera kimdir'],
  },
  '/metodoloji': {
    title: 'Teachera Teaching Method | Konya Dil Eğitimi Metodolojisi',
    description:
      'Teachera Teaching Method ile Konya merkezli, Türkiye geneline ulaşan konuşma odaklı yabancı dil metodolojisini keşfedin.',
    keywords: [...CORE_KEYWORDS, 'konuşma odaklı dil metodu', 'teachera teaching method'],
  },
  '/fiyatlar': {
    title: 'Fiyatlar | Teachera Konya Dil Kursu',
    description:
      'Konya ve Türkiye geneline uygun online/yüz yüze yabancı dil program fiyatlarını inceleyin. Size özel planı seçin.',
    keywords: [...CORE_KEYWORDS, 'konya dil kursu fiyatları', 'online dil kursu fiyatları'],
  },
  '/egitimlerimiz': {
    title: 'Eğitim Programları | Teachera Konya',
    description:
      'Konya merkezli Teachera programları: çocuk, genç, yetişkin, sınav ve kariyer odaklı yabancı dil eğitimleri.',
    keywords: [...CORE_KEYWORDS, 'konya dil kursu programları', 'konya yabancı dil okulu programları', 'yabancı dil eğitim programları'],
  },
  '/academy': {
    title: 'Teachera Academy | Dil Öğrenme Rehberleri',
    description:
      'Teachera Academy içerikleriyle Konya ve Türkiye odaklı pratik dil öğrenme stratejilerini, sınav ve kariyer rehberlerini okuyun.',
    keywords: [...CORE_KEYWORDS, 'dil öğrenme rehberi', 'konya dil eğitimi blog'],
  },
  '/speakup': {
    title: 'SpeakUp Campus | Konya Speaking Club',
    description:
      'SpeakUp, Konya odaklı speaking club programıdır. Üniversite öğrencileri için gerçek konuşma pratiği ve sosyal dil deneyimi sunar.',
    keywords: [...CORE_KEYWORDS, 'konya speaking club', 'konya konuşma kulübü'],
  },
  '/konya-speaking-club': {
    title: 'Konya Speaking Club | SpeakUp Campus Teachera',
    description:
      'Konya speaking club deneyimi için SpeakUp Campus sayfası: sosyal ortamda konuşma pratiği, seviye uyumlu grup yapısı ve başvuru süreci.',
    keywords: [...CORE_KEYWORDS, 'konya speaking club', 'konya konuşma pratiği'],
  },
  '/konya-online-dil-kursu': {
    title: 'Konya Online Dil Kursu | Türkiye Geneli Canlı Dersler',
    description:
      'Konya merkezli Teachera ile Türkiye geneline online dil kursu: İngilizce, Almanca, İspanyolca ve diğer dillerde canlı, konuşma odaklı eğitim.',
    keywords: [...CORE_KEYWORDS, 'konya online dil kursu', 'türkiye geneli online dil kursu'],
  },
  '/turkiye-online-dil-kursu': {
    title: 'Türkiye Online Dil Kursu | Teachera Canlı Dersler',
    description:
      'Türkiye online dil kursu arayanlar için Teachera: Konya merkezli uzman ekipten İngilizce, Almanca, İspanyolca ve diğer dillerde canlı online eğitim.',
    keywords: [...CORE_KEYWORDS, 'türkiye online dil kursu', 'online ingilizce kursu türkiye', 'canlı online dil eğitimi'],
  },
  '/kurumsal': {
    title: 'Kurumsal Dil Eğitimi | Teachera Konya',
    description:
      'Konya ve Türkiye genelindeki kurumlara özel yabancı dil eğitimi tekliflerini inceleyin. Şirketinize özel plan oluşturalım.',
    keywords: [...CORE_KEYWORDS, 'kurumsal dil eğitimi', 'şirketlere dil eğitimi konya'],
  },
  '/iletisim': {
    title: 'İletişim | Teachera Konya Dil Okulu',
    description:
      'Teachera Konya ile iletişime geçin. Kule Plaza Selçuklu Konya adresi, telefon, WhatsApp ve e-posta bilgileri burada.',
    keywords: [...CORE_KEYWORDS, 'konya dil okulu iletişim', 'selçuklu dil kursu adres'],
  },
  '/seviye-tespit-sinavi': {
    title: 'Seviye Tespit Sınavı | Teachera Konya',
    description:
      'Teachera Konya için ücretsiz seviye tespit sınavına katılın. Türkiye geneline uygun online/yüz yüze dil programı önerinizi alın.',
    keywords: [...CORE_KEYWORDS, 'ücretsiz seviye tespit sınavı', 'konya ingilizce seviye testi'],
  },
  '/is-firsatlari': {
    title: 'İş Fırsatları | Teachera Konya',
    description:
      'Teachera Konya ve Türkiye odaklı eğitim operasyonunda açık pozisyonlar ve genel başvuru imkanlarını inceleyin.',
    keywords: [...CORE_KEYWORDS, 'konya dil okulu iş ilanları', 'teachera kariyer'],
  },
  '/musteri-temsilcisi-ol': {
    title: 'Müşteri Temsilcisi Ol | Teachera',
    description:
      'Teachera ailesine müşteri temsilcisi olarak katılın. Konya merkezli yapıda Türkiye genelinde etki oluşturun.',
    keywords: [...CORE_KEYWORDS, 'müşteri temsilcisi iş başvurusu', 'konya eğitim sektörü iş'],
  },
  '/elci-ol': {
    title: 'Elçi Ol | Teachera',
    description:
      'Teachera elçilik programı ile Konya ve Türkiye genelinde dil eğitimi topluluğunun bir parçası olun.',
    keywords: [...CORE_KEYWORDS, 'kampüs elçilik programı', 'konya öğrenci elçi programı'],
  },
  '/hukuki': {
    title: 'Hukuki Metinler | Teachera',
    description:
      'Teachera hukuki metinleri: gizlilik politikası, KVKK, çerez politikası ve diğer yasal dokümanlara bu sayfadan ulaşın.',
    keywords: [...CORE_KEYWORDS, 'kvkk metinleri', 'teachera gizlilik politikası'],
  },
  '/giris': {
    title: 'Giriş Yap | Teachera',
    description: 'Teachera öğrenci portalına güvenli giriş yapın.',
    keywords: ['teachera öğrenci girişi', 'teachera portal'],
  },
  '/bursluluk-2026': {
    title: 'Bursluluk Sınavı Başvuru | Teachera',
    description:
      'Teachera Online Bursluluk Sınavı ile Konya genelindeki 1-12. sınıf öğrencileri için burs yapısı, sınav takvimi, video bilgilendirmesi ve başvuru sürecini inceleyin.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sınavı', 'bursluluk başvuru formu', 'online bursluluk sınavı'],
  },
  '/bursluluk': {
    title: 'Bursluluk Sınavı | Teachera',
    description:
      'Teachera bursluluk sınavı duyuru, başvuru, aday giriş, sınav ve sonuç süreçlerine bu sayfadan ulaşın.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sınavı', 'bursluluk aday girişi'],
  },
  '/bursluluk/onay': {
    title: 'Bursluluk Başvuru Onayı | Teachera',
    description:
      'Bursluluk başvurunuz alındı. Başvuru numaranızı görün, girişe geçin veya şifreyi tekrar SMS olarak gönderin.',
    keywords: [...CORE_KEYWORDS, 'bursluluk başvuru onayı', 'şifreyi tekrar gönder'],
  },
  '/bursluluk/giris': {
    title: 'Bursluluk Aday Girişi | Teachera',
    description:
      'Bursluluk sınavına katılım için kullanıcı adı ve şifre ile aday girişinizi tamamlayın, gerekirse şifrenizi yeniden isteyin.',
    keywords: [...CORE_KEYWORDS, 'bursluluk giriş', 'aday girişi', 'şifre yenileme'],
  },
  '/bursluluk/bekleme': {
    title: 'Bursluluk Sınav Bekleme Ekranı | Teachera',
    description:
      'Sınav başlamadan önce sayaç ve teknik kontrol ekranını takip edin. Sınav açıldığında otomatik yönlendirme sağlanır.',
    keywords: [...CORE_KEYWORDS, 'sınav bekleme ekranı', 'sayaç', 'teknik kontrol'],
  },
  '/bursluluk/sinav': {
    title: 'Bursluluk Sınavı | Teachera',
    description:
      'Teachera bursluluk sınavını güvenli oturumla tamamlayın. Sorular autosave ile kaydedilir ve süre yönetimi panelden takip edilir.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sınav ekranı', 'online sınav', 'autosave sınav'],
  },
  '/bursluluk/sınav': {
    title: 'Bursluluk Sınavı | Teachera',
    description:
      'Teachera bursluluk sınavını güvenli oturumla tamamlayın. Sorular autosave ile kaydedilir ve süre yönetimi panelden takip edilir.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sınav ekranı', 'online sınav', 'autosave sınav'],
  },
  '/bursluluk/sonuc': {
    title: 'Bursluluk Sınav Sonuç | Teachera',
    description:
      'Bursluluk sınav sonucunu kullanıcı adı ve şifre ile görüntüleyin. Sonuç görüntüleme ve bildirim durumları operasyon panelinde izlenir.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sonuç', 'sınav sonucu görüntüleme'],
  },
  '/bursluluk/sonuç': {
    title: 'Bursluluk Sınav Sonuç | Teachera',
    description:
      'Bursluluk sınav sonucunu kullanıcı adı ve şifre ile görüntüleyin. Sonuç görüntüleme ve bildirim durumları operasyon panelinde izlenir.',
    keywords: [...CORE_KEYWORDS, 'bursluluk sonuç', 'sınav sonucu görüntüleme'],
  },
  '/panel/login': {
    title: 'Panel Giriş | Teachera',
    description: 'Teachera operasyon paneline güvenli giriş yapın.',
    keywords: ['teachera panel', 'panel giriş', 'admin panel login'],
  },
  '/panel/dashboard': {
    title: 'Panel Dashboard | Teachera',
    description: 'Teachera operasyon dashboard ekranı: başvurular, bildirimler, görevler ve KPI takibi.',
    keywords: ['teachera dashboard', 'bursluluk operasyon paneli', 'panel kpi'],
  },
  '/panel/inbox': {
    title: 'Panel Inbox | Teachera',
    description: 'CRM ve operasyon inbox kayıtlarını panel üzerinden yönetin.',
    keywords: ['panel inbox', 'crm inbox', 'operasyon mesajları'],
  },
  '/panel/operations': {
    title: 'Panel Operasyon | Teachera',
    description: 'Bursluluk operasyon süreçlerini tek panelde izleyin ve yönetin.',
    keywords: ['operasyon paneli', 'bursluluk operasyonu'],
  },
  '/panel/candidates': {
    title: 'Panel Adaylar | Teachera',
    description: 'Aday listesi, giriş/sınav/sonuç durumlarını panelden görüntüleyin.',
    keywords: ['aday paneli', 'bursluluk aday takibi'],
  },
  '/panel/notifications': {
    title: 'Panel Bildirimler | Teachera',
    description: 'SMS ve WhatsApp bildirim kuyruğu, başarı ve hata durumlarını izleyin.',
    keywords: ['sms panel', 'whatsapp panel', 'bildirim takibi'],
  },
  '/panel/dlq': {
    title: 'Panel DLQ | Teachera',
    description: 'Başarısız bildirimleri (DLQ) görüntüleyin ve tekrar işleme alın.',
    keywords: ['dlq', 'retry queue', 'failed notification'],
  },
  '/panel/unviewed-results': {
    title: 'Panel Sonuç Görmeyenler | Teachera',
    description: 'Sonuç ekranını açmayan adayları filtreleyin ve operasyon aksiyonlarını yönetin.',
    keywords: ['unviewed results', 'sonuç görmeyen adaylar', 'operasyon aksiyonu'],
  },
  '/panel/password-reset': {
    title: 'Panel Şifre Yenileme | Teachera',
    description: 'Panel kullanıcı şifresini güvenli şekilde yenileyin.',
    keywords: ['panel password reset', 'şifre yenileme', 'mfa panel'],
  },
};

const NOT_FOUND_META: SeoMeta = {
  title: 'Sayfa Bulunamadı | Teachera Konya',
  description:
    'Aradığınız sayfa bulunamadı. Teachera Konya ana sayfasına dönerek Türkiye geneline sunduğumuz dil eğitim programlarını inceleyebilirsiniz.',
  keywords: [...CORE_KEYWORDS, 'sayfa bulunamadı'],
};

const LANGUAGE_LABELS: Record<string, string> = {
  ingilizce: 'İngilizce',
  almanca: 'Almanca',
  ispanyolca: 'İspanyolca',
  fransizca: 'Fransızca',
  italyanca: 'İtalyanca',
  rusca: 'Rusça',
  arapca: 'Arapça',
};

export function toKeywordCase(value: string) {
  return value
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function isKnownPath(pathname: string) {
  if (STATIC_ROUTE_META[pathname]) {
    return true;
  }

  return (
    /^\/academy\/[^/]+$/.test(pathname) ||
    /^\/egitimlerimiz\/[^/]+\/[^/]+$/.test(pathname) ||
    /^\/hukuki\/[^/]+$/.test(pathname)
  );
}

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertLinkTag(rel: string, href: string, hreflang?: string) {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  let element = document.querySelector(selector) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    if (hreflang) {
      element.setAttribute('hreflang', hreflang);
    }
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

function upsertJsonLdScript(id: string, payload: unknown) {
  let script = document.getElementById(id) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload);
}

export function resolveMeta(pathname: string): SeoMeta {
  if (STATIC_ROUTE_META[pathname]) {
    return STATIC_ROUTE_META[pathname];
  }

  const isProgramDetail = /^\/egitimlerimiz\/[^/]+\/[^/]+$/.test(pathname);
  if (isProgramDetail) {
    const languageSlug = pathname.split('/')[2] || '';
    const programSlug = pathname.split('/')[3] || '';
    const language = LANGUAGE_LABELS[languageSlug] || 'Yabancı Dil';
    const programPhrase = toKeywordCase(programSlug);
    const readableProgram = programPhrase ? `${language} ${programPhrase}` : `${language} kursu`;
    const loweredLanguage = language.toLocaleLowerCase('tr-TR');

    return {
      title: `${language} Kursu Konya | ${readableProgram} | Teachera`,
      description: `${language} program detayları: Konya merkezli Teachera ile Türkiye geneline online ve yüz yüze konuşma odaklı eğitim seçenekleri.`,
      keywords: [
        ...CORE_KEYWORDS,
        `konya ${loweredLanguage} kursu`,
        `türkiye online ${loweredLanguage} kursu`,
        `${readableProgram} teachera`,
      ],
    };
  }

  const isLegalDetail = /^\/hukuki\/[^/]+$/.test(pathname);
  if (isLegalDetail) {
    return {
      title: 'Hukuki Doküman | Teachera',
      description:
        'Teachera hukuki doküman detayını inceleyin. KVKK, gizlilik ve kullanıcı haklarına ilişkin güncel metinler burada.',
      keywords: [...CORE_KEYWORDS, 'hukuki doküman', 'kvkk metni'],
    };
  }

  return BASE_META;
}

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const rawPathname = location.pathname || "/";
    const pathname = rawPathname !== "/"
      ? (rawPathname.replace(/\/+$/, "") || "/" )
      : "/";

    // Article pages already maintain richer article-level SEO in their own component.
    if (/^\/academy\/[^/]+$/.test(pathname)) {
      return;
    }

    const knownPath = isKnownPath(pathname);
    const meta = knownPath ? resolveMeta(pathname) : NOT_FOUND_META;
    const canonicalPath = knownPath ? pathname || '/' : '/';
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const isAuthPage = pathname === '/giris';
    const isLegalDetailPage = /^\/hukuki\/[^/]+$/.test(pathname);
    const robotsValue = isAuthPage
      ? 'noindex,nofollow,noarchive'
      : isLegalDetailPage
        ? 'noindex,follow,noarchive'
        : knownPath
          ? DEFAULT_ROBOTS
          : 'noindex,follow,noarchive';

    document.title = meta.title;

    upsertMetaTag('name', 'description', meta.description);
    upsertMetaTag('name', 'keywords', meta.keywords.join(', '));
    upsertMetaTag('name', 'robots', robotsValue);
    upsertMetaTag('name', 'geo.region', 'TR-42');
    upsertMetaTag('name', 'geo.placename', 'Konya');
    upsertMetaTag('name', 'geo.position', '37.8746;32.4932');
    upsertMetaTag('name', 'ICBM', '37.8746, 32.4932');
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag('property', 'og:locale', 'tr_TR');
    upsertMetaTag('property', 'og:site_name', 'Teachera Dil Okulu');
    upsertMetaTag('property', 'og:title', meta.title);
    upsertMetaTag('property', 'og:description', meta.description);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', DEFAULT_OG_IMAGE);
    upsertMetaTag('name', 'twitter:card', 'summary');
    upsertMetaTag('name', 'twitter:title', meta.title);
    upsertMetaTag('name', 'twitter:description', meta.description);
    upsertMetaTag('name', 'twitter:image', DEFAULT_OG_IMAGE);

    upsertLinkTag('canonical', canonicalUrl);
    upsertLinkTag('alternate', canonicalUrl, 'tr-TR');
    upsertLinkTag('alternate', canonicalUrl, 'x-default');

    upsertJsonLdScript('teachera-site-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Teachera Dil Okulu',
      url: SITE_URL,
      inLanguage: 'tr-TR',
    });

    upsertJsonLdScript('teachera-sitenav-jsonld', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Teachera Primary Navigation',
      itemListElement: PREFERRED_SITELINKS.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: `${SITE_URL}${item.path}`,
      })),
    });
  }, [location.pathname]);

  return null;
}
