import { useEffect, useState, type ReactNode } from 'react';

/* ── Design Token Reference ──
 * Central color reference for the panel design system.
 * TODO: Migrate inline hex values to CSS custom properties in a future pass.
 */
export const PANEL_COLORS = {
  primary: '#2C5447',
  primaryHover: '#23463B',
  surface: '#FFFDF9',
  surfaceAlt: '#FFFCF7',
  surfaceCard: '#FFFCF8',
  surfaceStat: '#FCF8F2',
  background: '#F5EFE4',
  border: '#E2D8C8',
  borderLight: '#E8DFD2',
  borderInput: '#DDD4C6',
  borderChip: '#DDD3C5',
  text: '#1B2B24',
  textSecondary: '#7A7063',
  textBody: '#33463E',
  textMuted: '#8A7F71',
  textDescription: '#5E665E',
  focusRing: '#EEE3CC',
  focusBorder: '#9F865C',
  success: '#2C5447',
  successBg: '#EEF6F0',
  successBorder: '#BFD2C8',
  warning: '#795A26',
  warningBg: '#FBF1D9',
  warningBorder: '#D9C59C',
  danger: '#875349',
  dangerBg: '#FFF8F6',
  dangerBorder: '#E7D2CD',
  dangerButton: '#6B333A',
  dangerButtonHover: '#5B2930',
} as const;

export const panelSurfaceClassName =
  "rounded-[20px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.96)_0%,rgba(251,246,239,0.94)_100%)] p-3 shadow-[0_12px_36px_rgba(109,90,58,0.08)]";
export const panelWideSurfaceClassName = `${panelSurfaceClassName} lg:col-span-2`;
export const panelSoftCardClassName =
  "rounded-[16px] border border-[#E8DFD2] bg-[#FFFCF8] p-3 shadow-[0_6px_20px_rgba(109,90,58,0.05)]";
export const panelStatCardClassName =
  "rounded-[14px] border border-[#E7DED0] bg-[#FCF8F2] p-2.5 shadow-[0_4px_14px_rgba(109,90,58,0.04)]";
export const panelEyebrowClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.2em] text-[#7A7063]";
export const panelTitleClassName =
  "mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] leading-[1.2] text-[#1B2B24]";
export const panelLargeTitleClassName =
  "mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] leading-[1.15] text-[#1B2B24]";
export const panelDescriptionClassName =
  "mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.6] text-[#5E665E]";
export const panelPrimaryButtonClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] rounded-[14px] bg-[#2C5447] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white transition hover:bg-[#23463B] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#DCE6DE] disabled:cursor-not-allowed disabled:opacity-60";
export const panelSecondaryButtonClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] rounded-[14px] border border-[#D8CDBD] bg-[#FFFDF9] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[#33463E] transition hover:border-[#BFAE95] hover:bg-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#EEE3CC] disabled:cursor-not-allowed disabled:opacity-60";
export const panelSmallButtonClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] rounded-[12px] border border-[#DDD2C3] bg-[#FFFDF9] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[#41514B] transition hover:border-[#BCA98F] hover:bg-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55";
export const panelDangerButtonClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] rounded-[14px] border border-[#B78382] bg-[#6B333A] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[#FFF6F6] transition hover:bg-[#5B2930] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55";
export const panelInputClassName =
  "h-[40px] rounded-[14px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]";
export const panelCompactInputClassName =
  "h-[34px] rounded-[12px] border border-[#DDD4C6] bg-[#FFFCF7] px-2.5 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]";
export const panelTableContainerClassName = 'mt-3 overflow-x-auto rounded-[16px] border border-[#E4DBCE] bg-[#FFFDF9] shadow-[0_4px_14px_rgba(109,90,58,0.04)]';
export const panelEmptyRowClassName = "px-2 py-8 text-center font-['Neutraface_2_Text:Book',sans-serif] text-[#8B8172]";
export const panelChipClassName =
  "font-['Neutraface_2_Text:Demi',sans-serif] rounded-full border border-[#DDD3C5] bg-[#FFFDF9] px-3 py-2 text-[#485A53] transition hover:border-[#BFAE95] hover:bg-white";
export const panelReadOnlyNoticeClassName =
  "rounded-[18px] border border-[#D7D4C4] bg-[#FBF6EF] px-3 py-2 text-[12px] text-[#7A7063]";

type PanelFeedbackTone = 'info' | 'success' | 'error';

const PANEL_FEEDBACK_CLASS_MAP: Record<PanelFeedbackTone, string> = {
  info: 'border-[#D8CFBE] bg-[#FBF6EE] text-[#6C675E]',
  success: 'border-[#D8E0D6] bg-[#F6FAF5] text-[#345346]',
  error: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
};

export function PanelFeedbackMessage({
  children,
  tone,
  className = '',
}: {
  children: ReactNode;
  tone: PanelFeedbackTone;
  className?: string;
}) {
  if (!children) return null;

  return (
    <p
      className={`rounded-[18px] border px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] ${PANEL_FEEDBACK_CLASS_MAP[tone]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </p>
  );
}

export function PanelLoadingMessage({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[18px] border border-[#E0D7CA] bg-[#FBF7F0] px-3 py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#746E65]">
      {children}
    </div>
  );
}

/* ── Badge ── */

export function PanelBadge({ count, dot }: { count?: number; dot?: boolean }) {
  if (dot) {
    return <span className="inline-block h-2 w-2 rounded-full bg-[#C54040]" />;
  }
  if (count == null || count <= 0) return null;
  return (
    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#C54040] px-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ── Sub-navigation Tabs ── */

export function PanelSubNavTabs<T extends string>({
  items,
  activeFocus,
  onSelect,
}: {
  items: Array<{ label: string; focus: T }>;
  activeFocus: T | null;
  onSelect: (focus: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = activeFocus === item.focus;
        return (
          <button
            key={item.focus}
            type="button"
            onClick={() => onSelect(item.focus)}
            className={`${panelChipClassName} ${isActive ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]' : ''}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Modal ── */

export function PanelModal({
  open,
  onClose,
  title,
  children,
  maxWidth = '760px',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2B24]/18 px-4 py-8 backdrop-blur-sm">
      <div
        className="w-full rounded-[30px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.98)_0%,rgba(252,247,240,0.96)_100%)] p-6 shadow-[0_28px_90px_rgba(76,58,35,0.18)]"
        style={{ maxWidth }}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className={panelTitleClassName} style={{ marginTop: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} className={panelSmallButtonClassName}>Kapat</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Person Drawer (slide-over from right) ── */

export function PanelPersonDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 cursor-pointer bg-[#1B2B24]/12 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[480px] flex-col border-l border-[#E2D8C8] bg-[#FFFDF9] shadow-[-10px_0_40px_rgba(109,90,58,0.12)]">
        <div className="flex items-center justify-between border-b border-[#E5DBCD] px-5 py-4">
          <h3 className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{title}</h3>
          <button type="button" onClick={onClose} className={panelSmallButtonClassName}>Kapat</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Confirm Dialog ── */

export function PanelConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Onayla',
  danger = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1B2B24]/18 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-[440px] rounded-[28px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.98)_0%,rgba(252,247,240,0.96)_100%)] p-6 shadow-[0_28px_90px_rgba(76,58,35,0.18)]">
        <h3 className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{title}</h3>
        <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.7] text-[#5E665E]">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={panelSecondaryButtonClassName}>Vazgeç</button>
          <button type="button" onClick={onConfirm} className={danger ? panelDangerButtonClassName : panelPrimaryButtonClassName}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ── */

export function PanelEmptyState({
  message = 'Filtreye uygun kayıt bulunamadı',
  actionLabel,
  onAction,
}: {
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-[#C5BBAA]" aria-hidden="true">
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M18 24h12M24 18v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="mt-4 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#8B8172]">{message}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={`mt-3 ${panelSecondaryButtonClassName}`}>{actionLabel}</button>
      )}
    </div>
  );
}

/* ── KPI Card ── */

export function PanelKpiCard({
  title,
  value,
  helper,
  trend,
}: {
  title: string;
  value: string;
  helper?: string;
  trend?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className={panelStatCardClassName}>
      <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{title}</p>
      <div className="mt-2 flex items-end gap-2">
        <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] leading-[1.1] text-[#1B2B24]">{value}</p>
        {trend && (
          <span className={`text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] ${
            trend === 'up' ? 'text-[#2C5447]' : trend === 'down' ? 'text-[#8A433C]' : 'text-[#7A7063]'
          }`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      {helper && <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#6C7269]">{helper}</p>}
    </div>
  );
}

/* ── Toast Notification ── */

type ToastTone = 'success' | 'error' | 'info';

const TOAST_TONE_MAP: Record<ToastTone, string> = {
  success: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  error: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
  info: 'border-[#D8CFBE] bg-[#FBF6EE] text-[#6C675E]',
};

export function PanelToast({
  message,
  tone = 'success',
  duration = 4000,
  onDismiss,
}: {
  message: string;
  tone?: ToastTone;
  duration?: number;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`fixed right-4 top-4 z-[60] max-w-[380px] rounded-[18px] border px-4 py-3 shadow-[0_12px_32px_rgba(109,90,58,0.14)] transition-all duration-300 ${TOAST_TONE_MAP[tone]} ${visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.5]">{message}</p>
        <button type="button" onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} className="shrink-0 rounded-full p-0.5 opacity-60 transition hover:opacity-100" aria-label="Bildirimi kapat">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ── Search Modal (Ctrl+K) ── */

const SEARCH_HISTORY_KEY = 'teachera.panel.search.history';

function readSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveSearchTerm(query: string) {
  const history = readSearchHistory().filter((q) => q !== query);
  history.unshift(query);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
}

type PanelSearchResult = { id: string; name: string; grade?: number; school?: string; score?: number; applicationNo?: string };

const MOCK_SEARCH_DATA: PanelSearchResult[] = [
  { id: '1', name: 'Ahmet Yılmaz', grade: 5, school: 'Meram İlkokulu', score: 82, applicationNo: '20260322-100234' },
  { id: '2', name: 'Elif Kara', grade: 7, school: 'Selçuklu Ortaokulu', score: 65, applicationNo: '20260322-100235' },
  { id: '3', name: 'Mehmet Demir', grade: 9, school: 'Karatay Anadolu Lisesi', score: 91, applicationNo: '20260322-100236' },
  { id: '4', name: 'Zeynep Arslan', grade: 6, school: 'Meram Ortaokulu', score: 45, applicationNo: '20260322-100237' },
  { id: '5', name: 'Ali Çelik', grade: 8, school: 'Selçuklu İlkokulu', score: 72, applicationNo: '20260322-100238' },
  { id: '6', name: 'Fatma Öztürk', grade: 10, school: 'Karatay Ortaokulu', score: 58, applicationNo: '20260322-100239' },
  { id: '7', name: 'Burak Yıldız', grade: 4, school: 'Meram İlkokulu', score: 88, applicationNo: '20260322-100240' },
  { id: '8', name: 'Selin Aydın', grade: 11, school: 'Selçuklu Ortaokulu', score: 35, applicationNo: '20260322-100241' },
];

export function PanelSearchModal({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect?: (result: PanelSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [history] = useState<string[]>(() => readSearchHistory());

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const results = q.length >= 2 ? MOCK_SEARCH_DATA.filter((r) => r.name.toLowerCase().includes(q) || (r.applicationNo || '').includes(q) || (r.school || '').toLowerCase().includes(q)).slice(0, 8) : [];

  const handleSelect = (result: PanelSearchResult) => { saveSearchTerm(query.trim()); onSelect?.(result); onClose(); };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#1B2B24]/18 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[540px] rounded-[24px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.98)_0%,rgba(252,247,240,0.96)_100%)] shadow-[0_28px_90px_rgba(76,58,35,0.22)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[#ECE2D5] px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="shrink-0 text-[#7A7063]" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ad, telefon veya başvuru no..." className="flex-1 bg-transparent font-['Neutraface_2_Text:Book',sans-serif] text-[15px] text-[#1B2B24] outline-none placeholder:text-[#8A7F71]" autoFocus />
          <kbd className="rounded-[6px] border border-[#DDD3C5] bg-[#FBF7F0] px-1.5 py-0.5 font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#8A7F71]">ESC</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto px-2 py-2">
          {results.length > 0 ? (
            <div className="space-y-0.5">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => handleSelect(r)} className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-[#F5EFE5] focus-visible:ring-2 focus-visible:ring-[#2C5447] focus-visible:outline-none">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF6F0] font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] text-[#2C5447]">{r.grade || '-'}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{r.name}</p>
                    <p className="truncate font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">{r.school} {r.applicationNo ? `• ${r.applicationNo}` : ''}</p>
                  </div>
                  {r.score != null && <span className="shrink-0 font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#2C5447]">{r.score}</span>}
                </button>
              ))}
            </div>
          ) : q.length >= 2 ? (
            <p className="px-3 py-6 text-center font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#8B8172]">Sonuç bulunamadı</p>
          ) : history.length > 0 ? (
            <div className="px-3 py-3">
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">Son Aramalar</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {history.map((h) => (<button key={h} type="button" onClick={() => setQuery(h)} className="rounded-full border border-[#DDD3C5] bg-[#FFFDF9] px-3 py-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#485A53] transition hover:border-[#BFAE95] hover:bg-white">{h}</button>))}
              </div>
            </div>
          ) : (
            <p className="px-3 py-6 text-center font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#8B8172]">En az 2 karakter yazın</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Floating Action Bar ── */

export function PanelFloatingActionBar({ selectedCount, actions, onClear }: { selectedCount: number; actions: Array<{ label: string; onClick: () => void }>; onClear: () => void }) {
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-[22px] border border-[#2C5447] bg-[#24473C] px-5 py-3 shadow-[0_16px_48px_rgba(32,55,47,0.28)]">
      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-white">{selectedCount} aday seçildi</span>
      <span className="h-4 w-px bg-white/20" />
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onClick} className="rounded-[14px] border border-white/20 bg-white/10 px-3 py-1.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.1em] text-white transition hover:bg-white/20 active:scale-[0.97]">{action.label}</button>
      ))}
      <button type="button" onClick={onClear} className="rounded-full p-1 text-white/60 transition hover:text-white" aria-label="Seçimi temizle">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
