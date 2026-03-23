import { useEffect, useState } from 'react';
import {
  PanelFeedbackMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from './panelUi';

type ResultRow = {
  candidate_id: string;
  student_full_name?: string | null;
  grade?: number | null;
  school_name?: string | null;
  result_score?: number | null;
  result_percentage?: number | null;
  placement_label?: string | null;
  cefr_band?: string | null;
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
  onSave: (candidateId: string, updates: { score: number; placementLabel: string; cefrBand: string }, otpCode: string) => void;
}) {
  const [score, setScore] = useState(0);
  const [placementLabel, setPlacementLabel] = useState('');
  const [cefrBand, setCefrBand] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (result && open) {
      setScore(result.result_score ?? 0);
      setPlacementLabel(result.placement_label ?? '');
      setCefrBand(result.cefr_band ?? '');
      setOtpCode('');
      setError('');
    }
  }, [result, open]);

  const handleSubmit = () => {
    if (otpCode.trim().length !== 6) {
      setError('6 haneli OTP kodu gereklidir.');
      return;
    }
    if (!result) return;
    onSave(result.candidate_id, { score, placementLabel, cefrBand }, otpCode);
  };

  if (!result) return null;

  return (
    <PanelModal open={open} onClose={onClose} title="Sonuç Düzenle" maxWidth="560px">
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

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Puan</label>
            <input type="number" value={score} onChange={(e) => setScore(Number(e.target.value) || 0)} min={0} max={100} className={`mt-1 w-full ${panelInputClassName}`} />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Seviye</label>
            <input value={placementLabel} onChange={(e) => setPlacementLabel(e.target.value)} placeholder="Burslu, Yarı Burslu..." className={`mt-1 w-full ${panelInputClassName}`} />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">CEFR</label>
            <select value={cefrBand} onChange={(e) => setCefrBand(e.target.value)} className={`mt-1 w-full ${panelInputClassName}`}>
              <option value="">Seçin</option>
              <option value="A1">A1</option><option value="A2">A2</option>
              <option value="B1">B1</option><option value="B2">B2</option>
              <option value="C1">C1</option><option value="C2">C2</option>
            </select>
          </div>
        </div>

        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>OTP Doğrulama</p>
          <p className={`mt-1 ${panelDescriptionClassName}`} style={{ marginTop: 4 }}>
            Sonuç değişikliği kritik bir işlemdir. Devam etmek için 6 haneli OTP kodunuzu girin.
          </p>
          <input
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 haneli OTP kodu"
            className={`mt-3 w-full ${panelCompactInputClassName}`}
            maxLength={6}
          />
        </div>

        {error && <PanelFeedbackMessage tone="error">{error}</PanelFeedbackMessage>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={panelSecondaryButtonClassName}>Vazgeç</button>
          <button type="button" onClick={handleSubmit} className={panelPrimaryButtonClassName}>Kaydet (OTP ile)</button>
        </div>
      </div>
    </PanelModal>
  );
}
