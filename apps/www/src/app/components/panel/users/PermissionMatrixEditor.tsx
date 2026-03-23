import type { ModulePermission } from '../panelPermissions';
import { PANEL_MODULES } from '../panelPermissions';
import { panelEyebrowClassName, panelSoftCardClassName } from '../panelUi';

export default function PermissionMatrixEditor({
  permissions,
  onChange,
  disabled = false,
}: {
  permissions: ModulePermission[];
  onChange: (permissions: ModulePermission[]) => void;
  disabled?: boolean;
}) {
  const permMap = Object.fromEntries(permissions.map((p) => [p.moduleId, p]));

  const getPermission = (moduleId: string): ModulePermission => permMap[moduleId] || { moduleId, canView: false, canEdit: false, canDelete: false };

  const toggle = (moduleId: string, field: 'canView' | 'canEdit' | 'canDelete') => {
    if (disabled) return;
    const current = getPermission(moduleId);
    const updated = { ...current, [field]: !current[field] };
    if (field === 'canEdit' && updated.canEdit) updated.canView = true;
    if (field === 'canDelete' && updated.canDelete) { updated.canView = true; updated.canEdit = true; }
    if (field === 'canView' && !updated.canView) { updated.canEdit = false; updated.canDelete = false; }

    const newPerms = permissions.filter((p) => p.moduleId !== moduleId);
    newPerms.push(updated);
    onChange(newPerms);
  };

  return (
    <div className={panelSoftCardClassName}>
      <p className={panelEyebrowClassName}>Yetki Matrisi</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[420px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
          <thead>
            <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
              <th className="px-3 py-2">Modül</th>
              <th className="px-3 py-2 text-center">Görme</th>
              <th className="px-3 py-2 text-center">Değiştirme</th>
              <th className="px-3 py-2 text-center">Silme</th>
            </tr>
          </thead>
          <tbody>
            {PANEL_MODULES.map((mod) => {
              const perm = getPermission(mod.id);
              return (
                <tr key={mod.id} className="border-b border-[#F0E7DA]">
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{mod.label}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={perm.canView} onChange={() => toggle(mod.id, 'canView')} disabled={disabled} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={perm.canEdit} onChange={() => toggle(mod.id, 'canEdit')} disabled={disabled} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={perm.canDelete} onChange={() => toggle(mod.id, 'canDelete')} disabled={disabled} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {disabled && <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Sistem rolleri düzenlenemez.</p>}
    </div>
  );
}
