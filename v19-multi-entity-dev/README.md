# SBP Accounting Multi-Entitas — Development

Build ME-001 · Tahap 1: Pengelola Pembukuan

## Isolasi
- Folder ini adalah aplikasi development yang berdiri sendiri.
- Registry IndexedDB: `sbp-v19-multi-entity-dev-registry`.
- Setiap entitas memakai database: `sbp-v19-me-dev-<entityId>`.
- Tidak membuka, mengubah, menghapus, atau memigrasikan database produksi `sbp-accounting-v19`.
- Nama entitas dapat diedit; ID internal tetap.
- Arsip hanya menonaktifkan pemilihan. Database tidak dihapus.

## Cakupan build ini
- Tambah pembukuan.
- Ubah nama, nama perusahaan/unit, dan keterangan.
- Pilih pembukuan aktif.
- Arsipkan dan aktifkan kembali.
- Inisialisasi database kosong terpisah per pembukuan.

## Belum termasuk
Modul Master Akun, Jurnal, NPTRANS, Saldo Awal, Nota Debet, Anggaran, Buku Besar, Neraca Percobaan, Tutup Buku, backup/restore. Modul tersebut akan dipindahkan bertahap setelah audit struktur V19 dan pengujian isolasi.

Buka `index.html` melalui GitHub Pages atau server lokal. Untuk IndexedDB, gunakan origin yang sama setiap kali.
