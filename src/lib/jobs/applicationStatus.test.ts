import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectClosedFromText, isJobClosed, jobStatusLabel } from './applicationStatus.ts'

test('detects "no longer accepting applications"', () => {
  assert.equal(detectClosedFromText('QA Engineer', 'This role is no longer accepting applications.'), true)
})
test('detects "- Closed" title suffix', () => {
  assert.equal(detectClosedFromText('QA Test Engineer - Closed', null), true)
})
test('detects "- Closed" title suffix even WITH a description (multiline)', () => {
  // Regression: the haystack is `${title}\n${description}`, so the $ anchor must
  // match end-of-line, not only end-of-string. Real closed jobs have descriptions.
  assert.equal(detectClosedFromText('QA Test Engineer - Closed', 'We are a fast growing company hiring testers.'), true)
})
test('detects "position has been filled"', () => {
  assert.equal(detectClosedFromText('Backend Dev', 'The position has been filled.'), true)
})
test('detects "applications are closed"', () => {
  assert.equal(detectClosedFromText('Data Analyst', 'Applications are closed for this posting.'), true)
})
test('does NOT false-positive on "close collaboration"', () => {
  assert.equal(detectClosedFromText('Frontend Dev', 'You will work in close collaboration with design.'), false)
})
test('does NOT false-positive on "closed-loop"', () => {
  assert.equal(detectClosedFromText('Controls Engineer', 'Experience with closed-loop control systems is a plus.'), false)
})
test('does NOT false-positive on a normal open JD', () => {
  assert.equal(detectClosedFromText('QA Engineer', 'We are hiring a QA Engineer to own test automation.'), false)
})
test('isJobClosed true only for closed/expired', () => {
  assert.equal(isJobClosed({ application_status: 'closed' }), true)
  assert.equal(isJobClosed({ application_status: 'expired' }), true)
  assert.equal(isJobClosed({ application_status: 'open' }), false)
  assert.equal(isJobClosed({ application_status: 'unknown' }), false)
})
test('jobStatusLabel maps to display text', () => {
  assert.equal(jobStatusLabel('closed'), 'Closed')
  assert.equal(jobStatusLabel('expired'), 'Expired')
  assert.equal(jobStatusLabel('open'), null)
})
