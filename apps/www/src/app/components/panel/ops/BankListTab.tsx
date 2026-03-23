import { useState } from 'react';
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

type BankRow = { id: string; bankName: string; months1: number; months3: number; months6: number; months9: number; months12: number; isActive: boolean };

const INITIAL_BANKS: BankRow[] = [
  { id: '1', bankName: 'Garanti BBVA', months1: 0, months3: 3.5, months6: 7.2, months9: 11.0, months12: 15.5, isActive: true },
  { id: '2', bankName: 'İş Bankası', months1: 0, months3: 3.2, months6: 6.8, months9: 10.5, months12: 14.8, isActive: true },
  { id: '3', bankName: 'Yapı Kredi', months1: 0, months3: 3.8, months6: 7.5, months9: 11.5, months12: 16.2, isActive: true },
  { id: '4', bankName: 'Akbank', months1: 0, months3: 3.0, months6: 6.5, months9: 10.0, months12: 14.0, isActive: true },
  { id: '5', bankName: 'Halkbank', months1: 0, months3: 2.8, months6: 6.0, months9: 9.5, months12: 13.5, isActive: true },
  { id: '6', bankName: 'Ziraat Bankası', months1: 0, months3: 2.5, months6: 5.5, months9: 8.8, months12: 12.5, isActive: true },
  { id: '7', bankName: 'QNB Finansbank', months1: 0, months3: 4.0, months6: 8.0, months9: 12.0, months12: 17.0, isActive: false },
];

const formatRate = (v: number) => `%${v.toFixed(1)}`;

const emptyBank = (): BankRow => ({ id: '', bankName: '', months1: 0, months3: 0, months6: 0, months9: 0, months12: 0, isActive: true });

export default function BankListTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [banks, setBanks] = useState<BankRow[]>(INITIAL_BANKS);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditField, setInlineEditField] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');

  const handleSave = () => {
    if (!editing || !editing.bankName.trim()) return;
    if (isNew) {
      setBanks((prev) => [...prev, { ...editing, id: `b${Date.now()}` }]);
      setMessage(`"${editing.bankName}" eklendi.`);
    } else {
      setBanks((prev) => prev.map((b) => (b.id === editing.id ? editing : b)));
      setMessage(`"${editing.bankName}" güncellendi.`);
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    setBanks((prev) => prev.filter((b) => b.id !== id));
    setMessage('Banka silindi.');
    setDeleteTarget(null);
  };

  const startInlineEdit = (bankId: string, field: string, currentValue: number) => {
    if (!canOperate) return;
    setInlineEditId(bankId);
    setInlineEditField(field);
    setInlineEditValue(String(currentValue));
  };

  const commitInlineEdit = () => {
    if (!inlineEditId || !inlineEditField) return;
    const numValue = Number(inlineEditValue) || 0;
    setBanks((prev) => prev.map((b) => {
      if (b.id !== inlineEditId) return b;
      return { ...b, [inlineEditField]: numValue };
    }));
    setInlineEditId(null);
    setInlineEditField(null);
    setInlineEditValue('');
  };

  const rateFields = [
    { key: 'months1', label: 'Tek Çekim' },
    { key: 'months3', label: '3 Taksit' },
    { key: 'months6', label: '6 Taksit' },
    { key: 'months9', label: '9 Taksit' },
    { key: 'months12', label: '12 Taksit' },
  ] as const;

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Banka Yönetimi</p>
            <h3 className={panelTitleClassName}>Banka & Taksit Oranları</h3>
          </div>
          {canOperate && (
            <button type="button" onClick={() => { setEditing(emptyBank()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Banka Ekle</button>
          )}
        </div>

        <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">
          {canOperate ? 'Oranları değiştirmek için hücreye çift tıklayın.' : ''}
        </p>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[780px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Banka</th>
                {rateFields.map((rf) => (<th key={rf.key} className="px-3 py-2 text-center">{rf.label}</th>))}
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {banks.length === 0 ? (
                <tr><td colSpan={8}><PanelEmptyState message="Henüz banka eklenmemiş." /></td></tr>
              ) : (
                banks.map((bank) => (
                  <tr key={bank.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{bank.bankName}</td>
                    {rateFields.map((rf) => {
                      const isEditing = inlineEditId === bank.id && inlineEditField === rf.key;
                      const value = bank[rf.key];
                      return (
                        <td key={rf.key} className="px-3 py-2 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.1"
                              value={inlineEditValue}
                              onChange={(e) => setInlineEditValue(e.target.value)}
                              onBlur={commitInlineEdit}
                              onKeyDown={(e) => { if (e.key === 'Enter') commitInlineEdit(); if (e.key === 'Escape') { setInlineEditId(null); } }}
                              autoFocus
                              className={`w-[70px] text-center ${panelCompactInputClassName}`}
                            />
                          ) : (
                            <span
                              onDoubleClick={() => startInlineEdit(bank.id, rf.key, value)}
                              className={`inline-block rounded px-2 py-0.5 ${canOperate ? 'cursor-pointer transition hover:bg-[#EEF6F0]' : ''}`}
                              title={canOperate ? 'Çift tıkla düzenle' : ''}
                            >
                              {formatRate(value)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${bank.isActive ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'}`}>
                        {bank.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canOperate && (
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => { setEditing(bank); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                          <button type="button" onClick={() => setDeleteTarget(bank.id)} className={panelDangerButtonClassName}>Sil</button>
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

      <PanelModal open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Yeni Banka Ekle' : 'Banka Düzenle'} maxWidth="520px">
        {editing && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Banka Adı</label><input value={editing.bankName} onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            <div className="grid grid-cols-3 gap-3">
              {rateFields.map((rf) => (
                <div key={rf.key}><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{rf.label} (%)</label><input type="number" step="0.1" value={editing[rf.key] || ''} onChange={(e) => setEditing({ ...editing, [rf.key]: Number(e.target.value) || 0 })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              ))}
            </div>
            <div className="flex items-center gap-2"><label className="flex cursor-pointer items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="h-4 w-4 rounded border-[#DDD4C6]" />Aktif</label></div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Ekle' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Banka Sil" description="Bu bankayı silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
