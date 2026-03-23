import { useMemo, useState } from 'react';
import { formatNumber } from '../panelTypes';
import { DonutChart } from './PanelChartSvg';
import {
  PanelEmptyState,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type WpScenarioStats = { scenario: string; triggered: number; delivered: number; failed: number };
type WpLogRow = { id: string; date: string; scenario: string; recipient: string; status: string; error: string | null };

const MOCK_STATS: WpScenarioStats[] = [
  { scenario: 'Sınava Girmeyenler', triggered: 234, delivered: 210, failed: 24 },
  { scenario: 'Sonuç Görüntülemeyenler', triggered: 567, delivered: 540, failed: 27 },
  { scenario: 'Randevu Almayanlar', triggered: 345, delivered: 320, failed: 25 },
  { scenario: 'Görüşmeye Gelmeyenler', triggered: 89, delivered: 82, failed: 7 },
  { scenario: 'Kayıt Olmayanlar', triggered: 156, delivered: 140, failed: 16 },
];

const MOCK_LOGS: WpLogRow[] = [
  { id: '1', date: '2026-03-23T14:30:00Z', scenario: 'Sınava Girmeyenler', recipient: '532 XXX XX XX', status: 'DELIVERED', error: null },
  { id: '2', date: '2026-03-23T14:25:00Z', scenario: 'Sonuç Görüntülemeyenler', recipient: '555 XXX XX XX', status: 'DELIVERED', error: null },
  { id: '3', date: '2026-03-23T14:20:00Z', scenario: 'Randevu Almayanlar', recipient: '542 XXX XX XX', status: 'FAILED', error: 'PHONE_NOT_WA' },
  { id: '4', date: '2026-03-23T14:15:00Z', scenario: 'Sınava Girmeyenler', recipient: '505 XXX XX XX', status: 'DELIVERED', error: null },
  { id: '5', date: '2026-03-23T14:10:00Z', scenario: 'Kayıt Olmayanlar', recipient: '538 XXX XX XX', status: 'PENDING', error: null },
];

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  PENDING: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]',
  FAILED: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
};

export default function WpBotReportsPanel() {
  const [scenarioFilter, setScenarioFilter] = useState('');

  const totals = useMemo(() => ({
    triggered: MOCK_STATS.reduce((s, r) => s + r.triggered, 0),
    delivered: MOCK_STATS.reduce((s, r) => s + r.delivered, 0),
    failed: MOCK_STATS.reduce((s, r) => s + r.failed, 0),
  }), []);

  const donutItems = useMemo(() => [
    { label: 'Teslim', value: totals.delivered, color: '#2C5447' },
    { label: 'Başarısız', value: totals.failed, color: '#C59292' },
  ], [totals]);

  const filteredLogs = useMemo(() => {
    if (!scenarioFilter) return MOCK_LOGS;
    return MOCK_LOGS.filter((l) => l.scenario === scenarioFilter);
  }, [scenarioFilter]);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Tetiklenen</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(totals.triggered)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Teslim Edilen</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(totals.delivered)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Başarısız</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#875349]">{formatNumber(totals.failed)}</p>
        </div>
      </div>

      {/* Chart + Scenario Table */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Teslim Oranı</p>
          <h3 className={panelTitleClassName}>WhatsApp Başarı Dağılımı</h3>
          <div className="mt-4">
            <DonutChart items={donutItems} />
          </div>
        </section>

        <section className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Senaryo Bazlı</p>
          <h3 className={panelTitleClassName}>Senaryo Performansı</h3>
          <div className={panelTableContainerClassName}>
            <table className="min-w-[400px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
              <thead>
                <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                  <th className="px-3 py-2">Senaryo</th>
                  <th className="px-3 py-2 text-right">Tetiklenen</th>
                  <th className="px-3 py-2 text-right">Teslim</th>
                  <th className="px-3 py-2 text-right">Başarısız</th>
                  <th className="px-3 py-2 text-right">Oran</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_STATS.map((r) => {
                  const rate = r.triggered > 0 ? ((r.delivered / r.triggered) * 100).toFixed(1) : '0';
                  return (
                    <tr key={r.scenario} className="border-b border-[#F0E7DA]">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{r.scenario}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.triggered)}</td>
                      <td className="px-3 py-2 text-right text-[#2C5447]">{formatNumber(r.delivered)}</td>
                      <td className="px-3 py-2 text-right text-[#875349]">{formatNumber(r.failed)}</td>
                      <td className="px-3 py-2 text-right">%{rate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Detail Log */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Detaylı Log</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select value={scenarioFilter} onChange={(e) => setScenarioFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm Senaryolar</option>
            {MOCK_STATS.map((s) => (<option key={s.scenario} value={s.scenario}>{s.scenario}</option>))}
          </select>
          <input type="date" className={panelCompactInputClassName} />
        </div>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[580px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Senaryo</th>
                <th className="px-3 py-2">Alıcı</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Hata</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={5}><PanelEmptyState /></td></tr>
              ) : (
                filteredLogs.map((l) => (
                  <tr key={l.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2">{new Date(l.date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">{l.scenario}</td>
                    <td className="px-3 py-2">{l.recipient}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${STATUS_COLORS[l.status] || ''}`}>
                        {l.status === 'DELIVERED' ? 'Teslim' : l.status === 'FAILED' ? 'Başarısız' : 'Bekliyor'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#875349]">{l.error || '—'}</td>
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
