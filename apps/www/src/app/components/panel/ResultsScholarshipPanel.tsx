import { useMemo, useState } from 'react';
import { isSuperAdmin, canOperatePanelActions, isReadOnlyPanelRole } from './panelPermissions';
import { formatNumber } from './panelTypes';
import ResultEditModal from './ResultEditModal';
import BulkSmsResultModal from './BulkSmsResultModal';
import {
  PanelConfirmDialog,
  PanelEmptyState,
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelDangerButtonClassName,
  panelDescriptionClassName,
  panelEyebrowClassName,
  panelLargeTitleClassName,
  panelPrimaryButtonClassName,
  panelReadOnlyNoticeClassName,
  panelSecondaryButtonClassName,
  panelSmallButtonClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTableContainerClassName,
  panelTitleClassName,
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
  result_status?: string | null;
  result_viewed_at?: string | null;
};

const MOCK_RESULTS: ResultRow[] = [
  { candidate_id: '1', student_full_name: 'Ahmet Yılmaz', grade: 5, school_name: 'Meram İlkokulu', result_score: 82, result_percentage: 82, placement_label: '%100 Burs', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: '2026-03-22T15:00:00Z' },
  { candidate_id: '2', student_full_name: 'Elif Kara', grade: 7, school_name: 'Selçuklu Ortaokulu', result_score: 65, result_percentage: 65, placement_label: '%50 Burs', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: null },
  { candidate_id: '3', student_full_name: 'Mehmet Demir', grade: 9, school_name: 'Karatay Anadolu Lisesi', result_score: 91, result_percentage: 91, placement_label: '%100 Burs', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: '2026-03-22T16:30:00Z' },
  { candidate_id: '4', student_full_name: 'Zeynep Arslan', grade: 6, school_name: 'Meram Ortaokulu', result_score: 45, result_percentage: 45, placement_label: '%25 İndirim', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: null },
  { candidate_id: '5', student_full_name: 'Ali Çelik', grade: 8, school_name: 'Selçuklu İlkokulu', result_score: 72, result_percentage: 72, placement_label: '%50 Burs', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: '2026-03-23T09:00:00Z' },
  { candidate_id: '6', student_full_name: 'Fatma Öztürk', grade: 10, school_name: 'Karatay Ortaokulu', result_score: 58, result_percentage: 58, placement_label: '%25 İndirim', cefr_band: null, result_status: 'NOT_READY', result_viewed_at: null },
  { candidate_id: '7', student_full_name: 'Burak Yıldız', grade: 4, school_name: 'Meram İlkokulu', result_score: 88, result_percentage: 88, placement_label: '%100 Burs', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: null },
  { candidate_id: '8', student_full_name: 'Selin Aydın', grade: 11, school_name: 'Selçuklu Ortaokulu', result_score: 35, result_percentage: 35, placement_label: 'Burssuz', cefr_band: null, result_status: 'PUBLISHED', result_viewed_at: '2026-03-22T18:00:00Z' },
];

const PLACEMENT_COLORS: Record<string, string> = {
  '%100 Burs': 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  '%50 Burs': 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]',
  '%25 İndirim': 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]',
  'Burssuz': 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
};

export default function ResultsScholarshipPanel({ role }: { role?: string }) {
  const isAdmin = isSuperAdmin(role);
  const readOnly = isReadOnlyPanelRole(role);
  const [results, setResults] = useState<ResultRow[]>(MOCK_RESULTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [placementFilter, setPlacementFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [editTarget, setEditTarget] = useState<ResultRow | null>(null);
  const [showBulkSms, setShowBulkSms] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState<'publish' | 'unpublish' | null>(null);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (searchQuery && !(r.student_full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) && !(r.school_name || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (gradeFilter && String(r.grade) !== gradeFilter) return false;
      if (placementFilter && r.placement_label !== placementFilter) return false;
      return true;
    });
  }, [results, searchQuery, gradeFilter, placementFilter]);

  const summary = useMemo(() => ({
    total: results.length,
    published: results.filter((r) => r.result_status === 'PUBLISHED').length,
    viewed: results.filter((r) => r.result_viewed_at).length,
    fullScholarship: results.filter((r) => r.placement_label === '%100 Burs').length,
  }), [results]);

  /* Sınıf bazlı sıralama: grade gruplaması → puana göre sırala → sıra numarası ata */
  const rankMap = useMemo(() => {
    const map = new Map<string, number>();
    const byGrade = new Map<number, ResultRow[]>();
    for (const r of results) {
      const g = r.grade ?? 0;
      if (!byGrade.has(g)) byGrade.set(g, []);
      byGrade.get(g)!.push(r);
    }
    for (const [, group] of byGrade) {
      const sorted = [...group].sort((a, b) => (b.result_score ?? 0) - (a.result_score ?? 0));
      sorted.forEach((r, i) => map.set(r.candidate_id, i + 1));
    }
    return map;
  }, [results]);

  const allSelectedOnPage = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.candidate_id));

  const toggleAll = () => {
    if (allSelectedOnPage) {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((r) => next.delete(r.candidate_id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); filtered.forEach((r) => next.add(r.candidate_id)); return next; });
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleResultSave = (candidateId: string, updates: { score: number; placementLabel: string; cefrBand: string }, _otpCode: string) => {
    setResults((prev) => prev.map((r) => r.candidate_id === candidateId ? { ...r, result_score: updates.score, result_percentage: updates.score, placement_label: updates.placementLabel, cefr_band: updates.cefrBand } : r));
    setMessage(`Sonuç güncellendi: ${updates.score} puan, ${updates.placementLabel}, ${updates.cefrBand}`);
    setEditTarget(null);
  };

  const handleBulkSms = (_otpCode: string) => {
    setMessage(`${formatNumber(summary.published)} kişiye SMS gönderim başlatıldı.`);
    setShowBulkSms(false);
  };

  const placements = [...new Set(results.map((r) => r.placement_label).filter(Boolean))];

  return (
    <div className="space-y-5">
      {readOnly && <p className={panelReadOnlyNoticeClassName}>Salt okunur mod.</p>}
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      {/* Header */}
      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Yönetim</p>
        <h2 className={panelLargeTitleClassName}>Sonuç & Burs</h2>
      </section>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Toplam Sonuç</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(summary.total)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Yayınlanmış</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(summary.published)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">Görüntülenen</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#1B2B24]">{formatNumber(summary.viewed)}</p>
        </div>
        <div className={panelStatCardClassName}>
          <p className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">%100 Burs</p>
          <p className="mt-1 font-['Neutraface_2_Text:Bold',sans-serif] text-[24px] text-[#2C5447]">{formatNumber(summary.fullScholarship)}</p>
        </div>
      </div>

      {/* Super admin tools */}
      {isAdmin && (
        <section className={`${panelSoftCardClassName} border-[#C8CAD8]`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px] uppercase tracking-[0.14em] text-[#4A4A6A]">Yönetici İşlemleri</p>
              <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#5E665E]">Bu işlemler OTP doğrulaması gerektirir.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { const first = filtered.find((r) => selectedIds.has(r.candidate_id)); if (first) setEditTarget(first); else setMessage('Düzenlemek için bir aday seçin.'); }} className={panelSecondaryButtonClassName}>
                Sonuç Düzenle
              </button>
              <button type="button" onClick={() => {
                if (selectedIds.size === 0) { setMessage('Yayınlamak için en az bir aday seçin.'); return; }
                setPublishConfirm('publish');
              }} className={panelPrimaryButtonClassName}>
                Yayınla
              </button>
              <button type="button" onClick={() => {
                if (selectedIds.size === 0) { setMessage('Kaldırmak için en az bir aday seçin.'); return; }
                setPublishConfirm('unpublish');
              }} className={panelDangerButtonClassName}>
                Yayından Kaldır
              </button>
              <button type="button" onClick={() => setShowBulkSms(true)} className={panelSecondaryButtonClassName}>
                Toplu SMS Duyuru
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Filters + Table */}
      <section className={panelSurfaceClassName}>
        <details className="rounded-[14px] border border-[#E4DBCF] bg-[#FBF7F0]">
          <summary className="cursor-pointer px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.14em] text-[#7A7063]">
            Filtreler {(searchQuery || gradeFilter || placementFilter) ? `(${[searchQuery, gradeFilter, placementFilter].filter(Boolean).length} aktif)` : ''}
          </summary>
          <div className="grid gap-2 px-3 pb-3 sm:grid-cols-3">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Ad veya okul ara..." className={panelCompactInputClassName} />
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className={panelCompactInputClassName}>
              <option value="">Tüm Sınıflar</option>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((g) => (<option key={g} value={String(g)}>{g}. Sınıf</option>))}
            </select>
            <select value={placementFilter} onChange={(e) => setPlacementFilter(e.target.value)} className={panelCompactInputClassName}>
              <option value="">Tüm Burs Oranları</option>
              {placements.map((p) => (<option key={p} value={p!}>{p}</option>))}
            </select>
          </div>
        </details>

        {/* Table */}
        <div className={panelTableContainerClassName}>
          <table className="min-w-[820px] text-left font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#33463E]">
            <thead>
              <tr className="border-b border-[#E6DDCF] text-[#7A7063]">
                <th className="px-2 py-2 w-[36px]"><input type="checkbox" checked={allSelectedOnPage} onChange={toggleAll} className="h-3.5 w-3.5 rounded border-[#DDD4C6]" /></th>
                <th className="px-3 py-2">İsim</th>
                <th className="px-3 py-2">Sınıf</th>
                <th className="px-3 py-2">Okul</th>
                <th className="px-3 py-2 text-right">Puan</th>
                <th className="px-3 py-2 text-right">Yüzde</th>
                <th className="px-3 py-2">Burs Oranı</th>
                <th className="px-3 py-2 text-center">Sıra</th>
                <th className="px-3 py-2">Görüntüleme</th>
                {isAdmin && <th className="px-3 py-2 text-right">İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 10 : 9}><PanelEmptyState /></td></tr>
              ) : (
                filtered.map((r) => {
                  const placementColor = PLACEMENT_COLORS[r.placement_label || ''] || 'border-[#DDD3C5] bg-[#FBF7F0] text-[#6F675D]';
                  return (
                    <tr key={r.candidate_id} className="border-b border-[#F0E7DA]">
                      <td className="px-2 py-2"><input type="checkbox" checked={selectedIds.has(r.candidate_id)} onChange={() => toggleOne(r.candidate_id)} className="h-3.5 w-3.5 rounded border-[#DDD4C6]" /></td>
                      <td className="px-3 py-2 font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{r.student_full_name || '-'}</td>
                      <td className="px-3 py-2">{r.grade || '-'}</td>
                      <td className="px-3 py-2">{r.school_name || '-'}</td>
                      <td className="px-3 py-2 text-right font-['Neutraface_2_Text:Demi',sans-serif] text-[#1B2B24]">{r.result_score ?? '-'}</td>
                      <td className="px-3 py-2 text-right">%{r.result_percentage ?? '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${placementColor}`}>
                          {r.placement_label || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const rank = rankMap.get(r.candidate_id);
                          if (!rank) return '-';
                          if (rank === 1) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#FFD700] font-['Neutraface_2_Text:Bold',sans-serif] text-[10px] text-[#1B2B24]" title="Birincilik">1</span>;
                          if (rank === 2) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#C0C0C0] font-['Neutraface_2_Text:Bold',sans-serif] text-[10px] text-[#1B2B24]" title="İkincilik">2</span>;
                          if (rank === 3) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#CD7F32] font-['Neutraface_2_Text:Bold',sans-serif] text-[10px] text-white" title="Üçüncülük">3</span>;
                          return <span className="font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#7A7063]">{rank}</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        {r.result_viewed_at ? (
                          <span className="rounded-full border border-[#BFD2C8] bg-[#EEF6F0] px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] text-[#2C5447]">Gördü</span>
                        ) : r.result_status === 'PUBLISHED' ? (
                          <span className="rounded-full border border-[#D9C59C] bg-[#FBF1D9] px-2 py-0.5 text-[10px] font-['Neutraface_2_Text:Demi',sans-serif] text-[#795A26]">Görmedi</span>
                        ) : (
                          <span className="text-[#8A7F71]">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => setEditTarget(r)} className={panelSmallButtonClassName}>Düzenle</button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ResultEditModal open={editTarget !== null} onClose={() => setEditTarget(null)} result={editTarget} onSave={handleResultSave} />
      <BulkSmsResultModal open={showBulkSms} onClose={() => setShowBulkSms(false)} totalCandidates={summary.published} onSend={handleBulkSms} />

      <PanelConfirmDialog
        open={publishConfirm !== null}
        onCancel={() => setPublishConfirm(null)}
        onConfirm={() => {
          if (publishConfirm === 'publish') {
            setResults((prev) => prev.map((r) => selectedIds.has(r.candidate_id) ? { ...r, result_status: 'PUBLISHED' } : r));
            setMessage(`${selectedIds.size} sonuç yayınlandı. (OTP onayı gerekli — backend bağlantısında aktif olacak)`);
          } else {
            setResults((prev) => prev.map((r) => selectedIds.has(r.candidate_id) ? { ...r, result_status: 'NOT_READY', result_viewed_at: null } : r));
            setMessage(`${selectedIds.size} sonuç yayından kaldırıldı.`);
          }
          setSelectedIds(new Set());
          setPublishConfirm(null);
        }}
        title={publishConfirm === 'publish' ? 'Sonuçları Yayınla' : 'Sonuçları Yayından Kaldır'}
        description={publishConfirm === 'publish'
          ? `${selectedIds.size} adayın sınav sonucu yayınlanacak. Adaylar sonuçlarını görebilecek. Bu işlem OTP doğrulaması gerektirir.`
          : `${selectedIds.size} adayın sonucu yayından kaldırılacak. Adaylar artık sonuçlarını göremeyecek.`}
        confirmLabel={publishConfirm === 'publish' ? 'Yayınla' : 'Kaldır'}
        danger={publishConfirm === 'unpublish'}
      />
    </div>
  );
}
