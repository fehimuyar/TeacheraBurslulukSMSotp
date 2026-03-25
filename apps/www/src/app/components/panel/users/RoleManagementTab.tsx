import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../../api/panelApi';
import { isSuperAdmin } from '../panelPermissions';
import { PANEL_PERMISSION } from '../panelRoleAccess';
import { formatDateTime, formatNumber } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelModal,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type RoleListItem = {
  role_id: string;
  role_code: string;
  role_name: string;
  description: string | null;
  created_at: string | null;
  is_system: boolean;
  user_count: number;
  active_user_count: number;
  last_assigned_at: string | null;
  permissions: string[];
};

type RolesPayload = {
  items?: RoleListItem[];
  message?: string;
  error?: string;
};

type RoleActionPayload = {
  role_id?: string;
  message?: string;
  error?: string;
};

type RoleDraft = {
  role_id: string;
  role_name: string;
  description: string;
  permissions: string[];
};

const PERMISSION_GROUPS = [
  {
    id: 'dashboard-grid',
    title: 'Dashboard & Aday Grid',
    items: [
      {
        code: PANEL_PERMISSION.DASHBOARD_READ,
        label: 'Dashboard Okuma',
        description: 'Anasayfa KPI, dagilim ve canli dashboard kartlari.',
      },
      {
        code: PANEL_PERMISSION.CANDIDATES_READ,
        label: 'Aday Grid Okuma',
        description: 'Aday listesi, bursluluk tablo ve detay gorunumu.',
      },
      {
        code: PANEL_PERMISSION.CANDIDATES_EXPORT,
        label: 'Aday Export',
        description: 'Aday grid export ve toplu veri alma aksiyonlari.',
      },
      {
        code: PANEL_PERMISSION.CANDIDATES_ACTION,
        label: 'Aday Aksiyonlari',
        description: 'Retry, not, CRM push ve aday aksiyonlari.',
      },
    ],
  },
  {
    id: 'communication-ops',
    title: 'Iletisim Operasyonlari',
    items: [
      {
        code: PANEL_PERMISSION.NOTIFICATIONS_READ,
        label: 'Bildirim Merkezi Okuma',
        description: 'SMS ve WhatsApp job listesi ve ozetler.',
      },
      {
        code: PANEL_PERMISSION.NOTIFICATIONS_ACTION,
        label: 'Bildirim Aksiyonlari',
        description: 'SMS retry, reminder broadcast ve queue islemleri.',
      },
      {
        code: PANEL_PERMISSION.UNVIEWED_READ,
        label: 'Sonuc Gormeyenler Okuma',
        description: 'Unviewed result listesi ve sayaclari.',
      },
      {
        code: PANEL_PERMISSION.UNVIEWED_ACTION,
        label: 'WhatsApp Follow-up',
        description: 'Result unseen ve randevu follow-up tetikleme.',
      },
      {
        code: PANEL_PERMISSION.DLQ_READ,
        label: 'DLQ Okuma',
        description: 'Dead-letter queue ve hata listelerini gorme.',
      },
      {
        code: PANEL_PERMISSION.DLQ_ACTION,
        label: 'DLQ Aksiyonlari',
        description: 'Retry ve close aksiyonlarini calistirma.',
      },
      {
        code: PANEL_PERMISSION.CRM_PUSH,
        label: 'CRM Push',
        description: 'Aday verisini dis CRM sistemine gonderme.',
      },
    ],
  },
  {
    id: 'audit-settings',
    title: 'Ayarlar & Audit',
    items: [
      {
        code: PANEL_PERMISSION.SETTINGS_READ,
        label: 'Ayarlari Okuma',
        description: 'Panel ayarlari, kampanya ve runtime degerleri.',
      },
      {
        code: PANEL_PERMISSION.SETTINGS_WRITE,
        label: 'Ayar Yazma',
        description: 'Ayar guncelleme ve runtime konfigurasyon degisiklikleri.',
      },
      {
        code: PANEL_PERMISSION.AUDIT_READ,
        label: 'Audit Okuma',
        description: 'Audit trail ve guvenlik olaylarini okuma.',
      },
      {
        code: PANEL_PERMISSION.AUDIT_EXPORT,
        label: 'Audit Export',
        description: 'Audit ve log veri export aksiyonlari.',
      },
      {
        code: PANEL_PERMISSION.IP_POLICY_READ,
        label: 'IP Policy Okuma',
        description: 'Role-based IP policy kurallarini gorme.',
      },
      {
        code: PANEL_PERMISSION.IP_POLICY_WRITE,
        label: 'IP Policy Yazma',
        description: 'Role-based IP allowlist ayarlari.',
      },
    ],
  },
  {
    id: 'results',
    title: 'Sonuc Yetkileri',
    items: [
      {
        code: PANEL_PERMISSION.RESULTS_REVIEW,
        label: 'Sonuc Inceleme',
        description: 'Result review, onizleme ve karar ekranlari.',
      },
      {
        code: PANEL_PERMISSION.RESULTS_OVERRIDE,
        label: 'Sonuc Override',
        description: 'Ranking, burs ve karar override aksiyonlari.',
      },
      {
        code: PANEL_PERMISSION.RESULTS_PUBLISH,
        label: 'Sonuc Yayinlama',
        description: 'Sonuc publish aksiyonlari ve final dagitimi.',
      },
    ],
  },
] as const;

function createEmptyRole(): RoleDraft {
  return {
    role_id: '',
    role_name: '',
    description: '',
    permissions: [PANEL_PERMISSION.DASHBOARD_READ],
  };
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeMessage(payload: { message?: string; error?: string } | null, fallback: string) {
  const message = String(payload?.message || '').trim();
  if (message) return message;
  const error = String(payload?.error || '').trim();
  if (error) return error;
  return fallback;
}

function togglePermission(codes: string[], code: string) {
  const next = new Set(codes);
  if (next.has(code)) {
    next.delete(code);
  } else {
    next.add(code);
  }
  return Array.from(next).sort((left, right) => left.localeCompare(right, 'en'));
}

export default function RoleManagementTab({
  role,
  permissions: _permissions,
}: {
  role?: string;
  permissions?: string[];
}) {
  const canManage = isSuperAdmin(role);

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleListItem | null>(null);
  const [editingRole, setEditingRole] = useState<RoleDraft | null>(null);

  const summary = useMemo(() => {
    return roles.reduce(
      (acc, item) => {
        acc.totalRoles += 1;
        acc.systemRoles += item.is_system ? 1 : 0;
        acc.customRoles += item.is_system ? 0 : 1;
        acc.assignedUsers += Number(item.user_count || 0);
        return acc;
      },
      {
        totalRoles: 0,
        systemRoles: 0,
        customRoles: 0,
        assignedUsers: 0,
      },
    );
  }, [roles]);

  const selectedRole = roles.find((item) => item.role_id === selectedRoleId) || roles[0] || null;

  const loadRoles = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await panelFetch('/api/panel/users/roles');
      const payload = await readJsonSafe<RolesPayload>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Rol listesi yuklenemedi.'));
      }

      const nextRoles = Array.isArray(payload?.items) ? payload.items : [];
      setRoles(nextRoles);
      setSelectedRoleId((current) => {
        if (current && nextRoles.some((item) => item.role_id === current)) {
          return current;
        }
        return nextRoles[0]?.role_id || '';
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Rol listesi yuklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  const handleSave = async () => {
    if (!editingRole) return;
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/users/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'upsert_role',
          role_id: editingRole.role_id || undefined,
          role_name: editingRole.role_name.trim(),
          description: editingRole.description.trim() || undefined,
          permissions: editingRole.permissions,
        }),
      });

      const payload = await readJsonSafe<RoleActionPayload>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Rol kaydedilemedi.'));
      }

      await loadRoles();
      setSelectedRoleId(payload?.role_id || selectedRoleId);
      setEditingRole(null);
      setMessage(normalizeMessage(payload, 'Rol kaydedildi.'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Rol kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (target: RoleListItem) => {
    setIsSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/users/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete_role',
          role_id: target.role_id,
        }),
      });

      const payload = await readJsonSafe<RoleActionPayload>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Rol silinemedi.'));
      }

      await loadRoles();
      setDeleteTarget(null);
      setMessage(normalizeMessage(payload, 'Rol silindi.'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Rol silinemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {message ? <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Rol Yonetimi</p>
            <h3 className={panelTitleClassName}>Roller & Yetkiler</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadRoles()} className={panelSecondaryButtonClassName} disabled={isLoading}>
              Yenile
            </button>
            {canManage ? (
              <button type="button" onClick={() => setEditingRole(createEmptyRole())} className={panelPrimaryButtonClassName}>
                + Yeni Rol
              </button>
            ) : null}
          </div>
        </div>

        {!canManage ? (
          <p className={`mt-4 ${panelReadOnlyNoticeClassName}`}>
            Bu alan salt gorunum modunda. Sistem ve ozel roller yalnizca super admin tarafindan guncellenebilir.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Toplam Rol</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.totalRoles)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Sistem</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.systemRoles)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Ozel Rol</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.customRoles)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Atanmis Kullanici</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.assignedUsers)}</p>
          </div>
        </div>

        {isLoading ? (
          <PanelLoadingMessage>Roller ve yetkiler yukleniyor...</PanelLoadingMessage>
        ) : (
          <div className={panelTableContainerClassName}>
            <table className="min-w-[820px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
              <thead>
                <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Tur</th>
                  <th className="px-3 py-2 text-center">Kullanici</th>
                  <th className="px-3 py-2 text-center">Yetki</th>
                  <th className="px-3 py-2">Son Atama</th>
                  <th className="px-3 py-2 text-right">Islem</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <PanelEmptyState
                        message="Tanimli rol bulunamadi."
                        actionLabel={canManage ? 'Yeni Rol' : undefined}
                        onAction={canManage ? () => setEditingRole(createEmptyRole()) : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  roles.map((item) => {
                    const selected = selectedRole?.role_id === item.role_id;
                    return (
                      <tr
                        key={item.role_id}
                        className={`cursor-pointer border-b transition ${selected ? 'border-[#2C5447] bg-[#EEF6F0]' : 'border-[#F0E7DA] hover:bg-[#FBF7F0]'}`}
                        onClick={() => setSelectedRoleId(item.role_id)}
                      >
                        <td className="px-3 py-2">
                          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.role_name || item.role_code}</p>
                          <p className="mt-1 text-[11px] text-[#7A7063]">{item.role_code}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${item.is_system ? 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' : 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]'}`}>
                            {item.is_system ? 'Sistem' : 'Ozel'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formatNumber(item.user_count || 0)}
                          <span className="ml-1 text-[11px] text-[#7A7063]">({formatNumber(item.active_user_count || 0)} aktif)</span>
                        </td>
                        <td className="px-3 py-2 text-center">{formatNumber(item.permissions?.length || 0)}</td>
                        <td className="px-3 py-2">{formatDateTime(item.last_assigned_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {canManage && !item.is_system ? (
                            <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingRole({
                                    role_id: item.role_id,
                                    role_name: item.role_name || '',
                                    description: item.description || '',
                                    permissions: Array.isArray(item.permissions) ? item.permissions : [],
                                  })
                                }
                                className={panelSmallButtonClassName}
                              >
                                Duzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className={panelDangerButtonClassName}
                                disabled={isSaving}
                              >
                                Sil
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#8A7F71]">{item.is_system ? 'Sistem rolu' : 'Salt gorunum'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Rol Detayi</p>
            <h3 className={panelTitleClassName}>{selectedRole?.role_name || 'Rol Secin'}</h3>
          </div>
          {selectedRole ? (
            <div className="text-right">
              <p className="text-[12px] text-[#7A7063]">{selectedRole.role_code}</p>
              <p className="mt-1 text-[11px] text-[#8A7F71]">Olusturulma: {formatDateTime(selectedRole.created_at)}</p>
            </div>
          ) : null}
        </div>

        {selectedRole ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-[18px] border border-[#E8DFD2] bg-[#FFFCF8] p-4">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.7] text-[#33463E]">
                {selectedRole.description || 'Bu rol icin aciklama tanimlanmamis.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${selectedRole.is_system ? 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' : 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]'}`}>
                  {selectedRole.is_system ? 'Sistem' : 'Ozel'}
                </span>
                <span className="rounded-full border border-[#DDD3C5] bg-[#FFFDF9] px-2.5 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase text-[#5E665E]">
                  {formatNumber(selectedRole.user_count || 0)} kullanici
                </span>
                <span className="rounded-full border border-[#DDD3C5] bg-[#FFFDF9] px-2.5 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase text-[#5E665E]">
                  {formatNumber(selectedRole.permissions?.length || 0)} yetki
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => {
                const activeItems = group.items.filter((permission) => selectedRole.permissions.includes(permission.code));
                return (
                  <div key={group.id} className="rounded-[18px] border border-[#E8DFD2] bg-[#FFFCF8] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{group.title}</p>
                        <p className="mt-1 text-[11px] text-[#7A7063]">
                          {formatNumber(activeItems.length)} / {formatNumber(group.items.length)} aktif
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.items.map((permission) => {
                        const enabled = selectedRole.permissions.includes(permission.code);
                        return (
                          <div key={permission.code} className={`rounded-[14px] border px-3 py-2 ${enabled ? 'border-[#BFD2C8] bg-[#EEF6F0]' : 'border-[#E7DED0] bg-[#FFFDF9]'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] text-[#1B2B24]">{permission.label}</p>
                                <p className="mt-1 text-[11px] leading-[1.6] text-[#6A726A]">{permission.description}</p>
                              </div>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${enabled ? 'border-[#BFD2C8] bg-white text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#8A7F71]'}`}>
                                {enabled ? 'Acik' : 'Kapali'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <PanelEmptyState message="Detay gormek icin bir rol secin." />
          </div>
        )}
      </section>

      <PanelModal
        open={editingRole !== null}
        onClose={() => {
          if (isSaving) return;
          setEditingRole(null);
        }}
        title={editingRole?.role_id ? 'Rol Duzenle' : 'Yeni Rol Olustur'}
        maxWidth="860px"
      >
        {editingRole ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-[12px] text-[#7A7063]">Rol Adi</label>
                <input
                  value={editingRole.role_name}
                  onChange={(event) => setEditingRole({ ...editingRole, role_name: event.target.value })}
                  className={`mt-1 w-full ${panelInputClassName}`}
                  placeholder="Operasyon Koordinatoru"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#7A7063]">Aciklama</label>
                <input
                  value={editingRole.description}
                  onChange={(event) => setEditingRole({ ...editingRole, description: event.target.value })}
                  className={`mt-1 w-full ${panelInputClassName}`}
                  placeholder="Bu rolun hangi panel akislarini yonetecegini ozetleyin."
                />
              </div>
            </div>

            <div className="space-y-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="rounded-[18px] border border-[#E8DFD2] bg-[#FFFCF8] p-4">
                  <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{group.title}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {group.items.map((permission) => {
                      const checked = editingRole.permissions.includes(permission.code);
                      return (
                        <label
                          key={permission.code}
                          className={`flex cursor-pointer items-start gap-3 rounded-[14px] border px-3 py-3 transition ${checked ? 'border-[#BFD2C8] bg-[#EEF6F0]' : 'border-[#E7DED0] bg-[#FFFDF9] hover:border-[#D5C9B7]'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setEditingRole({
                                ...editingRole,
                                permissions: togglePermission(editingRole.permissions, permission.code),
                              })
                            }
                            className="mt-0.5 h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]"
                          />
                          <span>
                            <span className="block font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] text-[#1B2B24]">
                              {permission.label}
                            </span>
                            <span className="mt-1 block text-[11px] leading-[1.6] text-[#6A726A]">
                              {permission.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingRole(null)} className={panelSecondaryButtonClassName} disabled={isSaving}>
                Iptal
              </button>
              <button type="button" onClick={() => void handleSave()} className={panelPrimaryButtonClassName} disabled={isSaving}>
                {isSaving ? 'Kaydediliyor...' : editingRole.role_id ? 'Kaydet' : 'Rol Olustur'}
              </button>
            </div>
          </div>
        ) : null}
      </PanelModal>

      <PanelConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => {
          if (isSaving) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) {
            void handleDelete(deleteTarget);
          }
        }}
        title="Rol Silinsin mi?"
        description={
          deleteTarget
            ? `${deleteTarget.role_name || deleteTarget.role_code} rolu kalici olarak silinecek.`
            : 'Rol kalici olarak silinecek.'
        }
        confirmLabel="Sil"
        danger
      />
    </div>
  );
}
