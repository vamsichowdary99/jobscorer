import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateHistory } from './truncateHistory.ts'

test('leaves short history untouched', () => {
  const history = [{ role: 'user' as const, content: 'hi' }]
  assert.equal(truncateHistory(history, 12), history)
})

test('keeps only the last N messages when over the cap', () => {
  const history: { role: 'user' | 'assistant'; content: string }[] = Array.from(
    { length: 20 },
    (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }),
  )
  const result = truncateHistory(history, 12)
  assert.equal(result.length, 12)
  assert.equal(result[0].content, 'msg 8')
  assert.equal(result[11].content, 'msg 19')
})
