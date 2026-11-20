# SBP Accounting V19 — DEVELOPMENT CLONE

Kloning terpisah dari sumber V19 Build 042. Folder ini hanya untuk eksperimen dan pengembangan pada branch `development`.

## Pemisahan dari ORIGINAL
- Aplikasi asli tetap berada di `/v19/` dan branch `main`.
- Kloning ini berada di `/v19-development/`.
- Database IndexedDB dan fallback localStorage menggunakan namespace `sbp-accounting-v19-development`.
- Registry entitas juga memakai database terpisah: `sbp-accounting-v19-development-entities`.
- Service worker menggunakan cache khusus development dan tidak menghapus cache V19 asli.
- Jangan menyalin file backup V19 asli ke DEVELOPMENT kecuali memang ingin menguji data salinan secara sengaja.

## Sumber
- Sumber: V19 Build 042.
- Commit sumber: `bae3222a5951b57de65bba7e4e57d8344bb4553d`.
- Branch kerja: `development`.
- Jalur aplikasi: `v19-development/`.

## Akses GitHub Pages
Workflow gabungan ada di `.github/workflows/pages-combined.yml`. Setelah pemilik repository mengaktifkan GitHub Actions sebagai Pages source dan workflow berhasil, alamatnya:
- ORIGINAL: https://mfadholi27-bot.github.io/SBP-Accounting/v19/
- DEVELOPMENT: https://mfadholi27-bot.github.io/SBP-Accounting/v19-development/

Workflow menyusun situs dari `main:v19/` dan `development:v19-development/`; tidak menggabungkan branch dan tidak menyalin kode development ke produksi.

## Aturan kerja
1. Semua eksperimen dilakukan hanya pada `v19-development/`.
2. Jangan mengedit `v19/` atau melakukan commit ke `main` untuk pekerjaan fitur.
3. Jangan merge ke ORIGINAL tanpa persetujuan eksplisit.
4. Uji restore/backup hanya dengan data uji atau salinan.
5. Sebelum merge fitur, audit perubahan dan uji seluruh modul serta buat backup produksi.
