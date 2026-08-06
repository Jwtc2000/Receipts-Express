import { useEffect, useRef, useState } from 'react'
import type { Expense, Report } from '../types'
import { formatMoney, formatTotal, newId, todayIso } from '../types'
import { listReports, listExpenses, saveReport, deleteReport } from '../db'
import {
  exportBackup,
  importBackup,
  lastBackupAt,
  backupIsStale,
  dismissBackupWarning,
  shouldShowBackupWarning,
} from '../backup'
import { addProject, getProfile, removeProject, saveProfile, type Profile } from '../profile'
import { expenseMatches } from '../search'
import Icon from './icons'
import DrawerSection from './DrawerSection'
import ProjectSelect from './ProjectSelect'
import { ArrowDivider, HeaderPlanes } from './decorative'

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
    setCreating(false)
    onOpenReport(report.id)
  }

  const doBackup = async () => {
    setBackupBusy(true)
    setBackupNote(null)
    try {
      const done = await exportBackup()
      if (done) setBackupNote('Backup saved')
    } catch {
      setBackupNote('Backup failed — try again')
    } finally {
      setBackupBusy(false)
      setBackupTick((t) => t + 1)
    }
  }

  const doRestore = async (file: File | undefined) => {
    if (!file) return
    setBackupBusy(true)
    setBackupNote(null)
    try {
      const { reports, expenses } = await importBackup(file)
      setBackupNote(`Restored ${reports} report${reports === 1 ? '' : 's'}, ${expenses} expense${expenses === 1 ? '' : 's'}`)
      await refresh()
    } catch {
      setBackupNote("Couldn't read that file — is it a Receipts Express backup?")
    } finally {
      setBackupBusy(false)
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  const removeReport = async (id: string, name: string) => {
    if (!window.confirm(`Delete report "${name}" and all its expenses?`)) return
    await deleteReport(id)
    await refresh()
  }

  return (
    <>
      <header className="topbar">
        <HeaderPlanes />
        <div className="topbar-title">
          <span className="logo">
            <Icon name="receipt" size={24} />
          </span>
          <h1>Receipts Express</h1>
          <span className="express-arrow">
            <Icon name="express-arrow" size={26} />
          </span>
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
        <div className="drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Menu</h2>
              <button className="icon-btn" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
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
                    <input
                      placeholder="Jane Doe"
                      value={profile.name}
                      onChange={(e) => setProfileField({ name: e.target.value })}
                      onBlur={persistProfile}
                    />
                  </label>
                  <label className="field">
                    <span>Employee ID</span>
                    <input
                      placeholder="E12345"
                      value={profile.employeeId}
                      onChange={(e) => setProfileField({ employeeId: e.target.value })}
                      onBlur={persistProfile}
                    />
                  </label>
                  <label className="field">
                    <span>Cost Center</span>
                    <input
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
                    href="./docs/pilot-deck.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#2dd4bf',
                      textDecoration: 'underline',
                      fontWeight: 600,
                    }}
                  >
                    View Pilot Slide Deck
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
                <li
                  key={expense.id}
                  className="report-card"
                  onClick={() => onEditExpense(expense.reportId, expense.id)}
                >
                  <div className="report-card-main">
                    <h3>{expense.title || expense.merchant || 'Untitled expense'}</h3>
                    <p className="muted">
                      {reportNames.get(expense.reportId) ?? 'Unknown report'} · {expense.date || 'No date'}
                    </p>
                  </div>
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
              <li key={report.id} className="report-card" onClick={() => onOpenReport(report.id)}>
                <div className="report-card-main">
                  <h3>{report.name}</h3>
                  <p className="muted">
                    {count} expense{count === 1 ? '' : 's'}
                    {report.projectNumber ? ` · ${report.projectNumber}` : ''}
                  </p>
                </div>
                <div className="report-card-side">
                  <span className="report-total">{totalDisplay}</span>
                  <button
                    className="icon-btn danger"
                    aria-label={`Delete ${report.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeReport(report.id, report.name)
                    }}
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
                <p className="muted">
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
                placeholder="Report name — e.g. NYC Trip July"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="field-grid">
                <label className="field">
                  <span>Trip start</span>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => {
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
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
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
              <div className="form-actions">
                <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
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
              + New Report
            </button>
          ))}
      </main>
    </>
  )
}
