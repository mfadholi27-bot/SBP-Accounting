# SBP Accounting GitHub Pages V8 — Local-only, no SQL

This preview uses browser `localStorage` for its journal list and offers JSON backup/restore and CSV export. It does not use SQL, SQLite, a backend, or a server database.

## Install
Replace the root `index.html` in `mfadholi27-bot/SBP-Accounting` with this package's `index.html`, then commit the change. GitHub Pages rebuilds the preview automatically.

## Important limitations
- Browser localStorage belongs to the current browser profile and device. It does not sync to GitHub or other devices.
- Clearing browser/site data can remove the local journal list. Use **Backup JSON** regularly and store backup files outside the repository.
- Excel import preview reads `.xlsx` via an external SheetJS library if internet access is available; CSV import works without that library. Imported rows currently enter the journal-list prototype after validation.
- This remains a browser preview/prototype. It is not yet a complete accounting system: account master persistence, detailed journal lines, edit/post workflows, formal financial statements, access control, and production audit guarantees require further implementation/testing.
- Do not commit real company accounting data or JSON backup files to the public GitHub repository.
