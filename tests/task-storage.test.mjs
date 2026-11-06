import test from 'node:test'
import assert from 'node:assert/strict'
import { initialTasks, loadTasks, saveTasks, STORAGE_KEY } from '../src/taskStorage.ts'

function storageWith(initial = null) {
  let value = initial
  return {
    getItem: (key) => key === STORAGE_KEY ? value : null,
    setItem: (key, next) => { if (key === STORAGE_KEY) value = next },
  }
}

test('new boards use the initial tasks, and an empty saved board stays empty', () => {
  const storage = storageWith()
  assert.deepEqual(loadTasks(() => storage).tasks, initialTasks)
  assert.equal(saveTasks([], () => storage), true)
  assert.deepEqual(loadTasks(() => storage).tasks, [])
})

test('task changes survive a fresh load, including international text', () => {
  const storage = storageWith()
  const tasks = [{ id: 'one', title: 'تمرین ⚽ 中文', status: 'in_review' }]
  assert.equal(saveTasks(tasks, () => storage), true)
  assert.deepEqual(loadTasks(() => storage).tasks, tasks)
})

test('invalid or unreadable saved data disables automatic saving', () => {
  for (const raw of ['{broken', '[{"id":"x","title":"A","status":"bad"}]', '[{"id":"x","title":"A","status":"done"},{"id":"x","title":"B","status":"todo"}]']) {
    const storage = storageWith(raw)
    const result = loadTasks(() => storage)
    assert.equal(result.canSave, false)
    assert.notEqual(result.error, '')
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  }
  assert.equal(loadTasks(() => { throw new Error('blocked') }).canSave, false)
})

test('failed writes are reported without throwing', () => {
  assert.equal(saveTasks(initialTasks, () => ({
    getItem: () => null,
    setItem: () => { throw new Error('quota') },
  })), false)
})
