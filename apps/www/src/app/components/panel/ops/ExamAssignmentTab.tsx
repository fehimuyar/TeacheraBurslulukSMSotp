import { useState } from 'react';
import { canOperatePanelActions, isReadOnlyPanelRole } from '../panelPermissions';
import { formatDateTime } from '../panelTypes';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelEyebrowClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
} from '../panelUi';

type ExamDefinitionMock = { id: string; name: string; status: 'DRAFT' | 'PUBLISHED'; questionCount: number; durationMinutes: number };
type ExamAssignment = { id: string; examId: string; examName: string; grades: number[]; assignedAt: string };

const MOCK_EXAMS: ExamDefinitionMock[] = [
  { id: '1', name: 'İngilizce A1-A2 (Kids)', status: 'PUBLISHED', questionCount: 40, durationMinutes: 40 },
  { id: '2', name: 'İngilizce B1-B2 (Teens)', status: 'PUBLISHED', questionCount: 40, durationMinutes: 40 },
  { id: '3', name: 'Almanca Genel', status: 'PUBLISHED', questionCount: 30, durationMinutes: 30 },
  { id: '4', name: 'Fransızca Başlangıç', status: 'DRAFT', questionCount: 25, durationMinutes: 25 },
];

const GRADES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const INITIAL_ASSIGNMENTS: ExamAssignment[] = [
  { id: 'a1', examId: '1', examName: 'İngilizce A1-A2 (Kids)', grades: [2, 3, 4, 5], assignedAt: '2026-03-20T10:00:00Z' },
  { id: 'a2', examId: '2', examName: 'İngilizce B1-B2 (Teens)', grades: [6, 7, 8], assignedAt: '2026-03-20T10:05:00Z' },
  { id: 'a3', examId: '3', examName: 'Almanca Genel', grades: [9, 10, 11], assignedAt: '2026-03-20T10:10:00Z' },
];

export default function ExamAssignmentTab({ role }: { role?: string }) {
  const canOperate = canOperatePanelActions(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedGrades, setSelectedGrades] = useState<Set<number>>(new Set());
  const [assignments, setAssignments] = useState<ExamAssignment[]>(INITIAL_ASSIGNMENTS);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const publishedExams = MOCK_EXAMS.filter((e) => e.status === 'PUBLISHED');

  const handleToggleGrade = (grade: number) => {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade); else next.add(grade);
      return next;
    });
  };

  const handleAssign = () => {
    if (!selectedExamId || selectedGrades.size === 0) {
      setErrorMessage('Lütfen bir sınav ve en az bir sınıf seçin.');
      return;
    }
    const exam = publishedExams.find((e) => e.id === selectedExamId);
    if (!exam) return;
    const newAssignment: ExamAssignment = {
      id: `a${Date.now()}`,
      examId: exam.id,
      examName: exam.name,
      grades: Array.from(selectedGrades).sort((a, b) => a - b),
      assignedAt: new Date().toISOString(),
    };
    setAssignments((prev) => [...prev, newAssignment]);
    setMessage(`${exam.name} sınavı ${newAssignment.grades.join(', ')}. sınıflara atandı.`);
    setErrorMessage('');
    setSelectedExamId('');
    setSelectedGrades(new Set());
  };

  const handleRemove = (id: string) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setMessage('Atama kaldırıldı.');
    setRemoveTarget(null);
  };

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod. Atama işlemleri yapılamaz.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}
      {errorMessage && <PanelFeedbackMessage tone="error">{errorMessage}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Yeni Atama</p>
        <h3 className={panelTitleClassName}>Sınav Atama</h3>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div>
              <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınav Seçin</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={!canOperate}
                className={`mt-1 w-full ${panelCompactInputClassName}`}
              >
                <option value="">-- Sınav seçin --</option>
                {publishedExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>{exam.name} ({exam.questionCount} soru, {exam.durationMinutes} dk)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Sınıflar</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRADES.map((grade) => (
                  <label
                    key={grade}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] transition ${
                      selectedGrades.has(grade) ? 'border-[#2C5447] bg-[#EEF6F0] text-[#2C5447]' : 'border-[#DDD3C5] bg-[#FFFDF9] text-[#485A53] hover:border-[#BFAE95]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGrades.has(grade)}
                      onChange={() => handleToggleGrade(grade)}
                      disabled={!canOperate}
                      className="sr-only"
                    />
                    {grade}. Sınıf
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-end">
            <button type="button" onClick={handleAssign} disabled={!canOperate} className={panelPrimaryButtonClassName}>
              Sınavı Ata
            </button>
          </div>
        </div>
      </section>

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Mevcut Atamalar</p>
        <div className={panelTableContainerClassName}>
          <table className="min-w-[600px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-3 py-2">Sınav</th>
                <th className="px-3 py-2">Sınıflar</th>
                <th className="px-3 py-2">Atama Tarihi</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={4}><PanelEmptyState message="Henüz sınav ataması yapılmamış." /></td></tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} className="border-b border-[#F0E7DA]">
                    <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{a.examName}</td>
                    <td className="px-3 py-2">{a.grades.map((g) => `${g}.`).join(', ')} sınıf</td>
                    <td className="px-3 py-2">{formatDateTime(a.assignedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      {canOperate && (
                        <button type="button" onClick={() => setRemoveTarget(a.id)} className={panelDangerButtonClassName}>Kaldır</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelConfirmDialog
        open={removeTarget !== null}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && handleRemove(removeTarget)}
        title="Atamayı Kaldır"
        description="Bu sınav atamasını kaldırmak istediğinize emin misiniz?"
        confirmLabel="Kaldır"
        danger
      />
    </div>
  );
}
