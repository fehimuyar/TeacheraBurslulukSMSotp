import { useState } from 'react';
import type { ModulePermission, PanelRole } from '../panelPermissions';
import { isSuperAdmin } from '../panelPermissions';
import PermissionMatrixEditor from './PermissionMatrixEditor';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelModal,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

const SYSTEM_ROLES: PanelRole[] = [
  { id: 'sys_super', name: 'Süper Admin', description: 'Tüm modüllere tam erişim', isSystem: true, permissions: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sys_ops', name: 'Operasyon', description: 'Operasyonel işlemler ve veri erişimi', isSystem: true, permissions: [], createdAt: '2026-01-01T00:00:00Z' },
  { id: 'sys_ro', name: 'Salt Okunur', description: 'Yalnızca veri görüntüleme', isSystem: true, permissions: [], createdAt: '2026-01-01T00:00:00Z' },
];

const INITIAL_CUSTOM_ROLES: PanelRole[] = [
  {
    id: 'custom_1', name: 'Satış Müdürü', description: 'Satış operasyonları ve raporlama', isSystem: false, createdAt: '2026-03-15T10:00:00Z',
    permissions: [
      { moduleId: 'home', canView: true, canEdit: false, canDelete: false },
      { moduleId: 'applications', canView: true, canEdit: true, canDelete: false },
      { moduleId: 'scholarship', canView: true, canEdit: true, canDelete: false },
      { moduleId: 'results', canView: true, canEdit: false, canDelete: false },
      { moduleId: 'operations', canView: true, canEdit: true, canDelete: false },
      { moduleId: 'reports', canView: true, canEdit: false, canDelete: false },
    ],
  },
  {
    id: 'custom_2', name: 'Öğretmen', description: 'Sınav oluşturma ve aday takibi', isSystem: false, createdAt: '2026-03-16T08:00:00Z',
    permissions: [
      { moduleId: 'home', canView: true, canEdit: false, canDelete: false },
      { moduleId: 'scholarship', canView: true, canEdit: false, canDelete: false },
      { moduleId: 'exam-builder', canView: true, canEdit: true, canDelete: false },
      { moduleId: 'reports', canView: true, canEdit: false, canDelete: false },
    ],
  },
];

export default function RoleManagementTab({ role }: { role?: string }) {
  const canManage = isSuperAdmin(role);
  const [customRoles, setCustomRoles] = useState<PanelRole[]>(INITIAL_CUSTOM_ROLES);
  const [message, setMessage] = useState('');
  const [editingRole, setEditingRole] = useState<PanelRole | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const allRoles = [...SYSTEM_ROLES, ...customRoles];
  const selectedRole = allRoles.find((r) => r.id === selectedRoleId);
  const mockUserCounts: Record<string, number> = { sys_super: 1, sys_ops: 3, sys_ro: 2, custom_1: 1, custom_2: 5 };

  const handleSave = () => {
    if (!editingRole || !editingRole.name.trim()) return;
    if (isNew) {
      setCustomRoles((prev) => [...prev, { ...editingRole, id: `custom_${Date.now()}`, createdAt: new Date().toISOString() }]);
      setMessage(`"${editingRole.name}" rolü oluşturuldu.`);
    } else {
      setCustomRoles((prev) => prev.map((r) => (r.id === editingRole.id ? editingRole : r)));
      setMessage(`"${editingRole.name}" rolü güncellendi.`);
    }
    setEditingRole(null);
  };

  const handleDelete = (id: string) => {
    setCustomRoles((prev) => prev.filter((r) => r.id !== id));
    setMessage('Rol silindi.');
    setDeleteTarget(null);
    if (selectedRoleId === id) setSelectedRoleId(null);
  };

  const emptyRole = (): PanelRole => ({ id: '', name: '', description: '', isSystem: false, permissions: [], createdAt: '' });

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Rol Yönetimi</p>
            <h3 className={panelTitleClassName}>Roller & Yetkiler</h3>
          </div>
          {canManage && <button type="button" onClick={() => { setEditingRole(emptyRole()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Yeni Rol</button>}
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[520px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Rol Adı</th>
                <th className="px-3 py-2">Tür</th>
                <th className="px-3 py-2 text-right">Kullanıcı</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {allRoles.map((role) => (
                <tr
                  key={role.id}
                  className={`cursor-pointer border-b transition ${selectedRoleId === role.id ? 'border-[#2C5447] bg-[#EEF6F0]' : 'border-[#F0E7DA] hover:bg-[#FBF7F0]'}`}
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{role.name}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${role.isSystem ? 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' : 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]'}`}>
                      {role.isSystem ? 'Sistem' : 'Özel'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{mockUserCounts[role.id] || 0}</td>
                  <td className="px-3 py-2 text-right">
                    {!role.isSystem && canManage && (
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setEditingRole(role); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                      </div>
                    )}
                    {role.isSystem && <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Permission matrix for selected role */}
      {selectedRole && (
        <PermissionMatrixEditor
          permissions={selectedRole.permissions}
          onChange={(perms) => {
            if (selectedRole.isSystem) return;
            setCustomRoles((prev) => prev.map((r) => (r.id === selectedRole.id ? { ...r, permissions: perms } : r)));
          }}
          disabled={selectedRole.isSystem}
        />
      )}

      <PanelModal open={editingRole !== null} onClose={() => setEditingRole(null)} title={isNew ? 'Yeni Rol Oluştur' : 'Rol Düzenle'} maxWidth="520px">
        {editingRole && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Rol Adı</label><input value={editingRole.name} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} placeholder="Satış Müdürü, Öğretmen..." /></div>
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Açıklama</label><textarea value={editingRole.description} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} rows={2} className="mt-1 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]" /></div>
            <PermissionMatrixEditor permissions={editingRole.permissions} onChange={(perms) => setEditingRole({ ...editingRole, permissions: perms })} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingRole(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Oluştur' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Rol Sil" description="Bu rolü silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
