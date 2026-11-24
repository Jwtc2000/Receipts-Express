import { useEffect, useId, useRef, useState } from 'react'
import type { Expense, Report } from '../types'
import { ENTRY_YEAR_MESSAGE, formatMoney, formatTotal, isEntryDate, newId, todayIso } from '../types'
import { listReports, listExpenses, saveReport, deleteReport } from '../db'
import {
  exportBackup,
  validateBackup,
  commitBackup,
  lastBackupAt,
  backupIsStale,
  dismissBackupWarning,
  shouldShowBackupWarning,
  MAX_STRING_LENGTH,
  BackupTooLargeError,
} from '../backup'
import { addProject, getProfile, removeProject, saveProfile, type Profile } from '../profile'
import { expenseMatches } from '../search'
import { useModal } from '../hooks/useModal'
import Icon from './icons'
import DrawerSection from './DrawerSection'
import ProjectSelect from './ProjectSelect'
import { ArrowDivider, HeaderPlanes, SeasonGreeting } from './decorative'
import { LogoTitle } from './LogoTitle'

interface ReportSummary {
  report: Report
  count: number
  totalDisplay: string
}

interface Props {
  onOpenReport: (id: string) => void
  onEditExpense: (reportId: string, expenseId: string) => void
}

export default function ReportList({ onOpenReport, onEditExpense }: Props) {
  const [summaries, setSummaries] = useState<ReportSummary[] | null>(null)
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  const [reportNames, setReportNames] = useState<Map<string, string>>(new Map())
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState(todayIso)
  const [newEndDate, setNewEndDate] = useState(todayIso)
  const [newMealAllowance, setNewMealAllowance] = useState('')
  // A trip date with a year outside what the app takes (see isEntryDate).
  const [newDateError, setNewDateError] = useState<string | null>(null)
  const newDateErrorId = useId()
  const newStartDateBad = !!newDateError && !!newStartDate && !isEntryDate(newStartDate)
  const newEndDateBad = !!newDateError && !!newEndDate && !isEntryDate(newEndDate)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupNote, setBackupNote] = useState<string | null>(null)
  const [backupTick, setBackupTick] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [profile, setProfile] = useState<Profile>(() => getProfile())
  const [newProject, setNewProject] = useState('')
  const [newReportProject, setNewReportProject] = useState('')
  const restoreInput = useRef<HTMLInputElement>(null)
  // Fields in the drawer save when they lose focus. Closing it with Escape,
  // the backdrop or the close button used to remove the field without it
  // ever losing focus, so the edit was dropped. Blur it first.
  const closeMenu = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && menuRef.current?.contains(active)) active.blur()
    setMenuOpen(false)
  }
  const menuRef = useModal<HTMLElement>(menuOpen, () => closeMenu())

  const setProfileField = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }))
  const persistProfile = () => saveProfile(profile)
  // The project list is edited by button, not by typing, so it's saved
  // immediately rather than on blur like the free-text fields above.
  const updateProfile = (next: Profile) => {
    setProfile(next)
    saveProfile(next)
  }

  const refresh = async () => {
    const reports = await listReports()
    const result: ReportSummary[] = []
    const flatExpenses: Expense[] = []
    const names = new Map<string, string>()
    for (const report of reports) {
      const expenses = await listExpenses(report.id)
      flatExpenses.push(...expenses)
      names.set(report.id, report.name)
      result.push({
        report,
        count: expenses.length,
        totalDisplay: formatTotal(expenses),
      })
    }
    setSummaries(result)
    setAllExpenses(flatExpenses)
    setReportNames(names)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const query = searchQuery.trim()
  const searchResults = query ? allExpenses.filter((e) => expenseMatches(e, query)) : []

  const toggleSearch = () => {
    if (searchOpen) setSearchQuery('')
    setSearchOpen((v) => !v)
  }

  const createReport = async () => {
    const name = newName.trim()
    if (!name) return
    if ([newStartDate, newEndDate].some((d) => d && !isEntryDate(d))) {
      setNewDateError(ENTRY_YEAR_MESSAGE)
      return
    }
    const startDate = newStartDate
    const endDate = newEndDate < startDate ? startDate : newEndDate
    const dailyMealAllowance = Math.max(0, parseFloat(newMealAllowance)) || 0
    const report: Report = {
      id: newId(),
      name,
      createdAt: Date.now(),
      startDate,
      endDate,
      dailyMealAllowance,
      ...(newReportProject ? { projectNumber: newReportProject } : {}),
    }
    await saveReport(report)
    setNewName('')
    setNewStartDate(todayIso())
    setNewEndDate(todayIso())
    setNewMealAllowance('')
    setNewReportProject('')
    setNewDateError(null)
    setCreating(false)
    onOpenReport(report.id)
  }

  const doBackup = async () => {
    setBackupBusy(true)
    setBackupNote(null)
    try {
      const done = await exportBackup()
      // Not "Backup saved": the download path can only confirm the browser
      // accepted the file, not that it was kept (see the caveat on
      // shareOrDownloadFile in share.ts). Saying "saved" would tell the user
      // they have a copy that may not exist.
      if (done) setBackupNote('Backup file created — check it saved')
    } catch (err) {
      // A library too large for the file format says so in its own words;
      // "try again" would be advice that cannot work.
      setBackupNote(err instanceof BackupTooLargeError ? err.message : 'Backup failed — try again')
    } finally {
      setBackupBusy(false)
      setBackupTick((t) => t + 1)
    }
  }

  // A restore writes with `put`, so a record in the backup replaces the record
  // on this device that shares its id — including one edited since the backup
  // was taken — and nothing can undo that. So the file is validated first,
  // which touches nothing, and the user is shown what the restore would do
  // before any of it happens.
  const doRestore = async (file: File | undefined) => {
    if (!file) return
    setBackupBusy(true)
    setBackupNote(null)
    try {
      const plan = await validateBackup(file)
      const { reports, expenses, overwrites, missingImages, skippedExpenses, unreadableAmounts, clearedAllowances } =
        plan.counts
      const exported = plan.exportedAt ? new Date(plan.exportedAt) : null
      const taken =
        exported && !Number.isNaN(exported.getTime())
          ? `taken ${exported.toLocaleString()}`
          : 'with no export date recorded'
      const message = [
        `Restore this backup, ${taken}?`,
        '',
        `It holds ${reports} report${reports === 1 ? '' : 's'} and ${expenses} expense${expenses === 1 ? '' : 's'}.`,
        overwrites > 0
          ? `${overwrites} record${overwrites === 1 ? '' : 's'} already on this device will be replaced by the copy in the backup, even where this device's copy is newer. That can't be undone.`
          : 'No report or expense already on this device will be replaced.',
        ...(missingImages > 0
          ? ['', `${missingImages} receipt page${missingImages === 1 ? '' : 's'} the expenses refer to ${missingImages === 1 ? 'is' : 'are'} not in this file, so ${missingImages === 1 ? 'it' : 'they'} will be missing after the restore.`]
          : []),
        // Both come only from files written by older versions; see backup.ts.
        ...(skippedExpenses > 0
          ? ['', `${skippedExpenses} expense${skippedExpenses === 1 ? '' : 's'} in this file belong${skippedExpenses === 1 ? 's' : ''} to a report the file doesn't have, so ${skippedExpenses === 1 ? 'it' : 'they'} will be left out. The app had no way to show ${skippedExpenses === 1 ? 'it' : 'them'}.`]
          : []),
        ...(unreadableAmounts > 0
          ? ['', `${unreadableAmounts} expense${unreadableAmounts === 1 ? ' has an amount' : 's have amounts'} this file couldn't hold, so ${unreadableAmounts === 1 ? 'it' : 'they'} will be restored as 0. Check ${unreadableAmounts === 1 ? 'it' : 'them'} after the restore.`]
          : []),
        ...(clearedAllowances > 0
          ? ['', `${clearedAllowances} report${clearedAllowances === 1 ? ' has a daily meal allowance' : 's have daily meal allowances'} this file couldn't hold, so ${clearedAllowances === 1 ? 'it' : 'they'} will be restored with none. Set ${clearedAllowances === 1 ? 'it' : 'them'} again in the report menu.`]
          : []),
        // The profile is not one of those records: it has no id to match on,
        // and the backup's copy simply takes the place of this device's.
        ...(plan.profile
          ? ['', 'The name, employee ID, cost center and project numbers saved on this device will be replaced by the ones in the backup.']
          : []),
      ].join('\n')
      if (!window.confirm(message)) {
        setBackupNote('Restore cancelled — nothing was changed')
        return
      }
      const committed = await commitBackup(plan)
      // A backup can carry a profile, and commitBackup writes it straight to
      // localStorage — so `profile` in this component is now the pre-restore
      // copy. Left alone, the next blur on any profile field would save that
      // stale copy back over the one the restore just wrote, losing it with no
      // sign anything happened. Re-read from storage rather than trusting
      // plan.profile, so this matches what actually landed in every case: the
      // file carried none, it was written, or the write failed.
      setProfile(getProfile())
      const restored = `Restored ${reports} report${reports === 1 ? '' : 's'}, ${expenses} expense${expenses === 1 ? '' : 's'}`
      setBackupNote(
        committed.profile === 'failed'
          ? `${restored} — but the profile in the backup couldn't be saved, so this device's own is unchanged`
          : restored,
      )
      await refresh()
    } catch (err) {
      // validateBackup names what it rejected — which record, or which limit.
      // Showing that beats collapsing every failure into one guess about the
      // file, which left a user with a genuine backup no way to tell whether
      // they picked the wrong file or hit a size limit.
      setBackupNote(
        err instanceof Error && err.message
          ? `Couldn't restore: ${err.message}`
          : "Couldn't read that file — is it a Receipts Express backup?",
      )
    } finally {
      setBackupBusy(false)
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  const removeReport = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Delete report "${name}" with all its expenses and receipts? This can't be undone. If you might need it later, back up or export it first.`,
      )
    )
      return
    await deleteReport(id)
    await refresh()
  }

  return (
    <>
      <header className="topbar">
        <HeaderPlanes />
        <div className="topbar-title">
          <h1 className="logo-heading" title="Receipts Express">
            <LogoTitle />
          </h1>
        </div>
        <button
          className="icon-btn"
          aria-label={searchOpen ? 'Close search' : 'Search expenses'}
          onClick={toggleSearch}
        >
          <Icon name={searchOpen ? 'close' : 'search'} size={22} />
        </button>
        <button
          className="icon-btn"
          aria-label={backupBusy ? 'Backing up…' : 'Back up receipts'}
          onClick={() => void doBackup()}
          disabled={backupBusy}
        >
          <Icon name="backup" size={22} />
        </button>
        <button className="icon-btn menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
      </header>

      {searchOpen && (
        <div className="search-bar">
          <Icon name="search" size={16} />
          <input
            autoFocus
            type="text"
            inputMode="search"
            aria-label="Search all expenses"
            placeholder="Search all expenses by title, merchant, or amount…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setSearchQuery('')}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      )}

      {menuOpen && (
        <div className="drawer-backdrop" onClick={closeMenu}>
          <aside
            ref={menuRef}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-menu-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <h2 id="home-menu-title">Menu</h2>
              <button className="icon-btn" aria-label="Close menu" onClick={closeMenu}>
                <Icon name="close" />
              </button>
            </div>

            <div className="drawer-section">
              <DrawerSection title="Profile">
                <p className="muted">
                  Optional — fill in what applies and it'll appear on the summary page of your PDF
                  exports.
                </p>
                <div className="field-grid">
                  <label className="field span-2">
                    <span>Name</span>
                    {/* maxLength on every free-text field here, and on the
                        report name below: MAX_STRING_LENGTH is the app's limit
                        on typed text, kept below what a restore accepts, so
                        whatever is typed here can be restored. */}
                    <input
                      maxLength={MAX_STRING_LENGTH}
                      placeholder="Jane Doe"
                      value={profile.name}
                      onChange={(e) => setProfileField({ name: e.target.value })}
                      onBlur={persistProfile}
                    />
                  </label>
                  <label className="field">
                    <span>Employee ID</span>
                    <input
                      maxLength={MAX_STRING_LENGTH}
                      placeholder="E12345"
                      value={profile.employeeId}
                      onChange={(e) => setProfileField({ employeeId: e.target.value })}
                      onBlur={persistProfile}
                    />
                  </label>
                  <label className="field">
                    <span>Cost Center</span>
                    <input
                      maxLength={MAX_STRING_LENGTH}
                      placeholder="CC-100"
                      value={profile.costCenter}
                      onChange={(e) => setProfileField({ costCenter: e.target.value })}
                      onBlur={persistProfile}
                    />
                  </label>
                </div>
              </DrawerSection>

              <ArrowDivider />

              <DrawerSection title="Project Numbers">
                <p className="muted">
                  Save the projects you charge to, then pick one per report — each report's PDF
                  prints its own project number.
                </p>
                {profile.projects.length > 0 && (
                  <ul className="project-list">
                    {profile.projects.map((code) => (
                      <li key={code} className={code === profile.projectNumber ? 'is-default' : ''}>
                        <span className="project-code">{code}</span>
                        {code === profile.projectNumber ? (
                          <span className="project-default-tag">Default</span>
                        ) : (
                          <button
                            className="btn ghost small"
                            onClick={() => updateProfile({ ...profile, projectNumber: code })}
                          >
                            Make default
                          </button>
                        )}
                        <button
                          className="icon-btn danger"
                          aria-label={`Remove project ${code}`}
                          onClick={() => updateProfile(removeProject(profile, code))}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="project-add"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!newProject.trim()) return
                    updateProfile(addProject(profile, newProject))
                    setNewProject('')
                  }}
                >
                  <input
                    aria-label="Project number to add"
                    maxLength={MAX_STRING_LENGTH}
                    placeholder="PRJ-42"
                    value={newProject}
                    onChange={(e) => setNewProject(e.target.value)}
                  />
                  <button type="submit" className="btn primary small" disabled={!newProject.trim()}>
                    Add
                  </button>
                </form>
                {profile.projects.length > 0 && (
                  <p className="muted">
                    New reports start on the default and can be switched from the report's own menu.
                  </p>
                )}
              </DrawerSection>

              <ArrowDivider />

              <DrawerSection title="About">
                <p>
                  Receipts Express scans your receipts with on-device OCR, organizes them into expense
                  reports, and exports polished PDFs.
                </p>
                <p>
                  Everything stays on your device — receipts and reports are stored locally and are
                  never uploaded anywhere. Use the Backup card on the home screen to keep an
                  off-device copy.
                </p>
                <p className="muted">
                  As a browser-based app, that local storage isn't guaranteed to last — clearing
                  site data, switching browsers or devices, or an OS storage cleanup can erase it
                  permanently, with no server copy to restore from. Back up regularly.
                </p>
                <p style={{ marginTop: '0.75rem' }}>
                  <a
                    className="drawer-link"
                    href="./docs/pilot-deck.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Pilot Slide Deck
                  </a>
                </p>
                <p>
                  <a
                    className="drawer-link"
                    href="./docs/privacy.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                  <span aria-hidden="true"> · </span>
                  <a
                    className="drawer-link"
                    href="./docs/terms.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Terms of Use
                  </a>
                </p>
                {/* Its own link, not folded into the line above: RCW
                    19.373.020(1)(b) and the Washington AG's guidance call for
                    a separate and distinct link to the consumer health data
                    policy, and for an app the "homepage" for that purpose
                    includes the About screen. */}
                <p>
                  <a
                    className="drawer-link"
                    href="./docs/consumer-health-data.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Consumer Health Data Privacy Policy
                  </a>
                </p>
                <p className="muted">
                  Version {__APP_VERSION__}{' '}
                  <span style={{ fontSize: '0.8em', opacity: 0.7 }}>({__COMMIT_HASH__})</span>
                </p>
              </DrawerSection>
            </div>

            <footer className="drawer-footer">
              <p>
                Independent personal project — no affiliation with, endorsement from, or approval
                by FedEx or any employer.
              </p>
              <p>Exported PDFs are your responsibility once saved or shared outside this app.</p>
            </footer>
          </aside>
        </div>
      )}

      <main className="content">
        {!query && <SeasonGreeting />}
        {query ? (
          searchResults.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="search" size={52} />
              </div>
              <h2>No matches</h2>
              <p className="muted">Try a different title, merchant, or amount.</p>
            </div>
          ) : (
            <ul className="report-list">
              {searchResults.map((expense) => (
                <li key={expense.id} className="report-card">
                  <button
                    type="button"
                    className="report-card-main"
                    onClick={() => onEditExpense(expense.reportId, expense.id)}
                  >
                    <h3>{expense.title || expense.merchant || 'Untitled expense'}</h3>
                    <p className="muted">
                      {reportNames.get(expense.reportId) ?? 'Unknown report'} · {expense.date || 'No date'}
                    </p>
                  </button>
                  <div className="report-card-side">
                    <span className="report-total">{formatMoney(expense.amount, expense.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : summaries === null ? (
          <p className="muted center">Loading…</p>
        ) : summaries.length === 0 && !creating ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="receipt" size={52} />
            </div>
            <h2>No reports yet</h2>
            <p className="muted">Create a report, then scan receipts into it.</p>
          </div>
        ) : (
          <ul className="report-list">
            {summaries.map(({ report, count, totalDisplay }) => (
              // Only the main area is the button, not the whole card: the card
              // also holds the delete button, and a <button> may not contain
              // another one — browsers resolve that nesting unpredictably.
              // Keeping them siblings is also what lets the delete handler drop
              // its stopPropagation, since there is no longer an outer click to
              // stop.
              <li key={report.id} className="report-card">
                <button
                  type="button"
                  className="report-card-main"
                  onClick={() => onOpenReport(report.id)}
                >
                  <h3>{report.name}</h3>
                  <p className="muted">
                    {count} expense{count === 1 ? '' : 's'}
                    {report.projectNumber ? ` · ${report.projectNumber}` : ''}
                  </p>
                </button>
                <div className="report-card-side">
                  <span className="report-total">{totalDisplay}</span>
                  <button
                    className="icon-btn danger"
                    aria-label={`Delete ${report.name}`}
                    onClick={() => void removeReport(report.id, report.name)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!query && summaries !== null && (() => {
          void backupTick // re-read localStorage after each backup
          const hasData = summaries.some((s) => s.count > 0)
          const last = lastBackupAt()
          const showWarning = hasData && shouldShowBackupWarning()
          // Stale but snoozed: hide the card entirely rather than leaving a
          // plain-styled "Never backed up" card that reads as a second,
          // undismissable nag. A healthy (recently backed up) card still
          // shows, since that's ongoing utility (Restore access), not a nag.
          if (hasData && backupIsStale() && !showWarning) return null
          return (
            <section className={`backup-card${showWarning ? ' stale' : ''}`}>
              <div className="backup-info">
                <h3>
                  {showWarning && <Icon name="warning" size={16} />}
                  {showWarning ? 'Back up your receipts' : 'Backup'}
                </h3>
                {/* A live region rather than plain text: the result of a
                    backup or a restore is otherwise only ever reported by the
                    text quietly changing here. It sits on the paragraph rather
                    than on a wrapper added alongside the note, because a live
                    region that appears at the same moment as its message is
                    usually not announced at all — this one is already on
                    screen, next to the buttons that produce the message. */}
                <p className="muted" role="status">
                  {backupNote ??
                    (last
                      ? `Last backup ${new Date(last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : hasData
                        ? 'Never backed up — save a copy of your data'
                        : 'Backs up all reports and receipt photos to a file')}
                </p>
              </div>
              <div className="backup-actions">
                <button className="btn primary small" onClick={() => void doBackup()} disabled={backupBusy}>
                  {backupBusy ? 'Working…' : 'Back up now'}
                </button>
                <button className="btn ghost small" onClick={() => restoreInput.current?.click()} disabled={backupBusy}>
                  Restore
                </button>
                {showWarning && (
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      dismissBackupWarning()
                      setBackupTick((t) => t + 1)
                    }}
                  >
                    Not now
                  </button>
                )}
              </div>
              <input
                ref={restoreInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void doRestore(e.target.files?.[0])}
              />
            </section>
          )
        })()}

        {!query &&
          (creating ? (
            <form
              className="new-report-form"
              onSubmit={(e) => {
                e.preventDefault()
                void createReport()
              }}
            >
              <input
                autoFocus
                aria-label="Report name"
                maxLength={MAX_STRING_LENGTH}
                placeholder="Report name — e.g. NYC Trip July"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="field-grid">
                <label className="field">
                  <span>Trip start</span>
                  <input
                    type="date"
                    aria-invalid={newStartDateBad || undefined}
                    aria-describedby={newStartDateBad ? newDateErrorId : undefined}
                    value={newStartDate}
                    onChange={(e) => {
                      setNewDateError(null)
                      setNewStartDate(e.target.value)
                      if (newEndDate < e.target.value) setNewEndDate(e.target.value)
                    }}
                  />
                </label>
                <label className="field">
                  <span>Trip end</span>
                  <input
                    type="date"
                    min={newStartDate}
                    aria-invalid={newEndDateBad || undefined}
                    aria-describedby={newEndDateBad ? newDateErrorId : undefined}
                    value={newEndDate}
                    onChange={(e) => {
                      setNewDateError(null)
                      setNewEndDate(e.target.value)
                    }}
                  />
                </label>
                <label className="field span-2">
                  <span>Daily meal allowance (optional)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newMealAllowance}
                    onChange={(e) => setNewMealAllowance(e.target.value)}
                  />
                </label>
                {profile.projects.length > 0 && (
                  <ProjectSelect
                    value={newReportProject}
                    projects={profile.projects}
                    defaultProject={profile.projectNumber}
                    onChange={setNewReportProject}
                  />
                )}
              </div>
              {newDateError && (
                <div className="scan-banner warn" role="alert" id={newDateErrorId}>
                  {newDateError}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setNewDateError(null)
                    setCreating(false)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={!newName.trim()}>
                  Create
                </button>
              </div>
            </form>
          ) : (
            <button
              className="fab"
              onClick={() => {
                setNewReportProject(profile.projectNumber)
                setCreating(true)
              }}
            >
              <Icon name="plus" size={20} />
              New Report
            </button>
          ))}
      </main>
    </>
  )
}
