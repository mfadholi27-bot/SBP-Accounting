# Roadmap SBP Accounting V3

## Paket A — Fondasi aman
1. Buat backup otomatis SQLite sebelum migrasi atau restore.
2. Sediakan validasi lokasi dan integritas file backup.
3. Audit trail untuk tindakan penting: jurnal dibuat, diposting, dikoreksi, dibatalkan, backup, restore.
4. Restore harus meminta konfirmasi, membuat backup database aktif terlebih dahulu, dan memerlukan aplikasi dibuka ulang bila koneksi aktif tidak dapat ditukar dengan aman.

## Paket B — Integritas jurnal
1. Validasi setiap jurnal memiliki baris debit/kredit yang sah.
2. Pastikan total debit sama dengan total kredit sebelum posting.
3. Gunakan transaksi database atomik (commit/rollback).
4. Cegah duplikasi nomor bukti sesuai aturan nomor dokumen yang disepakati.
5. Jurnal yang sudah diposting tidak diedit diam-diam; koreksi melalui reversal/koreksi dengan alasan dan audit trail.

## Paket C — Buku Besar dan laporan
1. Buku Besar diturunkan dari jurnal yang telah diposting, bukan dari angka yang diketik ulang.
2. Filter periode dan akun.
3. Neraca saldo harus memeriksa keseimbangan total debit/kredit.
4. Cetak preview sebelum cetak dan ekspor PDF/Excel.
5. Cocokkan hasil laporan dengan contoh data uji yang diketahui benar.

## Paket D — Produktivitas dan kontrol
1. Pencarian global.
2. Hak akses berbasis peran.
3. Log kesalahan yang tidak menyimpan rahasia.
4. Shortcut keyboard dan input massal setelah validasi inti stabil.

## Urutan kerja yang direkomendasikan
Kerjakan A dan B bersama karena keamanan backup dan integritas jurnal saling mendukung. Setelah lulus tes, sambungkan C. Tambahkan D setelah alur utama stabil.
