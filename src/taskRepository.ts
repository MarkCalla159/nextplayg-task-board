import type { SupabaseClient } from '@supabase/supabase-js'
import { loadTasks, STORAGE_KEY } from './taskStorage.ts'
import type { Status, Task } from './taskStorage'

export type RemoteTask = Task & {
  description: string
  priority: string
  due_date: string | null
  created_at: string
  assignee: string
  labels: string[]
}

export type TaskLabel = { id: string; name: string }
export type TaskChanges = {
  title?: string
  status?: Status
  priority?: 'low' | 'normal' | 'high'
  due_date?: string | null
  assignee?: string
  labels?: string[]
}

const legacyFields = 'id,title,status,description,priority,due_date,created_at'
const extendedFields = `${legacyFields},assignee,labels`
const migrationPrefix = 'nextplayg.tasks.imported.v1.'

function schemaMissing(error: { code?: string } | null) {
  return !!error && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

function withDefaults(task: Partial<RemoteTask>): RemoteTask {
  return { ...task, assignee: task.assignee ?? '', labels: task.labels ?? [] } as RemoteTask
}

async function migrationId(userId: string, taskId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([userId, taskId])))
  const bytes = new Uint8Array(digest.slice(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createTaskRepository(client: SupabaseClient, storage: Storage) {
  let initializing: Promise<{ userId: string; tasks: RemoteTask[]; labels: TaskLabel[]; schemaReady: boolean }> | undefined
  let schemaReady = false
  const fields = () => schemaReady ? extendedFields : legacyFields

  async function initializeOnce() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession()
    if (sessionError) throw sessionError
    let user = sessionData.session?.user
    if (!user) {
      const { data, error } = await client.auth.signInAnonymously()
      if (error) throw error
      user = data.user ?? undefined
    }
    if (!user) throw new Error('No guest session is available')

    const marker = `${migrationPrefix}${user.id}`
    if (storage.getItem(marker) !== 'done') {
      const localData = storage.getItem(STORAGE_KEY)
      if (localData !== null) {
        const local = loadTasks(() => storage)
        if (!local.canSave) throw new Error('The local task backup could not be read')
        if (local.tasks.length) {
          const rows = await Promise.all(local.tasks.map(async (task) => ({
            id: await migrationId(user.id, task.id),
            title: task.title,
            status: task.status,
            user_id: user.id,
          })))
          const { error } = await client.from('tasks').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
          if (error) throw error
        }
      }
      storage.setItem(marker, 'done')
    }

    const tasksResult = await client.from('tasks').select(extendedFields).eq('user_id', user.id).order('created_at', { ascending: false })
    if (tasksResult.error && !schemaMissing(tasksResult.error)) throw tasksResult.error
    let labelsResult: { data: TaskLabel[] | null; error: { code?: string } | null } = { data: [], error: null }
    if (!tasksResult.error) {
      labelsResult = await client.from('labels').select('id,name').eq('user_id', user.id).order('name')
      if (labelsResult.error && !schemaMissing(labelsResult.error)) throw labelsResult.error
    }
    schemaReady = !tasksResult.error && !labelsResult.error
    if (!schemaReady) {
      const legacy = await client.from('tasks').select(legacyFields).eq('user_id', user.id).order('created_at', { ascending: false })
      if (legacy.error) throw legacy.error
      return { userId: user.id, tasks: (legacy.data ?? []).map(withDefaults), labels: [], schemaReady: false }
    }
    return { userId: user.id, tasks: (tasksResult.data ?? []).map(withDefaults), labels: labelsResult.data ?? [], schemaReady: true }
  }

  function initialize() {
    if (!initializing) {
      initializing = initializeOnce().finally(() => { initializing = undefined })
    }
    return initializing
  }

  async function create(userId: string, title: string) {
    const { data, error } = await client.from('tasks').insert({ title, status: 'todo', user_id: userId }).select(fields()).single()
    if (error) throw error
    return withDefaults(data as unknown as Partial<RemoteTask>)
  }

  async function update(userId: string, id: string, changes: TaskChanges) {
    const { data, error } = await client.from('tasks').update(changes).eq('id', id).eq('user_id', userId).select(fields()).single()
    if (error) throw error
    return withDefaults(data as unknown as Partial<RemoteTask>)
  }

  async function remove(userId: string, id: string) {
    const { data, error } = await client.from('tasks').delete().eq('id', id).eq('user_id', userId).select('id').single()
    if (error || !data) throw error ?? new Error('Task not found')
  }

  async function restore(userId: string, task: RemoteTask) {
    const { assignee, labels, ...base } = task
    const row = schemaReady ? { ...base, assignee, labels, user_id: userId } : { ...base, user_id: userId }
    const { data, error } = await client.from('tasks').insert(row).select(fields()).single()
    if (error) throw error
    return withDefaults(data as unknown as Partial<RemoteTask>)
  }

  async function createLabel(userId: string, name: string) {
    const { data, error } = await client.from('labels').insert({ user_id: userId, name }).select('id,name').single()
    if (error) throw error
    return data as TaskLabel
  }

  return { initialize, create, update, remove, restore, createLabel }
}
