import type { AnswerType, QuestionContentType, QuestionDefinition } from './examBuilderTypes';
import RichTextToolbar from './RichTextToolbar';
import AnswerEditor from './AnswerEditor';
import {
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelSoftCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from '../panelUi';

const CONTENT_TYPES: Array<{ value: QuestionContentType; label: string }> = [
  { value: 'RICH_TEXT', label: 'Metin' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'AUDIO', label: 'Ses' },
];

export default function QuestionEditor({
  question,
  onChange,
}: {
  question: QuestionDefinition;
  onChange: (updated: QuestionDefinition) => void;
}) {
  const update = (partial: Partial<QuestionDefinition>) => onChange({ ...question, ...partial });

  return (
    <div className="space-y-4">
      <section className={panelSurfaceClassName}>
        {/* Content type selector */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Soru #{question.order}</p>
            <h3 className={panelTitleClassName} style={{ marginTop: 4 }}>Soru İçeriği</h3>
          </div>
          <div className="flex gap-1">
            {CONTENT_TYPES.map((ct) => (
              <button
                key={ct.value}
                type="button"
                onClick={() => update({ contentType: ct.value })}
                className={`rounded-[14px] border px-3 py-1.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.12em] transition ${
                  question.contentType === ct.value
                    ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]'
                    : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53] hover:border-[#BFAE95]'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content area based on type */}
        <div className="mt-4">
          {question.contentType === 'RICH_TEXT' && (
            <RichTextToolbar
              content={question.contentHtml}
              onChange={(html) => update({ contentHtml: html })}
            />
          )}

          {question.contentType === 'VIDEO' && (
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>Video Soru</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Video URL veya Dosya Yolu</label>
                  <input
                    value={question.videoUrl}
                    onChange={(e) => update({ videoUrl: e.target.value })}
                    placeholder="https://... veya dosya yükle"
                    className={`mt-1 w-full ${panelInputClassName}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">İzleme limiti:</label>
                  <input
                    type="number"
                    value={question.videoViewLimit ?? ''}
                    onChange={(e) => update({ videoViewLimit: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Sınırsız"
                    min={1}
                    max={10}
                    className={`w-[100px] ${panelCompactInputClassName}`}
                  />
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">kez</span>
                </div>
                <div>
                  <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ek metin (opsiyonel)</label>
                  <RichTextToolbar content={question.contentHtml} onChange={(html) => update({ contentHtml: html })} placeholder="Video ile birlikte gösterilecek metin..." />
                </div>
              </div>
            </div>
          )}

          {question.contentType === 'AUDIO' && (
            <div className={panelSoftCardClassName}>
              <p className={panelEyebrowClassName}>Ses Soru</p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ses Dosyası URL</label>
                  <input
                    value={question.audioUrl}
                    onChange={(e) => update({ audioUrl: e.target.value })}
                    placeholder="Ses dosyası URL veya yükle"
                    className={`mt-1 w-full ${panelInputClassName}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Dinleme limiti:</label>
                  <input
                    type="number"
                    value={question.audioListenLimit ?? ''}
                    onChange={(e) => update({ audioListenLimit: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Sınırsız"
                    min={1}
                    max={10}
                    className={`w-[100px] ${panelCompactInputClassName}`}
                  />
                  <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[11px] text-[#8A7F71]">kez</span>
                </div>
                <div>
                  <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Ek metin (opsiyonel)</label>
                  <RichTextToolbar content={question.contentHtml} onChange={(html) => update({ contentHtml: html })} placeholder="Ses ile birlikte gösterilecek metin..." />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Answer editor */}
      <AnswerEditor
        answerType={question.answerType}
        answers={question.answers}
        onAnswersChange={(answers) => update({ answers })}
        onAnswerTypeChange={(type) => update({ answerType: type })}
      />

      {/* Question settings */}
      <div className={panelSoftCardClassName}>
        <p className={panelEyebrowClassName}>Soru Ayarları</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Soru Süresi (saniye, opsiyonel)</label>
            <input
              type="number"
              value={question.durationSeconds ?? ''}
              onChange={(e) => update({ durationSeconds: e.target.value ? Number(e.target.value) : null })}
              placeholder="Sınav süresinden düşer"
              min={10}
              className={`mt-1 w-full ${panelCompactInputClassName}`}
            />
          </div>
          <div>
            <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Puan Ağırlığı</label>
            <input
              type="number"
              value={question.weight}
              onChange={(e) => update({ weight: Number(e.target.value) || 1 })}
              min={0.1}
              step={0.1}
              className={`mt-1 w-full ${panelCompactInputClassName}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
