import { useState } from 'react';
import { canOperatePanelActions } from './panelPermissions';
import { formatDateTime } from './panelTypes';
import {
  PanelFeedbackMessage,
  PanelPersonDrawer,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
  panelTitleClassName,
} from './panelUi';

type ApplicationFieldEntry = { label?: string; value?: string };
type ApplicationNote = { id: string; note?: string | null; created_by?: string | null; created_at?: string | null };

type ApplicationDetail = {
  id: string;
  form_type: string;
  form_subject?: string;
  received_at?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  form_source?: string | null;
  field_entries?: ApplicationFieldEntry[];
  crm_status_ui?: 'TRANSFERRED' | 'NOT_TRANSFERRED';
  crm_transferred_at?: string | null;
  crm_last_error?: string | null;
  notes?: ApplicationNote[];
};

const FORM_TYPE_LABELS: Record<string, string> = {
  CALLBACK: 'Geri Arama',
  FREE_TRIAL: 'Ücretsiz Deneme',
  LEVEL_ASSESSMENT: 'Seviye Tespit',
  FORMAT_CONSULTATION: 'Eğitim Formatı',
  CORPORATE_OFFER: 'Kurumsal Teklif',
};

const FORM_TYPE_COLORS: Record<string, string> = {
  CALLBACK: 'border-[#E4D6C1] bg-[#FBF5EB] text-[#7A5E39]',
  FREE_TRIAL: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  LEVEL_ASSESSMENT: 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]',
  FORMAT_CONSULTATION: 'border-[#D8CFBE] bg-[#FBF6EE] text-[#6C675E]',
  CORPORATE_OFFER: 'border-[#C59292] bg-[#FFF7F5] text-[#8A433C]',
};

export default function ApplicationPersonDrawer({
  open,
  onClose,
  detail,
  role,
  onCrmPush,
  onAddNote,
}: {
  open: boolean;
  onClose: () => void;
  detail: ApplicationDetail | null;
  role?: string;
  onCrmPush?: (id: string) => void;
  onAddNote?: (id: string, note: string) => void;
}) {
  const canOperate = canOperatePanelActions(role);
  const [newNote, setNewNote] = useState('');
  const [noteMessage, setNoteMessage] = useState('');

  if (!detail) return null;

  const formLabel = FORM_TYPE_LABELS[detail.form_type] || detail.form_type;
  const formColor = FORM_TYPE_COLORS[detail.form_type] || 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]';
  const isCrmTransferred = detail.crm_status_ui === 'TRANSFERRED';

  const handleAddNote = () => {
    if (!newNote.trim() || !onAddNote) return;
    onAddNote(detail.id, newNote.trim());
    setNewNote('');
    setNoteMessage('Not eklendi.');
  };

  return (
    <PanelPersonDrawer open={open} onClose={onClose} title="Başvuru Detayı">
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase tracking-[0.12em] ${formColor}`}>
              {formLabel}
            </span>
          </div>
          <h3 className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[20px] text-[#1B2B24]">
            {detail.full_name || 'İsimsiz Başvuru'}
          </h3>
          <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
            {formatDateTime(detail.received_at)}
          </p>
        </div>

        {/* Contact info */}
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>İletişim Bilgileri</p>
          <div className="mt-3 space-y-2">
            {detail.phone && (
              <div className="flex items-center gap-2">
                <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Telefon:</span>
                <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{detail.phone}</span>
              </div>
            )}
            {detail.email && (
              <div className="flex items-center gap-2">
                <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">E-posta:</span>
                <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{detail.email}</span>
              </div>
            )}
            {detail.form_source && (
              <div className="flex items-center gap-2">
                <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Kaynak:</span>
                <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{detail.form_source}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form details */}
        {detail.field_entries && detail.field_entries.length > 0 && (
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Form Detayları</p>
            <div className="mt-3 divide-y divide-[#ECE2D5]">
              {detail.field_entries.map((entry, i) => (
                <div key={`${entry.label}-${i}`} className="flex justify-between gap-3 py-2">
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{entry.label || '-'}</span>
                  <span className="text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">{entry.value || '-'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CRM status */}
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>CRM Durumu</p>
          <div className="mt-3 flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${
              isCrmTransferred ? 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]'
            }`}>
              {isCrmTransferred ? 'Aktarıldı' : 'Bekliyor'}
            </span>
            {isCrmTransferred && detail.crm_transferred_at && (
              <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">
                {formatDateTime(detail.crm_transferred_at)}
              </span>
            )}
          </div>
          {detail.crm_last_error && (
            <p className="mt-2 rounded-[12px] border border-[#E7D2CD] bg-[#FFF8F6] px-3 py-1.5 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#875349]">
              Son hata: {detail.crm_last_error}
            </p>
          )}
          {canOperate && !isCrmTransferred && onCrmPush && (
            <button type="button" onClick={() => onCrmPush(detail.id)} className={`mt-3 ${panelPrimaryButtonClassName}`}>
              CRM'e Aktar
            </button>
          )}
        </div>

        {/* Notes */}
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Operatör Notları</p>
          {noteMessage && <PanelFeedbackMessage tone="success" className="mt-2">{noteMessage}</PanelFeedbackMessage>}

          {canOperate && (
            <div className="mt-3 flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Not ekle..."
                className={`flex-1 ${panelCompactInputClassName}`}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
              />
              <button type="button" onClick={handleAddNote} disabled={!newNote.trim()} className={panelSecondaryButtonClassName}>
                Ekle
              </button>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(detail.notes || []).length === 0 ? (
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8B8172]">Henüz not eklenmemiş.</p>
            ) : (
              (detail.notes || []).map((note) => (
                <div key={note.id} className="rounded-[14px] border border-[#ECE2D5] bg-[#FFFCF8] px-3 py-2">
                  <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">{note.note}</p>
                  <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">
                    {note.created_by || 'Sistem'} — {formatDateTime(note.created_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PanelPersonDrawer>
  );
}
