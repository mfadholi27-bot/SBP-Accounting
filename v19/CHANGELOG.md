# CHANGELOG — SBP Accounting V19

## 2026-11-12 — Buku Besar berdasarkan periode dan integritas cetak

- Menambahkan pilihan cetak Buku Besar bulanan, tahunan, dan rentang tanggal.
- Saldo awal rentang dihitung dari saldo awal bulan pertama ditambah mutasi jurnal POSTED sebelum tanggal mulai.
- Mutasi dalam rentang hanya mengambil jurnal POSTED; DRAFT, dibatalkan, dan status tidak dikenal tidak masuk ke saldo Buku Besar.
- Filter status transaksi pada panel Buku Besar mengikuti rentang tanggal yang dipilih.
- Ekspor Excel memakai rentang dan perhitungan saldo yang sama dengan tampilan/cetak.
- Pemeriksaan tanggal kalender menolak tanggal tidak valid dan rentang terbalik.
- Menambahkan snapshot pembanding state aplikasi dan IndexedDB sebelum serta sesudah dialog cetak. Verifikasi dipicu oleh event `afterprint` dari iframe cetak; notifikasi lulus hanya muncul bila kedua snapshot tetap identik.
- Menambahkan regression tests untuk saldo pembuka rentang, filter POSTED, pilihan periode, tanggal invalid, dan sifat read-only perhitungan.
- Memperbarui build stamp menjadi `SBP-V19-LEDGER-PRINT-004`.

### Batas validasi
- Pemeriksaan sintaks JavaScript dan uji logika fixture dijalankan sebelum publikasi.
- Uji dialog cetak dan pembandingan IndexedDB nyata memerlukan browser yang menjalankan preview; statusnya belum dinyatakan lulus sampai pemeriksaan browser selesai.
- Preview `/v19-dev/` merupakan salinan pengembangan terpisah; folder aplikasi utama `/v19/` tidak diubah pada branch `main`.
