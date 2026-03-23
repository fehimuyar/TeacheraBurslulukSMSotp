import { useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelModal,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type ProgramRow = { id: string; name: string; description: string; listPrice: number; currency: string; isActive: boolean };

const INITIAL_PROGRAMS: ProgramRow[] = [
  { id: '1', name: 'İngilizce A1-A2', description: 'Başlangıç seviye İngilizce programı', listPrice: 12500, currency: 'TRY', isActive: true },
  { id: '2', name: 'İngilizce B1-B2', description: 'Orta seviye İngilizce programı', listPrice: 14500, currency: 'TRY', isActive: true },
  { id: '3', name: 'Almanca Genel', description: 'Genel Almanca dil programı', listPrice: 13000, currency: 'TRY', isActive: true },
  { id: '4', name: 'Fransızca Başlangıç', description: 'Başlangıç seviye Fransızca', listPrice: 11000, currency: 'TRY', isActive: true },
  { id: '5', name: 'İspanyolca Genel', description: 'Genel İspanyolca dil programı', listPrice: 12000, currency: 'TRY', isActive: false },
];

const formatPrice = (value: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const emptyProgram = (): ProgramRow => ({ id: '', name: '', description: '', listPrice: 0, currency: 'TRY', isActive: true });

export default function ProgramsPricingTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [programs, setPrograms] = useState<ProgramRow[]>(INITIAL_PROGRAMS);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<ProgramRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleSave = () => {
    if (!editing || !editing.name.trim()) return;
    if (isNew) {
      setPrograms((prev) => [...prev, { ...editing, id: `p${Date.now()}` }]);
      setMessage(`"${editing.name}" eklendi.`);
    } else {
      setPrograms((prev) => prev.map((p) => (p.id === editing.id ? editing : p)));
      setMessage(`"${editing.name}" güncellendi.`);
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    setPrograms((prev) => prev.filter((p) => p.id !== id));
    setMessage('Program silindi.');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Eğitim Programları</p>
            <h3 className={panelTitleClassName}>Program & Fiyat Yönetimi</h3>
          </div>
          {canOperate && (
            <button type="button" onClick={() => { setEditing(emptyProgram()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Program Ekle</button>
          )}
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[640px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Program Adı</th>
                <th className="px-3 py-2">Açıklama</th>
                <th className="px-3 py-2 text-right">Liste Fiyatı</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {programs.length === 0 ? (
                <tr><td colSpan={5}><PanelEmptyState message="Henüz program eklenmemiş." /></td></tr>
              ) : (
                programs.map((program) => (
                  <tr key={program.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{program.name}</td>
                    <td className="px-3 py-2 text-[#5E665E]">{program.description}</td>
                    <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{formatPrice(program.listPrice)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${program.isActive ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'}`}>
                        {program.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canOperate && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { setEditing(program); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                          <button type="button" onClick={() => setDeleteTarget(program.id)} className={panelDangerButtonClassName}>Sil</button>
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

      <PanelModal open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Yeni Program Ekle' : 'Program Düzenle'} maxWidth="520px">
        {editing && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Program Adı</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Açıklama</label><textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={2} className={`mt-1 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Liste Fiyatı (TL)</label><input type="number" value={editing.listPrice || ''} onChange={(e) => setEditing({ ...editing, listPrice: Number(e.target.value) || 0 })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div className="flex items-end"><label className="flex cursor-pointer items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="h-4 w-4 rounded border-[#DDD4C6]" />Aktif</label></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Ekle' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Program Sil" description="Bu programı silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
