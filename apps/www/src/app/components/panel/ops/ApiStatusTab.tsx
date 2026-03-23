import { useState } from 'react';
import { isSuperAdmin } from '../panelPermissions';
import { formatDateTime } from '../panelTypes';
import {
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type HealthStatus = 'healthy' | 'warning' | 'critical';
type Integration = { id: string; label: string; status: HealthStatus; lastCheck: string; uptime: string; configFields: string[] };
type ErrorLogItem = { id: string; service: string; error: string; timestamp: string; detail: string };

const MOCK_INTEGRATIONS: Integration[] = [
  { id: 'sms', label: 'SMS Servisi', status: 'healthy', lastCheck: '2026-03-23T14:28:00Z', uptime: '%99.2', configFields: ['API Key', 'Endpoint URL', 'Sender ID'] },
  { id: 'crm', label: 'CRM Bağlantısı', status: 'warning', lastCheck: '2026-03-23T14:15:00Z', uptime: '%96.1', configFields: ['Endpoint URL', 'API Token'] },
  { id: 'wpbot', label: 'WhatsApp Bot', status: 'healthy', lastCheck: '2026-03-23T14:29:00Z', uptime: '%99.8', configFields: ['Bot Token', 'Webhook URL'] },
];

const MOCK_ERRORS: ErrorLogItem[] = [
  { id: 'e1', service: 'CRM', error: 'TIMEOUT', timestamp: '2026-03-23T14:15:00Z', detail: 'CRM endpoint 10s sonra zaman aşımı verdi.' },
  { id: 'e2', service: 'SMS', error: 'RATE_LIMITED', timestamp: '2026-03-23T12:00:00Z', detail: 'SMS sağlayıcı rate limit uyguladı.' },
];

const STATUS_STYLES: Record<HealthStatus, { bg: string; border: string; text: string; label: string }> = {
  healthy: { bg: 'bg-[#F3F9F4]', border: 'border-[#D7E2DA]', text: 'text-[#2C5447]', label: 'Aktif' },
  warning: { bg: 'bg-[#FBF5EB]', border: 'border-[#E4D6C1]', text: 'text-[#7A5E39]', label: 'Dikkat' },
  critical: { bg: 'bg-[#FFF7F5]', border: 'border-[#E5CDC6]', text: 'text-[#8A433C]', label: 'Kritik' },
};

export default function ApiStatusTab({ role }: { role?: string }) {
  const isAdmin = isSuperAdmin(role);
  const [selectedIntegration, setSelectedIntegration] = useState<string>('sms');
  const [configs, setConfigs] = useState<Record<string, Record<string, string>>>({
    sms: { 'API Key': 'sk-live-xxxxxxxxxxxxx', 'Endpoint URL': 'https://sms-provider.com/api/v1', 'Sender ID': 'TEACHERA' },
    crm: { 'Endpoint URL': 'https://crm.teachera.com.tr/api', 'API Token': 'crm-token-xxxxxxxxxxxxx' },
    wpbot: { 'Bot Token': 'wa-bot-xxxxxxxxxxxxx', 'Webhook URL': 'https://ops-api.teachera.com.tr/api/notifications/provider-webhook' },
  });
  const [showSecrets, setShowSecrets] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  const selectedConfig = MOCK_INTEGRATIONS.find((i) => i.id === selectedIntegration);
  const selectedFields = configs[selectedIntegration] || {};

  const toggleSecret = (field: string) => {
    if (!isAdmin) return;
    setShowSecrets((prev) => {
      const next = new Set(prev);
      const key = `${selectedIntegration}:${field}`;
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const maskValue = (value: string) => value.length > 8 ? value.slice(0, 4) + '\u2022'.repeat(value.length - 8) + value.slice(-4) : '\u2022'.repeat(value.length);

  const handleConfigChange = (field: string, value: string) => {
    setConfigs((prev) => ({ ...prev, [selectedIntegration]: { ...prev[selectedIntegration], [field]: value } }));
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Entegrasyon Sağlığı</p>
            <h3 className={panelTitleClassName}>API Aktiflik Durumu</h3>
            <p className={panelDescriptionClassName}>Dış servislerin bağlantı durumu ve yapılandırması.</p>
          </div>
          <button type="button" onClick={() => setMessage('Durum bilgileri güncellendi.')} className={panelSecondaryButtonClassName}>Yenile</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {MOCK_INTEGRATIONS.map((integration) => {
            const style = STATUS_STYLES[integration.status];
            const active = selectedIntegration === integration.id;
            return (
              <button
                key={integration.id}
                type="button"
                onClick={() => setSelectedIntegration(integration.id)}
                className={`${panelStatCardClassName} text-left transition ${active ? 'ring-2 ring-[#2C5447]' : ''} ${style.bg} ${style.border}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${integration.status === 'healthy' ? 'bg-[#2C5447]' : integration.status === 'warning' ? 'bg-[#B8922C]' : 'bg-[#8A433C]'}`} />
                  <p className={`font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] ${style.text}`}>{integration.label}</p>
                </div>
                <p className={`mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] ${style.text}`}>{style.label}</p>
                <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Uptime: {integration.uptime}</p>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Son: {formatDateTime(integration.lastCheck)}</p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedConfig && (
        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Yapılandırma</p>
          <h3 className={panelTitleClassName}>{selectedConfig.label}</h3>

          <div className="mt-4 space-y-3">
            {selectedConfig.configFields.map((field) => {
              const value = selectedFields[field] || '';
              const isSecret = field.toLowerCase().includes('key') || field.toLowerCase().includes('token');
              const revealed = showSecrets.has(`${selectedIntegration}:${field}`);
              return (
                <div key={field} className="flex items-center gap-2">
                  <label className="w-[140px] shrink-0 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{field}</label>
                  <input
                    value={isSecret && !revealed ? maskValue(value) : value}
                    onChange={(e) => handleConfigChange(field, e.target.value)}
                    readOnly={!isAdmin || (isSecret && !revealed)}
                    className={`flex-1 ${panelCompactInputClassName} ${!isAdmin ? 'opacity-60' : ''}`}
                  />
                  {isSecret && (
                    <button type="button" onClick={() => toggleSecret(field)} disabled={!isAdmin} className={panelSmallButtonClassName}>
                      {revealed ? 'Gizle' : 'Göster'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setMessage('Test bağlantısı başarılı.')} className={panelSecondaryButtonClassName}>Test Et</button>
              <button type="button" onClick={() => setMessage('Yapılandırma kaydedildi.')} className={panelPrimaryButtonClassName}>Kaydet</button>
            </div>
          )}
        </section>
      )}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Son Hatalar</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[560px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Servis</th>
                <th className="px-3 py-2">Hata</th>
                <th className="px-3 py-2">Zaman</th>
                <th className="px-3 py-2">Detay</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ERRORS.map((err) => (
                <tr key={err.id} className="border-b border-[#F0E7DA]">
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{err.service}</td>
                  <td className="px-3 py-2"><span className="rounded border border-[#E5CDC6] bg-[#FFF7F5] px-2 py-0.5 text-[10px] text-[#8A433C]">{err.error}</span></td>
                  <td className="px-3 py-2">{formatDateTime(err.timestamp)}</td>
                  <td className="px-3 py-2 text-[#5E665E]">{err.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
