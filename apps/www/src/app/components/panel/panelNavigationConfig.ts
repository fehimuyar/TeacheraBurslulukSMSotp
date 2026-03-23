import type { NavigationItem, NavigationSection } from './panelTypes';

export const NAVIGATION_ITEMS: NavigationItem[] = [
  /* ── ANA OPERASYON ── */
  {
    id: 'home',
    title: 'Anasayfa',
    subtitle: 'Genel bakış ve hızlı erişim',
    live: true,
    section: 'ana-operasyon',
  },
  {
    id: 'applications',
    title: 'Başvurular',
    subtitle: 'Website form inbox ve CRM aktarım',
    live: true,
    section: 'ana-operasyon',
    badgeKey: 'applications_pending',
  },
  {
    id: 'scholarship',
    title: 'Bursluluk Başvuruları',
    subtitle: 'Aday operasyonu ve süreç takibi',
    live: true,
    section: 'ana-operasyon',
  },
  {
    id: 'appointments',
    title: 'Randevu & Danışman',
    subtitle: 'Takvim, danışman yönetimi ve görüşme takibi',
    live: true,
    section: 'ana-operasyon',
    badgeKey: 'pending_appointments',
    defaultFocus: 'schedule',
  },

  /* ── YÖNETİM ── */
  {
    id: 'results',
    title: 'Sonuç & Burs',
    subtitle: 'Sonuç düzenleme ve burs yönetimi',
    live: true,
    section: 'yonetim',
    superAdminOnly: true,
  },
  {
    id: 'operations',
    title: 'Operasyon Merkezi',
    subtitle: 'Sınav atama, SMS, WhatsApp, okullar',
    live: true,
    section: 'yonetim',
    defaultFocus: 'exam-assign',
  },
  {
    id: 'reports',
    title: 'Raporlar',
    subtitle: 'Satış, okul, SMS ve WP raporları',
    live: true,
    section: 'yonetim',
    defaultFocus: 'sales',
  },

  /* ── SİSTEM ── */
  {
    id: 'exam-builder',
    title: 'Sınav Oluşturma',
    subtitle: 'Soru bankası ve sınav yapılandırma',
    live: true,
    section: 'sistem',
  },
  {
    id: 'system-status',
    title: 'Sistem Durumu',
    subtitle: 'Servis sağlığı ve uyarılar',
    live: true,
    section: 'sistem',
    badgeKey: 'system_alerts',
  },
  {
    id: 'users',
    title: 'Kullanıcı & Yetki',
    subtitle: 'Rol matrisi ve hesap yönetimi',
    live: true,
    section: 'sistem',
    superAdminOnly: true,
    defaultFocus: 'roles',
  },
  {
    id: 'security' as const,
    title: 'Güvenlik & Audit',
    subtitle: 'Audit trail ve güvenlik olayları',
    live: true,
    section: 'sistem',
    superAdminOnly: true,
  },
];

export const NAVIGATION_SECTION_META: Record<NavigationSection, string> = {
  'ana-operasyon': 'Ana Operasyon',
  yonetim: 'Yönetim',
  sistem: 'Sistem',
};

export const OPERATIONS_SUB_TABS = [
  { label: 'Sınav Atama', focus: 'exam-assign' as const },
  { label: 'WhatsApp', focus: 'whatsapp-triggers' as const },
  { label: 'SMS', focus: 'sms' as const },
  { label: 'API Durumu', focus: 'api-status' as const },
  { label: 'Okullar', focus: 'schools' as const },
  { label: 'Programlar', focus: 'programs' as const },
  { label: 'Bankalar', focus: 'banks' as const },
  { label: 'Sınav Oturumları', focus: 'exam-sessions' as const },
  { label: 'Pipeline', focus: 'pipeline' as const },
  { label: 'Otomasyon', focus: 'automation-rules' as const },
];

export const REPORTS_SUB_TABS = [
  { label: 'Satış Raporu', focus: 'sales' as const },
  { label: 'Okul Raporu', focus: 'school-reports' as const },
  { label: 'SMS Raporu', focus: 'sms-reports' as const },
  { label: 'WP Bot Raporu', focus: 'wp-reports' as const },
];

export const USERS_SUB_TABS = [
  { label: 'Roller & Yetkiler', focus: 'roles' as const },
  { label: 'Kullanıcı Hesapları', focus: 'accounts' as const },
];

export const APPOINTMENTS_SUB_TABS = [
  { label: 'Haftalık Takvim', focus: 'schedule' as const },
  { label: 'Günlük Detay', focus: 'daily' as const },
  { label: 'Danışmanlar', focus: 'advisor-list' as const },
  { label: 'Performans', focus: 'advisor-perf' as const },
];

export const SETTINGS_KEYS = {
  campaignCode: 'bursluluk.campaign.code',
  examOpenAt: 'bursluluk.campaign.exam_open_at',
  examCloseAt: 'bursluluk.campaign.exam_close_at',
  panelAllowedRoles: 'bursluluk.panel.allowed_roles',
} as const;
