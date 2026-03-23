import { useMemo, useState } from 'react';
import { formatNumber } from '../panelTypes';
import { DonutChart, SimpleLineChart } from './PanelChartSvg';
import {
  PanelEmptyState,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type SmsStatusBreakdown = { label: string; value: number; color: string };
type SmsLogRow = { id: string; date: string; recipient: string; template: string; status: string; errorCode: string | null };

const MOCK_STATUS: SmsStatusBreakdown[] = [
  { label: 'Teslim Edildi', value: 1150, color: '#2C5447' },
  { label: 'Gönderildi', value: 35, color: '#5B8A7D' },
  { label: 'Başarısız', value: 35, color: '#C59292' },
  { label: 'DLQ', value: 15, color: '#A07070' },
];

const MOCK_TREND = [
  { label: '18.03', value: 120 }, { label: '19.03', value: 250 }, { label: '20.03', value: 480 },
  { label: '21.03', value: 380 }, { label: '22.03', value: 150 }, { label: '23.03', value: 60 },
];

const MOCK_LOGS: SmsLogRow[] = [
  { id: '1', date: '2026-03-23T14:30:00Z', recipient: '532 XXX XX XX', template: 'CREDENTIALS_SMS', status: 'DELIVERED', errorCode: null },
  { id: '2', date: '2026-03-23T14:25:00Z', recipient: '555 XXX XX XX', template: 'EXAM_OPEN_SMS', status: 'DELIVERED', errorCode: null },
  { id: '3', date: '2026-03-23T14:20:00Z', recipient: '542 XXX XX XX', template: 'CREDENTIALS_SMS', status: 'FAILED', errorCode: 'UNDELIVERABLE' },
  { id: '4', date: '2026-03-23T14:15:00Z', recipient: '505 XXX XX XX', template: 'RESULT_READY_SMS', status: 'SENT', errorCode: null },
  { id: '5', date: '2026-03-23T14:10:00Z', recipient: '538 XXX XX XX', template: 'CREDENTIALS_SMS', status: 'DELIVERED', errorCode: null },
  { id: '6', date: '2026-03-23T14:05:00Z', recipient: '507 XXX XX XX', template: 'CREDENTIALS_SMS', status: 'DLQ', errorCode: 'PROVIDER_DOWN' },
];

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  SENT: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]',
  FAILED: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
  DLQ: 'border-[#C59292] bg-[#6B333A] text-white',
};

const STATUS_LABELS: Record<string, string> = { DELIVERED: 'Teslim', SENT: 'Gönderildi', FAILED: 'Başarısız', DLQ: 'DLQ' };

export default function SmsReportsPanel() {
  const [templateFilter, setTemplateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const total = useMemo(() => MOCK_STATUS.reduce((s, i) => s + i.value, 0), []);
  const deliveryRate = total > 0 ? ((MOCK_STATUS[0].value / total) * 100).toFixed(1) : '0';

  const filteredLogs = useMemo(() => {
    return MOCK_LOGS.filter((l) => {
      if (templateFilter && l.template !== templateFilter) return false;
      if (statusFilter && l.status !== statusFilter) return false;
      return true;
    });
  }, [templateFilter, statusFilter]);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MOCK_STATUS.map((s) => (
          <div key={s.label} className={panelStatCardClassName}>
            <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{s.label}</p>
            <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Dağılım</p>
          <h3 className={panelTitleClassName}>SMS Durum Oranları</h3>
          <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">Teslim oranı: <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">%{deliveryRate}</span></p>
          <div className="mt-4">
            <DonutChart items={MOCK_STATUS} />
          </div>
        </section>
        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Trend</p>
          <h3 className={panelTitleClassName}>Günlük SMS Gönderimi</h3>
          <div className="mt-4">
            <SimpleLineChart points={MOCK_TREND} />
          </div>
        </section>
      </div>

      {/* Log Table */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Detaylı Log</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="date" className={panelCompactInputClassName} />
          <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm Şablonlar</option>
            <option value="CREDENTIALS_SMS">Giriş Bilgileri</option>
            <option value="EXAM_OPEN_SMS">Sınav Açılış</option>
            <option value="RESULT_READY_SMS">Sonuç Duyuru</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm Durumlar</option>
            <option value="DELIVERED">Teslim</option><option value="SENT">Gönderildi</option>
            <option value="FAILED">Başarısız</option><option value="DLQ">DLQ</option>
          </select>
        </div>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[640px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Alıcı</th>
                <th className="px-3 py-2">Şablon</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Hata</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={5}><PanelEmptyState /></td></tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2">{new Date(log.date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">{log.recipient}</td>
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{log.template}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${STATUS_COLORS[log.status] || ''}`}>
                        {STATUS_LABELS[log.status] || log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#875349]">{log.errorCode || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
