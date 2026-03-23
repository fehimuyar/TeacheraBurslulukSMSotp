import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { NAVIGATION_ITEMS, NAVIGATION_SECTION_META, OPERATIONS_SUB_TABS, REPORTS_SUB_TABS, USERS_SUB_TABS, APPOINTMENTS_SUB_TABS } from './panelNavigationConfig';
import type { PanelFocus, PanelView } from './panelTypes';
import {
  PanelSearchModal,
  panelCompactInputClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
} from './panelUi';

function resolveFocusLabel(view: PanelView, focus: PanelFocus): string | null {
  if (!focus) return null;
  const tabs = view === 'operations' ? OPERATIONS_SUB_TABS : view === 'reports' ? REPORTS_SUB_TABS : view === 'users' ? USERS_SUB_TABS : view === 'appointments' ? APPOINTMENTS_SUB_TABS : [];
  return tabs.find((t) => t.focus === focus)?.label || null;
}

export default function PanelTopbar({
  activeView,
  activeFocus,
  campaignInput,
  onCampaignInputChange,
  onApplyFilters,
  onManualRefresh,
  isRefreshing,
  showGlobalFilters = true,
  onMenuToggle,
}: {
  activeView: PanelView;
  activeFocus?: PanelFocus;
  campaignInput: string;
  onCampaignInputChange: (value: string) => void;
  onApplyFilters: () => void;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  showGlobalFilters?: boolean;
  onMenuToggle?: () => void;
}) {
  const viewMeta = NAVIGATION_ITEMS.find((item) => item.id === activeView) || NAVIGATION_ITEMS[0];
  const sectionLabel = NAVIGATION_SECTION_META[viewMeta.section] || '';
  const focusLabel = resolveFocusLabel(activeView, activeFocus || null);

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const parts = [viewMeta.title];
    if (focusLabel) parts.push(focusLabel);
    parts.push('Teachera Panel');
    document.title = parts.join(' | ');
  }, [viewMeta.title, focusLabel]);

  /* Ctrl+K / Cmd+K shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
    <header className="sticky top-0 z-20 border-b border-[#E5DBCD] bg-[rgba(245,239,228,0.88)] backdrop-blur-sm">
      <div className="px-4 py-3 sm:px-6 xl:px-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            {/* Mobile hamburger */}
            {onMenuToggle && (
              <button type="button" onClick={onMenuToggle} className="mt-0.5 rounded-[10px] p-1.5 text-[#7A7063] transition hover:bg-[#F5EFE5] hover:text-[#2C5447] lg:hidden" aria-label="Menüyü aç">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            )}
            <div>
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-['Neutraface_2_Text:Book',sans-serif] text-[11px]">
              <Link to="/panel/dashboard?view=home" className="text-[#7A7063] transition hover:text-[#2C5447]">Panel</Link>
              <span className="text-[#DDD3C5]">/</span>
              <span className="text-[#7A7063]">{sectionLabel}</span>
              <span className="text-[#DDD3C5]">/</span>
              <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{viewMeta.title}</span>
              {focusLabel && (
                <>
                  <span className="text-[#DDD3C5]">/</span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{focusLabel}</span>
                </>
              )}
            </nav>
            <h2 className={panelLargeTitleClassName} style={{ marginTop: 4 }}>{viewMeta.title}</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search button */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-[16px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-1.5 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71] transition hover:border-[#BFAE95] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2C5447]"
              aria-label="Aday ara (Ctrl+K)"
            >
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <span className="hidden sm:inline">Ara</span>
              <kbd className="hidden rounded-[4px] border border-[#DDD3C5] bg-[#FBF7F0] px-1 py-0.5 text-[9px] sm:inline">⌘K</kbd>
            </button>

          <button
            type="button"
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className={panelSecondaryButtonClassName}
          >
            {isRefreshing ? 'Yenileniyor...' : 'Yenile'}
          </button>
          </div>
        </div>
      </div>
    </header>
    <PanelSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
