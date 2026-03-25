import { useSearchParams } from 'react-router';
import { USERS_SUB_TABS } from './panelNavigationConfig';
import type { PanelFocus } from './panelTypes';
import {
  PanelSubNavTabs,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSurfaceClassName,
} from './panelUi';
import RoleManagementTab from './users/RoleManagementTab';
import UserAccountsTab from './users/UserAccountsTab';

export default function UserPermissionPanel({
  role,
  permissions,
  focus,
}: {
  role?: string;
  permissions?: string[];
  focus: PanelFocus;
}) {
  const [, setSearchParams] = useSearchParams();

  const handleFocusChange = (newFocus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'users');
      next.set('focus', newFocus);
      return next;
    });
  };

  const activeFocus = focus || 'roles';

  return (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Sistem</p>
        <h2 className={panelLargeTitleClassName}>Kullanıcı & Yetki Merkezi</h2>
        <p className={panelDescriptionClassName}>
          Roller oluşturun, modül bazlı yetkiler tanımlayın ve kullanıcı hesaplarını yönetin.
        </p>
        <div className="mt-4">
          <PanelSubNavTabs
            items={USERS_SUB_TABS}
            activeFocus={activeFocus}
            onSelect={handleFocusChange}
          />
        </div>
      </section>

      {activeFocus === 'roles' && <RoleManagementTab role={role} permissions={permissions} />}
      {activeFocus === 'accounts' && <UserAccountsTab role={role} permissions={permissions} />}
    </div>
  );
}
