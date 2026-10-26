# SBP Accounting V7 — GitHub Pages Preview

V7 mempertahankan tema visual V3 dan menambahkan workflow demo: input jurnal, daftar jurnal, koreksi demo, pratinjau impor Excel/CSV, validasi per nomor jurnal, serta template Excel/CSV.

## Impor Excel
1. Buka menu **Input Massal / Import**.
2. Unduh **Template Excel**.
3. Isi kolom `Tanggal`, `Nomor`, `Keterangan`, `Akun`, `Debit`, `Kredit`; satu baris untuk setiap akun dalam jurnal.
4. Pilih file `.xlsx` atau `.xls`, lalu klik **Pratinjau & Validasi**.
5. Perbaiki jurnal yang tidak seimbang/kolom yang salah. Klik **Tambahkan Jurnal Valid ke Daftar Demo** untuk mencoba alur browser.

Excel dibaca menggunakan SheetJS CDN sehingga perlu internet untuk memuat library; jika offline gunakan CSV.

## Batasan penting
Ini hanya preview browser statis. Data hanya masuk ke array sesi browser, tidak tersimpan ke SQLite, tidak mengubah aplikasi C# desktop, dan tidak cocok untuk data perusahaan rahasia. Untuk aktivasi sebenarnya, fungsi impor harus diimplementasikan di WinForms dan transaksi disimpan dalam SQLite dalam satu transaksi database setelah validasi. GitHub Pages tidak dapat mengakses SQLite lokal di laptop.

## Pasang ke GitHub Pages
Ganti file `index.html` di root repository dengan file ini lalu commit ke branch yang dipakai GitHub Pages. ZIP ini belum otomatis diunggah ke repository.
