import { useMemo, useState } from 'react';
import { formatNumber } from '../panelTypes';
import {
  PanelEmptyState,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type SchoolSalesRow = {
  school: string;
  district: string;
  applied: number;
  examTaken: number;
  resultViewed: number;
  appointed: number;
  attended: number;
  registered: number;
};

const MOCK_DATA: SchoolSalesRow[] = [
  { school: 'Meram İlkokulu', district: 'Meram', applied: 145, examTaken: 112, resultViewed: 89, appointed: 56, attended: 42, registered: 28 },
  { school: 'Selçuklu Ortaokulu', district: 'Selçuklu', applied: 198, examTaken: 156, resultViewed: 120, appointed: 78, attended: 65, registered: 45 },
  { school: 'Karatay Anadolu Lisesi', district: 'Karatay', applied: 87, examTaken: 72, resultViewed: 60, appointed: 38, attended: 30, registered: 22 },
  { school: 'Meram Ortaokulu', district: 'Meram', applied: 134, examTaken: 98, resultViewed: 82, appointed: 52, attended: 41, registered: 30 },
  { school: 'Selçuklu İlkokulu', district: 'Selçuklu', applied: 110, examTaken: 85, resultViewed: 70, appointed: 45, attended: 32, registered: 20 },
  { school: 'Karatay Ortaokulu', district: 'Karatay', applied: 92, examTaken: 70, resultViewed: 55, appointed: 35, attended: 28, registered: 18 },
  { school: 'Necmettin Erbakan İlkokulu', district: 'Meram', applied: 168, examTaken: 130, resultViewed: 102, appointed: 68, attended: 55, registered: 38 },
  { school: 'Selçuklu Fen Lisesi', district: 'Selçuklu', applied: 76, examTaken: 65, resultViewed: 52, appointed: 33, attended: 25, registered: 16 },
];

export default function SchoolSalesReport() {
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');

  const filtered = useMemo(() => {
    return MOCK_DATA.filter((r) => {
      if (search && !r.school.toLowerCase().includes(search.toLowerCase())) return false;
      if (districtFilter && r.district !== districtFilter) return false;
      return true;
    });
  }, [search, districtFilter]);

  const districts = [...new Set(MOCK_DATA.map((r) => r.district))];

  const totals = useMemo(() => ({
    applied: filtered.reduce((s, r) => s + r.applied, 0),
    registered: filtered.reduce((s, r) => s + r.registered, 0),
  }), [filtered]);

  return (
    <div className="space-y-5">
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Filtreler</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Okul adı ara..." className={panelCompactInputClassName} />
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className={panelCompactInputClassName}>
            <option value="">Tüm İlçeler</option>
            {districts.map((d) => (<option key={d} value={d}>{d}</option>))}
          </select>
        </div>
        <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">
          {formatNumber(filtered.length)} okul — Toplam {formatNumber(totals.applied)} başvuru, {formatNumber(totals.registered)} kayıt
        </p>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Okul Bazlı Satış Raporu</p>
        <h3 className={panelTitleClassName}>Her okulun satış hunisi</h3>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[820px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Okul</th>
                <th className="px-3 py-2">İlçe</th>
                <th className="px-3 py-2 text-right">Başvuru</th>
                <th className="px-3 py-2 text-right">Sınav</th>
                <th className="px-3 py-2 text-right">Sonuç</th>
                <th className="px-3 py-2 text-right">Randevu</th>
                <th className="px-3 py-2 text-right">Geldi</th>
                <th className="px-3 py-2 text-right">Kayıt</th>
                <th className="px-3 py-2 text-right">Dönüşüm</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9}><PanelEmptyState /></td></tr>
              ) : (
                filtered.map((r) => {
                  const conversion = r.applied > 0 ? ((r.registered / r.applied) * 100).toFixed(1) : '0';
                  return (
                    <tr key={r.school} className="border-b border-[#F0E7DA]">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{r.school}</td>
                      <td className="px-3 py-2">{r.district}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.applied)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.examTaken)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.resultViewed)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.appointed)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.attended)}</td>
                      <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{formatNumber(r.registered)}</td>
                      <td className="px-3 py-2 text-right">%{conversion}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
