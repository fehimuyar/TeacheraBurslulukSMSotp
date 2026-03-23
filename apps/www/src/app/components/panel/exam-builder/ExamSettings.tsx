import type { ExamDefinition } from './examBuilderTypes';
import {
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelInputClassName,
  panelSoftCardClassName,
  panelTitleClassName,
} from '../panelUi';

export default function ExamSettings({
  exam,
  onChange,
}: {
  exam: ExamDefinition;
  onChange: (updated: ExamDefinition) => void;
}) {
  const update = (partial: Partial<ExamDefinition>) => onChange({ ...exam, ...partial });
  const durationMinutes = Math.floor(exam.totalDurationSeconds / 60);

  return (
    <div className={panelSoftCardClassName}>
      <p className={panelEyebrowClassName}>Sınav Ayarları</p>
      <h3 className={panelTitleClassName} style={{ marginTop: 4 }}>Zamanlama & Güvenlik</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Süre (dakika)</label>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => update({ totalDurationSeconds: (Number(e.target.value) || 40) * 60 })}
            min={5}
            max={180}
            className={`mt-1 w-full ${panelInputClassName}`}
          />
        </div>

        <div>
          <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınav Adı</label>
          <input
            value={exam.name}
            onChange={(e) => update({ name: e.target.value })}
            className={`mt-1 w-full ${panelInputClassName}`}
          />
        </div>

        <div>
          <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Başlangıç Tarihi</label>
          <input
            type="datetime-local"
            value={exam.startAt ? exam.startAt.slice(0, 16) : ''}
            onChange={(e) => update({ startAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className={`mt-1 w-full ${panelInputClassName}`}
          />
        </div>

        <div>
          <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Bitiş Tarihi</label>
          <input
            type="datetime-local"
            value={exam.endAt ? exam.endAt.slice(0, 16) : ''}
            onChange={(e) => update({ endAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className={`mt-1 w-full ${panelInputClassName}`}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex cursor-pointer items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">
          <input type="checkbox" checked={exam.randomizeQuestions} onChange={(e) => update({ randomizeQuestions: e.target.checked })} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
          Soru sırasını karıştır
        </label>
        <label className="flex cursor-pointer items-center gap-2 font-['Neutraface_2_Text:Book',sans-serif] text-[13px] text-[#33463E]">
          <input type="checkbox" checked={exam.shuffleAnswers} onChange={(e) => update({ shuffleAnswers: e.target.checked })} className="h-4 w-4 rounded border-[#DDD4C6] accent-[#2C5447]" />
          Cevap şıklarını karıştır
        </label>
      </div>
    </div>
  );
}
