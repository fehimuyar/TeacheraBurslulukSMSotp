import { useMemo, useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
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
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type SchoolRow = { id: string; name: string; district: string; type: string; schoolHours: string; population: number; applied: number; examTaken: number; registered: number; followUpNeeded: boolean };

const INITIAL_SCHOOLS: SchoolRow[] = [
  { id: '1', name: 'Meram İlkokulu', district: 'Meram', type: 'İLKOKUL', schoolHours: '08:30-15:00', population: 450, applied: 145, examTaken: 112, registered: 28, followUpNeeded: false },
  { id: '2', name: 'Selçuklu Ortaokulu', district: 'Selçuklu', type: 'ORTAOKUL', schoolHours: '08:00-15:30', population: 620, applied: 198, examTaken: 156, registered: 45, followUpNeeded: false },
  { id: '3', name: 'Karatay Anadolu Lisesi', district: 'Karatay', type: 'LİSE', schoolHours: '08:30-16:00', population: 780, applied: 87, examTaken: 72, registered: 22, followUpNeeded: false },
  { id: '4', name: 'Meram Ortaokulu', district: 'Meram', type: 'ORTAOKUL', schoolHours: '08:30-15:00', population: 520, applied: 12, examTaken: 8, registered: 2, followUpNeeded: true },
  { id: '5', name: 'Selçuklu İlkokulu', district: 'Selçuklu', type: 'İLKOKUL', schoolHours: '09:00-15:00', population: 380, applied: 5, examTaken: 3, registered: 0, followUpNeeded: true },
  { id: '6', name: 'Karatay Ortaokulu', district: 'Karatay', type: 'ORTAOKUL', schoolHours: '08:00-14:30', population: 410, applied: 92, examTaken: 70, registered: 18, followUpNeeded: false },
];

const DISTRICTS = ['Meram', 'Selçuklu', 'Karatay'];
const SCHOOL_TYPES = ['İLKOKUL', 'ORTAOKUL', 'LİSE'];

const emptySchool = (): SchoolRow => ({ id: '', name: '', district: '', type: 'ORTAOKUL', schoolHours: '08:30-15:00', population: 0, applied: 0, examTaken: 0, registered: 0, followUpNeeded: false });

export default function SchoolListTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [schools, setSchools] = useState<SchoolRow[]>(INITIAL_SCHOOLS);
  const [searchQuery, setSearchQuery] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [message, setMessage] = useState('');
  const [editingSchool, setEditingSchool] = useState<SchoolRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return schools.filter((s) => {
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (districtFilter && s.district !== districtFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      return true;
    });
  }, [schools, searchQuery, districtFilter, typeFilter]);

  const handleSave = () => {
    if (!editingSchool || !editingSchool.name.trim()) return;
    if (isNew) {
      setSchools((prev) => [...prev, { ...editingSchool, id: `s${Date.now()}` }]);
      setMessage(`"${editingSchool.name}" eklendi.`);
    } else {
      setSchools((prev) => prev.map((s) => (s.id === editingSchool.id ? editingSchool : s)));
      setMessage(`"${editingSchool.name}" güncellendi.`);
    }
    setEditingSchool(null);
  };

  const handleDelete = (id: string) => {
    setSchools((prev) => prev.filter((s) => s.id !== id));
    setMessage('Okul silindi.');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Okul Yönetimi</p>
            <h3 className={panelTitleClassName}>Okul Listesi</h3>
          </div>
          {canOperate && (
            <button type="button" onClick={() => { setEditingSchool(emptySchool()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Okul Ekle</button>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Okul adı ara..." className={panelCompactInputClassName} />
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm İlçeler</option>
            {DISTRICTS.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm Türler</option>
            {SCHOOL_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[950px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Okul Adı</th>
                <th className="px-3 py-2">İlçe</th>
                <th className="px-3 py-2">Tür</th>
                <th className="px-3 py-2">Giriş-Çıkış</th>
                <th className="px-3 py-2 text-right">Nüfus</th>
                <th className="px-3 py-2 text-right">Başvuru</th>
                <th className="px-3 py-2 text-right">Sınav</th>
                <th className="px-3 py-2 text-right">Kayıt</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10}><PanelEmptyState /></td></tr>
              ) : (
                filtered.map((school) => (
                  <tr key={school.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{school.name}</td>
                    <td className="px-3 py-2">{school.district}</td>
                    <td className="px-3 py-2">{school.type}</td>
                    <td className="px-3 py-2">{school.schoolHours}</td>
                    <td className="px-3 py-2 text-right">{school.population}</td>
                    <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{school.applied}</td>
                    <td className="px-3 py-2 text-right">{school.examTaken}</td>
                    <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{school.registered}</td>
                    <td className="px-3 py-2">
                      {school.followUpNeeded ? (
                        <span className="rounded-full border border-[#D9C59C] bg-[#FBF1D9] px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase text-[#795A26]">Takip</span>
                      ) : (
                        <span className="rounded-full border border-[#BFD2C8] bg-[#EEF6F0] px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase text-[#2C5447]">İyi</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canOperate && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { setEditingSchool(school); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                          <button type="button" onClick={() => setDeleteTarget(school.id)} className={panelDangerButtonClassName}>Sil</button>
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

      <PanelModal open={editingSchool !== null} onClose={() => setEditingSchool(null)} title={isNew ? 'Yeni Okul Ekle' : 'Okul Düzenle'} maxWidth="520px">
        {editingSchool && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Okul Adı</label><input value={editingSchool.name} onChange={(e) => setEditingSchool({ ...editingSchool, name: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">İlçe</label><select value={editingSchool.district} onChange={(e) => setEditingSchool({ ...editingSchool, district: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`}><option value="">Seçin</option>{DISTRICTS.map((d) => (<option key={d} value={d}>{d}</option>))}</select></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Tür</label><select value={editingSchool.type} onChange={(e) => setEditingSchool({ ...editingSchool, type: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`}>{SCHOOL_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Giriş-Çıkış</label><input value={editingSchool.schoolHours} onChange={(e) => setEditingSchool({ ...editingSchool, schoolHours: e.target.value })} placeholder="08:30-15:00" className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Öğrenci Nüfusu</label><input type="number" value={editingSchool.population || ''} onChange={(e) => setEditingSchool({ ...editingSchool, population: Number(e.target.value) || 0 })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingSchool(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Ekle' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Okul Sil" description="Bu okulu silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
