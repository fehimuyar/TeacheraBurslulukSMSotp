import { useState } from 'react';
import { canOperatePanelActions } from './panelPermissions';
import { formatDateTime } from './panelTypes';
import {
  PanelFeedbackMessage,
  PanelPersonDrawer,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from './panelUi';

type CandidateDetail = {
  candidate_id: string;
  application_no?: string | null;
  student_full_name?: string | null;
  parent_full_name?: string | null;
  parent_phone_e164?: string | null;
  grade?: number | null;
  school_name?: string | null;
  application_status?: string | null;
  credentials_sms_status?: string | null;
  first_login_at?: string | null;
  exam_status?: string | null;
  exam_started_at?: string | null;
  exam_submitted_at?: string | null;
  result_status?: string | null;
  result_score?: number | null;
  result_viewed_at?: string | null;
  placement_label?: string | null;
  cefr_band?: string | null;
  wa_result_status?: string | null;
  appointment_status?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
  advisor_name?: string | null;
  meeting_notes?: string | null;
  meeting_outcome?: string | null;
  registration_status?: string | null;
  crm_status?: string | null;
  operator_note?: string | null;
  created_at?: string | null;
};

type TimelineStep = { label: string; status: 'done' | 'active' | 'pending'; detail: string };

function buildTimeline(c: CandidateDetail): TimelineStep[] {
  const steps: TimelineStep[] = [];

  steps.push({
    label: 'Başvuru',
    status: c.application_no ? 'done' : 'pending',
    detail: c.created_at ? formatDateTime(c.created_at) : 'Bekleniyor',
  });

  steps.push({
    label: 'SMS Gönderim',
    status: c.credentials_sms_status === 'DELIVERED' || c.credentials_sms_status === 'SENT' ? 'done' : c.credentials_sms_status === 'QUEUED' ? 'active' : 'pending',
    detail: c.credentials_sms_status || 'Bekleniyor',
  });

  steps.push({
    label: 'İlk Giriş',
    status: c.first_login_at ? 'done' : 'pending',
    detail: c.first_login_at ? formatDateTime(c.first_login_at) : 'Bekleniyor',
  });

  steps.push({
    label: 'Sınav',
    status: c.exam_status === 'SUBMITTED' ? 'done' : c.exam_status === 'STARTED' ? 'active' : 'pending',
    detail: c.exam_submitted_at ? formatDateTime(c.exam_submitted_at) : c.exam_started_at ? `Başladı: ${formatDateTime(c.exam_started_at)}` : c.exam_status || 'Bekleniyor',
  });

  steps.push({
    label: 'Sonuç Görüntüleme',
    status: c.result_viewed_at ? 'done' : c.result_status === 'PUBLISHED' ? 'active' : 'pending',
    detail: c.result_viewed_at ? formatDateTime(c.result_viewed_at) : c.result_status || 'Bekleniyor',
  });

  const appointmentDetail = (() => {
    const parts: string[] = [];
    if (c.appointment_status === 'BOOKED') parts.push('Alındı');
    else if (c.appointment_status === 'ATTENDED') parts.push('Geldi');
    else if (c.appointment_status === 'NO_SHOW') parts.push('Gelmedi');
    else return 'Bekleniyor';
    if (c.appointment_date) parts.push(formatDateTime(c.appointment_date));
    if (c.advisor_name) parts.push(`(${c.advisor_name})`);
    return parts.join(' — ');
  })();

  steps.push({
    label: 'Randevu',
    status: c.appointment_status === 'ATTENDED' ? 'done' : c.appointment_status === 'BOOKED' ? 'active' : 'pending',
    detail: appointmentDetail,
  });

  steps.push({
    label: 'Kayıt',
    status: c.registration_status === 'REGISTERED' ? 'done' : 'pending',
    detail: c.registration_status === 'REGISTERED' ? 'Kayıt Oldu' : c.registration_status === 'CANCELLED' ? 'İptal' : 'Bekleniyor',
  });

  return steps;
}

const STEP_ICONS: Record<TimelineStep['status'], string> = {
  done: 'bg-[#2C5447] text-white',
  active: 'bg-[#FBF1D9] text-[#795A26] border border-[#D9C59C]',
  pending: 'bg-[#F0EBE3] text-[#8A7F71]',
};

export default function CandidatePersonDrawer({
  open,
  onClose,
  candidate,
  role,
  onSmsSend,
  onWaTrigger,
}: {
  open: boolean;
  onClose: () => void;
  candidate: CandidateDetail | null;
  role?: string;
  onSmsSend?: (id: string) => void;
  onWaTrigger?: (id: string) => void;
}) {
  const canOperate = canOperatePanelActions(role);
  const [message, setMessage] = useState('');

  if (!candidate) return null;

  const timeline = buildTimeline(candidate);
  const hasResult = candidate.result_score != null;

  return (
    <PanelPersonDrawer open={open} onClose={onClose} title="Aday Kartı">
      <div className="space-y-5">
        {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

        {/* Student info */}
        <div>
          <h3 className="font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] text-[#1B2B24]">
            {candidate.student_full_name || 'İsimsiz'}
          </h3>
          <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#5E665E]">
            {candidate.grade ? `${candidate.grade}. Sınıf` : ''}{candidate.school_name ? ` — ${candidate.school_name}` : ''}
          </p>
          {candidate.application_no && (
            <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">
              Başvuru No: {candidate.application_no}
            </p>
          )}
        </div>

        {/* Guardian */}
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Veli Bilgileri</p>
          <div className="mt-3 space-y-1.5">
            <div className="flex gap-2">
              <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ad:</span>
              <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{candidate.parent_full_name || '-'}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Telefon:</span>
              <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{candidate.parent_phone_e164 || '-'}</span>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Süreç Zaman Çizelgesi</p>
          <div className="mt-3 space-y-0">
            {timeline.map((step, i) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] ${STEP_ICONS[step.status]}`}>
                    {step.status === 'done' ? '\u2713' : i + 1}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className={`h-6 w-px ${step.status === 'done' ? 'bg-[#2C5447]' : 'bg-[#E4DBCF]'}`} />
                  )}
                </div>
                <div className="pb-3">
                  <p className={`font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] ${step.status === 'done' ? 'text-[#2C5447]' : step.status === 'active' ? 'text-[#795A26]' : 'text-[#8A7F71]'}`}>
                    {step.label}
                  </p>
                  <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#6C7269]">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Exam result */}
        {hasResult && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Sınav Sonucu</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Puan</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] text-[#1B2B24]">{candidate.result_score}</p>
              </div>
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Seviye</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[16px] text-[#1B2B24]">{candidate.placement_label || '-'}</p>
              </div>
              <div>
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">CEFR</p>
                <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[16px] text-[#1B2B24]">{candidate.cefr_band || '-'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Appointment details */}
        {candidate.appointment_status && candidate.appointment_status !== 'NOT_BOOKED' && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Randevu Bilgileri</p>
            <div className="mt-3 space-y-1.5">
              {candidate.appointment_date && (
                <div className="flex gap-2">
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Tarih:</span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{formatDateTime(candidate.appointment_date)}{candidate.appointment_time ? ` ${candidate.appointment_time}` : ''}</span>
                </div>
              )}
              {candidate.advisor_name && (
                <div className="flex gap-2">
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Danışman:</span>
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{candidate.advisor_name}</span>
                </div>
              )}
              {candidate.meeting_outcome && (
                <div className="flex gap-2">
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sonuç:</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
                    candidate.meeting_outcome === 'REGISTERED' ? 'border-[#BFD2C8] bg-[#2C5447] text-white' :
                    candidate.meeting_outcome === 'INTERESTED' ? 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' :
                    'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]'
                  }`}>
                    {candidate.meeting_outcome === 'REGISTERED' ? 'Kayıt Oldu' : candidate.meeting_outcome === 'INTERESTED' ? 'İlgileniyor' : 'Vazgeçti'}
                  </span>
                </div>
              )}
              {candidate.meeting_notes && (
                <div className="mt-2 rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2">
                  <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Görüşme Notu:</p>
                  <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">{candidate.meeting_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {canOperate && (
          <div className="flex flex-wrap gap-2">
            {onSmsSend && (
              <button type="button" onClick={() => { onSmsSend(candidate.candidate_id); setMessage('SMS gönderildi.'); }} className={panelSecondaryButtonClassName}>
                SMS Gönder
              </button>
            )}
            {onWaTrigger && (
              <button type="button" onClick={() => { onWaTrigger(candidate.candidate_id); setMessage('WhatsApp tetiklendi.'); }} className={panelPrimaryButtonClassName}>
                WA Tetikle
              </button>
            )}
          </div>
        )}
      </div>
    </PanelPersonDrawer>
  );
}
