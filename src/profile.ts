/**
 * Optional user attributes (not tied to any one report) that, when filled
 * in, are printed on the summary page of every PDF export. Stored in
 * localStorage since it's a handful of small strings, not report data.
 */
export interface Profile {
  name: string
  employeeId: string
  costCenter: string
  /** Default project number — used by reports that haven't picked their own. */
  projectNumber: string
  /**
   * Saved project numbers to pick from, so someone charging several
   * projects can bill each report to a different one. Always contains
   * `projectNumber` when that's set.
   */
  projects: string[]
}

const PROFILE_KEY = 'br.profile'

/** Plenty for one person's project list; keeps a corrupted file from ballooning. */
const MAX_PROJECTS = 50

const emptyProfile: Profile = {
  name: '',
  employeeId: '',
  costCenter: '',
  projectNumber: '',
  projects: [],
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Trim, drop blanks, de-duplicate (case-insensitively) and cap the list. */
function normalizeProjects(codes: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of codes) {
    const code = raw.trim()
    if (!code) continue
    const key = code.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(code)
    if (out.length === MAX_PROJECTS) break
  }
  return out
}

export function getProfile(): Profile {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return { ...emptyProfile, projects: [] }
  try {
    const parsed = JSON.parse(raw)
    const projectNumber = str(parsed.projectNumber)
    const stored = Array.isArray(parsed.projects) ? parsed.projects.map(str) : []
    // Profiles saved before project lists existed only have the single
    // `projectNumber`; seed the list from it so it shows up as a choice.
    return {
      name: str(parsed.name),
      employeeId: str(parsed.employeeId),
      costCenter: str(parsed.costCenter),
      projectNumber: projectNumber.trim(),
      projects: normalizeProjects([projectNumber, ...stored]),
    }
  } catch {
    return { ...emptyProfile, projects: [] }
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

/**
 * Add a project number to the saved list. The first one saved also becomes
 * the default, since a single-project user shouldn't have to pick one twice.
 */
export function addProject(profile: Profile, code: string): Profile {
  const projects = normalizeProjects([...profile.projects, code])
  return {
    ...profile,
    projects,
    projectNumber: profile.projectNumber || (projects.length === 1 ? projects[0] : ''),
  }
}

/** Remove a project number, clearing the default if that's what was removed. */
export function removeProject(profile: Profile, code: string): Profile {
  const projects = profile.projects.filter((p) => p !== code)
  return {
    ...profile,
    projects,
    projectNumber: profile.projectNumber === code ? '' : profile.projectNumber,
  }
}

/**
 * The non-empty attributes, as "Label: value" pairs, in a fixed display
 * order. `reportProjectNumber` — the project a single report is charged to
 * — takes precedence over the profile's default for that report's export.
 */
export function profileSummaryLines(profile: Profile, reportProjectNumber?: string): string[] {
  const projectNumber = (reportProjectNumber ?? '').trim() || profile.projectNumber.trim()
  return [
    profile.name.trim() && `Name: ${profile.name.trim()}`,
    profile.employeeId.trim() && `Employee ID: ${profile.employeeId.trim()}`,
    profile.costCenter.trim() && `Cost Center: ${profile.costCenter.trim()}`,
    projectNumber && `Project Number: ${projectNumber}`,
  ].filter((line): line is string => Boolean(line))
}
