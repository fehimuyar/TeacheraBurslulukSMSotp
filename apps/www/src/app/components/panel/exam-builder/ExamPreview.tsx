import type { ExamDefinition } from './examBuilderTypes';
import {
  PanelModal,
  panelEyebrowClassName,
  panelSoftCardClassName,
  panelTitleClassName,
} from '../panelUi';

export default function ExamPreview({
  open,
  onClose,
  exam,
}: {
  open: boolean;
  onClose: () => void;
  exam: ExamDefinition;
}) {
  return (
    <PanelModal open={open} onClose={onClose} title={`Önizleme: ${exam.name}`} maxWidth="720px">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className={panelSoftCardClassName}>
          <p className={panelEyebrowClassName}>Sınav Bilgisi</p>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Soru Sayısı</p>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{exam.questions.length}</p>
            </div>
            <div>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Süre</p>
              <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{Math.floor(exam.totalDurationSeconds / 60)} dk</p>
            </div>
            <div>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#7A7063]">Güvenlik</p>
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[13px] text-[#1B2B24]">
                {exam.randomizeQuestions ? 'Karışık soru' : 'Sabit sıra'}
                {exam.shuffleAnswers ? ' + Karışık şık' : ''}
              </p>
            </div>
          </div>
        </div>

        {exam.questions.map((q, i) => (
          <div key={q.id} className={panelSoftCardClassName}>
            <p className={panelEyebrowClassName}>Soru {i + 1} / {exam.questions.length}</p>
            {q.contentType === 'RICH_TEXT' && q.contentHtml && (
              <div className="mt-2 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] leading-[1.7] text-[#1C2A24]" dangerouslySetInnerHTML={{ __html: q.contentHtml }} />
            )}
            {q.contentType === 'VIDEO' && q.videoUrl && (
              <div className="mt-2">
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Video: {q.videoUrl}</p>
                {q.videoViewLimit && <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Max izleme: {q.videoViewLimit} kez</p>}
              </div>
            )}
            {q.contentType === 'AUDIO' && q.audioUrl && (
              <div className="mt-2">
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ses: {q.audioUrl}</p>
                {q.audioListenLimit && <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Max dinleme: {q.audioListenLimit} kez</p>}
              </div>
            )}

            {q.answerType === 'MULTIPLE_CHOICE' && (
              <div className="mt-3 space-y-1.5">
                {q.answers.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 ${
                      a.isCorrect ? 'border-[#BFD2C8] bg-[#EEF6F0]' : 'border-[#ECE2D5] bg-[#FFFCF8]'
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] ${
                      a.isCorrect ? 'bg-[#2C5447] text-white' : 'bg-[#F0EBE3] text-[#7A7063]'
                    }`}>
                      {a.label}
                    </span>
                    <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#1B2B24]">{a.content || '(boş)'}</span>
                    {a.isCorrect && <span className="ml-auto font-['Neutraface_2_Text:Demi',sans-serif] text-[10px] text-[#2C5447]">DOĞRU</span>}
                  </div>
                ))}
              </div>
            )}

            {q.answerType === 'TEXT' && (
              <div className="mt-3 rounded-[14px] border border-dashed border-[#DDD3C5] bg-[#FBF7F0] px-3 py-4 text-center">
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">Aday serbest metin cevap yazacak</p>
              </div>
            )}

            {q.answerType === 'AUDIO_RECORDING' && (
              <div className="mt-3 rounded-[14px] border border-dashed border-[#DDD3C5] bg-[#FBF7F0] px-3 py-4 text-center">
                <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">Aday ses kaydı yapacak</p>
              </div>
            )}

            <div className="mt-2 flex gap-3">
              {q.durationSeconds && <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Süre: {q.durationSeconds}sn</p>}
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">Ağırlık: {q.weight}</p>
            </div>
          </div>
        ))}
      </div>
    </PanelModal>
  );
}
