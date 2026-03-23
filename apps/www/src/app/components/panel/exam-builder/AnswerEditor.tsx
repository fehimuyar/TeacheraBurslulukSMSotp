import type { AnswerOption, AnswerType } from './examBuilderTypes';
import {
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelSecondaryButtonClassName,
  panelSoftCardClassName,
} from '../panelUi';

export default function AnswerEditor({
  answerType,
  answers,
  onAnswersChange,
  onAnswerTypeChange,
}: {
  answerType: AnswerType;
  answers: AnswerOption[];
  onAnswersChange: (answers: AnswerOption[]) => void;
  onAnswerTypeChange: (type: AnswerType) => void;
}) {
  const ANSWER_TYPES: Array<{ value: AnswerType; label: string }> = [
    { value: 'MULTIPLE_CHOICE', label: 'Çoktan Seçmeli' },
    { value: 'AUDIO_RECORDING', label: 'Ses Kaydı' },
    { value: 'VISUAL', label: 'Görsel' },
    { value: 'TEXT', label: 'Metin' },
  ];

  const updateAnswer = (id: string, updates: Partial<AnswerOption>) => {
    onAnswersChange(answers.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const setCorrect = (id: string) => {
    onAnswersChange(answers.map((a) => ({ ...a, isCorrect: a.id === id })));
  };

  const addAnswer = () => {
    const labels = 'ABCDEFGHIJ';
    const nextLabel = labels[answers.length] || `${answers.length + 1}`;
    onAnswersChange([...answers, { id: `a_${Date.now()}`, label: nextLabel, content: '', isCorrect: false, mediaUrl: null }]);
  };

  const removeAnswer = (id: string) => {
    if (answers.length <= 2) return;
    onAnswersChange(answers.filter((a) => a.id !== id));
  };

  return (
    <div className={panelSoftCardClassName}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={panelEyebrowClassName}>Cevap Türü</p>
        <select
          value={answerType}
          onChange={(e) => onAnswerTypeChange(e.target.value as AnswerType)}
          className={`w-[180px] ${panelCompactInputClassName}`}
        >
          {ANSWER_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
        </select>
      </div>

      {answerType === 'MULTIPLE_CHOICE' && (
        <div className="mt-3 space-y-2">
          {answers.map((answer) => (
            <div key={answer.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrect(answer.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] transition ${
                  answer.isCorrect ? 'border-[#2C5447] bg-[#2C5447] text-white' : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53] hover:border-[#BFAE95]'
                }`}
                title={answer.isCorrect ? 'Doğru cevap' : 'Doğru olarak işaretle'}
              >
                {answer.label}
              </button>
              <input
                value={answer.content}
                onChange={(e) => updateAnswer(answer.id, { content: e.target.value })}
                placeholder={`${answer.label} şıkkı...`}
                className={`flex-1 ${panelCompactInputClassName}`}
              />
              {answers.length > 2 && (
                <button type="button" onClick={() => removeAnswer(answer.id)} className="rounded-full p-1 text-[#875349] transition hover:bg-[#FFF8F6]" title="Şıkkı kaldır">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          ))}
          {answers.length < 6 && (
            <button type="button" onClick={addAnswer} className={panelSecondaryButtonClassName}>+ Şık Ekle</button>
          )}
        </div>
      )}

      {answerType === 'AUDIO_RECORDING' && (
        <div className="mt-3">
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
            Aday bu soruda ses kaydı yapacak. Maksimum süreyi belirleyin.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Max süre (sn):</label>
            <input type="number" defaultValue={60} min={10} max={300} className={`w-[100px] ${panelCompactInputClassName}`} />
          </div>
        </div>
      )}

      {answerType === 'VISUAL' && (
        <div className="mt-3 space-y-2">
          {answers.map((answer) => (
            <div key={answer.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrect(answer.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-['Neutraface_2_Text:Demi',sans-serif] ${
                  answer.isCorrect ? 'border-[#2C5447] bg-[#2C5447] text-white' : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53]'
                }`}
              >
                {answer.label}
              </button>
              <input
                value={answer.mediaUrl || ''}
                onChange={(e) => updateAnswer(answer.id, { mediaUrl: e.target.value })}
                placeholder="Resim URL..."
                className={`flex-1 ${panelCompactInputClassName}`}
              />
            </div>
          ))}
        </div>
      )}

      {answerType === 'TEXT' && (
        <div className="mt-3">
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#5E665E]">
            Aday serbest metin cevap yazacak. Karakter limiti belirleyin.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <label className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Max karakter:</label>
            <input type="number" defaultValue={500} min={50} max={5000} className={`w-[100px] ${panelCompactInputClassName}`} />
          </div>
        </div>
      )}
    </div>
  );
}
