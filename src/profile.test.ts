import { beforeEach, describe, expect, it } from 'vitest'
import { addProject, getProfile, profileSummaryLines, removeProject, saveProfile } from './profile'
import type { Profile } from './profile'

const empty: Profile = { name: '', employeeId: '', costCenter: '', projectNumber: '', projects: [] }

beforeEach(() => {
  localStorage.clear()
})

describe('getProfile / saveProfile', () => {
  it('returns all-empty fields when nothing has been saved', () => {
    expect(getProfile()).toEqual(empty)
  })

  it('round-trips a saved profile', () => {
    const profile: Profile = {
      name: 'Jane Doe',
      employeeId: 'E123',
      costCenter: 'CC-9',
      projectNumber: 'PRJ-1',
      projects: ['PRJ-1', 'PRJ-2'],
    }
    saveProfile(profile)
    expect(getProfile()).toEqual(profile)
  })

  it('falls back to defaults on corrupted storage instead of throwing', () => {
    localStorage.setItem('br.profile', '{not json')
    expect(getProfile()).toEqual(empty)
  })

  it('ignores non-string fields in stored data', () => {
    localStorage.setItem('br.profile', JSON.stringify({ name: 42, employeeId: null }))
    expect(getProfile()).toEqual(empty)
  })

  it('seeds the project list from a pre-list profile that only had one project number', () => {
    localStorage.setItem('br.profile', JSON.stringify({ name: 'Jane', projectNumber: 'PRJ-1' }))
    expect(getProfile().projects).toEqual(['PRJ-1'])
  })

  it('keeps the default project in the list and drops blanks and duplicates', () => {
    localStorage.setItem(
      'br.profile',
      JSON.stringify({ projectNumber: ' PRJ-1 ', projects: ['PRJ-2', '  ', 'prj-2', 'PRJ-1', 7] }),
    )
    const profile = getProfile()
    expect(profile.projectNumber).toBe('PRJ-1')
    expect(profile.projects).toEqual(['PRJ-1', 'PRJ-2'])
  })

  it('ignores a malformed projects field', () => {
    localStorage.setItem('br.profile', JSON.stringify({ projects: 'PRJ-1' }))
    expect(getProfile().projects).toEqual([])
  })
})

describe('addProject', () => {
  it('appends a trimmed project and makes the first one the default', () => {
    const profile = addProject(empty, '  PRJ-1  ')
    expect(profile.projects).toEqual(['PRJ-1'])
    expect(profile.projectNumber).toBe('PRJ-1')
  })

  it('leaves an existing default alone when adding more projects', () => {
    const profile = addProject(addProject(empty, 'PRJ-1'), 'PRJ-2')
    expect(profile.projects).toEqual(['PRJ-1', 'PRJ-2'])
    expect(profile.projectNumber).toBe('PRJ-1')
  })

  it('does not add a duplicate', () => {
    const profile = addProject(addProject(empty, 'PRJ-1'), 'prj-1')
    expect(profile.projects).toEqual(['PRJ-1'])
  })
})

describe('removeProject', () => {
  it('removes the project and clears the default when it was the default', () => {
    const profile = removeProject(addProject(addProject(empty, 'PRJ-1'), 'PRJ-2'), 'PRJ-1')
    expect(profile.projects).toEqual(['PRJ-2'])
    expect(profile.projectNumber).toBe('')
  })

  it('keeps the default when a different project is removed', () => {
    const profile = removeProject(addProject(addProject(empty, 'PRJ-1'), 'PRJ-2'), 'PRJ-2')
    expect(profile.projects).toEqual(['PRJ-1'])
    expect(profile.projectNumber).toBe('PRJ-1')
  })
})

describe('profileSummaryLines', () => {
  it('returns nothing when every field is empty or blank', () => {
    expect(profileSummaryLines({ ...empty, employeeId: '  ' })).toEqual([])
  })

  it('includes only the filled-in fields, trimmed, in a fixed order', () => {
    expect(profileSummaryLines({ ...empty, name: '  Jane Doe  ', costCenter: 'CC-9' })).toEqual([
      'Name: Jane Doe',
      'Cost Center: CC-9',
    ])
  })

  it('includes all four fields when all are set', () => {
    expect(
      profileSummaryLines({
        name: 'Jane',
        employeeId: 'E1',
        costCenter: 'CC-9',
        projectNumber: 'PRJ-1',
        projects: ['PRJ-1'],
      }),
    ).toEqual(['Name: Jane', 'Employee ID: E1', 'Cost Center: CC-9', 'Project Number: PRJ-1'])
  })

  it("uses the report's own project number over the profile default", () => {
    expect(profileSummaryLines({ ...empty, projectNumber: 'PRJ-1', projects: ['PRJ-1'] }, 'PRJ-2')).toEqual([
      'Project Number: PRJ-2',
    ])
  })

  it('falls back to the profile default when the report has no project number', () => {
    const profile = { ...empty, projectNumber: 'PRJ-1', projects: ['PRJ-1'] }
    expect(profileSummaryLines(profile, '')).toEqual(['Project Number: PRJ-1'])
    expect(profileSummaryLines(profile, undefined)).toEqual(['Project Number: PRJ-1'])
  })

  it('prints no project line when neither the report nor the profile has one', () => {
    expect(profileSummaryLines(empty, '  ')).toEqual([])
  })
})
