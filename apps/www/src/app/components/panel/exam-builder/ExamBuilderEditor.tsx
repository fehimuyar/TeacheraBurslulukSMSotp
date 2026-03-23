import { useState } from 'react';
import type { ExamDefinition, QuestionContentType, QuestionDefinition } from './examBuilderTypes';
import { createEmptyQuestion } from './examBuilderTypes';
import QuestionEditor from './QuestionEditor';
import ExamSettings from './ExamSettings';
import ExamPreview from './ExamPreview';
import {
  PanelConfirmDialog,
  PanelFeedbackMessage,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
} from '../panelUi';

export default function ExamBuilderEditor({
  exam: initialExam,
  onBack,
  onSave,
}: {
  exam: ExamDefinition;
  onBack: () => void;
  onSave: (exam: ExamDefinition) => void;
}) {
  const [exam, setExam] = useState<ExamDefinition>(initialExam);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(exam.questions[0]?.id || null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);

  const selectedQuestion = exam.questions.find((q) => q.id === selectedQuestionId);

  const updateQuestion = (updated: QuestionDefinition) => {
    setExam((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === updated.id ? updated : q)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addQuestion = (contentType: QuestionContentType) => {
    const newQ = createEmptyQuestion(exam.questions.length + 1, contentType);
    setExam((prev) => ({ ...prev, questions: [...prev.questions, newQ], updatedAt: new Date().toISOString() }));
    setSelectedQuestionId(newQ.id);
  };

  const removeQuestion = (id: string) => {
    setExam((prev) => {
      const filtered = prev.questions.filter((q) => q.id !== id).map((q, i) => ({ ...q, order: i + 1 }));
      return { ...prev, questions: filtered, updatedAt: new Date().toISOString() };
    });
    if (selectedQuestionId === id) setSelectedQuestionId(exam.questions.find((q) => q.id !== id)?.id || null);
    setDeleteQuestionId(null);
  };

  const handleDragStart = (id: string) => setDragSourceId(id);
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd = () => { setDragOverId(null); setDragSourceId(null); };
  const handleDrop = (targetId: string) => {
    if (!dragSourceId || dragSourceId === targetId) { setDragOverId(null); return; }
    setExam((prev) => {
      const questions = [...prev.questions];
      const srcIdx = questions.findIndex((q) => q.id === dragSourceId);
      const tgtIdx = questions.findIndex((q) => q.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return prev;
      const [moved] = questions.splice(srcIdx, 1);
      questions.splice(tgtIdx, 0, moved);
      return { ...prev, questions: questions.map((q, i) => ({ ...q, order: i + 1 })), updatedAt: new Date().toISOString() };
    });
    setDragOverId(null);
    setDragSourceId(null);
  };

  const handleSave = () => { onSave(exam); setMessage('Sınav kaydedildi.'); };

  return (
    <div className="space-y-4">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* Top bar */}
      <div className={`${panelSurfaceClassName} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className={panelSecondaryButtonClassName}>← Geri</button>
          <div>
            <p className={panelEyebrowClassName}>Sınav Düzenleyici</p>
            <p className="font-['Neutraface_2_Text:Bold',sans-serif] text-[18px] text-[#1B2B24]">{exam.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowSettings(!showSettings)} className={panelSecondaryButtonClassName}>Ayarlar</button>
          <button type="button" onClick={() => setShowPreview(true)} className={panelSecondaryButtonClassName}>Önizle</button>
          <button type="button" onClick={handleSave} className={panelPrimaryButtonClassName}>Kaydet</button>
        </div>
      </div>

      {/* Settings (collapsible) */}
      {showSettings && <ExamSettings exam={exam} onChange={setExam} />}

      {/* Main editor: sidebar + content */}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Question sidebar */}
        <div className={panelSurfaceClassName}>
          <p className={panelEyebrowClassName}>Sorular ({exam.questions.length})</p>
          <div className="mt-3 space-y-1">
            {exam.questions.map((q) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(q.id)}
                onDragOver={(e) => handleDragOver(e, q.id)}
                onDragEnd={handleDragEnd}
                onDrop={() => handleDrop(q.id)}
                className={`flex cursor-grab items-center justify-between gap-2 rounded-[14px] border px-3 py-2 transition active:cursor-grabbing ${
                  selectedQuestionId === q.id
                    ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]'
                    : dragOverId === q.id
                      ? 'border-[#9F865C] bg-[#FBF1D9]'
                      : 'border-[#ECE2D5] bg-[#FFFCF8] text-[#33463E] hover:border-[#DDD3C5]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedQuestionId(q.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E4DBCF] font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] text-[#5E665E]">
                    {q.order}
                  </span>
                  <span className="truncate font-['Neutraface_2_Text:Book',sans-serif] text-[12px]">
                    {q.contentType === 'VIDEO' ? 'Video Soru' : q.contentType === 'AUDIO' ? 'Ses Soru' : (q.contentHtml.replace(/<[^>]*>/g, '').slice(0, 30) || 'Boş soru')}
                  </span>
                </button>
                <button type="button" onClick={() => setDeleteQuestionId(q.id)} aria-label={`${q.order}. soruyu sil`} className="shrink-0 rounded p-0.5 text-[#875349] opacity-50 transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[#2C5447] focus-visible:opacity-100" title="Soruyu sil">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            <button type="button" onClick={() => addQuestion('RICH_TEXT')} className={panelSmallButtonClassName}>+ Metin</button>
            <button type="button" onClick={() => addQuestion('VIDEO')} className={panelSmallButtonClassName}>+ Video</button>
            <button type="button" onClick={() => addQuestion('AUDIO')} className={panelSmallButtonClassName}>+ Ses</button>
          </div>

          <p className="mt-3 font-['Neutraface_2_Text:Book',sans-serif] text-[10px] text-[#8A7F71]">
            Sürükle-bırak ile sıra değiştir
          </p>
        </div>

        {/* Question editor */}
        <div>
          {selectedQuestion ? (
            <QuestionEditor question={selectedQuestion} onChange={updateQuestion} />
          ) : (
            <div className={`${panelSurfaceClassName} flex items-center justify-center py-16`}>
              <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#8B8172]">Düzenlemek için sol panelden bir soru seçin.</p>
            </div>
          )}
        </div>
      </div>

      <ExamPreview open={showPreview} onClose={() => setShowPreview(false)} exam={exam} />
      <PanelConfirmDialog
        open={deleteQuestionId !== null}
        onCancel={() => setDeleteQuestionId(null)}
        onConfirm={() => deleteQuestionId && removeQuestion(deleteQuestionId)}
        title="Soruyu Sil"
        description="Bu soruyu silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
        confirmLabel="Sil"
        danger
      />
    </div>
  );
}
