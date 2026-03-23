import { useSearchParams } from 'react-router';
import { REPORTS_SUB_TABS } from './panelNavigationConfig';
import type { PanelFocus } from './panelTypes';
import {
  PanelSubNavTabs,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSurfaceClassName,
} from './panelUi';
import SalesFunnelReport from './reports/SalesFunnelReport';
import SchoolSalesReport from './reports/SchoolSalesReport';
import SmsReportsPanel from './reports/SmsReportsPanel';
import WpBotReportsPanel from './reports/WpBotReportsPanel';

export default function ReportsPanel({
  role,
  focus,
}: {
  role?: string;
  focus: PanelFocus;
}) {
  const [, setSearchParams] = useSearchParams();

  const handleFocusChange = (newFocus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'reports');
      next.set('focus', newFocus);
      return next;
    });
  };

  const activeFocus = focus || 'sales';

  return (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Yönetim</p>
        <h2 className={panelLargeTitleClassName}>Raporlar</h2>
        <div className="mt-3">
          <PanelSubNavTabs
            items={REPORTS_SUB_TABS}
            activeFocus={activeFocus}
            onSelect={handleFocusChange}
          />
        </div>
      </section>

      {activeFocus === 'sales' && <SalesFunnelReport />}
      {activeFocus === 'school-reports' && <SchoolSalesReport />}
      {activeFocus === 'sms-reports' && <SmsReportsPanel />}
      {activeFocus === 'wp-reports' && <WpBotReportsPanel />}
    </div>
  );
}
