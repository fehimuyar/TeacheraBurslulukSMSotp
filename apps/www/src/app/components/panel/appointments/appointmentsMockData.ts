/* Mock data for the appointment & advisor system */

export type Advisor = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  specializations: string[];
  isActive: boolean;
};

export type AdvisorAvailability = {
  advisorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
};

export type AppointmentSlot = {
  id: string;
  advisorId: string;
  advisorName: string;
  candidateId: string | null;
  candidateName: string | null;
  candidateGrade: number | null;
  candidateSchool: string | null;
  placementLabel: string | null;
  cefrBand: string | null;
  resultScore: number | null;
  parentPhone: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'BOOKED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED';
  meetingNotes: string | null;
  meetingOutcome: 'PENDING' | 'INTERESTED' | 'REGISTERED' | 'DECLINED' | null;
  programId: string | null;
  discountRate: number | null;
  createdAt: string;
};

export type AppointmentSummary = {
  totalBooked: number;
  totalAttended: number;
  totalNoShow: number;
  todayBookings: number;
  pendingToday: number;
  conversionRate: number;
};

export const MOCK_ADVISORS: Advisor[] = [
  { id: 'adv1', fullName: 'Zeynep Kaya', email: 'zeynep@teachera.com.tr', phone: '532 XXX XX XX', specializations: ['İngilizce A1-B2', 'Yüz Yüze'], isActive: true },
  { id: 'adv2', fullName: 'Ali Yıldırım', email: 'ali@teachera.com.tr', phone: '555 XXX XX XX', specializations: ['İngilizce B1-C1', 'Online'], isActive: true },
  { id: 'adv3', fullName: 'Fatma Özdemir', email: 'fatma@teachera.com.tr', phone: '542 XXX XX XX', specializations: ['Almanca', 'Fransızca', 'Yüz Yüze'], isActive: true },
];

export const MOCK_AVAILABILITY: AdvisorAvailability[] = [
  // Zeynep: Pazartesi-Cuma 09:00-17:00
  ...[1, 2, 3, 4, 5].map((d) => ({ advisorId: 'adv1', dayOfWeek: d, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30 })),
  // Ali: Pazartesi-Cuma 10:00-18:00
  ...[1, 2, 3, 4, 5].map((d) => ({ advisorId: 'adv2', dayOfWeek: d, startTime: '10:00', endTime: '18:00', slotDurationMinutes: 30 })),
  // Fatma: Pazartesi-Cumartesi 09:00-16:00
  ...[1, 2, 3, 4, 5, 6].map((d) => ({ advisorId: 'adv3', dayOfWeek: d, startTime: '09:00', endTime: '16:00', slotDurationMinutes: 30 })),
];

function slot(id: string, advisorId: string, advisorName: string, date: string, start: string, end: string, status: AppointmentSlot['status'], candidate?: { name: string; grade: number; school: string; placement: string; cefr: string; score: number; phone: string }, outcome?: AppointmentSlot['meetingOutcome'], notes?: string): AppointmentSlot {
  return {
    id, advisorId, advisorName, date, startTime: start, endTime: end, status,
    candidateId: candidate ? `c_${id}` : null,
    candidateName: candidate?.name || null,
    candidateGrade: candidate?.grade || null,
    candidateSchool: candidate?.school || null,
    placementLabel: candidate?.placement || null,
    cefrBand: candidate?.cefr || null,
    resultScore: candidate?.score || null,
    parentPhone: candidate?.phone || null,
    meetingNotes: notes || null,
    meetingOutcome: outcome || null,
    programId: null,
    discountRate: candidate?.placement === 'Tam Burslu' ? 100 : candidate?.placement === 'Yarı Burslu' ? 50 : candidate?.placement === 'İndirimli' ? 25 : null,
    createdAt: '2026-03-20T10:00:00Z',
  };
}

const C = {
  ahmet: { name: 'Ahmet Yılmaz', grade: 5, school: 'Meram İlkokulu', placement: 'Tam Burslu', cefr: 'B1', score: 82, phone: '532 XXX XX XX' },
  elif: { name: 'Elif Kara', grade: 7, school: 'Selçuklu Ortaokulu', placement: 'Yarı Burslu', cefr: 'A2', score: 65, phone: '555 XXX XX XX' },
  mehmet: { name: 'Mehmet Demir', grade: 9, school: 'Karatay Anadolu Lisesi', placement: 'Tam Burslu', cefr: 'B2', score: 91, phone: '542 XXX XX XX' },
  zeynepA: { name: 'Zeynep Arslan', grade: 6, school: 'Meram Ortaokulu', placement: 'İndirimli', cefr: 'A1', score: 45, phone: '505 XXX XX XX' },
  ali: { name: 'Ali Çelik', grade: 8, school: 'Selçuklu İlkokulu', placement: 'Yarı Burslu', cefr: 'B1', score: 72, phone: '538 XXX XX XX' },
  fatmaA: { name: 'Fatma Öztürk', grade: 10, school: 'Karatay Ortaokulu', placement: 'İndirimli', cefr: 'A2', score: 58, phone: '507 XXX XX XX' },
  burak: { name: 'Burak Yıldız', grade: 4, school: 'Meram İlkokulu', placement: 'Tam Burslu', cefr: 'B1', score: 88, phone: '533 XXX XX XX' },
  selin: { name: 'Selin Aydın', grade: 11, school: 'Selçuklu Ortaokulu', placement: 'Başarısız', cefr: 'Pre-A1', score: 35, phone: '544 XXX XX XX' },
};

export const MOCK_APPOINTMENTS: AppointmentSlot[] = [
  // 28 Mart Cuma — Zeynep
  slot('s1', 'adv1', 'Zeynep Kaya', '2026-03-28', '09:00', '09:30', 'BOOKED', C.ahmet),
  slot('s2', 'adv1', 'Zeynep Kaya', '2026-03-28', '09:30', '10:00', 'BOOKED', C.elif),
  slot('s3', 'adv1', 'Zeynep Kaya', '2026-03-28', '10:00', '10:30', 'AVAILABLE'),
  slot('s4', 'adv1', 'Zeynep Kaya', '2026-03-28', '10:30', '11:00', 'BOOKED', C.burak),
  slot('s5', 'adv1', 'Zeynep Kaya', '2026-03-28', '11:00', '11:30', 'AVAILABLE'),
  slot('s6', 'adv1', 'Zeynep Kaya', '2026-03-28', '14:00', '14:30', 'BOOKED', C.zeynepA),
  slot('s7', 'adv1', 'Zeynep Kaya', '2026-03-28', '14:30', '15:00', 'AVAILABLE'),

  // 28 Mart Cuma — Ali
  slot('s8', 'adv2', 'Ali Yıldırım', '2026-03-28', '10:00', '10:30', 'BOOKED', C.mehmet),
  slot('s9', 'adv2', 'Ali Yıldırım', '2026-03-28', '10:30', '11:00', 'AVAILABLE'),
  slot('s10', 'adv2', 'Ali Yıldırım', '2026-03-28', '11:00', '11:30', 'BOOKED', C.ali),
  slot('s11', 'adv2', 'Ali Yıldırım', '2026-03-28', '14:00', '14:30', 'AVAILABLE'),

  // 28 Mart Cuma — Fatma
  slot('s12', 'adv3', 'Fatma Özdemir', '2026-03-28', '09:00', '09:30', 'BOOKED', C.fatmaA),
  slot('s13', 'adv3', 'Fatma Özdemir', '2026-03-28', '09:30', '10:00', 'AVAILABLE'),
  slot('s14', 'adv3', 'Fatma Özdemir', '2026-03-28', '10:00', '10:30', 'BOOKED', C.selin),

  // 27 Mart Perşembe — geçmiş randevular
  slot('s15', 'adv1', 'Zeynep Kaya', '2026-03-27', '09:00', '09:30', 'ATTENDED', C.ahmet, 'REGISTERED', 'Kayıt tamamlandı. İngilizce A1-A2 programına yazıldı.'),
  slot('s16', 'adv1', 'Zeynep Kaya', '2026-03-27', '09:30', '10:00', 'NO_SHOW', C.elif, null, null),
  slot('s17', 'adv2', 'Ali Yıldırım', '2026-03-27', '10:00', '10:30', 'ATTENDED', C.mehmet, 'INTERESTED', 'Velisiyle konuşacak, hafta sonu dönüş yapacak.'),
  slot('s18', 'adv3', 'Fatma Özdemir', '2026-03-27', '09:00', '09:30', 'ATTENDED', C.fatmaA, 'DECLINED', 'Fiyat uygun değil, düşünecek.'),
];

export const MOCK_APPOINTMENT_SUMMARY: AppointmentSummary = {
  totalBooked: 42,
  totalAttended: 28,
  totalNoShow: 8,
  todayBookings: 11,
  pendingToday: 7,
  conversionRate: 66.7,
};
