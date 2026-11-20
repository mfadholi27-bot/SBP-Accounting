# SBP Accounting V19 — HTML / CSS / JavaScript

V19 is an additive browser-based development line inside `/v19`. The previous application files at repository root are intentionally preserved.

## Technology
- HTML, CSS, vanilla JavaScript (no Java, C#, PHP, server, or SQL server).
- IndexedDB for local browser storage, with a limited localStorage fallback.
- PWA service worker for caching the application shell.
- Built-in DBF reader/writer for the supported dBASE-style record structure.
- No external JavaScript CDN dependency.

## Current modules
- Dashboard.
- Manual multi-line journal entry with debit-credit balance validation.
- Journal listing, search, edit, and delete.
- Account master (SANDI, account name, normal balance).
- NPTRANS CSV import using the six expected columns.
- DBF import and schema-template capture.
- NPSALDO / account CSV or DBF import (basic field-name mapping; verify the actual NPSALDO schema).
- NPTRANS CSV export.
- NPTRANS DBF export using the field descriptors captured from an original DBF template.
- Trial-balance summary from manually posted journals.
- JSON backup and restore.

## Open the V19 app
After this branch is merged and GitHub Pages publishes the repository, open:

`https://mfadholi27-bot.github.io/SBP-Accounting/v19/`

The source can be edited directly in GitHub's web interface, including from iPhone.

## NPTRANS compatibility safety
The six known logical columns are `SANDI, TANGGAL, NOBUKTI, NOURUT, KET, JUMLAH`. That list does **not** prove the original DBF field widths, types, decimals, encoding, deleted-record behavior, indexes, or NPTRANS-specific rules.

For this reason:
1. Upload an original `NPTRANS.DBF` as the export schema template before using DBF export.
2. The exporter reuses the template's field descriptors instead of inventing field widths.
3. Exported files must first be tested against a disposable copy of the old NPTRANS program and old DBF files.
4. This first V19 build does not automatically turn NPTRANS legacy rows into balanced debit-credit journals. The accounting rules and any counterpart logic must be verified first.
5. The exporter currently writes a DBF data file only; it does not regenerate CDX/NDX indexes or companion files.

## Data and offline notes
- Data is stored in the browser profile on the device where the app is used.
- Browser data does not automatically sync to another device.
- Clearing website/browser storage can remove local data. Download JSON backups regularly.
- PWA offline caching requires the app to be opened once while online and a browser that supports service workers.
- Test with disposable data before official bookkeeping use.

## Suggested verification before production
- Confirm the exact NPTRANS and NPSALDO DBF schemas.
- Verify character encoding and numeric precision with real legacy samples.
- Compare exported DBF records and totals against the old system.
- Validate all journal, ledger, opening balance, closing period, correction, and report rules.
- Test backup/restore and browser storage behavior on target Windows browsers and iPhone Safari.
