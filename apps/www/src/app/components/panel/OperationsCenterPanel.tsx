import { useSearchParams } from 'react-router';
import { OPERATIONS_SUB_TABS } from './panelNavigationConfig';
import type { PanelFocus } from './panelTypes';
import {
  PanelSubNavTabs,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSurfaceClassName,
} from './panelUi';
import AutomationRulesTab from './ops/AutomationRulesTab';
import ExamAssignmentTab from './ops/ExamAssignmentTab';
import ExamSessionsTab from './ops/ExamSessionsTab';
import PipelineKanbanTab from './ops/PipelineKanbanTab';
import WhatsAppTriggersTab from './ops/WhatsAppTriggersTab';
import SmsOperationsTab from './ops/SmsOperationsTab';
import ApiStatusTab from './ops/ApiStatusTab';
import SchoolListTab from './ops/SchoolListTab';
import ProgramsPricingTab from './ops/ProgramsPricingTab';
import BankListTab from './ops/BankListTab';

export default function OperationsCenterPanel({
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
      next.set('view', 'operations');
      next.set('focus', newFocus);
      return next;
    });
  };

  const activeFocus = focus || 'exam-assign';

  return (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Yönetim</p>
        <h2 className={panelLargeTitleClassName}>Operasyon Merkezi</h2>
        <div className="mt-3">
          <PanelSubNavTabs
            items={OPERATIONS_SUB_TABS}
            activeFocus={activeFocus}
            onSelect={handleFocusChange}
          />
        </div>
      </section>

      {activeFocus === 'exam-assign' && <ExamAssignmentTab role={role} />}
      {activeFocus === 'whatsapp-triggers' && <WhatsAppTriggersTab role={role} />}
      {activeFocus === 'sms' && <SmsOperationsTab role={role} />}
      {activeFocus === 'api-status' && <ApiStatusTab role={role} />}
      {activeFocus === 'schools' && <SchoolListTab role={role} />}
      {activeFocus === 'programs' && <ProgramsPricingTab role={role} />}
      {activeFocus === 'banks' && <BankListTab role={role} />}
      {activeFocus === 'exam-sessions' && <ExamSessionsTab role={role} />}
      {activeFocus === 'pipeline' && <PipelineKanbanTab />}
      {activeFocus === 'automation-rules' && <AutomationRulesTab role={role} />}
    </div>
  );
}
