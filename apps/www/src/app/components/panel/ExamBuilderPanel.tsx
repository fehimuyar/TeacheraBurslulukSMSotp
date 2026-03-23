import { useState } from 'react';
import type { ExamDefinition } from './exam-builder/examBuilderTypes';
import { createEmptyExam } from './exam-builder/examBuilderTypes';
import { MOCK_EXAMS } from './exam-builder/examBuilderMockData';
import ExamBuilderEditor from './exam-builder/ExamBuilderEditor';
import { formatDateTime } from './panelTypes';
import { canOperatePanelActions } from './panelPermissions';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
} from './panelUi';

type ExamView = 'list' | 'editor';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Taslak', className: 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]' },
  PUBLISHED: { label: 'Yayında', className: 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]' },
  ARCHIVED: { label: 'Arşiv', className: 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]' },
};

export default function ExamBuilderPanel({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const [exams, setExams] = useState<ExamDefinition[]>(MOCK_EXAMS);
  const [view, setView] = useState<ExamView>('list');
  const [editingExam, setEditingExam] = useState<ExamDefinition | null>(null);
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleCreate = () => {
    const newExam = createEmptyExam();
    setExams((prev) => [...prev, newExam]);
    setEditingExam(newExam);
    setView('editor');
  };

  const handleEdit = (exam: ExamDefinition) => {
    setEditingExam(exam);
    setView('editor');
  };

  const handleSave = (updated: ExamDefinition) => {
    setExams((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setMessage(`"${updated.name}" kaydedildi.`);
  };

  const handleDelete = (id: string) => {
    setExams((prev) => prev.filter((e) => e.id !== id));
    setMessage('Sınav silindi.');
    setDeleteTarget(null);
  };

  const handlePublish = (id: string) => {
    setExams((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'PUBLISHED' as const, updatedAt: new Date().toISOString() } : e)));
    setMessage('Sınav yayınlandı.');
  };

  if (view === 'editor' && editingExam) {
    return (
      <ExamBuilderEditor
        exam={editingExam}
        onBack={() => { setView('list'); setEditingExam(null); }}
        onSave={handleSave}
      />
    );
  }

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={panelEyebrowClassName}>Sistem</p>
            <h2 className={panelLargeTitleClassName}>Sınav Oluşturma</h2>
            <p className={panelDescriptionClassName}>Soru bankası oluşturun, sınavları yapılandırın ve yayınlayın.</p>
          </div>
          {canOperate && (
            <button type="button" onClick={handleCreate} className={panelPrimaryButtonClassName}>+ Yeni Sınav</button>
          )}
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <div className={panelTableContainerClassName} style={{ marginTop: 0 }}>
          <table className="min-w-[700px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Sınav Adı</th>
                <th className="px-3 py-2 text-right">Soru</th>
                <th className="px-3 py-2">Süre</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {exams.length === 0 ? (
                <tr><td colSpan={6}><PanelEmptyState message="Henüz sınav oluşturulmamış." /></td></tr>
              ) : (
                exams.map((exam) => {
                  const statusStyle = STATUS_STYLES[exam.status] || STATUS_STYLES.DRAFT;
                  return (
                    <tr key={exam.id} className="border-b border-[#F0E7DA]">
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{exam.name}</td>
                      <td className="px-3 py-2 text-right">{exam.questions.length}</td>
                      <td className="px-3 py-2">{Math.floor(exam.totalDurationSeconds / 60)} dk</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${statusStyle.className}`}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">{exam.startAt ? formatDateTime(exam.startAt) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => handleEdit(exam)} className={panelSmallButtonClassName}>
                            {exam.status === 'ARCHIVED' ? 'Görüntüle' : 'Düzenle'}
                          </button>
                          {canOperate && exam.status === 'DRAFT' && (
                            <button type="button" onClick={() => handlePublish(exam.id)} className={panelSecondaryButtonClassName}>Yayınla</button>
                          )}
                          {canOperate && exam.status !== 'PUBLISHED' && (
                            <button type="button" onClick={() => setDeleteTarget(exam.id)} className="rounded-[14px] border border-[#B78382] px-2 py-1 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase text-[#875349] transition hover:bg-[#FFF8F6]">Sil</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelConfirmDialog open={deleteTarget !== null} onCancel={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && handleDelete(deleteTarget)} title="Sınavı Sil" description="Bu sınavı ve tüm sorularını silmek istediğinize emin misiniz?" confirmLabel="Sil" danger />
    </div>
  );
}
