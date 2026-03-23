import { useState } from 'react';
import { formatNumber } from './panelTypes';
import {
  PanelFeedbackMessage,
  PanelModal,
  panelCompactInputClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from './panelUi';

export default function BulkSmsResultModal({
  open,
  onClose,
  totalCandidates,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  totalCandidates: number;
  onSend: (otpCode: string) => void;
}) {
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (otpCode.trim().length !== 6) {
      setError('6 haneli OTP kodu gereklidir.');
      return;
    }
    onSend(otpCode);
  };

  return (
    <PanelModal open={open} onClose={onClose} title="Toplu SMS ile Sonuç Duyuru" maxWidth="520px">
      <div className="space-y-4">
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Gönderim Özeti</p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Alıcı Sayısı</p>
              <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(totalCandidates)}</p>
            </div>
            <div>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Mesaj Türü</p>
              <p className="mt-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[14px] text-[#1B2B24]">Sınav Sonucu Duyuru</p>
            </div>
          </div>
          <p className={`mt-3 ${panelDescriptionClassName}`} style={{ marginTop: 8 }}>
            Sonucu yayınlanmış tüm adaylara SMS ile sonuç bilgisi gönderilecektir.
            Bu işlem geri alınamaz.
          </p>
        </div>

        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>OTP Doğrulama</p>
          <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">
            Toplu mesaj gönderimi kritik bir işlemdir. OTP kodunuzu girin.
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
          <button type="button" onClick={handleSubmit} className={panelPrimaryButtonClassName}>
            {formatNumber(totalCandidates)} Kişiye SMS Gönder
          </button>
        </div>
      </div>
    </PanelModal>
  );
}
