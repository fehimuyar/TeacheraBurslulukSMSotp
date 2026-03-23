import { useState } from 'react';
import { MOCK_ADVISORS, MOCK_AVAILABILITY, type Advisor, type AdvisorAvailability } from './appointmentsMockData';
import { canManageAppointments } from '../panelPermissions';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelModal,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const SPECIALIZATION_OPTIONS = ['İngilizce A1-A2', 'İngilizce B1-B2', 'İngilizce C1', 'Almanca', 'Fransızca', 'İspanyolca', 'Yüz Yüze', 'Online'];

const emptyAdvisor = (): Advisor => ({ id: '', fullName: '', email: '', phone: '', specializations: [], isActive: true });

export default function AdvisorListTab({ role }: { role?: string }) {
  const canOperate = canManageAppointments(role);
  const [advisors, setAdvisors] = useState<Advisor[]>(MOCK_ADVISORS);
  const [availability, setAvailability] = useState<AdvisorAvailability[]>(MOCK_AVAILABILITY);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Advisor | null>(null);
  const [editAvail, setEditAvail] = useState<Set<string>>(new Set());
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const getAdvisorAvail = (advisorId: string) => availability.filter((a) => a.advisorId === advisorId);

  const startEdit = (advisor: Advisor, isNewAdvisor: boolean) => {
    setEditing(advisor);
    setIsNew(isNewAdvisor);
    const avail = getAdvisorAvail(advisor.id);
    const keys = new Set(avail.map((a) => `${a.dayOfWeek}`));
    setEditAvail(keys);
  };

  const handleSave = () => {
    if (!editing || !editing.fullName.trim() || !editing.email.trim()) return;
    const advisorId = isNew ? `adv_${Date.now()}` : editing.id;
    const saved = { ...editing, id: advisorId };

    if (isNew) {
      setAdvisors((prev) => [...prev, saved]);
    } else {
      setAdvisors((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
    }

    const newAvail: AdvisorAvailability[] = Array.from(editAvail).map((day) => ({
      advisorId,
      dayOfWeek: Number(day),
      startTime: '09:00',
      endTime: '17:00',
      slotDurationMinutes: 30,
    }));
    setAvailability((prev) => [...prev.filter((a) => a.advisorId !== advisorId), ...newAvail]);
    setMessage(`"${saved.fullName}" ${isNew ? 'eklendi' : 'güncellendi'}.`);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    setAdvisors((prev) => prev.filter((a) => a.id !== id));
    setAvailability((prev) => prev.filter((a) => a.advisorId !== id));
    setMessage('Danışman silindi.');
    setDeleteTarget(null);
  };

  const toggleSpec = (spec: string) => {
    if (!editing) return;
    const specs = editing.specializations.includes(spec)
      ? editing.specializations.filter((s) => s !== spec)
      : [...editing.specializations, spec];
    setEditing({ ...editing, specializations: specs });
  };

  const toggleDay = (day: string) => {
    setEditAvail((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Danışman Yönetimi</p>
            <h3 className={panelTitleClassName}>Eğitim Danışmanları</h3>
          </div>
          {canOperate && (
            <button type="button" onClick={() => startEdit(emptyAdvisor(), true)} className={panelPrimaryButtonClassName}>+ Danışman Ekle</button>
          )}
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[640px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Ad Soyad</th>
                <th className="px-3 py-2">E-posta</th>
                <th className="px-3 py-2">Uzmanlık</th>
                <th className="px-3 py-2">Çalışma Günleri</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {advisors.length === 0 ? (
                <tr><td colSpan={6}><PanelEmptyState message="Henüz danışman eklenmemiş." actionLabel="Danışman Ekle" onAction={() => startEdit(emptyAdvisor(), true)} /></td></tr>
              ) : (
                advisors.map((advisor) => {
                  const avail = getAdvisorAvail(advisor.id);
                  const days = avail.map((a) => DAY_LABELS[a.dayOfWeek - 1] || '').filter(Boolean).join(', ');
                  return (
                    <tr key={advisor.id} className="border-b border-[#F0E7DA] cursor-pointer hover:bg-[#FBF7F0] transition">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{advisor.fullName}</td>
                      <td className="px-3 py-2">{advisor.email}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {advisor.specializations.map((s) => (
                            <span key={s} className="rounded-full border border-[#DDD3C5] bg-[#FBF7F0] px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] text-[#6F675D]">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">{days || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${advisor.isActive ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'}`}>
                          {advisor.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canOperate && (
                          <button type="button" onClick={() => startEdit(advisor, false)} className={panelSmallButtonClassName}>Düzenle</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Edit Modal */}
      <PanelModal open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Yeni Danışman Ekle' : 'Danışman Düzenle'} maxWidth="560px">
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ad Soyad</label><input value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">E-posta</label><input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Telefon</label><input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>

            {/* Specializations */}
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>Uzmanlık Alanları</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SPECIALIZATION_OPTIONS.map((spec) => {
                  const selected = editing.specializations.includes(spec);
                  return (
                    <button key={spec} type="button" onClick={() => toggleSpec(spec)} className={`rounded-full border px-3 py-1.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] transition ${selected ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53] hover:border-[#BFAE95]'}`}>
                      {spec}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Availability */}
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>Çalışma Günleri</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => {
                  const day = String(i + 1);
                  const selected = editAvail.has(day);
                  return (
                    <button key={day} type="button" onClick={() => toggleDay(day)} className={`flex h-[40px] w-[50px] items-center justify-center rounded-[12px] border font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] transition ${selected ? 'border-[#2C5447] bg-[#2C5447] text-white' : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53] hover:border-[#BFAE95]'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Seçili günlerde 09:00-17:00, 30 dakikalık slotlar oluşturulur.</p>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
                Aktif
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Ekle' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Danışman Sil" description="Bu danışmanı silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
