import { useState } from 'react';
import { Link } from 'react-router';
import { NAVIGATION_ITEMS } from './panelNavigationConfig';
import { canViewModule, normalizePanelRole } from './panelPermissions';
import {
  PANEL_PERMISSION,
  canReadCandidates,
  canReadDashboard,
  canReadSettings,
  canReviewResults,
  hasAnyPanelPermission,
} from './panelRoleAccess';
import type { PanelIdentity, PanelView } from './panelTypes';
import { buildDashboardHref } from './panelTypes';
import {
  panelDangerButtonClassName,
} from './panelUi';

type BadgeCounts = Record<string, number>;

function canAccessNavigationItem(identity: PanelIdentity | null, item: (typeof NAVIGATION_ITEMS)[number]) {
  const role = identity?.role;
  const permissions = identity?.permissions;

  if (!permissions || permissions.length === 0) {
    return !item.superAdminOnly || canViewModule(role, item.id);
  }

  if (item.superAdminOnly) {
    return canViewModule(role, item.id);
  }

  switch (item.id) {
    case 'home':
      return canReadDashboard(role, permissions);
    case 'applications':
    case 'scholarship':
    case 'appointments':
      return canReadCandidates(role, permissions);
    case 'results':
      return canReviewResults(role, permissions);
    case 'operations':
      return hasAnyPanelPermission(
        [
          PANEL_PERMISSION.CANDIDATES_ACTION,
          PANEL_PERMISSION.NOTIFICATIONS_READ,
          PANEL_PERMISSION.NOTIFICATIONS_ACTION,
          PANEL_PERMISSION.UNVIEWED_READ,
          PANEL_PERMISSION.UNVIEWED_ACTION,
          PANEL_PERMISSION.DLQ_READ,
          PANEL_PERMISSION.DLQ_ACTION,
          PANEL_PERMISSION.CRM_PUSH,
        ],
        role,
        permissions,
      );
    case 'reports':
      return hasAnyPanelPermission(
        [
          PANEL_PERMISSION.CANDIDATES_EXPORT,
          PANEL_PERMISSION.NOTIFICATIONS_READ,
          PANEL_PERMISSION.UNVIEWED_READ,
          PANEL_PERMISSION.DLQ_READ,
          PANEL_PERMISSION.AUDIT_READ,
          PANEL_PERMISSION.AUDIT_EXPORT,
        ],
        role,
        permissions,
      );
    case 'exam-builder':
    case 'system-status':
      return canReadSettings(role, permissions);
    case 'users':
    case 'security':
      return canViewModule(role, item.id);
    default:
      return canViewModule(role, item.id);
  }
}

export default function PanelSidebar({
  identity,
  activeView,
  appliedCampaign,
  appliedGlobalSearch,
  autoRefresh,
  isSigningOut,
  onSignOut,
  badgeCounts = {},
  mobileOpen = false,
  onMobileClose,
}: {
  identity: PanelIdentity | null;
  activeView: PanelView;
  appliedCampaign: string;
  appliedGlobalSearch: string;
  autoRefresh: boolean;
  isSigningOut: boolean;
  onSignOut: () => void;
  badgeCounts?: BadgeCounts;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const normalizedRole = normalizePanelRole(identity?.role);

  /* Mobile: hidden by default, overlay when mobileOpen. Desktop: always visible. */
  const handleNavClick = () => { if (onMobileClose) onMobileClose(); };

  return (
    <>
    {/* Mobile backdrop */}
    {mobileOpen && (
      <div className="fixed inset-0 z-40 bg-[#1B2B24]/30 backdrop-blur-[2px] lg:hidden" onClick={onMobileClose} />
    )}
    <aside
      className={`shrink-0 border-b border-[#E5DBCD] bg-[rgba(250,244,235,0.96)] backdrop-blur-sm transition-all duration-300 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r ${
        collapsed ? 'lg:w-[72px]' : 'lg:w-[280px]'
      } ${mobileOpen ? 'fixed inset-y-0 left-0 z-50 w-[280px] shadow-[10px_0_40px_rgba(0,0,0,0.15)]' : 'hidden lg:block'}`}
    >
      <div className="flex h-full flex-col px-3 py-3 lg:px-4 lg:py-4">
        <div className="flex h-full flex-col rounded-[26px] border border-[#E2D8C8] bg-[linear-gradient(180deg,rgba(255,253,249,0.96)_0%,rgba(251,246,239,0.94)_100%)] shadow-[0_18px_50px_rgba(109,90,58,0.10)]">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-4 pb-2">
            {!collapsed ? (
              <img src="/teachera-logo.svg" alt="Teachera" className="h-6" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#2C5447] font-['Neutraface_2_Text:Bold',sans-serif] text-[13px] text-white">T</span>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="rounded-full p-1.5 text-[#7A7063] transition hover:bg-[#F5EFE5] hover:text-[#2C5447] focus-visible:ring-2 focus-visible:ring-[#2C5447]"
              title={collapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}
              aria-label={collapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                {collapsed ? (
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>

          {/* Navigation — flat list, no section headers */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <nav className="space-y-0.5">
              {NAVIGATION_ITEMS
                .filter((item) => canAccessNavigationItem(identity, item))
                .map((item) => {
                  const active = item.id === activeView;
                  const badge = item.badgeKey ? badgeCounts[item.badgeKey] : undefined;
                  const href = buildDashboardHref({
                    view: item.id,
                    focus: item.defaultFocus,
                    campaign: appliedCampaign,
                    query: appliedGlobalSearch,
                    autoRefresh,
                  });

                  return (
                    <Link
                      key={item.id}
                      to={href}
                      onClick={handleNavClick}
                      title={collapsed ? item.title : undefined}
                      className={`relative flex items-center gap-2.5 rounded-[14px] border px-2.5 py-1.5 transition focus-visible:ring-2 focus-visible:ring-[#2C5447] focus-visible:outline-none ${
                        active
                          ? 'border-[#2C5447] bg-[#24473C] text-white shadow-[0_8px_18px_rgba(32,55,47,0.12)]'
                          : 'border-transparent text-[#34463E] hover:border-[#DDD3C5] hover:bg-[#F5EFE5]'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-[16px] w-[3px] -translate-y-1/2 rounded-r-full bg-white" />}
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white' : 'bg-[#2C5447]'}`} />
                      <span className={`flex-1 truncate font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] uppercase tracking-[0.1em] transition-opacity duration-200 ${collapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
                        {item.title}
                      </span>
                      {!collapsed && badge != null && badge > 0 && (
                        <span className="flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#C54040] px-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[8px] leading-none text-white">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </nav>
          </div>

          {/* User Footer */}
          <div className="border-t border-[#E5DBCD] px-3 py-3">
            {!collapsed ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">
                      {identity?.full_name || '-'}
                    </p>
                    <p className="mt-0.5 truncate font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#6A726A]">
                      {normalizedRole || '-'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.14em] ${
                      identity?.mfa_verified
                        ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]'
                        : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'
                    }`}
                  >
                    {identity?.mfa_verified ? 'MFA' : 'OTP'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={isSigningOut}
                  className={`mt-3 w-full justify-center text-center ${panelDangerButtonClassName}`}
                >
                  {isSigningOut ? 'Çıkış...' : 'Çıkış Yap'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onSignOut}
                disabled={isSigningOut}
                title="Çıkış Yap"
                aria-label="Çıkış Yap"
                className="flex w-full items-center justify-center rounded-[14px] border border-[#B78382] bg-[#6B333A] p-2 text-white transition hover:bg-[#5B2930] focus-visible:ring-2 focus-visible:ring-[#2C5447]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5 12H3a1 1 0 01-1-1V3a1 1 0 011-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
