import test from 'node:test'
import assert from 'node:assert/strict'
import { dueIndicator, formatDueDate, matchesFilters } from '../src/boardFilters.ts'

const task = { title: 'Diseñar HUD', priority: 'high', assignee: 'Alex', labels: ['Design', 'Feature'] }
const none = { query: '', priority: '', assignee: '', label: '' }

test('search and filters combine and support multiple labels', () => {
  assert.equal(matchesFilters(task, { query: 'diseñar', priority: 'high', assignee: 'assigned:Alex', label: 'Feature' }), true)
  assert.equal(matchesFilters(task, { ...none, label: 'Design' }), true)
  assert.equal(matchesFilters(task, { ...none, label: 'Bug' }), false)
  assert.equal(matchesFilters(task, { ...none, priority: 'low' }), false)
  assert.equal(matchesFilters(task, { ...none, assignee: 'unassigned' }), false)
  assert.equal(matchesFilters({ ...task, assignee: '' }, { ...none, assignee: 'unassigned' }), true)
  assert.equal(matchesFilters(task, { ...none, query: 'missing' }), false)
})

test('due dates use the local calendar and do not mark finished tasks overdue', () => {
  const today = new Date(2026, 10, 6, 23, 30)
  assert.equal(dueIndicator(null, 'todo', today), null)
  assert.equal(dueIndicator('2026-11-05', 'todo', today), 'overdue')
  assert.equal(dueIndicator('2026-11-06', 'todo', today), 'today')
  assert.equal(dueIndicator('2026-11-09', 'in_progress', today), 'soon')
  assert.equal(dueIndicator('2026-11-10', 'in_progress', today), 'later')
  assert.equal(dueIndicator('2026-11-05', 'done', today), null)
  assert.equal(dueIndicator('invalid', 'todo', today), null)
  assert.ok(formatDueDate('2026-11-06').includes('2026'))
})
