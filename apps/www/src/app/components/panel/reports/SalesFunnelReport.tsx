import { useMemo, useState } from 'react';
import { formatNumber } from '../panelTypes';
import { HorizontalBarChart } from './PanelChartSvg';
import {
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type FunnelStage = { label: string; value: number; conversionRate: number };

const MOCK_FUNNEL: FunnelStage[] = [
  { label: 'Başvuru', value: 1234, conversionRate: 100 },
  { label: 'Sınava Giren', value: 892, conversionRate: 72.3 },
  { label: 'Sonuç Gördü', value: 678, conversionRate: 76.0 },
  { label: 'Randevu Aldı', value: 445, conversionRate: 65.6 },
  { label: 'Görüşmeye Geldi', value: 334, conversionRate: 75.1 },
  { label: 'Kayıt Oldu', value: 223, conversionRate: 66.8 },
];

const MOCK_REVENUE = 2787500;

export default function SalesFunnelReport() {
  const [gradeFilter, setGradeFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');

  const chartItems = useMemo(
    () => MOCK_FUNNEL.map((s) => ({ label: s.label, value: s.value })),
    [],
  );

  return (
    <div className="space-y-5">
      {/* Filters */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Filtreler</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm Sınıflar</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (<option key={g} value={String(g)}>{g}. Sınıf</option>))}
          </select>
          <input value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} placeholder="Okul adı ara..." className={panelCompactInputClassName} />
          <input type="date" className={panelCompactInputClassName} />
        </div>
      </section>

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Başvuru</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(1234)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kayıt Olan</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(223)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Dönüşüm Oranı</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">%18.1</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Ciro</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(MOCK_REVENUE)}</p>
        </div>
      </div>

      {/* Funnel Chart */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Satış Hunisi</p>
        <h3 className={panelTitleClassName}>Başvurudan kayıta dönüşüm akışı</h3>
        <div className="mt-4">
          <HorizontalBarChart items={chartItems} />
        </div>
      </section>

      {/* Detail Table */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Detaylı Tablo</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[560px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Aşama</th>
                <th className="px-3 py-2 text-right">Sayı</th>
                <th className="px-3 py-2 text-right">Oran</th>
                <th className="px-3 py-2 text-right">Kayıp</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_FUNNEL.map((stage, i) => {
                const prev = i > 0 ? MOCK_FUNNEL[i - 1].value : stage.value;
                const loss = prev - stage.value;
                return (
                  <tr key={stage.label} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{stage.label}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(stage.value)}</td>
                    <td className="px-3 py-2 text-right">%{stage.conversionRate.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-[#875349]">{i > 0 ? `-${formatNumber(loss)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
