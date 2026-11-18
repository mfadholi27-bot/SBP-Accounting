# SBP Accounting Multi-Entitas — Development

Build ME-001 · Tahap 1: Pengelola Pembukuan

- Folder development terpisah.
- Registry IndexedDB: `sbp-v19-multi-entity-dev-registry`.
- Database tiap entitas: `sbp-v19-me-dev-<entityId>`.
- Tidak membaca, mengubah, menghapus, atau memigrasikan database produksi `sbp-accounting-v19`.
- Fitur tahap ini: tambah, ubah, pilih, arsipkan, aktifkan kembali, dan inisialisasi database terpisah.
- Modul akuntansi V19 akan diintegrasikan bertahap setelah audit dan pengujian isolasi.
