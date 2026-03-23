import { useSearchParams } from 'react-router';
import { APPOINTMENTS_SUB_TABS } from './panelNavigationConfig';
import type { PanelFocus } from './panelTypes';
import {
  PanelSubNavTabs,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSurfaceClassName,
} from './panelUi';
import AdvisorListTab from './appointments/AdvisorListTab';
import AdvisorPerfTab from './appointments/AdvisorPerfTab';
import DailyViewTab from './appointments/DailyViewTab';
import ScheduleTab from './appointments/ScheduleTab';

export default function AppointmentsPanel({
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
      next.set('view', 'appointments');
      next.set('focus', newFocus);
      return next;
    });
  };

  const activeFocus = focus || 'schedule';

  return (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Ana Operasyon</p>
        <h2 className={panelLargeTitleClassName}>Randevu & Danışman</h2>
        <div className="mt-3">
          <PanelSubNavTabs
            items={APPOINTMENTS_SUB_TABS}
            activeFocus={activeFocus}
            onSelect={handleFocusChange}
          />
        </div>
      </section>

      {activeFocus === 'schedule' && <ScheduleTab role={role} />}
      {activeFocus === 'daily' && <DailyViewTab role={role} />}
      {activeFocus === 'advisor-list' && <AdvisorListTab role={role} />}
      {activeFocus === 'advisor-perf' && <AdvisorPerfTab />}
    </div>
  );
}
