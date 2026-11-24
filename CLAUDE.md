# Rules for changing Receipts Express

Everything a person has in this app lives on their device and in the backup files they keep, often for
years. A change must not lose any of it, refuse to restore it, or quietly change the figures on a report.

## Backups

1. **A new version restores every backup any earlier version wrote.** Never make a check in the restore
   path stricter (`validateBackup` and the `isValid*` functions in `src/backup.ts`). If an old value cannot
   be stored as it is, repair it and say so in the restore prompt (`BackupPlan.counts`, shown by
   `ReportList.tsx`). Refuse a whole file only when no version of the app could have written it.
2. **Every backup the app writes passes its own restore**, including one made today from records an old
   version saved.
3. **A new stored field needs all of these in the same pull request:** the type in `src/types.ts` (or
   `src/profile.ts`); an optional check in `isValidReport`, `isValidExpense` or `isValidProfile`; a line in
   `pickReport`, `pickExpense` or `pickProfile`, without which a restore drops the field silently; the field
   in the `EVERY_*_FIELD` records in `src/backupCompat.test.ts`; and a new backup file in
   `src/test/fixtures/backups/` carrying it.
4. **Backup files in `src/test/fixtures/backups/` are added, never edited or deleted.** Each is pinned by
   hash in `src/backupCompat.test.ts`. Every value in them is invented.
5. **Raise the backup `version` only when an existing field changes shape or meaning**, and keep a converter
   in the restore path for every older version.

## Stored data

6. **Never change what an existing field means or its units:** amounts in currency units, exchange rates as
   1 foreign unit = N US dollars, dates as local yyyy-mm-dd. Add a new field instead. Never rename or remove
   an IndexedDB store, a field, or a `br.*` localStorage key.
7. **Code that reads stored records copes with any field added since 1.0.0 being missing**, as
   `getProfile` does.
8. **A database structure change is a new `if (oldVersion < N)` step in `src/db.ts`.** Existing steps are
   never edited. A release that raised the database version is never rolled back, because the older build
   cannot open the newer database and the app would not load for anyone who had updated. Fix forward.
9. **Typed input may be held to stricter rules than a restore** (currency codes, years in dates, text
   length), **but a value an earlier version saved keeps saving while its field is left alone.** See
   `save()` in `src/components/ExpenseEditor.tsx`.

## Report figures

10. **The figures on a report are pinned:** totals, the USD conversion, personal amounts, meal allowance
    balances, day labels and the CSV in `src/reportNumbers.test.ts`, and the PDF summary in
    `src/pdf.test.ts`, all for the invented report in `src/test/sampleReport.ts`. A change that moves one
    changes reports people are still building. Update the pin on purpose, in the same pull request, and say
    what changed in `CHANGELOG.md`.

## Releases

11. **A change to app behaviour bumps the version** in `package.json` and `package-lock.json` and adds a
    `CHANGELOG.md` entry. MAJOR is for a breaking change to stored data or the backup format.
12. **Before merging a change to `src/backup.ts`, `src/db.ts` or `src/types.ts`**, restore a backup made by
    the live version into the new build (`/verify`).
