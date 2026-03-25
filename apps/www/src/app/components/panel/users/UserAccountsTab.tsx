import { useEffect, useMemo, useState } from 'react';
import { panelFetch } from '../../../api/panelApi';
import { isSuperAdmin } from '../panelPermissions';
import { formatDateTime, formatNumber } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelLoadingMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type UserListItem = {
  user_id: string;
  email: string;
  full_name: string;
  tckn: string | null;
  phone_e164: string | null;
  status: string | null;
  created_at: string | null;
  last_login_at: string | null;
  password_reset_required: boolean;
  mfa_enabled: boolean;
  active_session_count: number;
  role_code: string;
  role_name: string;
  role_codes: string[];
};

type UsersPayload = {
  items?: UserListItem[];
  summary?: {
    total_users?: number;
    active_users?: number;
    suspended_users?: number;
    password_reset_required?: number;
    otp_enabled?: number;
    active_sessions?: number;
  };
  message?: string;
  error?: string;
};

type RoleOption = {
  role_id: string;
  role_code: string;
  role_name: string;
  is_system: boolean;
};

type RolesPayload = {
  items?: RoleOption[];
  message?: string;
  error?: string;
};

type UserActionPayload = {
  message?: string;
  error?: string;
};

type UserDraft = {
  user_id: string;
  full_name: string;
  email: string;
  tckn: string;
  phone_e164: string;
  role_code: string;
  status: 'ACTIVE' | 'SUSPENDED';
  password: string;
  password_reset_required: boolean;
};

const EMPTY_SUMMARY = {
  total_users: 0,
  active_users: 0,
  suspended_users: 0,
  password_reset_required: 0,
  otp_enabled: 0,
  active_sessions: 0,
};

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
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

function formatStatus(status: string | null | undefined) {
  return String(status || '').trim().toUpperCase() === 'ACTIVE' ? 'Aktif' : 'Askida';
}

function formatMaskedTckn(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 3)}******${digits.slice(-2)}`;
}

function formatPhone(value: string | null | undefined) {
  const compact = String(value || '').trim();
  if (!compact) return '-';
  if (!compact.startsWith('+90') || compact.length < 13) return compact;
  return `+90 ${compact.slice(3, 6)} ${compact.slice(6, 9)} ${compact.slice(9, 11)} ${compact.slice(11, 13)}`;
}

function createEmptyUser(defaultRoleCode: string): UserDraft {
  return {
    user_id: '',
    full_name: '',
    email: '',
    tckn: '',
    phone_e164: '',
    role_code: defaultRoleCode,
    status: 'ACTIVE',
    password: generatePassword(),
    password_reset_required: true,
  };
}

function toDraft(user: UserListItem): UserDraft {
  return {
    user_id: user.user_id,
    full_name: user.full_name || '',
    email: user.email || '',
    tckn: user.tckn || '',
    phone_e164: user.phone_e164 || '',
    role_code: user.role_code || '',
    status: String(user.status || '').trim().toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
    password: '',
    password_reset_required: Boolean(user.password_reset_required),
  };
}

export default function UserAccountsTab({
  role,
  permissions: _permissions,
}: {
  role?: string;
  permissions?: string[];
}) {
  const canManage = isSuperAdmin(role);

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState('');
  const [editing, setEditing] = useState<UserDraft | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserListItem | null>(null);

  const defaultRoleCode = roles[0]?.role_code || 'OPERATIONS';

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!query) return users;
    return users.filter((user) =>
      [
        user.full_name,
        user.email,
        user.role_name,
        user.role_code,
        user.phone_e164,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('tr-TR').includes(query)),
    );
  }, [searchQuery, users]);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        panelFetch('/api/panel/users'),
        panelFetch('/api/panel/users/roles'),
      ]);

      const usersPayload = await readJsonSafe<UsersPayload>(usersResponse);
      const rolesPayload = await readJsonSafe<RolesPayload>(rolesResponse);

      if (!usersResponse.ok) {
        throw new Error(normalizeMessage(usersPayload, 'Kullanici listesi yuklenemedi.'));
      }
      if (!rolesResponse.ok) {
        throw new Error(normalizeMessage(rolesPayload, 'Rol listesi yuklenemedi.'));
      }

      setUsers(Array.isArray(usersPayload?.items) ? usersPayload.items : []);
      setRoles(Array.isArray(rolesPayload?.items) ? rolesPayload.items : []);
      setSummary({
        total_users: Number(usersPayload?.summary?.total_users || 0),
        active_users: Number(usersPayload?.summary?.active_users || 0),
        suspended_users: Number(usersPayload?.summary?.suspended_users || 0),
        password_reset_required: Number(usersPayload?.summary?.password_reset_required || 0),
        otp_enabled: Number(usersPayload?.summary?.otp_enabled || 0),
        active_sessions: Number(usersPayload?.summary?.active_sessions || 0),
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kullanici verisi yuklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreateModal = () => {
    setEditing(createEmptyUser(defaultRoleCode));
    setMessage('');
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (!editing) return;
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
          action: 'upsert_user',
          user_id: editing.user_id || undefined,
          full_name: editing.full_name.trim(),
          email: editing.email.trim(),
          tckn: editing.tckn.trim() || undefined,
          phone_e164: editing.phone_e164.trim() || undefined,
          role_code: editing.role_code,
          password: editing.password.trim() || undefined,
          password_reset_required: editing.password_reset_required,
          status: editing.status,
        }),
      });

      const payload = await readJsonSafe<UserActionPayload>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Kullanici kaydedilemedi.'));
      }

      await loadData();
      setEditing(null);
      setMessage(normalizeMessage(payload, 'Kullanici guncellendi.'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kullanici kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (user: UserListItem) => {
    const nextStatus = String(user.status || '').trim().toUpperCase() === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setTogglingUserId(user.user_id);
    setErrorMessage('');
    setMessage('');

    try {
      const response = await panelFetch('/api/panel/users/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set_status',
          user_id: user.user_id,
          status: nextStatus,
        }),
      });

      const payload = await readJsonSafe<UserActionPayload>(response);
      if (!response.ok) {
        throw new Error(normalizeMessage(payload, 'Kullanici durumu guncellenemedi.'));
      }

      await loadData();
      setMessage(normalizeMessage(payload, 'Kullanici durumu guncellendi.'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kullanici durumu guncellenemedi.');
    } finally {
      setTogglingUserId('');
      setSuspendTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      {message ? <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage> : null}
      {errorMessage ? <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage> : null}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Kullanici Yonetimi</p>
            <h3 className={panelTitleClassName}>Kullanici Hesaplari</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadData()} className={panelSecondaryButtonClassName} disabled={isLoading}>
              Yenile
            </button>
            {canManage ? (
              <button type="button" onClick={openCreateModal} className={panelPrimaryButtonClassName} disabled={roles.length === 0}>
                + Kullanici Ekle
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Toplam Hesap</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.total_users)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Aktif</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.active_users)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Askida</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.suspended_users)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Sifre Reset Bekleyen</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.password_reset_required)}</p>
          </div>
          <div className={panelStatCardClassName}>
            <p className="text-[12px] text-[#7A7063]">Acil Oturum</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.active_sessions)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Ad, e-posta, rol veya telefon ara..."
            className={`w-full max-w-[380px] ${panelCompactInputClassName}`}
          />
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
            {formatNumber(filteredUsers.length)} kayit gosteriliyor
          </p>
        </div>

        {isLoading ? (
          <PanelLoadingMessage>Kullanici hesaplari yukleniyor...</PanelLoadingMessage>
        ) : (
          <div className={panelTableContainerClassName}>
            <table className="min-w-[980px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
              <thead>
                <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                  <th className="px-3 py-2">Kullanici</th>
                  <th className="px-3 py-2">Rol</th>
                  <th className="px-3 py-2">Guvenlik</th>
                  <th className="px-3 py-2">Iletisim</th>
                  <th className="px-3 py-2">Son Giris</th>
                  <th className="px-3 py-2 text-center">Oturum</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2 text-right">Islem</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <PanelEmptyState
                        message="Filtreye uygun kullanici bulunamadi."
                        actionLabel={canManage ? 'Yeni Kullanici' : undefined}
                        onAction={canManage ? openCreateModal : undefined}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isActive = String(user.status || '').trim().toUpperCase() === 'ACTIVE';
                    return (
                      <tr key={user.user_id} className="border-b border-[#F0E7DA] align-top">
                        <td className="px-3 py-2">
                          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{user.full_name || '-'}</p>
                          <p className="mt-1 text-[11px] text-[#7A7063]">{user.email || '-'}</p>
                          <p className="mt-1 text-[11px] text-[#8A7F71]">TC: {formatMaskedTckn(user.tckn)}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{user.role_name || user.role_code || '-'}</p>
                          <p className="mt-1 text-[11px] text-[#7A7063]">{user.role_code || '-'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${user.password_reset_required ? 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' : 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]'}`}>
                              {user.password_reset_required ? 'Reset Gerekli' : 'Sifre Guncel'}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${user.mfa_enabled ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'}`}>
                              {user.mfa_enabled ? 'OTP Acik' : 'OTP Kapali'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <p>{formatPhone(user.phone_e164)}</p>
                          <p className="mt-1 text-[11px] text-[#7A7063]">Olusma: {formatDateTime(user.created_at)}</p>
                        </td>
                        <td className="px-3 py-2">{formatDateTime(user.last_login_at)}</td>
                        <td className="px-3 py-2 text-center">{formatNumber(user.active_session_count || 0)}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${isActive ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]'}`}>
                            {formatStatus(user.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canManage ? (
                            <div className="flex justify-end gap-1">
                              <button type="button" onClick={() => setEditing(toDraft(user))} className={panelSmallButtonClassName}>
                                Duzenle
                              </button>
                              <button
                                type="button"
                                onClick={() => setSuspendTarget(user)}
                                disabled={togglingUserId === user.user_id}
                                className={isActive ? panelDangerButtonClassName : panelSecondaryButtonClassName}
                              >
                                {togglingUserId === user.user_id ? 'Bekleyin...' : isActive ? 'Askiya Al' : 'Aktiflestir'}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#8A7F71]">Salt gorunum</span>
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

      <PanelModal
        open={editing !== null}
        onClose={() => {
          if (isSaving) return;
          setEditing(null);
        }}
        title={editing?.user_id ? 'Kullanici Duzenle' : 'Yeni Kullanici'}
        maxWidth="620px"
      >
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-[12px] text-[#7A7063]">Ad Soyad</label>
                <input
                  value={editing.full_name}
                  onChange={(event) => setEditing({ ...editing, full_name: event.target.value })}
                  className={`mt-1 w-full ${panelInputClassName}`}
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#7A7063]">E-posta</label>
                <input
                  type="email"
                  value={editing.email}
                  onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                  className={`mt-1 w-full ${panelInputClassName}`}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-[12px] text-[#7A7063]">TCKN</label>
                <input
                  value={editing.tckn}
                  onChange={(event) =>
                    setEditing({ ...editing, tckn: event.target.value.replace(/\D+/g, '').slice(0, 11) })
                  }
                  placeholder="11 haneli"
                  maxLength={11}
                  className={`mt-1 w-full ${panelInputClassName}`}
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#7A7063]">Telefon</label>
                <input
                  value={editing.phone_e164}
                  onChange={(event) => setEditing({ ...editing, phone_e164: event.target.value })}
                  placeholder="+90532..."
                  className={`mt-1 w-full ${panelInputClassName}`}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-[12px] text-[#7A7063]">Rol</label>
                <select
                  value={editing.role_code}
                  onChange={(event) => setEditing({ ...editing, role_code: event.target.value })}
                  className={`mt-1 w-full ${panelInputClassName}`}
                >
                  {roles.map((roleOption) => (
                    <option key={roleOption.role_id} value={roleOption.role_code}>
                      {roleOption.role_name} ({roleOption.role_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-[#7A7063]">Durum</label>
                <select
                  value={editing.status}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      status: event.target.value === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
                    })
                  }
                  className={`mt-1 w-full ${panelInputClassName}`}
                >
                  <option value="ACTIVE">Aktif</option>
                  <option value="SUSPENDED">Askida</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-[#7A7063]">
                Sifre {editing.user_id ? '(bos birakirsan degismez)' : ''}
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  value={editing.password}
                  onChange={(event) => setEditing({ ...editing, password: event.target.value })}
                  placeholder={editing.user_id ? 'Yeni sifre gir...' : 'Otomatik olusturuldu'}
                  className={`min-w-[240px] flex-1 ${panelInputClassName}`}
                />
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, password: generatePassword() })}
                  className={panelSecondaryButtonClassName}
                >
                  Sifre Uret
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#33463E]">
              <input
                type="checkbox"
                checked={editing.password_reset_required}
                onChange={(event) =>
                  setEditing({ ...editing, password_reset_required: event.target.checked })
                }
                className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]"
              />
              Ilk giriste sifre reset zorunlu olsun
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName} disabled={isSaving}>
                Iptal
              </button>
              <button type="button" onClick={() => void handleSave()} className={panelPrimaryButtonClassName} disabled={isSaving || roles.length === 0}>
                {isSaving ? 'Kaydediliyor...' : editing.user_id ? 'Kaydet' : 'Kullanici Olustur'}
              </button>
            </div>
          </div>
        ) : null}
      </PanelModal>

      <PanelConfirmDialog
        open={suspendTarget !== null}
        onCancel={() => {
          if (togglingUserId) return;
          setSuspendTarget(null);
        }}
        onConfirm={() => {
          if (suspendTarget) {
            void handleToggleStatus(suspendTarget);
          }
        }}
        title="Kullanici Durumu Degissin mi?"
        description={
          suspendTarget
            ? `${suspendTarget.full_name || 'Bu kullanici'} icin durum guncellenecek.`
            : 'Kullanici durumu guncellenecek.'
        }
        confirmLabel={suspendTarget && String(suspendTarget.status || '').trim().toUpperCase() === 'ACTIVE' ? 'Askiya Al' : 'Aktiflestir'}
      />
    </div>
  );
}
