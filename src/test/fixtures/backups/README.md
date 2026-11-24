# Backups from earlier versions

Each file here is a backup as the version in its name wrote it, holding the
values that version let someone save. `src/backupCompat.test.ts` restores every
one, then backs the result up again and restores that.

- **Add** a file when a version changes what a backup can hold: a new field, a
  new kind of value, a new format version.
- **Never edit** a file. Each is pinned by hash in `backupCompat.test.ts`, so an
  edit fails the tests. If a file is wrong, add a corrected one beside it.
- **Only invented data.** No real receipts, names, merchants or amounts.
