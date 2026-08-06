interface Props {
  /** The report's own project number; empty means "use the profile default". */
  value: string
  /** Saved project numbers from the profile. */
  projects: string[]
  /** The profile's default, shown as what the blank option falls back to. */
  defaultProject: string
  onChange: (value: string) => void
  label?: string
}

/**
 * Picks which saved project number a report is charged to. A report whose
 * project was since deleted from the saved list still shows its own value,
 * so opening the picker can't silently reassign it.
 */
export default function ProjectSelect({
  value,
  projects,
  defaultProject,
  onChange,
  label = 'Project number',
}: Props) {
  const options = value && !projects.includes(value) ? [...projects, value] : projects
  return (
    <label className="field span-2">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{defaultProject ? `Default — ${defaultProject}` : 'No project number'}</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  )
}
