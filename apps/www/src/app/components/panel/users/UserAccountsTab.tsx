import { useState } from 'react';
import { isSuperAdmin } from '../panelPermissions';
import { formatDateTime } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type UserAccount = {
  id: string;
  fullName: string;
  email: string;
  tckn: string;
  phone: string;
  roleName: string;
  hireDate: string | null;
  lastLoginAt: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
};

const MOCK_USERS: UserAccount[] = [
  { id: '1', fullName: 'Aliye Teachera', email: 'aliye@teachera.com.tr', tckn: '123456789**', phone: '532 XXX XX XX', roleName: 'Süper Admin', hireDate: '2024-06-01', lastLoginAt: '2026-03-23T14:30:00Z', status: 'ACTIVE', createdAt: '2024-06-01T00:00:00Z' },
  { id: '2', fullName: 'Zeynep Kaya', email: 'zeynep@teachera.com.tr', tckn: '987654321**', phone: '555 XXX XX XX', roleName: 'Operasyon', hireDate: '2025-01-15', lastLoginAt: '2026-03-23T14:25:00Z', status: 'ACTIVE', createdAt: '2025-01-15T00:00:00Z' },
  { id: '3', fullName: 'Ali Yılmaz', email: 'ali@teachera.com.tr', tckn: '112233445**', phone: '542 XXX XX XX', roleName: 'Operasyon', hireDate: '2025-03-10', lastLoginAt: '2026-03-22T18:00:00Z', status: 'ACTIVE', createdAt: '2025-03-10T00:00:00Z' },
  { id: '4', fullName: 'Fatma Öz', email: 'fatma@teachera.com.tr', tckn: '556677889**', phone: '505 XXX XX XX', roleName: 'Öğretmen', hireDate: '2025-09-01', lastLoginAt: '2026-03-21T09:00:00Z', status: 'ACTIVE', createdAt: '2025-09-01T00:00:00Z' },
  { id: '5', fullName: 'Mehmet Demir', email: 'mehmet@teachera.com.tr', tckn: '998877665**', phone: '538 XXX XX XX', roleName: 'Salt Okunur', hireDate: '2025-11-20', lastLoginAt: null, status: 'SUSPENDED', createdAt: '2025-11-20T00:00:00Z' },
];

const ROLE_OPTIONS = ['Süper Admin', 'Operasyon', 'Salt Okunur', 'Satış Müdürü', 'Öğretmen'];

const emptyUser = (): UserAccount => ({ id: '', fullName: '', email: '', tckn: '', phone: '', roleName: 'Operasyon', hireDate: null, lastLoginAt: null, status: 'ACTIVE', createdAt: '' });

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function UserAccountsTab({ role }: { role?: string }) {
  const canManage = isSuperAdmin(role);
  const [users, setUsers] = useState<UserAccount[]>(MOCK_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [password, setPassword] = useState('');
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);

  const filtered = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.roleName.toLowerCase().includes(q);
  });

  const handleSave = () => {
    if (!editing || !editing.fullName.trim() || !editing.email.trim()) return;
    if (isNew) {
      setUsers((prev) => [...prev, { ...editing, id: `u${Date.now()}`, createdAt: new Date().toISOString() }]);
      setMessage(`"${editing.fullName}" kullanıcısı oluşturuldu.`);
    } else {
      setUsers((prev) => prev.map((u) => (u.id === editing.id ? editing : u)));
      setMessage(`"${editing.fullName}" güncellendi.`);
    }
    setEditing(null);
    setPassword('');
  };

  const handleSuspend = (id: string) => {
    setUsers((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      return { ...u, status: u.status === 'ACTIVE' ? 'SUSPENDED' as const : 'ACTIVE' as const };
    }));
    setMessage('Kullanıcı durumu güncellendi.');
    setSuspendTarget(null);
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Kullanıcı Yönetimi</p>
            <h3 className={panelTitleClassName}>Kullanıcı Hesapları</h3>
          </div>
          {canManage && <button type="button" onClick={() => { setEditing(emptyUser()); setIsNew(true); setPassword(generatePassword()); }} className={panelPrimaryButtonClassName}>+ Kullanıcı Ekle</button>}
        </div>

        <div className="mt-3">
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ad, e-posta veya rol ara..." className={`w-full max-w-[360px] ${panelCompactInputClassName}`} />
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[780px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Ad Soyad</th>
                <th className="px-3 py-2">E-posta</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">İşe Giriş</th>
                <th className="px-3 py-2">Son Giriş</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><PanelEmptyState /></td></tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{user.fullName}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.roleName}</td>
                    <td className="px-3 py-2">{user.hireDate || '—'}</td>
                    <td className="px-3 py-2">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${user.status === 'ACTIVE' ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]'}`}>
                        {user.status === 'ACTIVE' ? 'Aktif' : 'Askıda'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { setEditing(user); setIsNew(false); setPassword(''); }} className={panelSmallButtonClassName}>Düzenle</button>
                          <button type="button" onClick={() => setSuspendTarget(user.id)} className={user.status === 'ACTIVE' ? panelDangerButtonClassName : panelSecondaryButtonClassName}>
                            {user.status === 'ACTIVE' ? 'Askıya Al' : 'Aktifleştir'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelModal open={editing !== null} onClose={() => { setEditing(null); setPassword(''); }} title={isNew ? 'Yeni Kullanıcı' : 'Kullanıcı Düzenle'} maxWidth="560px">
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ad Soyad</label><input value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">E-posta</label><input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">TCKN</label><input value={editing.tckn} onChange={(e) => setEditing({ ...editing, tckn: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="11 haneli" maxLength={11} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Telefon</label><input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="5XX XXX XX XX" className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Şifre</label>
                <div className="mt-1 flex gap-2">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isNew ? 'Otomatik oluşturuldu' : 'Boş bırak = değiştirme'} className={`flex-1 ${panelInputClassName}`} />
                  <button type="button" onClick={() => setPassword(generatePassword())} className={panelSecondaryButtonClassName}>Oluştur</button>
                </div>
              </div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Rol</label><select value={editing.roleName} onChange={(e) => setEditing({ ...editing, roleName: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`}>{ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">İşe Giriş Tarihi</label><input type="date" value={editing.hireDate || ''} onChange={(e) => setEditing({ ...editing, hireDate: e.target.value || null })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditing(null); setPassword(''); }} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Kullanıcı Oluştur' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={suspendTarget !== null} onCancel={() => setSuspendTarget(null)} onConfirm={() => suspendTarget && handleSuspend(suspendTarget)} title="Kullanıcı Durumu Değiştir" description="Bu kullanıcının durumunu değiştirmek istediğinize emin misiniz?" confirmLabel="Onayla" />
    </div>
  );
}
