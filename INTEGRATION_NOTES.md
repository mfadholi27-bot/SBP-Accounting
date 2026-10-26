# Catatan Integrasi

Target integrasi adalah project Windows C# WinForms + SQLite yang sudah ada.

Sebelum melakukan patch source:
1. Ambil source project lengkap dan file project `.csproj`.
2. Identifikasi schema SQLite, metode transaksi/jurnal, posting, audit, backup, dan restore yang sudah ada.
3. Buat salinan source dan jalankan build baseline terlebih dahulu.
4. Jangan mengganti `MainForm` secara membabi buta atau membuat schema kedua yang tidak kompatibel.
5. Implementasikan satu paket per perubahan kecil dan jalankan checklist pengujian.

## Kriteria selesai
- Build berhasil pada target framework yang digunakan project.
- Database dummy dapat menjalankan skenario pengujian.
- File DBF legacy tidak berubah.
- Tidak ada klaim fitur siap sebelum pengujian aktual selesai.
