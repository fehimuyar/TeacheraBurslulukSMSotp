import { useState } from 'react';
import type { AppointmentSlot } from './appointmentsMockData';
import { canManageAppointments } from '../panelPermissions';
import {
  PanelFeedbackMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from '../panelUi';

const OUTCOME_OPTIONS: Array<{ value: string; label: string; className: string }> = [
  { value: 'REGISTERED', label: 'Kayıt Oldu', className: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
  { value: 'INTERESTED', label: 'İlgileniyor', className: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' },
  { value: 'DECLINED', label: 'Vazgeçti', className: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Boş', color: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' },
  BOOKED: { label: 'Randevulu', color: 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]' },
  ATTENDED: { label: 'Geldi', color: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
  NO_SHOW: { label: 'Gelmedi', color: 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]' },
  CANCELLED: { label: 'İptal', color: 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' },
};

export default function SlotDetailModal({
  open,
  onClose,
  slot,
  role,
  onStatusChange,
}: {
  open: boolean;
  onClose: () => void;
  slot: AppointmentSlot | null;
  role?: string;
  onStatusChange?: (slotId: string, status: AppointmentSlot['status'], notes?: string, outcome?: string) => void;
}) {
  const canOperate = canManageAppointments(role);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');

  if (!slot) return null;

  const statusInfo = STATUS_LABELS[slot.status] || STATUS_LABELS.AVAILABLE;
  const hasCandidate = slot.candidateId !== null;
  const discountText = slot.discountRate === 100 ? 'Tam Burslu' : slot.discountRate ? `%${slot.discountRate} İndirim` : null;

  const handleAction = (newStatus: AppointmentSlot['status'], outcome?: string) => {
    const noteText = notes.trim() || slot.meetingNotes || undefined;
    onStatusChange?.(slot.id, newStatus, noteText, outcome);
    setMessage(`Durum güncellendi: ${STATUS_LABELS[newStatus]?.label || newStatus}`);
  };

  return (
    <PanelModal open={open} onClose={onClose} title={`${slot.date} — ${slot.startTime}-${slot.endTime}`} maxWidth="560px">
      <div className="space-y-4">
        {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

        {/* Slot status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Danışman:</span>
            <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">{slot.advisorName}</span>
          </div>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Candidate info */}
        {hasCandidate ? (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Aday Bilgileri</p>
            <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">
              {slot.candidateName}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px]">
              <div><span className="text-[#7A7063]">Sınıf:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{slot.candidateGrade}.</span></div>
              <div><span className="text-[#7A7063]">Okul:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{slot.candidateSchool}</span></div>
              <div><span className="text-[#7A7063]">Puan:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{slot.resultScore}/100</span></div>
              <div><span className="text-[#7A7063]">CEFR:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{slot.cefrBand}</span></div>
              <div><span className="text-[#7A7063]">Seviye:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">{slot.placementLabel}</span></div>
              {slot.parentPhone && <div><span className="text-[#7A7063]">Veli Tel:</span> <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{slot.parentPhone}</span></div>}
            </div>
            {discountText && (
              <div className="mt-3 rounded-[14px] border border-[#BFD2C8] bg-[#EEF6F0] px-3 py-2">
                <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#2C5447]">{discountText}</p>
              </div>
            )}
          </div>
        ) : (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Boş Slot</p>
            <p className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
              Bu slot müsait. Aday atamak için aday listesinden seçim yapın.
            </p>
            {canOperate && (
              <button type="button" className={`mt-3 ${panelSecondaryButtonClassName}`}>Aday Ata</button>
            )}
          </div>
        )}

        {/* Meeting notes */}
        {hasCandidate && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Görüşme Notu</p>
            {slot.meetingNotes && (
              <p className="mt-2 rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">
                {slot.meetingNotes}
              </p>
            )}
            {canOperate && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Görüşme notunu buraya yazın..."
                rows={3}
                className={`mt-2 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]`}
              />
            )}
          </div>
        )}

        {/* Outcome buttons */}
        {hasCandidate && canOperate && slot.status === 'BOOKED' && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Durum Güncelle</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => handleAction('ATTENDED')} className={panelPrimaryButtonClassName}>Geldi</button>
              <button type="button" onClick={() => handleAction('NO_SHOW')} className={panelDangerButtonClassName}>Gelmedi</button>
              <button type="button" onClick={() => handleAction('CANCELLED')} className={panelSecondaryButtonClassName}>İptal Et</button>
            </div>
          </div>
        )}

        {hasCandidate && canOperate && slot.status === 'ATTENDED' && !slot.meetingOutcome && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Görüşme Sonucu</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OUTCOME_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => handleAction('ATTENDED', opt.value)} className={`rounded-[18px] border px-4 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.12em] transition active:scale-[0.97] ${opt.className}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {slot.meetingOutcome && (
          <div className="flex items-center gap-2">
            <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sonuç:</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
              slot.meetingOutcome === 'REGISTERED' ? 'border-[#BFD2C8] bg-[#2C5447] text-white' :
              slot.meetingOutcome === 'INTERESTED' ? 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' :
              'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]'
            }`}>
              {slot.meetingOutcome === 'REGISTERED' ? 'Kayıt Oldu' : slot.meetingOutcome === 'INTERESTED' ? 'İlgileniyor' : 'Vazgeçti'}
            </span>
          </div>
        )}
      </div>
    </PanelModal>
  );
}
