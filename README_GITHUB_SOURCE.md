# SBP Accounting — Source untuk GitHub

## Tujuan paket
Paket ini menyiapkan source aplikasi desktop C# WinForms + SQLite untuk dikelola di repository GitHub. File `index.html` pada root repository GitHub Pages adalah preview web terpisah; source desktop ini tidak menggantikan tema atau file preview tersebut.

## Struktur utama
- `Program.cs` — titik masuk aplikasi
- `MainForm.cs` — antarmuka utama yang sudah ada
- `MainForm_V18.cs` — source versi V18 yang disertakan
- `AccountingDb.cs` — akses dan operasi database SQLite
- `DbfReader.cs` — pembaca DBF
- `SBPAccounting.csproj` / `SBPAccounting.sln` — project dan solution
- `Data/Legacy/README_LOCAL_DATA.txt` — petunjuk menempatkan file DBF secara lokal
- `.gitignore` — mengecualikan file database, backup, dan DBF dari commit

## Tema antarmuka
Source UI yang ada dipertahankan apa adanya. Paket ini hanya menambahkan dokumentasi struktur dan aturan `.gitignore`; tidak mendesain ulang `MainForm.cs`, tidak mengganti tema, dan tidak mengubah `index.html` GitHub Pages.

## Build dan verifikasi
Target project: `net10.0-windows`, Windows Forms, `Microsoft.Data.Sqlite` 10.0.0.
Buka `SBPAccounting.sln` pada Windows dengan .NET 10 SDK/Visual Studio yang mendukung .NET desktop, lalu jalankan restore/build. Build dan pengujian belum dilakukan dalam lingkungan pembuat paket ini.

## Keamanan data
Jangan memasukkan database SQLite produksi, file backup, kredensial, `NPTRANS.DBF`, atau `NPSALDO.DBF` asli ke repository publik. DBF asli harus tetap read-only; gunakan salinan uji untuk verifikasi.
