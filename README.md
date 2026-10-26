# SBP Accounting V3 — Paket Inti Terintegrasi (Starter)

Paket ini adalah **starter pengembangan**, bukan aplikasi Windows produksi siap pakai. Paket berisi rencana implementasi, kontrak data awal, checklist pengujian, dan prototype dashboard V3.

## Isi folder
- `prototype/index.html` — dashboard preview interaktif (navigasi, cetak halaman, penanda prioritas fitur).
- `docs/ROADMAP.md` — urutan implementasi yang disarankan.
- `docs/DATA_SAFETY.md` — batasan keamanan data legacy.
- `docs/TEST_CHECKLIST.md` — daftar pengujian sebelum produksi.
- `docs/INTEGRATION_NOTES.md` — catatan integrasi ke source C# WinForms + SQLite.

## Penting
- UI prototype tidak menjalankan jurnal akuntansi sungguhan dan tidak tersambung ke SQLite.
- Belum termasuk source project C# lengkap karena source project terbaru belum diberikan pada percakapan ini.
- Jangan masukkan database perusahaan, NPTRANS.DBF, NPSALDO.DBF, kredensial, atau transaksi asli ke repository publik.
- Jangan menimpa aplikasi produksi dengan paket ini tanpa mengintegrasikan dan menguji source lengkap.
