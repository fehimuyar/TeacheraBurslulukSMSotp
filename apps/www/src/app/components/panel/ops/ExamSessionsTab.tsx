import { useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
import { formatDateTime, formatNumber } from '../panelTypes';
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
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type ExamSession = {
  id: string;
  examName: string;
  date: string;
  startTime: string;
  endTime: string;
  gradeRange: string;
  capacity: number;
  enrolled: number;
  status: 'OPEN' | 'CLOSED' | 'COMPLETED' | 'SCHEDULED';
  createdAt: string;
};

const MOCK_SESSIONS: ExamSession[] = [
  { id: 'ses1', examName: 'İngilizce A1-A2 (Kids)', date: '2026-03-28', startTime: '10:00', endTime: '10:40', gradeRange: '2-5. Sınıf', capacity: 500, enrolled: 423, status: 'SCHEDULED', createdAt: '2026-03-20T10:00:00Z' },
  { id: 'ses2', examName: 'İngilizce B1-B2 (Teens)', date: '2026-03-28', startTime: '13:00', endTime: '13:40', gradeRange: '6-8. Sınıf', capacity: 500, enrolled: 389, status: 'SCHEDULED', createdAt: '2026-03-20T10:05:00Z' },
  { id: 'ses3', examName: 'İngilizce B1-B2 (Teens)', date: '2026-03-29', startTime: '13:00', endTime: '13:40', gradeRange: '9-11. Sınıf', capacity: 300, enrolled: 245, status: 'SCHEDULED', createdAt: '2026-03-20T10:10:00Z' },
];

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Açık', className: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
  CLOSED: { label: 'Kapalı', className: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]' },
  COMPLETED: { label: 'Tamamlandı', className: 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' },
  SCHEDULED: { label: 'Planlandı', className: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' },
};

const emptySession = (): ExamSession => ({
  id: '', examName: '', date: '', startTime: '10:00', endTime: '10:40', gradeRange: '', capacity: 500, enrolled: 0, status: 'SCHEDULED', createdAt: '',
});

export default function ExamSessionsTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [sessions, setSessions] = useState<ExamSession[]>(MOCK_SESSIONS);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<ExamSession | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [gateTarget, setGateTarget] = useState<{ id: string; action: 'OPEN' | 'CLOSED' } | null>(null);

  const summary = {
    total: sessions.length,
    open: sessions.filter((s) => s.status === 'OPEN').length,
    totalCapacity: sessions.reduce((s, r) => s + r.capacity, 0),
    totalEnrolled: sessions.reduce((s, r) => s + r.enrolled, 0),
  };

  const handleSave = () => {
    if (!editing || !editing.examName.trim() || !editing.date) return;
    if (isNew) {
      setSessions((prev) => [...prev, { ...editing, id: `ses_${Date.now()}`, createdAt: new Date().toISOString() }]);
      setMessage(`Oturum oluşturuldu: ${editing.date} ${editing.startTime}`);
    } else {
      setSessions((prev) => prev.map((s) => (s.id === editing.id ? editing : s)));
      setMessage('Oturum güncellendi.');
    }
    setEditing(null);
  };

  const handleGate = () => {
    if (!gateTarget) return;
    setSessions((prev) => prev.map((s) => (s.id === gateTarget.id ? { ...s, status: gateTarget.action } : s)));
    setMessage(`Oturum ${gateTarget.action === 'OPEN' ? 'açıldı' : 'kapatıldı'}.`);
    setGateTarget(null);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Oturum</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.total)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Açık Oturum</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#2C5447]">{formatNumber(summary.open)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Kapasite</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.totalCapacity)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kayıtlı Aday</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#2C5447]">{formatNumber(summary.totalEnrolled)}</p>
        </div>
      </div>

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Sınav Oturumları</p>
            <h3 className={panelTitleClassName}>Gate Kontrolü</h3>
          </div>
          {canOperate && (
            <button type="button" onClick={() => { setEditing(emptySession()); setIsNew(true); }} className={panelPrimaryButtonClassName}>+ Oturum Ekle</button>
          )}
        </div>

        <div className={panelTableContainerClassName}>
          <table className="min-w-[800px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Sınav</th>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Saat</th>
                <th className="px-3 py-2">Sınıflar</th>
                <th className="px-3 py-2 text-right">Kapasite</th>
                <th className="px-3 py-2 text-right">Kayıtlı</th>
                <th className="px-3 py-2 text-center">Doluluk</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={9}><PanelEmptyState message="Henüz oturum oluşturulmamış." actionLabel="Oturum Ekle" onAction={() => { setEditing(emptySession()); setIsNew(true); }} /></td></tr>
              ) : (
                sessions.map((session) => {
                  const style = STATUS_STYLES[session.status] || STATUS_STYLES.SCHEDULED;
                  const fillRate = session.capacity > 0 ? ((session.enrolled / session.capacity) * 100).toFixed(0) : '0';
                  return (
                    <tr key={session.id} className="border-b border-[#F0E7DA] hover:bg-[#FBF7F0] transition">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{session.examName}</td>
                      <td className="px-3 py-2">{new Date(session.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}</td>
                      <td className="px-3 py-2">{session.startTime} — {session.endTime}</td>
                      <td className="px-3 py-2">{session.gradeRange}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(session.capacity)}</td>
                      <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{formatNumber(session.enrolled)}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="mx-auto h-2 w-[60px] overflow-hidden rounded-full bg-[#ECE2D5]">
                          <div className="h-full rounded-full bg-[#2C5447]" style={{ width: `${Math.min(Number(fillRate), 100)}%` }} />
                        </div>
                        <span className="mt-0.5 block text-[10px] text-[#7A7063]">%{fillRate}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${style.className}`}>{style.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canOperate && (
                          <div className="flex justify-end gap-1">
                            {session.status === 'SCHEDULED' && (
                              <button type="button" onClick={() => setGateTarget({ id: session.id, action: 'OPEN' })} className={panelPrimaryButtonClassName}>Aç</button>
                            )}
                            {session.status === 'OPEN' && (
                              <button type="button" onClick={() => setGateTarget({ id: session.id, action: 'CLOSED' })} className={panelDangerButtonClassName}>Kapat</button>
                            )}
                            <button type="button" onClick={() => { setEditing(session); setIsNew(false); }} className={panelSmallButtonClassName}>Düzenle</button>
                          </div>
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

      {/* Create/Edit Modal */}
      <PanelModal open={editing !== null} onClose={() => setEditing(null)} title={isNew ? 'Yeni Oturum Oluştur' : 'Oturum Düzenle'} maxWidth="520px">
        {editing && (
          <div className="space-y-3">
            <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınav Adı</label><input value={editing.examName} onChange={(e) => setEditing({ ...editing, examName: e.target.value })} placeholder="İngilizce A1-A2..." className={`mt-1 w-full ${panelInputClassName}`} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Tarih</label><input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Başlangıç</label><input type="time" value={editing.startTime} onChange={(e) => setEditing({ ...editing, startTime: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Bitiş</label><input type="time" value={editing.endTime} onChange={(e) => setEditing({ ...editing, endTime: e.target.value })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınıf Aralığı</label><input value={editing.gradeRange} onChange={(e) => setEditing({ ...editing, gradeRange: e.target.value })} placeholder="2-5. Sınıf" className={`mt-1 w-full ${panelInputClassName}`} /></div>
              <div><label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kapasite</label><input type="number" value={editing.capacity} onChange={(e) => setEditing({ ...editing, capacity: Number(e.target.value) || 0 })} className={`mt-1 w-full ${panelInputClassName}`} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={panelSecondaryButtonClassName}>İptal</button>
              <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>{isNew ? 'Oluştur' : 'Kaydet'}</button>
            </div>
          </div>
        )}
      </PanelModal>

      {/* Gate confirm */}
      <PanelConfirmDialog
        open={gateTarget !== null}
        onCancel={() => setGateTarget(null)}
        onConfirm={handleGate}
        title={gateTarget?.action === 'OPEN' ? 'Oturumu Aç' : 'Oturumu Kapat'}
        description={gateTarget?.action === 'OPEN' ? 'Bu oturum açılacak ve adaylar sınava girebilecek. Devam etmek istiyor musunuz?' : 'Bu oturum kapatılacak ve yeni aday girişi engellenecek. Aktif sınavlar etkilenmez.'}
        confirmLabel={gateTarget?.action === 'OPEN' ? 'Oturumu Aç' : 'Oturumu Kapat'}
        danger={gateTarget?.action === 'CLOSED'}
      />
    </div>
  );
}
