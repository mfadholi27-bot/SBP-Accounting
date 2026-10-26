# Data Safety

- `NPTRANS.DBF` dan `NPSALDO.DBF` harus diperlakukan sebagai sumber legacy read-only kecuali ada prosedur resmi terpisah yang telah disetujui dan diuji.
- Jangan mengunggah file DBF, database SQLite produksi, backup, atau informasi sensitif perusahaan ke repository publik.
- Uji dengan database dummy yang tidak berisi data perusahaan.
- Sebelum migrasi/restore, simpan backup terverifikasi di lokasi lokal terpisah.
- Catat tindakan koreksi/pembatalan; jangan menghapus jejak transaksi yang telah diposting.
- Akses file backup harus dibatasi sesuai kebijakan perusahaan.
