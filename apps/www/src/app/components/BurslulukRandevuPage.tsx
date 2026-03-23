import { useState } from 'react';
import { Link } from 'react-router';

const AVAILABLE_DATES = [
  { date: '2026-03-30', label: '30 Mart Pazartesi' },
  { date: '2026-03-31', label: '31 Mart Salı' },
  { date: '2026-04-01', label: '1 Nisan Çarşamba' },
  { date: '2026-04-02', label: '2 Nisan Perşembe' },
  { date: '2026-04-03', label: '3 Nisan Cuma' },
];

const AVAILABLE_TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00'];

export default function BurslulukRandevuPage() {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const canConfirm = selectedDate && selectedTime;

  if (confirmed) {
    const dateLabel = AVAILABLE_DATES.find((d) => d.date === selectedDate)?.label || selectedDate;
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#0A0A14] p-6 text-center">
        <div className="max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2C5447]">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M8 16l6 6L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="mt-6 text-[28px] font-bold text-white">Randevunuz Alındı</h1>
          <p className="mt-3 text-[16px] leading-[1.6] text-white/70">{dateLabel}, saat {selectedTime}</p>
          <p className="mt-2 text-[14px] text-white/50">Eğitim danışmanımız sizi bekliyor olacak. Randevu detayları SMS ile gönderilecektir.</p>
          <Link to="/bursluluk/giris" className="mt-8 inline-block rounded-full border border-white/18 px-8 py-3 text-[13px] uppercase tracking-[0.14em] text-white/74 transition hover:bg-white/8">
            Ana Sayfaya Dön
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-[#0A0A14] p-6">
      <div className="w-full max-w-lg">
        <Link to="/bursluluk/sonuç" className="text-[12px] uppercase tracking-[0.14em] text-white/50 transition hover:text-white/80">← Sonuçlara Dön</Link>
        <h1 className="mt-4 text-[32px] font-bold text-white">Randevu Al</h1>
        <p className="mt-2 text-[15px] leading-[1.6] text-white/60">Eğitim danışmanımızla görüşme için size uygun bir tarih ve saat seçin.</p>

        {/* Date selection */}
        <div className="mt-8">
          <p className="text-[12px] uppercase tracking-[0.16em] text-white/50">Tarih Seçin</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AVAILABLE_DATES.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelectedDate(d.date)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${selectedDate === d.date ? 'border-[#2C5447] bg-[#2C5447] text-white' : 'border-white/12 bg-white/4 text-white/70 hover:bg-white/8'}`}
              >
                <p className="text-[13px] font-semibold">{d.label.split(' ')[0]} {d.label.split(' ')[1]}</p>
                <p className="text-[11px] opacity-60">{d.label.split(' ')[2]}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Time selection */}
        {selectedDate && (
          <div className="mt-6">
            <p className="text-[12px] uppercase tracking-[0.16em] text-white/50">Saat Seçin</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {AVAILABLE_TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setSelectedTime(time)}
                  className={`rounded-xl border py-2.5 text-center text-[13px] font-medium transition ${selectedTime === time ? 'border-[#2C5447] bg-[#2C5447] text-white' : 'border-white/12 bg-white/4 text-white/70 hover:bg-white/8'}`}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm */}
        {canConfirm && (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="w-full rounded-full bg-[#2C5447] py-4 text-[14px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_rgba(44,84,71,0.3)] transition hover:bg-[#23463B] active:scale-[0.98]"
            >
              Randevuyu Onayla
            </button>
            <p className="mt-3 text-center text-[12px] text-white/40">Randevu detayları SMS ile gönderilecektir.</p>
          </div>
        )}
      </div>
    </section>
  );
}
