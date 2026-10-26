# Repository layout and next steps

## Current source
The existing WinForms/SQLite project files are kept at the package root to avoid breaking project-relative paths. This is a compatibility-first layout; moving files into a nested `src/` directory can be done later as a separate, tested change.

## Suggested GitHub repository layout
- `/index.html` — existing GitHub Pages UI preview (leave untouched)
- `/README.md` — repository overview
- `/.gitignore` — local data exclusions
- `/Program.cs`, `/MainForm.cs`, `/AccountingDb.cs`, `/DbfReader.cs`
- `/SBPAccounting.sln`, `/SBPAccounting.csproj`
- `/docs/` — architecture, build notes, test checklist
- `/Data/Legacy/README_LOCAL_DATA.txt` — local-only DBF instructions

## Validation checklist
1. Build on Windows with the .NET 10 SDK.
2. Test only against a disposable SQLite database.
3. Verify journal debit equals credit and posted journals are protected from direct editing.
4. Verify backup and restore using disposable copies.
5. Verify DBF import reads source files without writing to them.
6. Confirm Git status does not include `*.db`, `*.db-wal`, `*.db-shm`, `*.bak`, or `*.DBF`.
