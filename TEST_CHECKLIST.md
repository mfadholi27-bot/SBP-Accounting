# Checklist Pengujian V3

Gunakan database uji saja. Tandai lulus setelah benar-benar diuji.

## Backup & Restore
- [ ] Backup menghasilkan file baru dengan nama bertimestamp.
- [ ] File backup dapat dibuka/divalidasi.
- [ ] Restore membuat backup dari database aktif terlebih dahulu.
- [ ] Restore gagal dengan pesan yang jelas jika file rusak.
- [ ] Data setelah restore cocok dengan data sebelum backup.

## Jurnal
- [ ] Jurnal seimbang dapat disimpan.
- [ ] Jurnal tidak seimbang ditolak.
- [ ] Nomor bukti duplikat ditangani sesuai aturan yang disepakati.
- [ ] Error di tengah proses membatalkan seluruh transaksi (rollback).
- [ ] Jurnal posted tidak dapat diedit tanpa alur koreksi.

## Audit
- [ ] Pembuatan, posting, koreksi, pembatalan, backup, dan restore tercatat.
- [ ] Catatan menyimpan waktu, pengguna, tindakan, objek, dan alasan bila relevan.
- [ ] Kegagalan mencatat audit tidak diam-diam diabaikan untuk tindakan kritis.

## Laporan
- [ ] Total debit = total kredit pada neraca saldo untuk periode uji.
- [ ] Filter tanggal inklusif dan konsisten.
- [ ] Preview cetak sesuai data di layar.
- [ ] PDF/Excel hasil ekspor dapat dibuka dan angka cocok.
