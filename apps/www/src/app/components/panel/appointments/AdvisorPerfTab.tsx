import { useMemo, useState } from 'react';
import { MOCK_ADVISORS, MOCK_APPOINTMENTS } from './appointmentsMockData';
import { formatNumber } from '../panelTypes';
import {
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type AdvisorMetrics = {
  advisorId: string;
  advisorName: string;
  totalAppointments: number;
  attended: number;
  noShow: number;
  registered: number;
  interested: number;
  declined: number;
  attendanceRate: string;
  conversionRate: string;
  estimatedRevenue: number;
};

export default function AdvisorPerfTab() {
  const [dateFrom] = useState('2026-03-20');
  const [dateTo] = useState('2026-03-28');

  const metrics: AdvisorMetrics[] = useMemo(() => {
    return MOCK_ADVISORS.filter((a) => a.isActive).map((advisor) => {
      const slots = MOCK_APPOINTMENTS.filter((s) => s.advisorId === advisor.id && s.date >= dateFrom && s.date <= dateTo);
      const total = slots.filter((s) => s.status !== 'AVAILABLE').length;
      const attended = slots.filter((s) => s.status === 'ATTENDED').length;
      const noShow = slots.filter((s) => s.status === 'NO_SHOW').length;
      const registered = slots.filter((s) => s.meetingOutcome === 'REGISTERED').length;
      const interested = slots.filter((s) => s.meetingOutcome === 'INTERESTED').length;
      const declined = slots.filter((s) => s.meetingOutcome === 'DECLINED').length;
      const attendanceRate = total > 0 ? ((attended / total) * 100).toFixed(1) : '0';
      const conversionRate = attended > 0 ? ((registered / attended) * 100).toFixed(1) : '0';
      const estimatedRevenue = registered * 12500;
      return { advisorId: advisor.id, advisorName: advisor.fullName, totalAppointments: total, attended, noShow, registered, interested, declined, attendanceRate, conversionRate, estimatedRevenue };
    });
  }, [dateFrom, dateTo]);

  const totals = useMemo(() => ({
    appointments: metrics.reduce((s, m) => s + m.totalAppointments, 0),
    attended: metrics.reduce((s, m) => s + m.attended, 0),
    registered: metrics.reduce((s, m) => s + m.registered, 0),
    revenue: metrics.reduce((s, m) => s + m.estimatedRevenue, 0),
  }), [metrics]);

  return (
    <div className="space-y-5">
      {/* Global KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Randevu</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(totals.appointments)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Geldi</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(totals.attended)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kayıt Oldu</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(totals.registered)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Tahmini Ciro</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(totals.revenue)}</p>
        </div>
      </div>

      {/* Per-advisor cards */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Danışman Karşılaştırması</p>
        <h3 className={panelTitleClassName}>Performans Özeti</h3>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.advisorId} className={`${panelStatCardClassName} space-y-3`}>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[16px] text-[#1B2B24]">{m.advisorName}</p>
              <div className="grid grid-cols-2 gap-2">
                <div><p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Randevu</p><p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[16px] text-[#1B2B24]">{m.totalAppointments}</p></div>
                <div><p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Gelme %</p><p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[16px] text-[#2C5447]">%{m.attendanceRate}</p></div>
                <div><p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Kayıt</p><p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[16px] text-[#2C5447]">{m.registered}</p></div>
                <div><p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Dönüşüm %</p><p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[16px] text-[#1B2B24]">%{m.conversionRate}</p></div>
              </div>
              <div className="rounded-[14px] border border-[#BFD2C8] bg-[#EEF6F0] px-3 py-2">
                <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#2C5447]">
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(m.estimatedRevenue)}
                </p>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#2C5447]">Tahmini ciro</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Detail table */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Detaylı Tablo</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[700px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Danışman</th>
                <th className="px-3 py-2 text-right">Randevu</th>
                <th className="px-3 py-2 text-right">Geldi</th>
                <th className="px-3 py-2 text-right">Gelmedi</th>
                <th className="px-3 py-2 text-right">Kayıt</th>
                <th className="px-3 py-2 text-right">İlgili</th>
                <th className="px-3 py-2 text-right">Vazgeçti</th>
                <th className="px-3 py-2 text-right">Gelme %</th>
                <th className="px-3 py-2 text-right">Dönüşüm %</th>
                <th className="px-3 py-2 text-right">Ciro</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.advisorId} className="border-b border-[#F0E7DA]">
                  <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{m.advisorName}</td>
                  <td className="px-3 py-2 text-right">{m.totalAppointments}</td>
                  <td className="px-3 py-2 text-right text-[#2C5447]">{m.attended}</td>
                  <td className="px-3 py-2 text-right text-[#875349]">{m.noShow}</td>
                  <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{m.registered}</td>
                  <td className="px-3 py-2 text-right">{m.interested}</td>
                  <td className="px-3 py-2 text-right text-[#875349]">{m.declined}</td>
                  <td className="px-3 py-2 text-right">%{m.attendanceRate}</td>
                  <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif]">%{m.conversionRate}</td>
                  <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 }).format(m.estimatedRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
