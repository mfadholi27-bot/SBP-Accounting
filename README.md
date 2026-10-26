# SBP Accounting — Local NoSQL Edition

Versi browser dengan tema V3, tanpa SQL dan tanpa backend. Buka `index.html` di browser atau salin ke root repositori GitHub Pages.

## Modul
- Dashboard
- Input jurnal dengan beberapa baris, validasi debit/kredit, simpan, edit
- Daftar jurnal, pencarian/filter, edit/hapus
- Import massal CSV dan Excel, preview, validasi kelompok jurnal
- Buku besar dengan saldo berjalan
- Saldo & akun / COA
- Laporan rekap jurnal, neraca saldo berbasis mutasi, ringkasan pendapatan/beban
- Jurnal koreksi (membuat jurnal pembalik)
- Pencarian global
- Backup/restore JSON, ekspor CSV
- Audit trail
- Pengaturan lokal

## Cara pakai
1. Ekstrak ZIP.
2. Buka `index.html` dengan Chrome atau Edge.
3. Untuk GitHub Pages, ganti `index.html` di root repository dengan file dari ZIP, lalu commit ke branch `main`.
4. Refresh website dengan `Ctrl+F5`.

## Format impor
Kolom: `Tanggal, Nomor, Keterangan, Akun, Debit, Kredit`. Satu baris per akun. Setiap nomor jurnal harus seimbang dan setiap akun harus ada di daftar COA. Gunakan template yang diunduh dari aplikasi.

## Penting
- Data disimpan pada `localStorage` browser. Tidak sinkron antarperangkat dan dapat hilang jika data situs/browser dihapus.
- Backup JSON secara berkala.
- Impor file Excel `.xlsx/.xls` memakai library SheetJS dari CDN sehingga perlu internet; CSV dapat digunakan tanpa library Excel.
- Ini aplikasi browser lokal/prototipe, bukan pengganti sistem akuntansi produksi yang telah diaudit. Tidak ada login/hak akses sungguhan. Uji dengan data dummy dan verifikasi laporan sebelum pemakaian resmi.
