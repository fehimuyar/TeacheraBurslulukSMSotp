# Scholarship Exam Registry

Bu paket bursluluk sınav içerikleri için kanonik kaynaktır.

- `content/`: grade bazlı exam content ve asset referansları.
- `shared-shell/`: welcome/prep shell medya dosyaları.
- `styles.css`: referans modül stilleri.
- `index.js`: grade çözümleme, public path üretimi ve JSON yükleme yardımcıları.

Host yüzeylerine kopyalama için kök repodaki `npm run sync:scholarship-exam-content` script'i kullanılmalıdır.
