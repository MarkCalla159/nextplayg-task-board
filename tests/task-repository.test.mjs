import test from 'node:test'
import assert from 'node:assert/strict'
import { createTaskRepository } from '../src/taskRepository.ts'
import { STORAGE_KEY } from '../src/taskStorage.ts'

function fakeStorage(initial) {
  const values = new Map(initial ? [[STORAGE_KEY, initial]] : [])
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function fakeClient({ existingSession = true, failImport = false, missingSchema = false } = {}) {
  const rows = new Map()
  let signups = 0
  let session = existingSession ? { user: { id: 'guest-1' } } : null
  return {
    rows,
    get signups() { return signups },
    auth: {
      async getSession() { return { data: { session }, error: null } },
      async signInAnonymously() {
        signups++
        session = { user: { id: 'guest-1' } }
        return { data: { user: session.user }, error: null }
      },
    },
    from(table) {
      return {
        async upsert(incoming) {
          if (failImport) return { error: new Error('offline') }
          for (const row of incoming) if (!rows.has(row.id)) rows.set(row.id, row)
          return { error: null }
        },
        select(fields) {
          return { eq() { return { async order() {
            if (table === 'tasks' && missingSchema && fields.includes('assignee')) return { data: null, error: { code: '42703' } }
            if (table === 'labels') return { data: [{ id: 'label-1', name: 'Design' }], error: null }
            return { data: [...rows.values()], error: null }
          } } } }
        },
      }
    },
  }
}

test('reuses a session and imports local tasks without changing the backup', async () => {
  const raw = JSON.stringify([{ id: 'sample-1', title: 'Local', status: 'todo' }])
  const storage = fakeStorage(raw)
  const client = fakeClient()
  const repository = createTaskRepository(client, storage)
  const result = await repository.initialize()
  assert.equal(client.signups, 0)
  assert.equal(result.tasks.length, 1)
  assert.equal(result.schemaReady, true)
  assert.deepEqual(result.labels, [{ id: 'label-1', name: 'Design' }])
  assert.equal(result.tasks[0].title, 'Local')
  assert.match(result.tasks[0].id, /^[0-9a-f-]{36}$/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  storage.removeItem('nextplayg.tasks.imported.v1.guest-1')
  await repository.initialize()
  assert.equal(client.rows.size, 1, 'retrying an import must not duplicate the task')
})

test('existing tasks remain available before the new migration is applied', async () => {
  const raw = JSON.stringify([{ id: '1', title: 'Existing', status: 'todo' }])
  const repository = createTaskRepository(fakeClient({ missingSchema: true }), fakeStorage(raw))
  const result = await repository.initialize()
  assert.equal(result.schemaReady, false)
  assert.equal(result.tasks[0].title, 'Existing')
  assert.deepEqual(result.tasks[0].labels, [])
  assert.equal(result.tasks[0].assignee, '')
})

test('concurrent initialization creates only one guest', async () => {
  const client = fakeClient({ existingSession: false })
  const repository = createTaskRepository(client, fakeStorage())
  await Promise.all([repository.initialize(), repository.initialize()])
  assert.equal(client.signups, 1)
})

test('failed imports preserve the original data and remain retryable', async () => {
  const raw = JSON.stringify([{ id: '1', title: 'Keep me', status: 'done' }])
  const storage = fakeStorage(raw)
  const repository = createTaskRepository(fakeClient({ failImport: true }), storage)
  await assert.rejects(repository.initialize(), /offline/)
  assert.equal(storage.getItem(STORAGE_KEY), raw)
  assert.equal(storage.getItem('nextplayg.tasks.imported.v1.guest-1'), null)
})

test('malformed local data is not overwritten or marked imported', async () => {
  const storage = fakeStorage('{invalid')
  const repository = createTaskRepository(fakeClient(), storage)
  await assert.rejects(repository.initialize(), /backup/)
  assert.equal(storage.getItem(STORAGE_KEY), '{invalid')
  assert.equal(storage.getItem('nextplayg.tasks.imported.v1.guest-1'), null)
})
