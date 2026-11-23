import { Component, type ReactNode } from 'react'
import { exportBackup } from '../backup'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
  backupNote: string | null
}

/**
 * Without this, an exception while rendering unmounted the whole app and
 * left a blank page, with the backup controls gone along with everything
 * else. The data in storage is untouched by a render error, so the fallback
 * offers the two things that matter: a reload, and a backup made directly
 * through the backup module rather than through the screens that failed.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, backupNote: null }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('Render error', error)
  }

  private backUp = async () => {
    this.setState({ backupNote: 'Working…' })
    try {
      const done = await exportBackup()
      this.setState({ backupNote: done ? 'Backup file created — check it saved' : 'Backup cancelled' })
    } catch (err) {
      this.setState({ backupNote: err instanceof Error && err.message ? err.message : 'Backup failed' })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>
          This screen hit an error and could not be shown. Your reports and receipts are still
          stored on this device. Reloading usually fixes it. If it keeps happening, back up your
          data first.
        </p>
        <div className="crash-actions">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" className="btn ghost" onClick={() => void this.backUp()}>
            Back up now
          </button>
        </div>
        {this.state.backupNote && <p className="muted">{this.state.backupNote}</p>}
      </main>
    )
  }
}
