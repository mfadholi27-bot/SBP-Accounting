# CHANGELOG — SBP Accounting V19

## 2026-11-12 — Periodic Ledger Print safety pass

- Added a read-only state snapshot guard around Buku Besar print generation.
- The print flow now logs a passing integrity message when the in-memory accounting state is unchanged, and raises a visible warning if any state mutation is detected.
- Updated the V19 build stamp to `SBP-V19-LEDGER-PRINT-003`.
- Existing Buku Besar period selector remains month-based (`YYYY-MM`); this change does not claim date-range/year print support.
- No journal, account, or opening-balance records are rewritten by this change.

### Validation status
- Source-level guard added.
- Browser execution, print-dialog behavior, IndexedDB persistence verification, and live GitHub Pages preview still require runtime testing before release.
