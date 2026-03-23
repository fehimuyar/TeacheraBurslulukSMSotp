import { useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
import { formatDateTime, formatNumber } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  PanelModal,
  panelChipClassName,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type SmsType = 'credentials' | 'reminder' | 'result' | 'appointment';
type SmsLogItem = { id: string; type: SmsType; typeLabel: string; recipientCount: number; sentAt: string; status: 'SENT' | 'PENDING' | 'FAILED' };

const SMS_TYPES: Array<{ id: SmsType; label: string; description: string }> = [
  { id: 'credentials', label: 'Kullanıcı Adı/Şifre', description: 'Adaylara giriş bilgilerini SMS ile gönderin.' },
  { id: 'reminder', label: 'Sınav Hatırlatma', description: 'Sınava girmemiş adaylara hatırlatma mesajı gönderin.' },
  { id: 'result', label: 'Sonuç Duyuru', description: 'Sınav sonuçlarını adaylara SMS ile duyurun.' },
  { id: 'appointment', label: 'Randevu Hatırlatma', description: 'Randevusu olan adaylara hatırlatma SMS gönderin.' },
];

const INITIAL_LOG: SmsLogItem[] = [
  { id: 's1', type: 'credentials', typeLabel: 'Kullanıcı Adı/Şifre', recipientCount: 1200, sentAt: '2026-03-21T09:00:00Z', status: 'SENT' },
  { id: 's2', type: 'reminder', typeLabel: 'Sınav Hatırlatma', recipientCount: 850, sentAt: '2026-03-22T08:00:00Z', status: 'SENT' },
];

export default function SmsOperationsTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [activeSmsType, setActiveSmsType] = useState<SmsType>('credentials');
  const [gradeFilter, setGradeFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [smsLog, setSmsLog] = useState<SmsLogItem[]>(INITIAL_LOG);
  const [message, setMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const activeSmsConfig = SMS_TYPES.find((t) => t.id === activeSmsType) || SMS_TYPES[0];
  const mockRecipientCount = activeSmsType === 'credentials' ? 156 : activeSmsType === 'reminder' ? 234 : activeSmsType === 'appointment' ? 42 : 890;

  const handleSend = () => {
    const newLog: SmsLogItem = {
      id: `s${Date.now()}`,
      type: activeSmsType,
      typeLabel: activeSmsConfig.label,
      recipientCount: mockRecipientCount,
      sentAt: new Date().toISOString(),
      status: 'PENDING',
    };
    setSmsLog((prev) => [newLog, ...prev]);
    setMessage(`${activeSmsConfig.label} — ${formatNumber(mockRecipientCount)} kişiye SMS gönderim başlatıldı.`);
    setShowConfirm(false);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod. SMS gönderimi yapılamaz.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>SMS İşlemleri</p>
        <h3 className={panelTitleClassName}>Mesaj Gönderimi</h3>
        <p className={panelDescriptionClassName}>{activeSmsConfig.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {SMS_TYPES.map((smsType) => (
            <button
              key={smsType.id}
              type="button"
              onClick={() => { setActiveSmsType(smsType.id); setMessage(''); }}
              className={`${panelChipClassName} ${activeSmsType === smsType.id ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]' : ''}`}
            >
              {smsType.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınıf</label>
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className={`mt-1 w-full ${panelCompactInputClassName}`}>
              <option value="">Tümü</option>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (<option key={g} value={String(g)}>{g}. Sınıf</option>))}
            </select>
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Okul</label>
            <input value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} placeholder="Okul adı ara..." className={`mt-1 w-full ${panelCompactInputClassName}`} />
          </div>
          <div className="flex items-end">
            <div className="rounded-[16px] border border-[#E4DBCF] bg-[#FBF7F0] px-4 py-2">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Bulunan</p>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(mockRecipientCount)} kişi</p>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setShowPreview(true)} className={panelSecondaryButtonClassName}>Önizle</button>
            {canOperate && (
              <button type="button" onClick={() => setShowConfirm(true)} className={panelPrimaryButtonClassName}>Gönder</button>
            )}
          </div>
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Gönderim Geçmişi</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[560px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Tür</th>
                <th className="px-3 py-2 text-right">Alıcı Sayısı</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {smsLog.length === 0 ? (
                <tr><td colSpan={4}><PanelEmptyState message="Henüz gönderim yapılmamış." /></td></tr>
              ) : (
                smsLog.map((item) => (
                  <tr key={item.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2">{formatDateTime(item.sentAt)}</td>
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{item.typeLabel}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(item.recipientCount)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
                        item.status === 'SENT' ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' :
                        item.status === 'FAILED' ? 'border-[#C59292] bg-[#FFF7F5] text-[#8A433C]' :
                        'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]'
                      }`}>
                        {item.status === 'SENT' ? 'Gönderildi' : item.status === 'FAILED' ? 'Başarısız' : 'Bekliyor'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelConfirmDialog
        open={showConfirm}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleSend}
        title={`${activeSmsConfig.label} Gönder`}
        description={`${formatNumber(mockRecipientCount)} kişiye SMS gönderilecek. Devam etmek istiyor musunuz?`}
        confirmLabel="Gönder"
      />

      <PanelModal open={showPreview} onClose={() => setShowPreview(false)} title={`SMS Önizleme: ${activeSmsConfig.label}`} maxWidth="520px">
        <div className="space-y-4">
          <div className="rounded-[18px] border border-[#E4DBCF] bg-[#FBF7F0] p-4">
            <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">Şablon Önizleme</p>
            <p className="mt-3 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.7] text-[#1B2B24]">
              {activeSmsType === 'credentials' && 'Merhaba Ahmet Yılmaz, Teachera Bursluluk Sınavı giriş bilgileriniz: Kullanıcı adı: 20260322-100234, Şifre: a1b2c3d4. Giriş: teachera.com.tr/bursluluk/giris'}
              {activeSmsType === 'reminder' && 'Merhaba Ahmet Yılmaz, Teachera Bursluluk Sınavınız 30 dakika sonra başlıyor! Saat 10:00\'da hazır olun. Giriş: teachera.com.tr/bursluluk/giris'}
              {activeSmsType === 'result' && 'Merhaba Ahmet Yılmaz, Teachera Bursluluk Sınav sonucunuz açıklandı! Puanınız: 82/100. Detaylar: teachera.com.tr/bursluluk/sonuc'}
              {activeSmsType === 'appointment' && 'Merhaba Ahmet Yılmaz, Teachera görüşme randevunuz yarın saat 10:00\'da. Adres: Teachera Dil Okulu, Selçuklu/Konya. Detay: teachera.com.tr'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Alıcı Sayısı</p>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{formatNumber(mockRecipientCount)}</p>
            </div>
            <div className="rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Örnek Alıcı</p>
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">0532 XXX XX XX</p>
            </div>
          </div>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">
            Bu bir önizlemedir. Gerçek gönderimde şablon değişkenleri her aday için otomatik doldurulur.
          </p>
        </div>
      </PanelModal>
    </div>
  );
}
