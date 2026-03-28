import { useEffect, useState } from 'react';
import {
  PanelFeedbackMessage,
  PanelModal,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from './panelUi';

type ResultRow = {
  attempt_id: string;
  student_full_name?: string | null;
  grade?: number | null;
  school_name?: string | null;
  objective_score_80?: number | null;
  speaking_score_20?: number | null;
  final_score_100?: number | null;
  speaking_status?: string | null;
};

export default function ResultEditModal({
  open,
  onClose,
  result,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  result: ResultRow | null;
  onSave: (attemptId: string, updates: { speakingScore20: number; reviewNote: string }) => void;
}) {
  const [speakingScore20, setSpeakingScore20] = useState(0);
  const [reviewNote, setReviewNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (result && open) {
      setSpeakingScore20(Number(result.speaking_score_20 || 0));
      setReviewNote('');
      setError('');
    }
  }, [result, open]);

  const handleSubmit = () => {
    if (!result) return;
    if (speakingScore20 < 0 || speakingScore20 > 20) {
      setError('Speaking puani 0 ile 20 arasinda olmalidir.');
      return;
    }
    onSave(result.attempt_id, {
      speakingScore20: Number(speakingScore20),
      reviewNote: reviewNote.trim(),
    });
  };

  if (!result) return null;

  const objectiveScore80 = Number(result.objective_score_80 || 0);
  const projectedTotal = Math.max(0, Math.min(100, Number(objectiveScore80 + Number(speakingScore20 || 0))));

  return (
    <PanelModal open={open} onClose={onClose} title="Speaking Puanı Gir" maxWidth="620px">
      <div className="space-y-4">
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Aday Bilgisi</p>
          <p className="mt-2 font-['Neutraface_2_Text:Bold',sans-serif] text-[16px] text-[#1B2B24]">
            {result.student_full_name || 'İsimsiz'}
          </p>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
            {result.grade ? `${result.grade}. Sınıf` : ''}{result.school_name ? ` — ${result.school_name}` : ''}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Objective / 80</p>
            <p className="mt-2 text-[22px] font-['Neutraface_2_Text:Bold',sans-serif] text-[#1B2B24]">{objectiveScore80}</p>
          </div>
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Speaking / 20</p>
            <input
              type="number"
              min={0}
              max={20}
              step={0.01}
              value={speakingScore20}
              onChange={(event) => setSpeakingScore20(Number(event.target.value) || 0)}
              className={`mt-2 w-full ${panelInputClassName}`}
            />
          </div>
          <div className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Projeksiyon / 100</p>
            <p className="mt-2 text-[22px] font-['Neutraface_2_Text:Bold',sans-serif] text-[#1B2B24]">{projectedTotal.toFixed(2)}</p>
          </div>
        </div>

        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Not</p>
          <p className={`mt-1 ${panelDescriptionClassName}`}>Ops notu opsiyoneldir. Ranking ve burs etiketi kayıt sonrası otomatik hesaplanır.</p>
          <textarea
            rows={4}
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="İsteğe bağlı yorum..."
            className="mt-3 w-full rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] px-3 py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1C2A24] outline-none transition focus:border-[#9F865C] focus:bg-white focus:ring-4 focus:ring-[#EEE3CC]"
          />
        </div>

        {error ? <PanelFeedbackMessage tone="error">{error}</PanelFeedbackMessage> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={panelSecondaryButtonClassName}>Vazgeç</button>
          <button type="button" onClick={handleSubmit} className={panelPrimaryButtonClassName}>Speaking Puanını Kaydet</button>
        </div>
      </div>
    </PanelModal>
  );
}
