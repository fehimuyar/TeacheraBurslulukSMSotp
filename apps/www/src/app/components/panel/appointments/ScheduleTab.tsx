import { useMemo, useState } from 'react';
import { MOCK_ADVISORS, MOCK_APPOINTMENTS, type AppointmentSlot } from './appointmentsMockData';
import { canManageAppointments } from '../panelPermissions';
import { formatNumber } from '../panelTypes';
import SlotDetailModal from './SlotDetailModal';
import {
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelSecondaryButtonClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from '../panelUi';

function getWeekDates(startDate: string): string[] {
  const d = new Date(startDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date.toISOString().slice(0, 10);
  });
}

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = 9 + Math.floor(i / 2);
  const min = i % 2 === 0 ? '00' : '30';
  return `${String(hour).padStart(2, '0')}:${min}`;
});

const SLOT_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-[#EEF6F0] border-[#D7E2DA] text-[#2C5447] hover:bg-[#DFF0E5]',
  BOOKED: 'bg-[#F0F0F6] border-[#C8CAD8] text-[#4A4A6A] hover:bg-[#E8E8F0]',
  ATTENDED: 'bg-[#2C5447] border-[#2C5447] text-white hover:bg-[#23463B]',
  NO_SHOW: 'bg-[#FFF8F6] border-[#E7D2CD] text-[#875349] hover:bg-[#FFEFEC]',
  CANCELLED: 'bg-[#FBF7F0] border-[#DDD3C5] text-[#8A7F71]',
};

export default function ScheduleTab({ role, dailyMode }: { role?: string; dailyMode?: boolean }) {
  const canOperate = canManageAppointments(role);
  const [weekStart, setWeekStart] = useState('2026-03-23');
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [slots, setSlots] = useState<AppointmentSlot[]>(MOCK_APPOINTMENTS);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [message, setMessage] = useState('');

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const selectedDate = dailyMode ? weekDates[0] || weekStart : null;

  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      if (advisorFilter && s.advisorId !== advisorFilter) return false;
      if (dailyMode) return s.date === selectedDate;
      return weekDates.includes(s.date);
    });
  }, [slots, advisorFilter, weekDates, dailyMode, selectedDate]);

  const getSlotForCell = (date: string, time: string): AppointmentSlot | undefined => {
    return filteredSlots.find((s) => s.date === date && s.startTime === time);
  };

  const summary = useMemo(() => ({
    booked: filteredSlots.filter((s) => s.status === 'BOOKED').length,
    attended: filteredSlots.filter((s) => s.status === 'ATTENDED').length,
    noShow: filteredSlots.filter((s) => s.status === 'NO_SHOW').length,
    available: filteredSlots.filter((s) => s.status === 'AVAILABLE').length,
  }), [filteredSlots]);

  const handleStatusChange = (slotId: string, status: AppointmentSlot['status'], notes?: string, outcome?: string) => {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status, meetingNotes: notes || s.meetingNotes, meetingOutcome: (outcome as AppointmentSlot['meetingOutcome']) || s.meetingOutcome } : s));
    setMessage('Randevu durumu güncellendi.');
  };

  const shiftWeek = (direction: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + direction * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const formatDateShort = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Randevulu</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#4A4A6A]">{formatNumber(summary.booked)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Geldi</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#2C5447]">{formatNumber(summary.attended)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Gelmedi</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#875349]">{formatNumber(summary.noShow)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Boş Slot</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#2C5447]">{formatNumber(summary.available)}</p>
        </div>
      </div>

      {/* Controls */}
      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftWeek(-1)} className={panelSecondaryButtonClassName} aria-label="Önceki hafta">&#9664;</button>
            <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">
              {formatDateShort(weekDates[0])} — {formatDateShort(weekDates[4])}
            </span>
            <button type="button" onClick={() => shiftWeek(1)} className={panelSecondaryButtonClassName} aria-label="Sonraki hafta">&#9654;</button>
          </div>
          <div className="flex items-center gap-2">
            <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className={`w-[200px] ${panelCompactInputClassName}`}>
              <option value="">Tüm Danışmanlar</option>
              {MOCK_ADVISORS.filter((a) => a.isActive).map((a) => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[700px] w-full border-collapse">
            <thead>
              <tr>
                <th className="w-[70px] border-b border-[#E6DDCF] px-2 py-2 text-left font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Saat</th>
                {weekDates.map((date, i) => (
                  <th key={date} className="border-b border-[#E6DDCF] px-2 py-2 text-center font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.1em] text-[#1B2B24]">
                    <div>{DAY_NAMES[i]}</div>
                    <div className="font-['Neutraface_2_Text:Book',sans-serif] text-[#7A7063]">{formatDateShort(date)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => (
                <tr key={time}>
                  <td className="border-b border-[#F0E7DA] px-2 py-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">{time}</td>
                  {weekDates.map((date) => {
                    const slot = getSlotForCell(date, time);
                    if (!slot) {
                      return <td key={date} className="border-b border-[#F0E7DA] px-1 py-1"><div className="h-[32px]" /></td>;
                    }
                    const colorClass = SLOT_COLORS[slot.status] || SLOT_COLORS.AVAILABLE;
                    return (
                      <td key={date} className="border-b border-[#F0E7DA] px-1 py-1">
                        <button
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`flex h-[32px] w-full items-center justify-center rounded-[10px] border px-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] transition cursor-pointer ${colorClass}`}
                          title={slot.candidateName || 'Boş slot'}
                        >
                          {slot.status === 'AVAILABLE' ? 'Boş' :
                           slot.status === 'ATTENDED' ? `\u2713 ${(slot.candidateName || '').split(' ')[0]}` :
                           slot.status === 'NO_SHOW' ? `\u2717 ${(slot.candidateName || '').split(' ')[0]}` :
                           (slot.candidateName || '').split(' ')[0]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3">
          {[
            { label: 'Boş', color: 'bg-[#EEF6F0] border-[#D7E2DA]' },
            { label: 'Randevulu', color: 'bg-[#F0F0F6] border-[#C8CAD8]' },
            { label: 'Geldi', color: 'bg-[#2C5447] border-[#2C5447] text-white' },
            { label: 'Gelmedi', color: 'bg-[#FFF8F6] border-[#E7D2CD]' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-5 rounded-[4px] border ${item.color}`} />
              <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#7A7063]">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <SlotDetailModal
        open={selectedSlot !== null}
        onClose={() => setSelectedSlot(null)}
        slot={selectedSlot}
        role={role}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
