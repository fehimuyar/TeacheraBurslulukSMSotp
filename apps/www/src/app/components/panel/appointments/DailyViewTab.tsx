import { useMemo, useState } from 'react';
import { MOCK_ADVISORS, MOCK_APPOINTMENTS, type AppointmentSlot } from './appointmentsMockData';
import { canManageAppointments } from '../panelPermissions';
import { formatNumber } from '../panelTypes';
import SlotDetailModal from './SlotDetailModal';
import {
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelSmallButtonClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from '../panelUi';

const STATUS_BADGE: Record<string, { label: string; icon: string; className: string }> = {
  AVAILABLE: { label: 'Boş', icon: '', className: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' },
  BOOKED: { label: 'Bekliyor', icon: '', className: 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]' },
  ATTENDED: { label: 'Geldi', icon: '\u2713', className: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
  NO_SHOW: { label: 'Gelmedi', icon: '\u2717', className: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]' },
  CANCELLED: { label: 'İptal', icon: '', className: 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' },
};

const OUTCOME_BADGE: Record<string, { label: string; className: string }> = {
  REGISTERED: { label: 'Kayıt', className: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
  INTERESTED: { label: 'İlgili', className: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' },
  DECLINED: { label: 'Vazgeçti', className: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]' },
};

export default function DailyViewTab({ role }: { role?: string }) {
  const canOperate = canManageAppointments(role);
  const today = '2026-03-28';
  const [selectedDate, setSelectedDate] = useState(today);
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [slots, setSlots] = useState<AppointmentSlot[]>(MOCK_APPOINTMENTS);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [message, setMessage] = useState('');

  const daySlots = useMemo(() => {
    return slots
      .filter((s) => s.date === selectedDate && (!advisorFilter || s.advisorId === advisorFilter))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [slots, selectedDate, advisorFilter]);

  const summary = useMemo(() => {
    const booked = daySlots.filter((s) => s.status === 'BOOKED').length;
    const attended = daySlots.filter((s) => s.status === 'ATTENDED').length;
    const noShow = daySlots.filter((s) => s.status === 'NO_SHOW').length;
    const registered = daySlots.filter((s) => s.meetingOutcome === 'REGISTERED').length;
    const total = booked + attended + noShow;
    const conversionRate = total > 0 ? ((registered / total) * 100).toFixed(1) : '0';
    return { total, booked, attended, noShow, registered, conversionRate };
  }, [daySlots]);

  const handleStatusChange = (slotId: string, status: AppointmentSlot['status'], notes?: string, outcome?: string) => {
    setSlots((prev) => prev.map((s) => s.id === slotId ? { ...s, status, meetingNotes: notes || s.meetingNotes, meetingOutcome: (outcome as AppointmentSlot['meetingOutcome']) || s.meetingOutcome } : s));
    setMessage('Durum güncellendi.');
  };

  const formatDateFull = (date: string) => new Date(date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* Controls */}
      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Günlük Detay</p>
            <h3 className={panelTitleClassName} style={{ marginTop: 4 }}>{formatDateFull(selectedDate)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={`w-[170px] ${panelCompactInputClassName}`} />
            <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className={`w-[180px] ${panelCompactInputClassName}`}>
              <option value="">Tüm Danışmanlar</option>
              {MOCK_ADVISORS.filter((a) => a.isActive).map((a) => (<option key={a.id} value={a.id}>{a.fullName}</option>))}
            </select>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">{formatNumber(summary.total)}</p>
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
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kayıt</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#2C5447]">{formatNumber(summary.registered)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Dönüşüm</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[22px] text-[#1B2B24]">%{summary.conversionRate}</p>
        </div>
      </div>

      {/* Day list */}
      <section className={panelSurfaceClassName}>
        <div className="divide-y divide-[#ECE2D5]">
          {daySlots.length === 0 ? (
            <div className="py-8 text-center font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#8B8172]">Bu tarihte randevu bulunmuyor.</div>
          ) : (
            daySlots.map((slot) => {
              const badge = STATUS_BADGE[slot.status] || STATUS_BADGE.AVAILABLE;
              const outcomeBadge = slot.meetingOutcome ? OUTCOME_BADGE[slot.meetingOutcome] : null;
              return (
                <div key={slot.id} className="flex items-center gap-3 px-2 py-3 transition hover:bg-[#FBF7F0] cursor-pointer" onClick={() => setSelectedSlot(slot)}>
                  {/* Time */}
                  <div className="w-[60px] shrink-0 font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">{slot.startTime}</div>

                  {/* Status badge */}
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${badge.className}`}>
                    {badge.icon && `${badge.icon} `}{badge.label}
                  </span>

                  {/* Candidate info */}
                  {slot.candidateName ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{slot.candidateName}</span>
                      <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{slot.candidateGrade}. Sınıf</span>
                      <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{slot.candidateSchool}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${slot.placementLabel === 'Tam Burslu' ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]'}`}>
                        {slot.placementLabel}
                      </span>
                    </div>
                  ) : (
                    <span className="flex-1 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#8B8172]">Boş slot</span>
                  )}

                  {/* Outcome */}
                  {outcomeBadge && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${outcomeBadge.className}`}>
                      {outcomeBadge.label}
                    </span>
                  )}

                  {/* Advisor */}
                  <span className="shrink-0 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">{slot.advisorName}</span>

                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedSlot(slot); }} className={panelSmallButtonClassName}>Detay</button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <SlotDetailModal open={selectedSlot !== null} onClose={() => setSelectedSlot(null)} slot={selectedSlot} role={role} onStatusChange={handleStatusChange} />
    </div>
  );
}
