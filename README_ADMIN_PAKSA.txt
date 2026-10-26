SBP ACCOUNTING - ADMIN FORCE TOOLS
==================================

Versi: V18 + Admin Force NPSALDO/Jurnal
Target: Windows 10/11, .NET 10, win-x64, offline

FITUR BARU
1. Saldo & Akun -> Sinkronisasi NPSALDO
   - Pilih NPSALDO.DBF dari komputer/flashdisk lain.
   - Preview BARU / DIUBAH / TETAP / data yang tidak ada lagi di sumber.
   - Backup database otomatis sebelum diterapkan.
   - DBF asli tidak diubah.

2. Saldo & Akun -> Perbaikan Paksa NPSALDO
   - Edit kode akun (ditampilkan readonly), nama, saldo debet/kredit.
   - Alasan wajib.
   - Audit Trail menyimpan sebelum/sesudah.
   - Hapus paksa hanya jika akun belum dipakai jurnal, agar histori jurnal tidak rusak.

3. Jurnal -> Perbaikan Paksa Admin
   - Daftar jurnal POSTED.
   - Perbaikan paksa header dan detail.
   - Wajib balance.
   - Backup otomatis.
   - Audit Trail sebelum/sesudah + alasan.
   - VOID Paksa mengubah status POSTED menjadi VOID sehingga tidak lagi masuk Buku Besar.
   - Hapus Paksa menghapus jurnal dari database modern setelah backup dan mencatat Audit Trail.

CATATAN PENTING
- NPTRANS.DBF dan NPSALDO.DBF sumber legacy tidak ditulis oleh aplikasi.
- Fitur ini mengubah database SQLite modern SBP Accounting.
- Setiap operasi admin force wajib memiliki alasan.
- Backup admin dibuat di Data\App\AdminBackup.
- Sebelum digunakan pada data produksi, build/test dulu pada salinan database.

BUILD
Buka SBPAccounting.sln di Visual Studio 2026.
Pilih Release | Any CPU atau win-x64 sesuai publish.
Build/Publish seperti konfigurasi sebelumnya: net10.0-windows, self-contained, win-x64.

Catatan verifikasi: lingkungan pembuat file ini tidak memiliki .NET SDK, sehingga build Windows tidak dijalankan di sini. Jalankan Build/Rebuild di Visual Studio pada komputer Windows.
