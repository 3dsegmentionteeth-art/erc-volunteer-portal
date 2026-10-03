# ERC Volunteer Portal — agent rules

`docs/QA.md` is an append-only session log. Corrections are disclosed notes
inside the entry being corrected (see the existing Phase 5.1 / 6.1
"correction, disclosed" entries); history is never silently rewritten.

- **Take every entry-header timestamp from a live clock read at write time,**
recorded as UTC plus local zone — e.g. `10:55 UTC / 13:55 UTC+3,
   2026-09-23`. PowerShell 7: `Get-Date -AsUTC` (+ `Get-Date`). PowerShell 5
   (this project's shell): `[DateTime]::UtcNow` / `(Get-Date).ToUniversalTime()`
   (+ `Get-Date` for the local value); paste the clock output verbatim into the
   header.
- A header time that recurs a remembered number, reuses an earlier line's
  value, or is estimated is a defect: reread the clock and paste what it says.
- Re-dating a header goes through a disclosed correction note naming the
  machine evidence (clock read, log line, file mtime), never a silent edit.