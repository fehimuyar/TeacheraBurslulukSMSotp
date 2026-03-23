import { useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
import { formatDateTime, formatNumber } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelFeedbackMessage,
  PanelModal,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type WaScenario = { id: string; title: string; description: string; filterHint: string; mockCount: number };
type TriggerLogItem = { id: string; scenarioId: string; scenarioTitle: string; candidateCount: number; triggeredAt: string; status: 'SENT' | 'PENDING' | 'FAILED' };

const WA_SCENARIOS: WaScenario[] = [
  { id: 'no-exam', title: 'Sınava Girmeyenler', description: 'Sınav tarihi geçmiş ama sınava girmemiş adaylar', filterHint: 'exam_status \u2260 SUBMITTED', mockCount: 234 },
  { id: 'no-result-view', title: 'Sonuç Görüntülemeyenler', description: 'Sonuç yayınlanmış ama görüntülememiş', filterHint: 'result_viewed = false', mockCount: 567 },
  { id: 'no-appointment', title: 'Randevu Almayanlar', description: 'Sonucu görmüş ama randevu almamış', filterHint: 'appointment_status = NOT_BOOKED', mockCount: 345 },
  { id: 'no-show', title: 'Görüşmeye Gelmeyenler', description: 'Randevu almış ama gelmemiş', filterHint: 'appointment_status = BOOKED & tarih geçmiş', mockCount: 89 },
  { id: 'no-register', title: 'Kayıt Olmayanlar', description: 'Görüşmeye gelmiş ama kayıt olmamış', filterHint: 'registration_status = NOT_REGISTERED', mockCount: 156 },
];

const INITIAL_LOG: TriggerLogItem[] = [
  { id: 't1', scenarioId: 'no-exam', scenarioTitle: 'Sınava Girmeyenler', candidateCount: 210, triggeredAt: '2026-03-22T14:30:00Z', status: 'SENT' },
  { id: 't2', scenarioId: 'no-result-view', scenarioTitle: 'Sonuç Görüntülemeyenler', candidateCount: 540, triggeredAt: '2026-03-22T11:00:00Z', status: 'SENT' },
];

export default function WhatsAppTriggersTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [triggerLog, setTriggerLog] = useState<TriggerLogItem[]>(INITIAL_LOG);
  const [message, setMessage] = useState('');
  const [confirmScenario, setConfirmScenario] = useState<WaScenario | null>(null);
  const [listViewScenario, setListViewScenario] = useState<WaScenario | null>(null);

  const handleTrigger = (scenario: WaScenario) => {
    const newLog: TriggerLogItem = {
      id: `t${Date.now()}`,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      candidateCount: scenario.mockCount,
      triggeredAt: new Date().toISOString(),
      status: 'PENDING',
    };
    setTriggerLog((prev) => [newLog, ...prev]);
    setMessage(`"${scenario.title}" senaryosu ${formatNumber(scenario.mockCount)} kişiye tetiklendi.`);
    setConfirmScenario(null);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod. Tetikleme yapılamaz.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>WhatsApp Tetikleme</p>
        <h3 className={panelTitleClassName}>Tetikleme Senaryoları</h3>
        <p className={panelDescriptionClassName}>Belirli kriterlere uyan adaylara toplu WhatsApp mesajı gönderin.</p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {WA_SCENARIOS.map((scenario, index) => (
            <div key={scenario.id} className={panelSoftCardClassName}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">
                    {index + 1}. {scenario.title}
                  </p>
                  <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] leading-[1.6] text-[#5E665E]">
                    {scenario.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-[14px] border border-[#E4DBCF] bg-[#FBF7F0] px-3 py-2">
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Filtre: {scenario.filterHint}</p>
                <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(scenario.mockCount)} kişi</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setListViewScenario(scenario)} className={panelSecondaryButtonClassName}>Listeyi Gör</button>
                {canOperate && (
                  <button type="button" onClick={() => setConfirmScenario(scenario)} className={panelPrimaryButtonClassName}>
                    Tetikle
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Tetikleme Geçmişi</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[580px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Senaryo</th>
                <th className="px-3 py-2 text-right">Kişi Sayısı</th>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {triggerLog.map((item) => (
                <tr key={item.id} className="border-b border-[#F0E7DA]">
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.scenarioTitle}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(item.candidateCount)}</td>
                  <td className="px-3 py-2">{formatDateTime(item.triggeredAt)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
                      item.status === 'SENT' ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' :
                      item.status === 'FAILED' ? 'border-[#C59292] bg-[#6B333A] text-white' :
                      'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]'
                    }`}>
                      {item.status === 'SENT' ? 'Gönderildi' : item.status === 'FAILED' ? 'Başarısız' : 'Bekliyor'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PanelConfirmDialog
        open={confirmScenario !== null}
        onCancel={() => setConfirmScenario(null)}
        onConfirm={() => confirmScenario && handleTrigger(confirmScenario)}
        title={`${confirmScenario?.title || ''} Tetikle`}
        description={`${formatNumber(confirmScenario?.mockCount)} kişiye WhatsApp mesajı gönderilecek. Devam etmek istiyor musunuz?`}
        confirmLabel="Tetikle"
      />

      <PanelModal open={listViewScenario !== null} onClose={() => setListViewScenario(null)} title={listViewScenario ? `${listViewScenario.title} — Aday Listesi` : ''} maxWidth="640px">
        {listViewScenario && (
          <div>
            <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
              Filtre: {listViewScenario.filterHint}
            </p>
            <p className="mt-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">
              {formatNumber(listViewScenario.mockCount)} aday bu filtreye uyuyor.
            </p>
            <div className="mt-4 rounded-[18px] border border-[#E4DBCE] bg-[#FFFDF9] p-4">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">
                Aday listesi backend bağlantısı sonrasında burada gösterilecek. Şu an mock veri ile çalışılıyor.
              </p>
            </div>
          </div>
        )}
      </PanelModal>
    </div>
  );
}
