# SBP Accounting — UI Preview V2

## Isi
- `index.html`: prototype dashboard desktop-first dengan tema Neumorphism.
- Modul navigasi, ikon besar dengan judul, preview cetak browser, dan pemilih prioritas fitur yang bisa dinyalakan bersamaan.

## Cara update GitHub Pages
1. Buka repository `SBP-Accounting` → tab **Code**.
2. Pilih **Add file → Upload files**.
3. Upload `index.html` dari ZIP ini ke folder utama repository dan pilih **Commit changes**. Jika ditanya, timpa file lama.
4. Buka **Settings → Pages**. Pastikan deploy dari branch `main` dan folder `/(root)`.
5. Tunggu beberapa menit, lalu refresh halaman dengan `Ctrl + F5`.

## Batasan penting
Ini hanya prototype tampilan web. Toggle fitur adalah daftar prioritas UI, bukan konfigurasi sistem akuntansi sungguhan. Belum terhubung ke SQLite, belum menjalankan posting jurnal, dan belum mengakses file DBF. Untuk aplikasi produksi Windows, perubahan harus diterapkan ke project C# WinForms, diuji, dan dibuat backup sebelum mengganti aplikasi lama.

## Saran implementasi
Prioritas awal: (1) backup/restore SQLite, (2) validasi debit = kredit, (3) audit trail, (4) preview cetak/PDF, (5) pencarian global, (6) hak akses pengguna. Jangan mengubah NPTRANS.DBF/NPSALDO.DBF secara langsung.
