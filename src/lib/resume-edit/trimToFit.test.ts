import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTrimResponse, applyTrimChanges, isTrimEmpty } from './trimToFit.ts'
import type { ResumeEditorState } from '../types.ts'

function baseState(): ResumeEditorState {
    return {
        profile: { name: 'Jane Doe', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
        summary: 'Backend engineer with 3 years of experience.',
        education: [],
        experience: [
            {
                company: 'Acme Corp', title: 'Software Engineer', startDate: '2022', endDate: 'Present', location: 'Remote',
                bullets: [
                    'Built REST APIs using Node.js and Express.',
                    'Wrote unit tests improving coverage from 40% to 85%.',
                    'Reviewed pull requests for a team of 5 engineers.',
                    'Migrated a legacy service to TypeScript.',
                    'Set up CI/CD pipelines using GitHub Actions.',
                    'Mentored two junior engineers.',
                ],
            },
        ],
        projects: [
            { name: 'Project A', tech: 'React', date: '2023', bullets: ['Built a dashboard.', 'Added charts.'] },
            { name: 'Project B', tech: 'Python', date: '2023', bullets: ['Wrote a scraper.'] },
            { name: 'Project C', tech: 'Go', date: '2022', bullets: ['Built a CLI tool.'] },
            { name: 'Project D', tech: 'Rust', date: '2022', bullets: ['Wrote a parser.'] },
        ],
        skills: { languages: 'TypeScript, Python', tools: 'Docker, Git', frameworks: 'React, Express', soft: '' },
        leadership: [],
        certifications: ['AWS Certified Developer', 'CKA', 'CompTIA Security+', 'Scrum Master'],
        achievements: [],
    }
}

test('parseTrimResponse accepts a condensed experience bullet list with no new numbers', () => {
    const state = baseState()
    const raw = {
        experience: [{ index: 0, bullets: [
            'Built and maintained REST APIs in Node.js/Express, improving test coverage from 40% to 85%.',
            'Led CI/CD setup with GitHub Actions and mentored two junior engineers.',
        ] }],
    }
    const changes = parseTrimResponse(raw, state, [], [])
    assert.equal(changes.experience.length, 1)
    assert.equal(changes.experience[0].index, 0)
    assert.equal(changes.experience[0].company, 'Acme Corp')
    assert.deepEqual(changes.experience[0].before, state.experience[0].bullets)
    assert.equal(changes.experience[0].after.length, 2)
})

test('parseTrimResponse drops a bullet that invents an unverified number', () => {
    const state = baseState()
    const raw = {
        experience: [{ index: 0, bullets: [
            'Built REST APIs serving 2 million requests per day.', // "2 million" appears nowhere in state/messages/evidence
        ] }],
    }
    const changes = parseTrimResponse(raw, state, [], [])
    // The whole experience[0] change is dropped since its only proposed bullet failed validation.
    assert.equal(changes.experience.length, 0)
})

test('parseTrimResponse marks a project demoted when bullets go to empty', () => {
    const state = baseState()
    const raw = {
        projects: [
            { index: 2, bullets: [] },
            { index: 3, bullets: [] },
        ],
    }
    const changes = parseTrimResponse(raw, state, [], [])
    assert.equal(changes.projects.length, 2)
    assert.equal(changes.projects[0].demoted, true)
    assert.equal(changes.projects[0].name, 'Project C')
    assert.deepEqual(changes.projects[0].after, [])
})

test('parseTrimResponse ignores an index that does not exist', () => {
    const state = baseState()
    const raw = { experience: [{ index: 9, bullets: ['whatever'] }] }
    const changes = parseTrimResponse(raw, state, [], [])
    assert.equal(changes.experience.length, 0)
})

test('parseTrimResponse allows a number that already exists in the resume', () => {
    const state = baseState()
    const raw = {
        experience: [{ index: 0, bullets: [
            'Wrote unit tests improving coverage from 40% to 85%, mentoring two engineers along the way.',
        ] }],
    }
    const changes = parseTrimResponse(raw, state, [], [])
    assert.equal(changes.experience.length, 1)
    assert.equal(changes.experience[0].after.length, 1)
})

test('parseTrimResponse accepts a certifications trim and a summary trim', () => {
    const state = baseState()
    const raw = {
        certifications: ['AWS Certified Developer', 'CKA'],
        summary: 'Backend engineer focused on scalable APIs.',
    }
    const changes = parseTrimResponse(raw, state, [], [])
    assert.deepEqual(changes.certifications?.after, ['AWS Certified Developer', 'CKA'])
    assert.equal(changes.summary?.after, 'Backend engineer focused on scalable APIs.')
})

test('isTrimEmpty is true when nothing changed', () => {
    const state = baseState()
    const changes = parseTrimResponse({}, state, [], [])
    assert.equal(isTrimEmpty(changes), true)
})

test('applyTrimChanges splices experience, projects, certifications, and summary back into state', () => {
    const state = baseState()
    const changes = parseTrimResponse({
        experience: [{ index: 0, bullets: ['Tightened bullet one.', 'Tightened bullet two.'] }],
        projects: [{ index: 3, bullets: [] }],
        certifications: ['AWS Certified Developer'],
        summary: 'Tightened summary.',
    }, state, [], [])

    const next = applyTrimChanges(state, changes)
    assert.deepEqual(next.experience[0].bullets, ['Tightened bullet one.', 'Tightened bullet two.'])
    assert.deepEqual(next.projects[3].bullets, [])
    assert.deepEqual(next.certifications, ['AWS Certified Developer'])
    assert.equal(next.summary, 'Tightened summary.')
    // Untouched entries are unchanged.
    assert.deepEqual(next.projects[0].bullets, state.projects[0].bullets)
    // Original state object is never mutated.
    assert.deepEqual(state.experience[0].bullets, baseState().experience[0].bullets)
})
