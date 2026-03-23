import { useState } from 'react';
import { canOperatePanelActions } from '../panelPermissions';
import { formatDateTime, formatNumber } from '../panelTypes';
import {
  PanelConfirmDialog,
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
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from '../panelUi';

type TriggerType = 'BEFORE_EXAM' | 'AFTER_PUBLISH' | 'AFTER_APPOINTMENT' | 'NO_ACTION';
type ActionType = 'SMS_SEND' | 'WA_BOT' | 'CRM_PUSH';

type AutomationRule = {
  id: string;
  name: string;
  triggerType: TriggerType;
  triggerValue: number;
  triggerUnit: string;
  actionType: ActionType;
  actionTemplate: string;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunCount: number;
};

const TRIGGER_LABELS: Record<TriggerType, string> = {
  BEFORE_EXAM: 'Sınav başlangıcından önce',
  AFTER_PUBLISH: 'Sonuç yayınından sonra',
  AFTER_APPOINTMENT: 'Randevudan sonra',
  NO_ACTION: 'Aksiyon alınmadıysa',
};

const ACTION_LABELS: Record<ActionType, string> = {
  SMS_SEND: 'SMS Gönder',
  WA_BOT: 'WhatsApp Bot',
  CRM_PUSH: 'CRM Aktarım',
};

const MOCK_RULES: AutomationRule[] = [
  { id: 'r1', name: 'Sınav Hatırlatma SMS', triggerType: 'BEFORE_EXAM', triggerValue: 30, triggerUnit: 'dakika', actionType: 'SMS_SEND', actionTemplate: 'HATIRLATMA_SMS', isActive: true, lastRunAt: '2026-03-28T09:30:00Z', lastRunCount: 423 },
  { id: 'r2', name: 'Sonuç Görüntülemeyenlere WA', triggerType: 'AFTER_PUBLISH', triggerValue: 2, triggerUnit: 'saat', actionType: 'WA_BOT', actionTemplate: 'no-result-view', isActive: true, lastRunAt: null, lastRunCount: 0 },
  { id: 'r3', name: 'Randevu Hatırlatma SMS', triggerType: 'BEFORE_EXAM', triggerValue: 60, triggerUnit: 'dakika', actionType: 'SMS_SEND', actionTemplate: 'RANDEVU_HATIRLATMA', isActive: true, lastRunAt: '2026-03-27T09:00:00Z', lastRunCount: 45 },
  { id: 'r4', name: 'Gelmeyenlere WA Takip', triggerType: 'AFTER_APPOINTMENT', triggerValue: 2, triggerUnit: 'saat', actionType: 'WA_BOT', actionTemplate: 'no-show', isActive: false, lastRunAt: '2026-03-27T16:00:00Z', lastRunCount: 12 },
  { id: 'r5', name: 'Kayıt Olmayanlara WA', triggerType: 'NO_ACTION', triggerValue: 3, triggerUnit: 'gün', actionType: 'WA_BOT', actionTemplate: 'no-register', isActive: true, lastRunAt: null, lastRunCount: 0 },
];

const emptyRule = (): AutomationRule => ({ id: '', name: '', triggerType: 'BEFORE_EXAM', triggerValue: 30, triggerUnit: 'dakika', actionType: 'SMS_SEND', actionTemplate: '', isActive: true, lastRunAt: null, lastRunCount: 0 });

export default function AutomationRulesTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const [rules, setRules] = useState<AutomationRule[]>(MOCK_RULES);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleSave = () => {
    if (!editing || !editing.name.trim()) return;
    if (isNew) {
      setRules((prev) => [...prev, { ...editing, id: `r_${Date.now()}` }]);
      setMessage(`"${editing.name}" kuralı oluşturuldu.`);
    } else {
      setRules((prev) => prev.map((r) => (r.id === editing.id ? editing : r)));
      setMessage(`"${editing.name}" güncellendi.`);
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setMessage('Kural silindi.');
    setDeleteTarget(null);
  };

  const toggleActive = (id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <div className="space-y-5">
      {!canOperate && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Otomasyon</p>
            <h3 className={panelTitleClassName}>Otomasyon Kuralları</h3>
            <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{activeCount} aktif kural</p>
          </div>
          {canOperate && (
            <button type="button" onClick={() => { setEditing(emptyRule()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Kural Ekle</button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className={`${panelSoftCardClassName} ${!rule.isActive ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  {canOperate && (
                    <button
                      type="button"
                      onClick={() => toggleActive(rule.id)}
                      className={`relative h-6 w-11 rounded-full transition ${rule.isActive ? 'bg-[#2C5447]' : 'bg-[#DDD3C5]'}`}
                      aria-label={rule.isActive ? 'Pasif yap' : 'Aktif yap'}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${rule.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  )}
                  <div>
                    <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">{rule.name}</p>
                    <p className="mt-0.5 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">
                      Tetikleyici: {TRIGGER_LABELS[rule.triggerType]} ({rule.triggerValue} {rule.triggerUnit})
                    </p>
                    <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">
                      Aksiyon: {ACTION_LABELS[rule.actionType]} — {rule.actionTemplate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rule.lastRunAt && (
                    <div className="text-right">
                      <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#8A7F71]">Son çalışma</p>
                      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] text-[#1B2B24]">{formatDateTime(rule.lastRunAt)}</p>
                      <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#2C5447]">{formatNumber(rule.lastRunCount)} kişi</p>
                    </div>
                  )}
                  {canOperate && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { setEditing(rule); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                      <button type="button" onClick={() => setDeleteTarget(rule.id)} className={panelDangerButtonClassName}>Sil</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PanelModal open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Yeni Kural Oluştur' : 'Kural Düzenle'} maxWidth="520px">
        {editing && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kural Adı</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Tetikleyici</label>
                <select value={editing.triggerType} onChange={(e) => setEditing({ ...editing, triggerType: e.target.value as TriggerType })} className={`mt-1 w-full ${panelInputClassName}`}>
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Değer</label><input type="number" value={editing.triggerValue} onChange={(e) => setEditing({ ...editing, triggerValue: Number(e.target.value) || 0 })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Birim</label>
                <select value={editing.triggerUnit} onChange={(e) => setEditing({ ...editing, triggerUnit: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`}>
                  <option value="dakika">Dakika</option><option value="saat">Saat</option><option value="gün">Gün</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Aksiyon</label>
                <select value={editing.actionType} onChange={(e) => setEditing({ ...editing, actionType: e.target.value as ActionType })} className={`mt-1 w-full ${panelInputClassName}`}>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Şablon/Senaryo</label><input value={editing.actionTemplate} onChange={(e) => setEditing({ ...editing, actionTemplate: e.target.value })} placeholder="HATIRLATMA_SMS, no-show..." className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Oluştur' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Kural Sil" description="Bu otomasyon kuralını silmek istediğinize emin misiniz? Kuralın gelecek çalışmaları iptal edilir." confirmLabel="Sil" danger />
    </div>
  );
}
