import { useState } from 'react';
import { formatDateTime } from './panelTypes';
import {
  PanelFeedbackMessage,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from './panelUi';

type HealthStatus = 'iyi' | 'dikkat' | 'kritik';
type ServiceHealth = { id: string; label: string; status: HealthStatus; metric: string; lastCheck: string };
type Alert = { id: string; severity: HealthStatus; title: string; description: string; suggestion: string; timestamp: string };
type AuditEntry = { id: string; time: string; user: string; action: string; detail: string };

const HEALTH_STYLES: Record<HealthStatus, { dot: string; bg: string; border: string; text: string; label: string }> = {
  iyi: { dot: 'bg-[#2C5447]', bg: 'bg-[#F3F9F4]', border: 'border-[#D7E2DA]', text: 'text-[#2C5447]', label: 'Sorunsuz' },
  dikkat: { dot: 'bg-[#B8922C]', bg: 'bg-[#FBF5EB]', border: 'border-[#E4D6C1]', text: 'text-[#7A5E39]', label: 'Dikkat' },
  kritik: { dot: 'bg-[#8A433C]', bg: 'bg-[#FFF7F5]', border: 'border-[#E5CDC6]', text: 'text-[#8A433C]', label: 'Kritik' },
};

const MOCK_SERVICES: ServiceHealth[] = [
  { id: 'sms', label: 'SMS Servisi', status: 'iyi', metric: '%99.2 uptime', lastCheck: '2026-03-23T14:28:00Z' },
  { id: 'crm', label: 'CRM Bağlantısı', status: 'dikkat', metric: 'Son yanıt: 3.2s', lastCheck: '2026-03-23T14:15:00Z' },
  { id: 'wpbot', label: 'WhatsApp Bot', status: 'iyi', metric: '%99.8 uptime', lastCheck: '2026-03-23T14:29:00Z' },
  { id: 'db', label: 'Veritabanı', status: 'iyi', metric: '18ms ortalama', lastCheck: '2026-03-23T14:30:00Z' },
];

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', severity: 'dikkat', title: 'CRM yanıt süresi yüksek', description: 'CRM servisi son 1 saatte ortalama 3.2 saniye yanıt veriyor. Normal değer 1 saniyenin altıdır.', suggestion: 'CRM sağlayıcınızın durumunu kontrol edin. Sorun devam ederse yazılımcınızla iletişime geçin.', timestamp: '2026-03-23T14:15:00Z' },
  { id: 'a2', severity: 'iyi', title: 'SMS teslim oranı normal', description: 'Son 24 saatte SMS teslim oranı %99.2 seviyesinde. Eşik değer: >%95.', suggestion: 'Herhangi bir işlem gerekmez.', timestamp: '2026-03-23T14:00:00Z' },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 'l1', time: '2026-03-23T14:30:00Z', user: 'Zeynep Kaya', action: 'Panel Giriş', detail: 'Başarılı oturum açma' },
  { id: 'l2', time: '2026-03-23T14:25:00Z', user: 'Sistem', action: 'SMS Gönderim', detail: '50 aday için credentials SMS kuyruğa alındı' },
  { id: 'l3', time: '2026-03-23T14:20:00Z', user: 'Ali Yılmaz', action: 'Sonuç Düzenleme', detail: 'Aday #100234 puanı güncellendi (OTP doğrulandı)' },
  { id: 'l4', time: '2026-03-23T14:15:00Z', user: 'Sistem', action: 'CRM Uyarı', detail: 'CRM yanıt süresi eşik değerini aştı (3.2s > 1.0s)' },
  { id: 'l5', time: '2026-03-23T14:10:00Z', user: 'Zeynep Kaya', action: 'WhatsApp Tetik', detail: '"Sınava Girmeyenler" senaryosu 234 kişiye tetiklendi' },
];

export default function SystemStatusPanel() {
  const [message, setMessage] = useState('');

  const overallStatus: HealthStatus = MOCK_SERVICES.some((s) => s.status === 'kritik') ? 'kritik' : MOCK_SERVICES.some((s) => s.status === 'dikkat') ? 'dikkat' : 'iyi';
  const overallStyle = HEALTH_STYLES[overallStatus];
  const alertCount = MOCK_ALERTS.filter((a) => a.severity !== 'iyi').length;

  const copyAlertText = (alert: Alert) => {
    const text = `[${alert.severity.toUpperCase()}] ${alert.title}\n${alert.description}\nÖnerilen: ${alert.suggestion}\nZaman: ${formatDateTime(alert.timestamp)}`;
    navigator.clipboard.writeText(text).then(() => setMessage('Uyarı detayları panoya kopyalandı.'));
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* Header */}
      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Sistem</p>
            <h2 className={panelLargeTitleClassName}>Sistem Durumu</h2>
            <p className={panelDescriptionClassName}>Servis sağlığı, entegrasyon durumu ve aktif uyarılar.</p>
          </div>
          <button type="button" onClick={() => setMessage('Durum bilgileri güncellendi.')} className={panelSecondaryButtonClassName}>Yenile</button>
        </div>
      </section>

      {/* Overall status */}
      <div className={`rounded-[24px] border ${overallStyle.border} ${overallStyle.bg} p-5`}>
        <div className="flex items-center gap-3">
          <span className={`h-4 w-4 rounded-full ${overallStyle.dot}`} />
          <h3 className={`font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] ${overallStyle.text}`}>
            {overallStatus === 'iyi' ? 'Sistem Sağlıklı' : overallStatus === 'dikkat' ? 'Dikkat Gerektiren Durum' : 'Kritik Durum'}
          </h3>
        </div>
        <p className={`mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.7] ${overallStyle.text} opacity-80`}>
          {overallStatus === 'iyi' ? 'Tüm servisler normal çalışıyor. Herhangi bir müdahale gerekmiyor.' : overallStatus === 'dikkat' ? `${alertCount} serviste dikkat gerektiren durum tespit edildi. Aşağıdaki uyarıları kontrol edin.` : 'Bir veya daha fazla serviste kritik sorun var. Acil müdahale gerekebilir.'}
        </p>
      </div>

      {/* Service cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MOCK_SERVICES.map((service) => {
          const style = HEALTH_STYLES[service.status];
          return (
            <div key={service.id} className={`${panelStatCardClassName} ${style.bg} ${style.border}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                <p className={`font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] ${style.text}`}>{service.label}</p>
              </div>
              <p className={`mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] ${style.text}`}>{style.label}</p>
              <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">{service.metric}</p>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#8A7F71]">Son: {formatDateTime(service.lastCheck)}</p>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Aktif Uyarılar</p>
        <h3 className={panelTitleClassName}>Dikkat gerektiren konular</h3>
        <div className="mt-4 space-y-3">
          {MOCK_ALERTS.filter((a) => a.severity !== 'iyi').length === 0 ? (
            <div className="rounded-[18px] border border-[#D7E2DA] bg-[#F3F9F4] px-4 py-3">
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#2C5447]">Aktif uyarı bulunmuyor. Tüm sistemler normal.</p>
            </div>
          ) : (
            MOCK_ALERTS.filter((a) => a.severity !== 'iyi').map((alert) => {
              const style = HEALTH_STYLES[alert.severity];
              return (
                <div key={alert.id} className={`rounded-[20px] border ${style.border} ${style.bg} p-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full ${style.dot}`} />
                      <p className={`font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] ${style.text}`}>{alert.title}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${style.border} ${style.text}`}>
                      {alert.severity === 'dikkat' ? 'Dikkat' : 'Kritik'}
                    </span>
                  </div>
                  <p className={`mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] leading-[1.6] ${style.text} opacity-85`}>{alert.description}</p>
                  <div className="mt-3 rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2">
                    <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">Önerilen İşlem</p>
                    <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">{alert.suggestion}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => copyAlertText(alert)} className={panelSmallButtonClassName}>Yazılımcıya Bildir</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Recent audit */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Son İşlemler</p>
        <h3 className={panelTitleClassName}>Güvenlik Audit Özeti</h3>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[560px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Kullanıcı</th>
                <th className="px-3 py-2">İşlem</th>
                <th className="px-3 py-2">Detay</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_AUDIT.map((entry) => (
                <tr key={entry.id} className="border-b border-[#F0E7DA]">
                  <td className="px-3 py-2">{formatDateTime(entry.time)}</td>
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{entry.user}</td>
                  <td className="px-3 py-2">{entry.action}</td>
                  <td className="px-3 py-2 text-[#5E665E]">{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
