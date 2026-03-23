import { useState } from 'react';
import { formatNumber } from '../panelTypes';
import {
  PanelFeedbackMessage,
  panelCompactInputClassName,
  panelEyebrowClassName,
  panelSoftCardClassName,
  panelStatCardClassName,
  panelSurfaceClassName,
  panelTitleClassName,
} from '../panelUi';

type PipelineStage = 'APPLIED' | 'BOOKED' | 'ATTENDED' | 'OFFERED' | 'REGISTERED';
type PipelineCard = { id: string; name: string; grade: number; school: string; score: number; placement: string; stage: PipelineStage };

const STAGE_META: Array<{ id: PipelineStage; label: string; color: string }> = [
  { id: 'APPLIED', label: 'Başvuru', color: 'border-[#E4D6C1] bg-[#FBF5EB]' },
  { id: 'BOOKED', label: 'Randevu', color: 'border-[#C8CAD8] bg-[#F0F0F6]' },
  { id: 'ATTENDED', label: 'Görüşme', color: 'border-[#BFD2C8] bg-[#EEF6F0]' },
  { id: 'OFFERED', label: 'Teklif', color: 'border-[#D9C59C] bg-[#FBF1D9]' },
  { id: 'REGISTERED', label: 'Kayıt', color: 'border-[#BFD2C8] bg-[#2C5447] text-white' },
];

const MOCK_CARDS: PipelineCard[] = [
  { id: 'p1', name: 'Ahmet Yılmaz', grade: 5, school: 'Meram İlk.', score: 82, placement: 'Tam Burslu', stage: 'APPLIED' },
  { id: 'p2', name: 'Burak Yıldız', grade: 4, school: 'Meram İlk.', score: 88, placement: 'Tam Burslu', stage: 'APPLIED' },
  { id: 'p3', name: 'Selin Aydın', grade: 11, school: 'Selçuklu Ort.', score: 35, placement: 'Başarısız', stage: 'APPLIED' },
  { id: 'p4', name: 'Elif Kara', grade: 7, school: 'Selçuklu Ort.', score: 65, placement: 'Yarı Burslu', stage: 'BOOKED' },
  { id: 'p5', name: 'Ali Çelik', grade: 8, school: 'Selçuklu İlk.', score: 72, placement: 'Yarı Burslu', stage: 'BOOKED' },
  { id: 'p6', name: 'Mehmet Demir', grade: 9, school: 'Karatay Lis.', score: 91, placement: 'Tam Burslu', stage: 'ATTENDED' },
  { id: 'p7', name: 'Zeynep Arslan', grade: 6, school: 'Meram Ort.', score: 45, placement: 'İndirimli', stage: 'ATTENDED' },
  { id: 'p8', name: 'Fatma Öztürk', grade: 10, school: 'Karatay Ort.', score: 58, placement: 'İndirimli', stage: 'OFFERED' },
  { id: 'p9', name: 'Deniz Kaya', grade: 5, school: 'Meram İlk.', score: 78, placement: 'Yarı Burslu', stage: 'REGISTERED' },
  { id: 'p10', name: 'Emre Şahin', grade: 7, school: 'Selçuklu Ort.', score: 85, placement: 'Tam Burslu', stage: 'REGISTERED' },
];

const PLACEMENT_COLORS: Record<string, string> = {
  'Tam Burslu': 'border-[#BFD2C8] bg-[#EEF6F0] text-[#2C5447]',
  'Yarı Burslu': 'border-[#C8CAD8] bg-[#F0F0F6] text-[#4A4A6A]',
  'İndirimli': 'border-[#D9C59C] bg-[#FBF1D9] text-[#795A26]',
  'Başarısız': 'border-[#E7D2CD] bg-[#FFF8F6] text-[#875349]',
};

export default function PipelineKanbanTab() {
  const [cards, setCards] = useState<PipelineCard[]>(MOCK_CARDS);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);
  const [message, setMessage] = useState('');

  const handleDragStart = (cardId: string) => setDragSourceId(cardId);
  const handleDragOver = (e: React.DragEvent, stage: PipelineStage) => { e.preventDefault(); setDragOverStage(stage); };
  const handleDragEnd = () => { setDragOverStage(null); setDragSourceId(null); };
  const handleDrop = (targetStage: PipelineStage) => {
    if (!dragSourceId) return;
    const card = cards.find((c) => c.id === dragSourceId);
    if (!card || card.stage === targetStage) { setDragOverStage(null); setDragSourceId(null); return; }
    setCards((prev) => prev.map((c) => c.id === dragSourceId ? { ...c, stage: targetStage } : c));
    const stageLabel = STAGE_META.find((s) => s.id === targetStage)?.label || targetStage;
    setMessage(`${card.name} → ${stageLabel} aşamasına taşındı.`);
    setDragOverStage(null);
    setDragSourceId(null);
  };

  return (
    <div className="space-y-5">
      {message && <PanelFeedbackMessage tone="success">{message}</PanelFeedbackMessage>}

      <section className={panelSurfaceClassName}>
        <p className={panelEyebrowClassName}>Satış Pipeline</p>
        <h3 className={panelTitleClassName}>Aday Akış Takibi</h3>
        <p className="mt-1 font-['Neutraface_2_Text:Book',sans-serif] text-[12px] text-[#8A7F71]">Kartları sürükleyerek aşamalar arasında taşıyın.</p>

        <div className="mt-4 grid grid-cols-5 gap-3">
          {STAGE_META.map((stage) => {
            const stageCards = cards.filter((c) => c.stage === stage.id);
            const isOver = dragOverStage === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={() => handleDrop(stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                className={`min-h-[200px] rounded-[20px] border p-2 transition ${isOver ? 'border-[#2C5447] bg-[#EEF6F0]' : 'border-[#ECE2D5] bg-[#FFFCF8]'}`}
              >
                <div className="mb-2 flex items-center justify-between px-2">
                  <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] uppercase tracking-[0.12em] text-[#1B2B24]">{stage.label}</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E4DBCF] font-['Neutraface_2_Text:Demi',sans-serif] text-[9px] text-[#5E665E]">{stageCards.length}</span>
                </div>
                <div className="space-y-1.5">
                  {stageCards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card.id)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-grab rounded-[14px] border ${stage.color} p-2.5 transition active:cursor-grabbing active:shadow-md ${dragSourceId === card.id ? 'opacity-50' : ''}`}
                    >
                      <p className="font-['Neutraface_2_Text:Demi',sans-serif] text-[12px]">{card.name}</p>
                      <p className="mt-0.5 font-['Neutraface_2_Text:Book',sans-serif] text-[10px] opacity-70">{card.grade}. Sınıf • {card.school}</p>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="font-['Neutraface_2_Text:Demi',sans-serif] text-[11px]">{card.score} puan</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-['Neutraface_2_Text:Demi',sans-serif] uppercase ${PLACEMENT_COLORS[card.placement] || ''}`}>{card.placement}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
